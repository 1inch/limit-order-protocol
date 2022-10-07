// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;
pragma abicoder v1;

/**
 * @title Interface for interactor which acts after `taker -> maker` transfers.
 * @notice The order filling steps are `preInteraction` =>` Transfer "maker -> taker"` => `Interaction` => `Transfer "taker -> maker"` => **`postInteraction`**
 */
interface IPostInteractionNotificationReceiver {
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
