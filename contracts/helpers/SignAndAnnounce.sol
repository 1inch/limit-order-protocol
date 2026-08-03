// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import { GnosisSafeStorage } from "@gnosis.pm/safe-contracts/contracts/examples/libraries/GnosisSafeStorage.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";
import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { IOrderRegistrator } from "../interfaces/IOrderRegistrator.sol";

/**
 * @title SignAndAnnounce
 * @notice Lets a Safe authorize a limit order and announce it in a single co-signed execution.
 * @dev The Safe delegatecalls {signAndAnnounce}, which marks the order digest in the Safe's own
 * `signedMessages` mapping — the Safe's ERC-1271 presign, read later by empty-signature fills — and
 * registers the order with the {OrderRegistrator}. The registrator authenticates by `msg.sender`,
 * which under delegatecall is the Safe itself, i.e. the order's maker, so the announcement anchor is
 * written in the same transaction and nothing is signed off-chain beyond the Safe execution itself.
 *
 * This is the {SafeOrderBuilder} pattern minus the oracle logic. As a Safe delegatecall target the
 * contract deliberately writes `signedMessages` and nothing else, holds no other storage, and has no
 * upgradeability.
 */
contract SignAndAnnounce is GnosisSafeStorage {
    bytes32 private constant _SAFE_MSG_TYPEHASH = keccak256("SafeMessage(bytes message)");

    IOrderMixin private immutable _LIMIT_ORDER_PROTOCOL;
    IOrderRegistrator private immutable _ORDER_REGISTRATOR;

    constructor(IOrderMixin limitOrderProtocol, IOrderRegistrator orderRegistrator) {
        _LIMIT_ORDER_PROTOCOL = limitOrderProtocol;
        _ORDER_REGISTRATOR = orderRegistrator;
    }

    /**
     * @notice Marks the order digest as signed by the calling Safe and announces the order.
     * @dev Must be delegatecalled by the Safe that is the order's maker.
     * @param order The order to authorize and announce.
     * @param extension The extension data associated with the order.
     */
    function signAndAnnounce(IOrderMixin.Order calldata order, bytes calldata extension) external {
        bytes32 msgHash = _getMessageHash(abi.encode(_LIMIT_ORDER_PROTOCOL.hashOrder(order)));
        signedMessages[msgHash] = 1;

        _ORDER_REGISTRATOR.registerOrder(order, extension);
    }

    /**
     * @dev Returns hash of a message that can be signed by owners.
     * @param message Message that should be hashed.
     * @return bytes32 hash of the message.
     */
    function _getMessageHash(bytes memory message) private view returns (bytes32) {
        bytes32 safeMessageHash = keccak256(abi.encode(_SAFE_MSG_TYPEHASH, keccak256(message)));
        return keccak256(abi.encodePacked(bytes1(0x19), bytes1(0x01), GnosisSafe(payable(address(this))).domainSeparator(), safeMessageHash));
    }
}
