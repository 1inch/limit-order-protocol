// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

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
        MakerPermit,
        PreInteractionData,
        PostInteractionData
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

    function makerPermit(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.MakerPermit);
    }

    function preInteractionTargetAndData(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.PreInteractionData);
    }

    function postInteractionTargetAndData(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.PostInteractionData);
    }

    function _get(bytes calldata extension, DynamicField field) private pure returns(bytes calldata result) {
        if (extension.length < 0x20) return msg.data[:0];

        Offsets offsets;
        bytes calldata concat;
        assembly ("memory-safe") {  // solhint-disable-line no-inline-assembly
            offsets := calldataload(extension.offset)
            concat.offset := add(extension.offset, 0x20)
            concat.length := sub(extension.length, 0x20)
        }

        return offsets.get(concat, uint256(field));
    }
}
