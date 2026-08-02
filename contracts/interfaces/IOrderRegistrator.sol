// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import { IOrderMixin } from "./IOrderMixin.sol";

/**
 * @title IOrderRegistrator
 * @dev The interface defines the structure of the order registrator contract.
 * The registrator is responsible for registering orders and emitting an event when an order is registered.
 */
interface IOrderRegistrator {
    /**
     * @notice Emitted when an order is registered.
     * @param order The order that was registered.
     * @param extension The extension data associated with the order.
     * @param signature The signature of the order.
     */
    event OrderRegistered(IOrderMixin.Order order, bytes extension, bytes signature);

    /**
     * @notice Registers an order.
     * @param order The order to be registered.
     * @param extension The extension data associated with the order.
     * @param signature The signature of the order.
     */
    function registerOrder(IOrderMixin.Order calldata order, bytes calldata extension, bytes calldata signature) external;

    /**
     * @notice Returns the block timestamp of the first registration of an order.
     * @param orderHash The hash of the order.
     * @return timestamp The timestamp of the first registration, or 0 if the order was never registered.
     */
    function announcedAt(bytes32 orderHash) external view returns (uint256 timestamp);

    /**
     * @notice Returns the block number of the first registration of an order.
     * @param orderHash The hash of the order.
     * @return blockNumber The block number of the first registration, or 0 if the order was never registered.
     */
    function announcedAtBlock(bytes32 orderHash) external view returns (uint256 blockNumber);
}
