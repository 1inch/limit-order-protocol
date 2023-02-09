// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../interfaces/IPreInteractionNotificationReceiver.sol";

/**
 * @notice OrderIdInvalidator stores pairs (orderId, orderHash)
 * that allows to execute only one order with the same orderId
 */
contract OrderIdInvalidator is IPreInteractionNotificationReceiver {
    error AccessDenied();
    error InvalidOrderHash();

    /// @notice Limit order protocol address.
    address private immutable _limitOrderProtocol;
    /// @notice Stores corresponding maker orders ids and hashes.
    mapping(address => mapping(uint32 => bytes32)) private _ordersIdsHashes;

    /// @notice Only limit order protocol can call this contract.
    modifier onlyLimitOrderProtocol() {
        if (msg.sender != _limitOrderProtocol) {
            revert AccessDenied();
        }
        _;
    }

    constructor(address limitOrderProtocol_) {
        _limitOrderProtocol = limitOrderProtocol_;
    }

    /**
     * @notice Callback method that gets called before any funds transfers
     * @param orderHash Hash of the order being processed
     * @param maker Order maker address.
     * @param interactionData Interaction calldata with uint256 orderId for orders replacement and validation.
     */
    function fillOrderPreInteraction(
        bytes32 orderHash,
        address maker,
        address /*taker*/,
        uint256 /*makingAmount*/,
        uint256 /*takingAmount*/,
        uint256 /*remainingAmount*/,
        bytes memory interactionData
    ) external onlyLimitOrderProtocol {
        uint32 orderId;
        /// @solidity memory-safe-assembly
        assembly { // solhint-disable-line no-inline-assembly
            orderId := mload(interactionData)
        }
        bytes32 storedOrderHash = _ordersIdsHashes[maker][orderId];
        if (storedOrderHash == 0x0) {
            _ordersIdsHashes[maker][orderId] = orderHash;
        } else if (storedOrderHash != orderHash) {
            revert InvalidOrderHash();
        }
    }
}
