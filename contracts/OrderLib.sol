// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@1inch/solidity-utils/contracts/libraries/ECDSA.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

import "./interfaces/IOrderMixin.sol";
import "./libraries/MakerTraitsLib.sol";
import "./libraries/ExtensionLib.sol";
import "./helpers/AmountCalculator.sol";

/**
 * @title OrderLib
 * @dev The library provides common functionality for processing and manipulating limit orders. 
 * It provides functionality to calculate and verify order hashes, calculate trade amounts, and validate 
 * extension data associated with orders. The library also contains helper methods to get the receiver of 
 * an order and call getter functions.
 */
 library OrderLib {
    using AddressLib for Address;
    using MakerTraitsLib for MakerTraits;
    using ExtensionLib for bytes;

    /// @dev Error to be thrown when the incorrect getter function called.
    error WrongGetter();
    /// @dev Error to be thrown when the call to get the amount fails.
    error GetAmountCallFailed();
    /// @dev Error to be thrown when the extension data of an order is missing.
    error MissingOrderExtension();
    /// @dev Error to be thrown when the order has an unexpected extension.
    error UnexpectedOrderExtension();
    /// @dev Error to be thrown when the order extension is invalid.
    error ExtensionInvalid();

    /// @dev The typehash of the order struct.
    bytes32 constant internal _LIMIT_ORDER_TYPEHASH = keccak256(
        "Order("
            "uint256 salt,"
            "address maker,"
            "address receiver,"
            "address makerAsset,"
            "address takerAsset,"
            "uint256 makingAmount,"
            "uint256 takingAmount,"
            "uint256 makerTraits"
        ")"
    );
    uint256 constant internal _ORDER_STRUCT_SIZE = 0x100;
    uint256 constant internal _DATA_HASH_SIZE = 0x120;

    /**
      * @notice Calculates the hash of an order.
      * @param order The order to be hashed.
      * @param domainSeparator The domain separator to be used for the EIP-712 hashing.
      * @return result The keccak256 hash of the order data.
      */
    function hash(IOrderMixin.Order calldata order, bytes32 domainSeparator) internal pure returns(bytes32 result) {
        bytes32 typehash = _LIMIT_ORDER_TYPEHASH;
        assembly ("memory-safe") { // solhint-disable-line no-inline-assembly
            let ptr := mload(0x40)

            // keccak256(abi.encode(_LIMIT_ORDER_TYPEHASH, order));
            mstore(ptr, typehash)
            calldatacopy(add(ptr, 0x20), order, _ORDER_STRUCT_SIZE)
            result := keccak256(ptr, _DATA_HASH_SIZE)
        }
        result = ECDSA.toTypedDataHash(domainSeparator, result);
    }

    /**
      * @notice Returns the receiver address for an order.
      * @param order The order.
      * @return receiver The address of the receiver, either explicitly defined in the order or the maker's address if not specified.
      */
    function getReceiver(IOrderMixin.Order calldata order) internal pure returns(address /*receiver*/) {
        address receiver = order.receiver.get();
        return receiver != address(0) ? receiver : order.maker.get();
    }

    /** 
      * @notice Calculates the making amount based on the requested taking amount.
      * @dev If getter is specified in the extension data, the getter is called to calculate the making amount,
      * otherwise the making amount is calculated linearly.
      * @param order The order.
      * @param extension The extension data associated with the order.
      * @param requestedTakingAmount The amount the taker wants to take.
      * @param remainingMakingAmount The remaining amount of the asset left to fill.
      * @param orderHash The hash of the order.
      * @return makingAmount The amount of the asset the maker receives.
      */
    function calculateMakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        uint256 requestedTakingAmount,
        uint256 remainingMakingAmount,
        bytes32 orderHash
    ) internal view returns(uint256) {
        bytes calldata getter = extension.makingAmountGetter();
        if (getter.length == 0) {
            // Linear proportion
            return AmountCalculator.getMakingAmount(order.makingAmount, order.takingAmount, requestedTakingAmount);
        }
        return _callGetter(getter, requestedTakingAmount, remainingMakingAmount, orderHash);
    }

    /**
      * @notice Calculates the taking amount based on the requested making amount.
      * @dev If getter is specified in the extension data, the getter is called to calculate the taking amount,
      * otherwise the taking amount is calculated linearly.
      * @param order The order.
      * @param extension The extension data associated with the order.
      * @param requestedMakingAmount The amount the maker wants to receive.
      * @param remainingMakingAmount The remaining amount of the asset left to be filled.
      * @param orderHash The hash of the order.
      * @return takingAmount The amount of the asset the taker takes.
      */
    function calculateTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        uint256 requestedMakingAmount,
        uint256 remainingMakingAmount,
        bytes32 orderHash
    ) internal view returns(uint256) {
        bytes calldata getter = extension.takingAmountGetter();
        if (getter.length == 0) {
            // Linear proportion
            return AmountCalculator.getTakingAmount(order.makingAmount, order.takingAmount, requestedMakingAmount);
        }
        return _callGetter(getter, requestedMakingAmount, remainingMakingAmount, orderHash);
    }

    /**
      * @notice Calls the getter function to calculate an amount for a trade.
      * @param getter The address of the getter function.
      * @param requestedAmount The amount requested by the taker.
      * @param remainingMakingAmount The remaining amount of the asset left to fill.
      * @param orderHash The hash of the order.
      * @return amount The calculated amount.
      */
    function _callGetter(
        bytes calldata getter,
        uint256 requestedAmount,
        uint256 remainingMakingAmount,
        bytes32 orderHash
    ) private view returns(uint256) {
        if (getter.length < 20) revert WrongGetter();

        (bool success, bytes memory result) = address(bytes20(getter)).staticcall(abi.encodePacked(getter[20:], requestedAmount, remainingMakingAmount, orderHash));
        if (!success || result.length != 32) revert GetAmountCallFailed();
        return abi.decode(result, (uint256));
    }

    /**
      * @dev Validates the extension associated with an order. Reverts if invalid.
      * @param order The order to validate against.
      * @param extension The extension associated with the order.
      */
    function validateExtension(IOrderMixin.Order calldata order, bytes calldata extension) internal pure {
        if (order.makerTraits.hasExtension()) {
            if (extension.length == 0) revert MissingOrderExtension();
            // Lowest 160 bits of the order salt must be equal to the lowest 160 bits of the extension hash
            if (uint256(keccak256(extension)) & type(uint160).max != order.salt & type(uint160).max) revert ExtensionInvalid();
        } else {
            if (extension.length > 0) revert UnexpectedOrderExtension();
        }
    }
}
