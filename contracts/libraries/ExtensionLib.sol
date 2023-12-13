// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../interfaces/IOrderMixin.sol";
import "./OffsetsLib.sol";

/**
 * @title ExtensionLib
 * @notice Library for retrieving extensions information for the IOrderMixin Interface.
 */
library ExtensionLib {
    using AddressLib for Address;
    using OffsetsLib for Offsets;

    enum DynamicField {
        MakerAssetSuffix,
        TakerAssetSuffix,
        MakingAmountData,
        TakingAmountData,
        Predicate,
        MakerPermit,
        PreInteractionData,
        PostInteractionData,
        CustomData
    }

    /**
     * @notice Returns the MakerAssetSuffix from the provided extension calldata.
     * @param extension The calldata from which the MakerAssetSuffix is to be retrieved.
     * @return calldata Bytes representing the MakerAssetSuffix.
     */
    function makerAssetSuffix(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.MakerAssetSuffix);
    }

    /**
     * @notice Returns the TakerAssetSuffix from the provided extension calldata.
     * @param extension The calldata from which the TakerAssetSuffix is to be retrieved.
     * @return calldata Bytes representing the TakerAssetSuffix.
     */
    function takerAssetSuffix(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.TakerAssetSuffix);
    }

    /**
     * @notice Returns the MakingAmountData from the provided extension calldata.
     * @param extension The calldata from which the MakingAmountData is to be retrieved.
     * @return calldata Bytes representing the MakingAmountData.
     */
    function makingAmountData(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.MakingAmountData);
    }

    /**
     * @notice Returns the TakingAmountData from the provided extension calldata.
     * @param extension The calldata from which the TakingAmountData is to be retrieved.
     * @return calldata Bytes representing the TakingAmountData.
     */
    function takingAmountData(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.TakingAmountData);
    }

    /**
     * @notice Returns the order's predicate from the provided extension calldata.
     * @param extension The calldata from which the predicate is to be retrieved.
     * @return calldata Bytes representing the predicate.
     */
    function predicate(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.Predicate);
    }

    /**
     * @notice Returns the maker's permit from the provided extension calldata.
     * @param extension The calldata from which the maker's permit is to be retrieved.
     * @return calldata Bytes representing the maker's permit.
     */
    function makerPermit(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.MakerPermit);
    }


    /**
     * @notice Returns the pre-interaction from the provided extension calldata.
     * @param extension The calldata from which the pre-interaction is to be retrieved.
     * @return calldata Bytes representing the pre-interaction.
     */
    function preInteractionTargetAndData(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.PreInteractionData);
    }

    /**
     * @notice Returns the post-interaction from the provided extension calldata.
     * @param extension The calldata from which the post-interaction is to be retrieved.
     * @return calldata Bytes representing the post-interaction.
     */
    function postInteractionTargetAndData(bytes calldata extension) internal pure returns(bytes calldata) {
        return _get(extension, DynamicField.PostInteractionData);
    }

    /**
     * @notice Returns extra suffix data from the provided extension calldata.
     * @param extension The calldata from which the extra suffix data is to be retrieved.
     * @return calldata Bytes representing the extra suffix data.
     */
    function customData(bytes calldata extension) internal pure returns(bytes calldata) {
        if (extension.length < 0x20) return msg.data[:0];
        uint256 offsets = uint256(bytes32(extension));
        unchecked {
            return extension[0x20 + (offsets >> 224):];
        }
    }

    /**
     * @notice Retrieves a specific field from the provided extension calldata.
     * @dev The first 32 bytes of an extension calldata contain offsets to the end of each field within the calldata.
     * @param extension The calldata from which the field is to be retrieved.
     * @param field The specific dynamic field to retrieve from the extension.
     * @return calldata Bytes representing the requested field.
     */
    function _get(bytes calldata extension, DynamicField field) private pure returns(bytes calldata) {
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
