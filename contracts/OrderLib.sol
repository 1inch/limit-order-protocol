// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/solidity-utils/contracts/libraries/ECDSA.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

import "./libraries/ConstraintsLib.sol";
import "./helpers/AmountCalculator.sol";

library OrderLib {
    using AddressLib for Address;
    using ConstraintsLib for Constraints;

    error FieldOutOfBounds();
    error RFQWrongGetter();
    error RFQGetAmountCallFailed();
    error MissingOrderExtension();
    error UnexpectedOrderExtension();
    error ExtensionInvalid();

    struct Order {
        uint256 salt;
        Address maker;
        Address makerAsset;
        Address takerAsset;
        uint256 makingAmount;
        uint256 takingAmount;
        Constraints constraints;
    }

    bytes32 constant internal _LIMIT_ORDER_RFQ_TYPEHASH = keccak256(
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

    enum DynamicField {
        MakerAssetData,
        TakerAssetData,
        MakingAmountGetter,
        TakingAmountGetter,
        Predicate,
        Permit,
        PreInteractionData,
        PostInteractionData
    }

    function hash(Order calldata order, bytes32 domainSeparator) internal pure returns(bytes32 result) {
        bytes32 typehash = _LIMIT_ORDER_RFQ_TYPEHASH;
        /// @solidity memory-safe-assembly
        assembly { // solhint-disable-line no-inline-assembly
            let ptr := mload(0x40)

            // keccak256(abi.encode(_LIMIT_ORDER_RFQ_TYPEHASH, order));
            mstore(ptr, typehash)
            calldatacopy(add(ptr, 0x20), order, 0xe0)
            result := keccak256(ptr, 0x100)
        }
        result = ECDSA.toTypedDataHash(domainSeparator, result);
    }

    function calculateMakingAmount(
        Order calldata order,
        bytes calldata extension,
        uint256 requestedTakingAmount,
        uint256 remainingMakingAmount,
        bytes32 orderHash
    ) internal view returns(uint256) {
        bytes calldata getter = makingAmountGetter(extension);
        if (getter.length == 0) {
            // Linear proportion
            return AmountCalculator.makingAmountGetter(order.makingAmount, order.takingAmount, requestedTakingAmount);
        }
        return _callGetter(getter, requestedTakingAmount, remainingMakingAmount, orderHash);
    }

    function calculateTakingAmount(
        Order calldata order,
        bytes calldata extension,
        uint256 requestedMakingAmount,
        uint256 remainingMakingAmount,
        bytes32 orderHash
    ) internal view returns(uint256) {
        bytes calldata getter = takingAmountGetter(extension);
        if (getter.length == 0) {
            // Linear proportion
            return AmountCalculator.takingAmountGetter(order.makingAmount, order.takingAmount, requestedMakingAmount);
        }
        return _callGetter(getter, requestedMakingAmount, remainingMakingAmount, orderHash);
    }

    function _callGetter(
        bytes calldata getter,
        uint256 requestedAmount,
        uint256 remainingMakingAmount,
        bytes32 orderHash
    ) private view returns(uint256) {
        if (getter.length < 20) revert RFQWrongGetter();

        (bool success, bytes memory result) = address(bytes20(getter)).staticcall(abi.encodePacked(getter[20:], requestedAmount, remainingMakingAmount, orderHash));
        if (!success || result.length != 32) revert RFQGetAmountCallFailed();
        return abi.decode(result, (uint256));
    }

    function validateExtension(Order calldata order, bytes calldata extension) internal pure {
        if (order.constraints.hasExtension()) {
            if (extension.length == 0) revert MissingOrderExtension();
            // Lowest 160 bits of the order salt must be equal to the lowest 160 bits of the extension hash
            if (uint256(keccak256(extension)) & type(uint160).max != order.salt & type(uint160).max) revert ExtensionInvalid();
        } else {
            if (extension.length > 0) revert UnexpectedOrderExtension();
        }
    }

    function getReceiver(bytes calldata extension, Order calldata order) internal pure returns(address receiver) {
        if (extension.length < 20) {
            return order.maker.get();
        }
        receiver = address(bytes20(extension));
        if (receiver == address(0)) {
            receiver = order.maker.get();
        }
    }

    function makerAssetData(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.MakerAssetData);
    }

    function takerAssetData(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.TakerAssetData);
    }

    function makingAmountGetter(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.MakingAmountGetter);
    }

    function takingAmountGetter(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.TakingAmountGetter);
    }

    function predicate(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.Predicate);
    }

    function permitTargetAndData(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.Permit);
    }

    function preInteractionTargetAndData(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.PreInteractionData);
    }

    function postInteractionTargetAndData(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.PostInteractionData);
    }

    function _get(bytes calldata extension, DynamicField field) private pure returns(bytes calldata result) {
        if (extension.length < 52) return msg.data[:0];

        bytes4 exception = FieldOutOfBounds.selector;
        /// @solidity memory-safe-assembly
        assembly {  // solhint-disable-line no-inline-assembly
            let offsets := calldataload(add(extension.offset, 20))

            let bitShift := shl(5, field) // field * 32
            let begin := and(0xffffffff, shr(bitShift, shl(32, offsets)))
            let end := and(0xffffffff, shr(bitShift, offsets))
            result.offset := add(extension.offset, add(52, begin))
            result.length := sub(end, begin)
            if gt(add(result.offset, result.length), add(extension.offset, extension.length)) {
                mstore(0, exception)
                revert(0, 4)
            }
        }
    }
}
