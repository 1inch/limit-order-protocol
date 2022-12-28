// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/solidity-utils/contracts/libraries/ECDSA.sol";
import "./libraries/CalldataLib.sol";

import "./helpers/AmountCalculator.sol";

library OrderLib {
    error WrongAmount();
    error WrongGetter();
    error GetAmountCallFailed();

    struct Order {
        uint256 salt;
        CalldataLib.Address makerAsset;
        CalldataLib.Address takerAsset;
        CalldataLib.Address maker;
        CalldataLib.Address receiver;
        CalldataLib.Address allowedSender;  // equals to Zero address on public orders
        uint256 makingAmount;
        uint256 takingAmount;
        uint256 offsets;
        // bytes makerAssetData;
        // bytes takerAssetData;
        // bytes getMakingAmount; // this.staticcall(abi.encodePacked(bytes, swapTakerAmount)) => (swapMakerAmount)
        // bytes getTakingAmount; // this.staticcall(abi.encodePacked(bytes, swapMakerAmount)) => (swapTakerAmount)
        // bytes predicate;       // this.staticcall(bytes) => (bool)
        // bytes permit;          // On first fill: permit.1.call(abi.encodePacked(permit.selector, permit.2))
        // bytes preInteraction;
        // bytes postInteraction;
        bytes interactions; // concat(makerAssetData, takerAssetData, getMakingAmount, getTakingAmount, predicate, permit, preIntercation, postInteraction)
    }

    bytes32 constant internal _LIMIT_ORDER_TYPEHASH = keccak256(
        "Order("
            "uint256 salt,"
            "address makerAsset,"
            "address takerAsset,"
            "address maker,"
            "address receiver,"
            "address allowedSender,"
            "uint256 makingAmount,"
            "uint256 takingAmount,"
            "uint256 offsets,"
            "bytes interactions"
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

    function getterIsFrozen(bytes calldata getter) internal pure returns(bool) {
        return getter.length == 1 && getter[0] == "x";
    }

    function _get(Order calldata order, DynamicField field) private pure returns(bytes calldata) {
        uint256 bitShift = uint256(field) << 5; // field * 32
        return order.interactions[
            uint32((order.offsets << 32) >> bitShift):
            uint32(order.offsets >> bitShift)
        ];
    }

    function makerAssetData(Order calldata order) internal pure returns(bytes calldata) {
        return _get(order, DynamicField.MakerAssetData);
    }

    function takerAssetData(Order calldata order) internal pure returns(bytes calldata) {
        return _get(order, DynamicField.TakerAssetData);
    }

    function getMakingAmount(Order calldata order) internal pure returns(bytes calldata) {
        return _get(order, DynamicField.GetMakingAmount);
    }

    function getTakingAmount(Order calldata order) internal pure returns(bytes calldata) {
        return _get(order, DynamicField.GetTakingAmount);
    }

    function predicate(Order calldata order) internal pure returns(bytes calldata) {
        return _get(order, DynamicField.Predicate);
    }

    function permit(Order calldata order) internal pure returns(bytes calldata) {
        return _get(order, DynamicField.Permit);
    }

    function preInteraction(Order calldata order) internal pure returns(bytes calldata) {
        return _get(order, DynamicField.PreInteraction);
    }

    function postInteraction(Order calldata order) internal pure returns(bytes calldata) {
        return _get(order, DynamicField.PostInteraction);
    }

    function hash(Order calldata order, bytes32 domainSeparator) internal pure returns(bytes32 result) {
        bytes calldata interactions = order.interactions;
        bytes32 typehash = _LIMIT_ORDER_TYPEHASH;
        /// @solidity memory-safe-assembly
        assembly { // solhint-disable-line no-inline-assembly
            let ptr := mload(0x40)

            // keccak256(abi.encode(_LIMIT_ORDER_TYPEHASH, orderWithoutInteractions, keccak256(order.interactions)));
            calldatacopy(ptr, interactions.offset, interactions.length)
            mstore(add(ptr, 0x140), keccak256(ptr, interactions.length))
            calldatacopy(add(ptr, 0x20), order, 0x120)
            mstore(ptr, typehash)
            result := keccak256(ptr, 0x160)
        }
        result = ECDSA.toTypedDataHash(domainSeparator, result);
    }

    function getMakingAmount(
        Order calldata order,
        uint256 requestedTakingAmount,
        uint256 remainingMakingAmount,
        bytes32 orderHash
    ) internal view returns(uint256) {
        bytes calldata getter = getMakingAmount(order);
        if (getter.length == 0) {
            // Linear proportion
            return AmountCalculator.getMakingAmount(order.makingAmount, order.takingAmount, requestedTakingAmount);
        }
        return _callGetter(getter, order.takingAmount, requestedTakingAmount, order.makingAmount, remainingMakingAmount, orderHash);
    }

    function getTakingAmount(
        Order calldata order,
        uint256 requestedMakingAmount,
        uint256 remainingMakingAmount,
        bytes32 orderHash
    ) internal view returns(uint256) {
        bytes calldata getter = getTakingAmount(order);
        if (getter.length == 0) {
            // Linear proportion
            return AmountCalculator.getTakingAmount(order.makingAmount, order.takingAmount, requestedMakingAmount);
        }
        return _callGetter(getter, order.makingAmount, requestedMakingAmount, order.takingAmount, remainingMakingAmount, orderHash);
    }

    function _callGetter(
        bytes calldata getter,
        uint256 orderExpectedAmount,
        uint256 requestedAmount,
        uint256 orderResultAmount,
        uint256 remainingMakingAmount,
        bytes32 orderHash
    ) private view returns(uint256) {
        if (getter.length == 1) {
            if (OrderLib.getterIsFrozen(getter)) {
                // On "x" getter calldata only exact amount is allowed
                if (requestedAmount != orderExpectedAmount) revert WrongAmount();
                return orderResultAmount;
            } else {
                revert WrongGetter();
            }
        } else {
            address target = address(bytes20(getter));
            bytes calldata data = getter[20:];
            (bool success, bytes memory result) = target.staticcall(abi.encodePacked(data, requestedAmount, remainingMakingAmount, orderHash));
            if (!success || result.length != 32) revert GetAmountCallFailed();
            return abi.decode(result, (uint256));
        }
    }
}
