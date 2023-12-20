// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "../interfaces/IPreInteraction.sol";
import "../interfaces/IPostInteraction.sol";

contract InteractionMock is IPreInteraction, IPostInteraction {
    error InvalidExtraDataLength();
    error TakingAmountTooHigh();
    error IncorrectTakingAmount();

    function copyArg(uint256 arg) external pure returns (uint256) {
        return arg;
    }

    function preInteraction(
        IOrderMixin.Order calldata /* order */,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 /* makingAmount */,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external pure {
        if (extraData.length < 32) revert InvalidExtraDataLength();

        uint256 targetAmount;
        assembly ("memory-safe") { // solhint-disable-line no-inline-assembly
            targetAmount := calldataload(extraData.offset)
        }

        if (takingAmount != targetAmount) revert IncorrectTakingAmount();
    }

    function postInteraction(
        IOrderMixin.Order calldata /* order */,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 /* makingAmount */,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external pure {
        if (extraData.length < 32) revert InvalidExtraDataLength();

        uint256 threshold;
        assembly ("memory-safe") { // solhint-disable-line no-inline-assembly
            threshold := calldataload(extraData.offset)
        }

        if (takingAmount > threshold) revert TakingAmountTooHigh();
    }
}
