// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "../interfaces/IPreInteraction.sol";

/**
 * @notice OrderIdInvalidator stores pairs (orderId, orderHash)
 * that allows to execute only one order with the same orderId
 */
contract OrderIdInvalidator is IPreInteraction {
    using AddressLib for Address;

    error AccessDenied();
    error InvalidOrderHash();

    /// @notice Limit order protocol address.
    address private immutable _LIMIT_ORDER_PROTOCOL;
    /// @notice Stores corresponding maker orders ids and hashes.
    mapping(address maker => mapping(uint32 orderId => bytes32 orderHash)) private _ordersIdsHashes;

    /// @notice Only limit order protocol can call this contract.
    modifier onlyLimitOrderProtocol() {
        if (msg.sender != _LIMIT_ORDER_PROTOCOL) {
            revert AccessDenied();
        }
        _;
    }

    constructor(address limitOrderProtocol_) {
        _LIMIT_ORDER_PROTOCOL = limitOrderProtocol_;
    }

    function preInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 orderHash,
        address /* taker */,
        uint256 /* makingAmount */,
        uint256 /* takingAmount */,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external onlyLimitOrderProtocol {
        uint32 orderId = uint32(bytes4(extraData));
        bytes32 storedOrderHash = _ordersIdsHashes[order.maker.get()][orderId];
        if (storedOrderHash == 0x0) {
            _ordersIdsHashes[order.maker.get()][orderId] = orderHash;
        } else if (storedOrderHash != orderHash) {
            revert InvalidOrderHash();
        }
    }
}
