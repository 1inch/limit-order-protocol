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
     * @notice Emitted on the first registration of an order — the single anchor write for
     * announcement-anchored auctions, and the broadcast resolvers read the order from. Emission proves
     * the maker itself sent the order, and it never fires again for the same one.
     * @param orderHash The hash of the announced order.
     * @param timestamp The block timestamp recorded as the announcement time. Carried in the event so
     * indexers need no extra block lookup; the emitting block itself is on the log already.
     * @param order The announced order.
     * @param extension The extension data associated with the order.
     */
    event OrderAnnounced(bytes32 indexed orderHash, uint256 timestamp, IOrderMixin.Order order, bytes extension);

    /**
     * @notice Registers an order. Callable only by the order's maker; reverts for any other sender.
     * Registration is idempotent: the first successful call records the announcement timestamp and
     * emits {OrderAnnounced}, and a repeated call is a silent success that changes nothing.
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
