// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { IERC5267 } from "@openzeppelin/contracts/interfaces/IERC5267.sol";
import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { IOrderRegistrator } from "../interfaces/IOrderRegistrator.sol";
import { OrderLib } from "../OrderLib.sol";

/**
 * @title OrderRegistrator
 * @notice Announces orders on-chain and records when each one was first announced.
 * @dev Registration is authenticated by the transaction itself: only the order's maker may call
 * {registerOrder}, so no signature is taken and none is checked. The emitted order therefore always
 * originates from its maker, but carries no fill authorization — that lives wherever each flow keeps it
 * (presign state for contract makers such as {DelegatedMaker} and Safes, the off-chain orderbook for
 * EOA fill signatures). Neither the broadcast nor the clock can be delegated to a relayer.
 *
 * The recorded announcement is what {FusionAnchoredAuction} anchors an auction to, so it is written
 * once and never moved: a repeated registration of the same order is a silent success that changes
 * nothing. The announcement is keyed by order hash alone, which already commits to the maker.
 */
contract OrderRegistrator is IOrderRegistrator {
    using AddressLib for Address;
    using OrderLib for IOrderMixin.Order;

    error AccessDenied();

    bytes32 private constant _DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    IOrderMixin private immutable _LIMIT_ORDER_PROTOCOL;
    bytes32 private immutable _HASHED_NAME;
    bytes32 private immutable _HASHED_VERSION;

    /// @notice See {IOrderRegistrator-announcedAt}.
    mapping(bytes32 orderHash => uint256 timestamp) public announcedAt;

    constructor(IOrderMixin limitOrderProtocol) {
        _LIMIT_ORDER_PROTOCOL = limitOrderProtocol;
        (, string memory name, string memory version,,,,) = IERC5267(address(limitOrderProtocol)).eip712Domain();
        _HASHED_NAME = keccak256(bytes(name));
        _HASHED_VERSION = keccak256(bytes(version));
    }

    /// @dev The protocol's order hash, computed locally: the domain is rebuilt from immutables captured
    /// at construction (fork-safe via block.chainid), so no cross-contract call carries the order.
    function _hashOrder(IOrderMixin.Order calldata order) private view returns (bytes32) {
        bytes32 domainSeparator = keccak256(abi.encode(
            _DOMAIN_TYPEHASH, _HASHED_NAME, _HASHED_VERSION, block.chainid, address(_LIMIT_ORDER_PROTOCOL)
        ));
        return order.hash(domainSeparator);
    }

    /**
     * @notice See {IOrderRegistrator-registerOrder}.
     */
    function registerOrder(IOrderMixin.Order calldata order, bytes calldata extension) external returns (bytes32 orderHash, bool firstRegistration) {
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

        if (msg.sender != order.maker.get()) revert AccessDenied();

        orderHash = _hashOrder(order);

        if (announcedAt[orderHash] == 0) {
            firstRegistration = true;
            // solhint-disable-next-line not-rely-on-time
            announcedAt[orderHash] = block.timestamp;
            // solhint-disable-next-line not-rely-on-time
            emit OrderAnnounced(orderHash, block.timestamp, order, extension);
        }
    }
}
