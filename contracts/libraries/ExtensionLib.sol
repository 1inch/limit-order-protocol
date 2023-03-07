// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@1inch/solidity-utils/contracts/libraries/ECDSA.sol";

import "../interfaces/IOrderMixin.sol";
import "./OffsetsLib.sol";

library ExtensionLib {
    using AddressLib for Address;
    using OffsetsLib for Offsets;

    enum DynamicField {
        MakerAssetSuffix,
        TakerAssetSuffix,
        MakingAmountGetter,
        TakingAmountGetter,
        Predicate,
        Permit,
        PreInteractionData,
        PostInteractionData
    }

    function getReceiver(bytes calldata extension, IOrderMixin.Order calldata order) internal pure returns(address receiver) {
        if (extension.length < 20) {
            return order.maker.get();
        }
        receiver = address(bytes20(extension));
        if (receiver == address(0)) {
            receiver = order.maker.get();
        }
    }

    function makerAssetSuffix(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.MakerAssetSuffix);
    }

    function takerAssetSuffix(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.TakerAssetSuffix);
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

        Offsets offsets;
        bytes calldata concat;
        assembly ("memory-safe") {  // solhint-disable-line no-inline-assembly
            offsets := calldataload(add(extension.offset, 20))
            concat.offset := add(extension.offset, 52)
            concat.length := sub(extension.length, 52)
        }

        return offsets.get(concat, uint256(field));
    }
}
