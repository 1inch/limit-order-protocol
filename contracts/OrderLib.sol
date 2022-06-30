// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

library OrderLib {
    struct Order {
        uint256 salt;
        address makerAsset;
        address takerAsset;
        address maker;
        address receiver;
        address allowedSender;  // equals to Zero address on public orders
        uint256 makingAmount;
        uint256 takingAmount;
        uint256 offsets;
        // bytes makerAssetData;
        // bytes takerAssetData;
        // bytes getMakingAmount; // this.staticcall(abi.encodePacked(bytes, swapTakerAmount)) => (swapMakerAmount)
        // bytes getTakingAmount; // this.staticcall(abi.encodePacked(bytes, swapMakerAmount)) => (swapTakerAmount)
        // bytes predicate;      // this.staticcall(bytes) => (bool)
        // bytes permit;         // On first fill: permit.1.call(abi.encodePacked(permit.selector, permit.2))
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
        if (uint256(field) == 0) {
            return order.interactions[0:uint32(order.offsets)];
        }

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

    function hash(Order calldata order) internal pure returns(bytes32 result) {
        bytes calldata interactions = order.interactions;
        bytes32 typehash = _LIMIT_ORDER_TYPEHASH;
        assembly { // solhint-disable-line no-inline-assembly
            let ptr := mload(0x40)
            // we use add(0x160, interactions.length) instead of max(0x160, interactions.length) as it is cheaper
            mstore(0x40, add(ptr, add(0x160, interactions.length)))

            calldatacopy(ptr, interactions.offset, interactions.length)
            mstore(add(ptr, 0x140), keccak256(ptr, interactions.length))
            calldatacopy(add(ptr, 0x20), order, 0x120)
            mstore(ptr, typehash)
            result := keccak256(ptr, 0x160)
        }
    }
}
