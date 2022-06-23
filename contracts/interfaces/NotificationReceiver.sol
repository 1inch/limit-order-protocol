// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;
pragma abicoder v1;

// TODO: pass order hash, remaining amount, etc to the arguments

/// @title Interface for interactor which acts between `maker => taker` and `taker => maker` transfers.
interface PreInteractionNotificationReceiver {
    function fillOrderPreInteraction(
        address taker,
        address makerAsset,
        address takerAsset,
        uint256 makingAmount,
        uint256 takingAmount,
        bytes memory interactiveData
    ) external;
}

interface PostInteractionNotificationReceiver {
    /// @notice Callback method that gets called after taker transferred funds to maker but before
    /// the opposite transfer happened
    function fillOrderPostInteraction(
        address taker,
        address makerAsset,
        address takerAsset,
        uint256 makingAmount,
        uint256 takingAmount,
        bytes memory interactiveData
    ) external;
}

interface InteractionNotificationReceiver {
    function fillOrderInteraction(
        address taker,
        address makerAsset,
        address takerAsset,
        uint256 makingAmount,
        uint256 takingAmount,
        bytes memory interactiveData
    ) external returns(uint256 offeredMakingAmount);
}
