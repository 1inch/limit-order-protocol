// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { ECDSA } from "@1inch/solidity-utils/contracts/libraries/ECDSA.sol";
import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { IOrderRegistrator } from "../interfaces/IOrderRegistrator.sol";
import { OrderLib } from "../OrderLib.sol";

/**
 * @title OrderRegistrator
 * @notice Announces orders on-chain and records when each one was first announced.
 * @dev The recorded announcement is what {FusionAnchoredAuction} anchors an auction to, so it is written
 * once and never moved: a repeated registration of the same order keeps the original announcement and
 * only re-emits the event. Registration is permissionless — any caller holding a valid signature, or any
 * caller at all once a contract maker has marked the order digest, may announce an order and thereby
 * start the clock for an anchored auction.
 * The announcement is keyed by order hash alone, which already commits to the maker.
 */
contract OrderRegistrator is IOrderRegistrator {
    using AddressLib for Address;
    using OrderLib for IOrderMixin.Order;

    uint256 private constant _TIMESTAMP_OFFSET = 64;
    uint256 private constant _BLOCK_NUMBER_MASK = type(uint64).max;

    IOrderMixin private immutable _LIMIT_ORDER_PROTOCOL;

    /// @dev Announcement timestamp shifted left by 64 bits, announcement block number in the low 64 bits.
    mapping(bytes32 orderHash => uint256 announcement) private _announcements;

    constructor(IOrderMixin limitOrderProtocol) {
        _LIMIT_ORDER_PROTOCOL = limitOrderProtocol;
    }

    /**
     * @notice See {IOrderRegistrator-registerOrder}.
     */
    function registerOrder(IOrderMixin.Order calldata order, bytes calldata extension, bytes calldata signature) external {
        // Validate order
        {
            (bool valid, bytes4 validationResult) = order.isValidExtension(extension);
            if (!valid) {
                // solhint-disable-next-line no-inline-assembly
                assembly ("memory-safe") {
                    mstore(0, validationResult)
                    revert(0, 4)
                }
            }
        }

        bytes32 orderHash = _LIMIT_ORDER_PROTOCOL.hashOrder(order);

        // Validate signature
        if(!ECDSA.recoverOrIsValidSignature(order.maker.get(), orderHash, signature)) revert IOrderMixin.BadSignature();

        if (_announcements[orderHash] == 0) {
            // solhint-disable-next-line not-rely-on-time
            _announcements[orderHash] = (block.timestamp << _TIMESTAMP_OFFSET) | block.number;
        }

        emit OrderRegistered(order, extension, signature);
    }

    /**
     * @notice See {IOrderRegistrator-announcedAt}.
     */
    function announcedAt(bytes32 orderHash) external view returns (uint256 timestamp) {
        return _announcements[orderHash] >> _TIMESTAMP_OFFSET;
    }

    /**
     * @notice See {IOrderRegistrator-announcedAtBlock}.
     */
    function announcedAtBlock(bytes32 orderHash) external view returns (uint256 blockNumber) {
        return _announcements[orderHash] & _BLOCK_NUMBER_MASK;
    }
}
