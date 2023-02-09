// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/solidity-utils/contracts/libraries/ECDSA.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

import "./libraries/ConstraintsLib.sol";
import "./helpers/AmountCalculator.sol";

library OrderLib {
    error WrongGetter();
    error GetAmountCallFailed();

    struct Order {
        uint256 salt;
        Address makerAsset;
        Address takerAsset;
        uint256 makingAmount;
        uint256 takingAmount;
        Constraints constraints;
        Address maker;
        Address receiver;
        uint256 offsets;
        bytes interactions;
    }

    bytes32 constant internal _LIMIT_ORDER_TYPEHASH = keccak256(
        "Order("
            "uint256 salt,"
            "address makerAsset,"
            "address takerAsset,"
            "uint256 makingAmount,"
            "uint256 takingAmount,"
            "uint256 constraints,"
            "address maker,"
            "address receiver,"
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
        return _callGetter(getter, requestedTakingAmount, remainingMakingAmount, orderHash);
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
        return _callGetter(getter, requestedMakingAmount, remainingMakingAmount, orderHash);
    }

    function _callGetter(
        bytes calldata getter,
        uint256 requestedAmount,
        uint256 remainingMakingAmount,
        bytes32 orderHash
    ) private view returns(uint256) {
        if (getter.length < 20) revert WrongGetter();

        address target = address(bytes20(getter));
        bytes calldata data = getter[20:];
        (bool success, bytes memory result) = target.staticcall(abi.encodePacked(data, requestedAmount, remainingMakingAmount, orderHash));
        if (!success || result.length != 32) revert GetAmountCallFailed();
        return abi.decode(result, (uint256));
    }
}
