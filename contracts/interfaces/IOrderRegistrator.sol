// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import { IOrderMixin } from "./IOrderMixin.sol";

/**
 * @title IOrderRegistrator
 * @dev The interface defines the structure of the order registrator contract.
 * The registrator is responsible for registering orders and emitting an event when an order is registered.
 * Registration is maker-only and signature-free: the transaction sender must be the order's maker,
 * which is the sole authentication. Fill authorization is carried separately by each flow.
 */
interface IOrderRegistrator {
    /**
     * @notice Emitted when an order is registered. Emission proves the maker itself sent the order.
     * @param order The order that was registered.
     * @param extension The extension data associated with the order.
     */
    event OrderRegistered(IOrderMixin.Order order, bytes extension);

    /**
     * @notice Emitted on the first registration of an order — the single anchor write for
     * announcement-anchored auctions. Never emitted again for the same order.
     * @param orderHash The hash of the announced order.
     * @param timestamp The block timestamp recorded as the announcement time. Carried in the event so
     * indexers need no extra block lookup; the emitting block itself is on the log already.
     */
    event OrderAnnounced(bytes32 indexed orderHash, uint256 timestamp);

    /**
     * @notice Registers an order. Callable only by the order's maker; reverts for any other sender.
     * The first successful call records the announcement timestamp and block number; repeated calls
     * re-emit {OrderRegistered} without moving the announcement.
     * @param order The order to be registered.
     * @param extension The extension data associated with the order.
     */
    function registerOrder(IOrderMixin.Order calldata order, bytes calldata extension) external;

    /**
     * @notice Returns the block timestamp of the first registration of an order.
     * @param orderHash The hash of the order.
     * @return timestamp The timestamp of the first registration, or 0 if the order was never registered.
     */
    function announcedAt(bytes32 orderHash) external view returns (uint256 timestamp);
}
