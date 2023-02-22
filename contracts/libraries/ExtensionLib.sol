// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@1inch/solidity-utils/contracts/libraries/ECDSA.sol";

import "../interfaces/IOrderMixin.sol";

library ExtensionLib {
    using AddressLib for Address;

    error FieldOutOfBounds();

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

    function getReceiver(bytes calldata extension, IOrderMixin.Order calldata order) internal pure returns(address receiver) {
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
