// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IOrderMixin.sol";

/**
 * @title IAmountGetter
 * @notice Interface for external logic to determine actual making and taking amounts for orders.
 */
interface IAmountGetter {
    /**
     * @notice View method that gets called to determine the actual making amount
     * @param order Order being processed
     * @param extension Order extension data
     * @param orderHash Hash of the order being processed
     * @param taker Taker address
     * @param takingAmount Actual taking amount
     * @param remainingMakingAmount Order remaining making amount
     * @param extraData Extra data
     * @return makingAmount Actual making amount that should be used for the order
     */
    function getMakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external view returns (uint256);

    /**
     * @notice View method that gets called to determine the actual taking amount
     * @param order Order being processed
     * @param extension Order extension data
     * @param orderHash Hash of the order being processed
     * @param taker Taker address
     * @param makingAmount Actual taking amount
     * @param remainingMakingAmount Order remaining making amount
     * @param extraData Extra data
     * @return takingAmount Actual taking amount that should be used for the order
     */
    function getTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external view returns (uint256);
}
