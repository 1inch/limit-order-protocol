// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "../interfaces/IPreInteraction.sol";
import "../interfaces/IPostInteraction.sol";
import "../interfaces/ITakerInteraction.sol";

contract InteractionMock is IPreInteraction, IPostInteraction, ITakerInteraction {
    error InvalidExtraDataLength();
    error TakingAmountTooHigh();
    error IncorrectTakingAmount();

    function copyArg(uint256 arg) external pure returns (uint256) {
        return arg;
    }

    function preInteraction(
        IOrderMixin.Order calldata /* order */,
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

    function takerInteraction(
        IOrderMixin.Order calldata /* order */,
        bytes32 /* orderHash */,
        bytes calldata /* extension */,
        address /* taker */,
        uint256 /* makingAmount */,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external pure returns(uint256 offeredTakingAmount){
        if (extraData.length < 32) return takingAmount;

        uint256 increaseAmount;
        assembly ("memory-safe") { // solhint-disable-line no-inline-assembly
            increaseAmount := calldataload(extraData.offset)
        }

        return takingAmount + increaseAmount;
    }
}
