// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/solidity-utils/contracts/libraries/ECDSA.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

import "./libraries/ConstraintsLib.sol";
import "./helpers/AmountCalculator.sol";

library OrderRFQLib {
    using AddressLib for Address;

    error RFQWrongGetter();
    error RFQGetAmountCallFailed();

    struct OrderRFQ {
        uint256 salt;
        Address maker;
        Address makerAsset;
        Address takerAsset;
        uint256 makingAmount;
        uint256 takingAmount;
        Constraints constraints;
    }

    bytes32 constant internal _LIMIT_ORDER_RFQ_TYPEHASH = keccak256(
        "OrderRFQ("
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
        GetMakingAmount,
        GetTakingAmount,
        Predicate,
        Permit,
        PreInteraction,
        PostInteraction
    }

    function hash(OrderRFQ calldata order, bytes32 domainSeparator) internal pure returns(bytes32 result) {
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
        OrderRFQ calldata order,
        bytes calldata extension,
        uint256 requestedTakingAmount,
        uint256 remainingMakingAmount,
        bytes32 orderHash
    ) internal view returns(uint256) {
        bytes calldata getter = getMakingAmount(extension);
        if (getter.length == 0) {
            // Linear proportion
            return AmountCalculator.getMakingAmount(order.makingAmount, order.takingAmount, requestedTakingAmount);
        }
        return _callGetter(getter, requestedTakingAmount, remainingMakingAmount, orderHash);
    }

    function calculateTakingAmount(
        OrderRFQ calldata order,
        bytes calldata extension,
        uint256 requestedMakingAmount,
        uint256 remainingMakingAmount,
        bytes32 orderHash
    ) internal view returns(uint256) {
        bytes calldata getter = getTakingAmount(extension);
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
        if (getter.length < 20) revert RFQWrongGetter();

        (bool success, bytes memory result) = address(bytes20(getter)).staticcall(abi.encodePacked(getter[20:], requestedAmount, remainingMakingAmount, orderHash));
        if (!success || result.length != 32) revert RFQGetAmountCallFailed();
        return abi.decode(result, (uint256));
    }

    function validateExtension(OrderRFQ calldata order, bytes calldata extension) internal pure returns(bool) {
        // Lowest 160 bits of the order salt must be equal to the lowest 160 bits of the extension hash
        return (uint256(keccak256(extension)) & type(uint160).max) == (order.salt & type(uint160).max) && extension.length >= 20;
    }

    function getReceiver(bytes calldata extension, OrderRFQ calldata order) internal pure returns(address receiver) {
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

    function getMakingAmount(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.GetMakingAmount);
    }

    function getTakingAmount(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.GetTakingAmount);
    }

    function predicate(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.Predicate);
    }

    function permit(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.Permit);
    }

    function preInteraction(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.PreInteraction);
    }

    function postInteraction(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.PostInteraction);
    }

    function _get(bytes calldata extension, DynamicField field) private pure returns(bytes calldata) {
        if (extension.length < 52) return msg.data[:0];
        uint256 offsets;
        /// @solidity memory-safe-assembly
        assembly {  // solhint-disable-line no-inline-assembly
            offsets := calldataload(add(extension.offset, 20))
        }
        uint256 bitShift = uint256(field) << 5; // field * 32
        unchecked {
            return extension[
                uint32((offsets << 32) >> bitShift) + 52:
                uint32(offsets >> bitShift) + 52
            ];
        }
    }
}
