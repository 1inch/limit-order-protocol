// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../OrderRFQLib.sol";

interface IPreInteractionRFQ {
    /**
     * @notice Callback method that gets called before any funds transfers
     * @param order Order being processed
     * @param orderHash Hash of the order being processed
     * @param maker Maker address
     * @param taker Taker address
     * @param makingAmount Actual making amount
     * @param takingAmount Actual taking amount
     */
    function preInteractionRFQ(
        OrderRFQLib.OrderRFQ calldata order,
        bytes32 orderHash,
        address maker,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount
    ) external;
}
