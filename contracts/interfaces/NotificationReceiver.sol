// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;
pragma abicoder v1;

/// @title Interface for interactor which acts between `maker => taker` and `taker => maker` transfers.
interface PreInteractionNotificationReceiver {
    function fillOrderPreInteraction(
        bytes32 orderHash,
        address maker,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingAmount,
        bytes memory interactiveData
    ) external;
}

interface PostInteractionNotificationReceiver {
    /// @notice Callback method that gets called after taker transferred funds to maker but before
    /// the opposite transfer happened
    function fillOrderPostInteraction(
        bytes32 orderHash,
        address maker,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingAmount,
        bytes memory interactiveData
    ) external;
}

interface InteractionNotificationReceiver {
    function fillOrderInteraction(
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        bytes memory interactiveData
    ) external returns(uint256 offeredTakingAmount);
}
