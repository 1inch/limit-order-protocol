// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@1inch/solidity-utils/contracts/libraries/ECDSA.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

import "./interfaces/IOrderMixin.sol";
import "./libraries/ConstraintsLib.sol";
import "./libraries/ExtensionLib.sol";
import "./helpers/AmountCalculator.sol";

library OrderLib {
    using AddressLib for Address;
    using ConstraintsLib for Constraints;
    using ExtensionLib for bytes;

    error WrongGetter();
    error GetAmountCallFailed();
    error MissingOrderExtension();
    error UnexpectedOrderExtension();
    error ExtensionInvalid();

    bytes32 constant internal _LIMIT_ORDER_TYPEHASH = keccak256(
        "Order("
            "uint256 salt,"
            "address maker,"
            "address makerAsset,"
            "address takerAsset,"
            "uint256 makingAmount,"
            "uint256 takingAmount,"
            "uint256 constraints"
        ")"
    );

    function hash(IOrderMixin.Order calldata order, bytes32 domainSeparator) internal pure returns(bytes32 result) {
        bytes32 typehash = _LIMIT_ORDER_TYPEHASH;
        assembly ("memory-safe") { // solhint-disable-line no-inline-assembly
            let ptr := mload(0x40)

            // keccak256(abi.encode(_LIMIT_ORDER_TYPEHASH, order));
            mstore(ptr, typehash)
            calldatacopy(add(ptr, 0x20), order, 0xe0)
            result := keccak256(ptr, 0x100)
        }
        result = ECDSA.toTypedDataHash(domainSeparator, result);
    }

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

    function validateExtension(IOrderMixin.Order calldata order, bytes calldata extension) internal pure {
        if (order.constraints.hasExtension()) {
            if (extension.length == 0) revert MissingOrderExtension();
            // Lowest 160 bits of the order salt must be equal to the lowest 160 bits of the extension hash
            if (uint256(keccak256(extension)) & type(uint160).max != order.salt & type(uint160).max) revert ExtensionInvalid();
        } else {
            if (extension.length > 0) revert UnexpectedOrderExtension();
        }
    }
}
