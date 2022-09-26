// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;
pragma abicoder v1;

/**
 * @title Interface for interactor which acts before `maker -> taker` transfers.
 * @notice The order filling steps are **`preInteraction`** =>` Transfer "maker -> taker"` => `Interaction` => `Transfer "taker -> maker"` => `postInteraction`
 */
interface PreInteractionNotificationReceiver {
    /**
     * @notice Callback method that gets called before any funds transfers
     * @param orderHash Hash of the order being processed
     * @param maker Maker address
     * @param taker Taker address
     * @param makingAmount Actual making amount
     * @param takingAmount Actual taking amount
     * @param remainingAmount Limit order remaining maker amount after the swap
     * @param interactionData Interaction calldata
     */
    function fillOrderPreInteraction(
        bytes32 orderHash,
        address maker,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingAmount,
        bytes memory interactionData
    ) external;
}

/**
 * @title Interface for interactor which acts after `taker -> maker` transfers.
 * @notice The order filling steps are `preInteraction` =>` Transfer "maker -> taker"` => `Interaction` => `Transfer "taker -> maker"` => **`postInteraction`**
 */
interface PostInteractionNotificationReceiver {
    /**
     * @notice Callback method that gets called after all funds transfers
     * @param orderHash Hash of the order being processed
     * @param maker Maker address
     * @param taker Taker address
     * @param makingAmount Actual making amount
     * @param takingAmount Actual taking amount
     * @param remainingAmount Limit order remaining maker amount after the swap
     * @param interactionData Interaction calldata
     */
    function fillOrderPostInteraction(
        bytes32 orderHash,
        address maker,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingAmount,
        bytes memory interactionData
    ) external;
}

/**
 * @title Interface for interactor which acts after `taker -> maker` transfers.
 * @notice The order filling steps are `preInteraction` =>` Transfer "maker -> taker"` => **`Interaction`** => `Transfer "taker -> maker"` => `postInteraction`
 */
interface InteractionNotificationReceiver {
    /**
     * @notice Callback method that gets called after all funds transfers
     * @param taker Taker address (tx sender)
     * @param makingAmount Actual making amount
     * @param takingAmount Actual taking amount
     * @param interactionData Interaction calldata
     * @return offeredTakingAmount Suggested amount. Order is filled with this amount if maker or taker getter functions are not defined.
     */
    function fillOrderInteraction(
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        bytes memory interactionData
    ) external returns(uint256 offeredTakingAmount);
}
