// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import { IERC1271 } from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { SafeERC20, IERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

import { IOrderMixin } from "../interfaces/IOrderMixin.sol";
import { IOrderRegistrator } from "../interfaces/IOrderRegistrator.sol";
import { IPreInteraction } from "../interfaces/IPreInteraction.sol";
import { MakerTraits, MakerTraitsLib } from "../libraries/MakerTraitsLib.sol";
import { ExtensionLib } from "../libraries/ExtensionLib.sol";

/**
 * @title DelegatedMaker
 * @notice A shared order maker that gives ERC-20 makers a one-transaction, no-signature, no-escrow flow.
 * @dev A user sends a single {createOrder} transaction and signs nothing: the contract records the user
 * as the order's owner — the presign read by {isValidSignature} at fill time — and registers the order,
 * anchoring any announcement-based auction in the same block. Funds never move at creation. The order
 * names this contract as its maker, so at fill time the protocol calls {preInteraction} immediately
 * before the maker-asset transfer, and the contract pulls exactly the filled amount from the owner's
 * wallet through their standing allowance. Custody time is zero; proceeds go straight to the owner,
 * because {createOrder} requires the order's receiver to be the owner.
 *
 * The token path has two allowances: the owner's allowance to this contract feeds the just-in-time pull,
 * and this contract's own allowance to the protocol — granted once per token by the permissionless
 * {approveRouter} — lets the protocol move the pulled funds to the taker. The latter is safe to leave
 * unbounded since the protocol only transfers within valid fills of orders this contract has presigned.
 *
 * The contract concentrates standing allowances, the same trust shape as the protocol itself; it holds
 * no balances between transactions and has no owner powers over user funds. Contract wallets can use it
 * the same way EOAs do, though a Safe keeps cleaner provenance staying its own maker via SignAndAnnounce.
 */
contract DelegatedMaker is IERC1271, IPreInteraction {
    using AddressLib for Address;
    using SafeERC20 for IERC20;
    using MakerTraitsLib for MakerTraits;
    using ExtensionLib for bytes;

    /// @dev The function may only be called by the limit order protocol.
    error OnlyLimitOrderProtocol();
    /// @dev The order's maker must be this contract.
    error InvalidMaker();
    /// @dev The order's receiver must be the creating owner, so proceeds bypass the shared contract.
    error InvalidReceiver();
    /// @dev Orders must use the per-order remaining invalidator and the pre-interaction hook.
    error InvalidMakerTraits();
    /// @dev The order's pre-interaction must target this contract, or the pull never happens.
    error InvalidPreInteractionTarget();
    /// @dev The order was registered before; a cancelled order cannot be revived either.
    error OrderAlreadyRegistered();
    /// @dev Only the recorded owner of the order may act on it.
    error AccessDenied();

    /**
     * @notice Emitted when an order is created and presigned on behalf of an owner.
     * @param orderHash The hash of the created order.
     * @param owner The wallet whose funds the order draws on.
     */
    event DelegatedOrderCreated(bytes32 indexed orderHash, address indexed owner);

    /**
     * @notice Emitted when an owner cancels their order.
     * @param orderHash The hash of the cancelled order.
     */
    event DelegatedOrderCancelled(bytes32 indexed orderHash);

    IOrderMixin private immutable _LIMIT_ORDER_PROTOCOL;
    IOrderRegistrator private immutable _ORDER_REGISTRATOR;

    /// @notice The wallet each order draws funds from — the presign, deleted on cancellation.
    mapping(bytes32 orderHash => address owner) public approvedOrders;

    constructor(IOrderMixin limitOrderProtocol, IOrderRegistrator orderRegistrator) {
        _LIMIT_ORDER_PROTOCOL = limitOrderProtocol;
        _ORDER_REGISTRATOR = orderRegistrator;
    }

    /**
     * @notice Creates, presigns and announces an order on behalf of the caller — the only per-order
     * transaction, with nothing signed off-chain.
     * @dev The order must name this contract as maker and the caller as receiver, must use the
     * remaining invalidator (partial and multiple fills allowed — the bit-invalidator nonce space would
     * be shared across users), and must route its pre-interaction to this contract (an absent
     * pre-interaction target defaults to the order's maker, which is this contract). The duplicate check
     * reads the registrator rather than local state: a cancelled order deletes its local approval, but
     * its protocol-level invalidation is permanent, so re-creating it would only produce a dead order.
     * @param order The order to create; its maker is this contract, its funds are the caller's.
     * @param extension The extension data associated with the order.
     */
    function createOrder(IOrderMixin.Order calldata order, bytes calldata extension) external {
        if (order.maker.get() != address(this)) revert InvalidMaker();
        if (order.receiver.get() != msg.sender) revert InvalidReceiver();
        if (order.makerTraits.useBitInvalidator() || !order.makerTraits.needPreInteractionCall()) revert InvalidMakerTraits();
        bytes calldata preInteractionData = extension.preInteractionTargetAndData();
        if (preInteractionData.length >= 20 && address(bytes20(preInteractionData)) != address(this)) revert InvalidPreInteractionTarget();

        bytes32 orderHash = _LIMIT_ORDER_PROTOCOL.hashOrder(order);
        if (_ORDER_REGISTRATOR.announcedAt(orderHash) != 0) revert OrderAlreadyRegistered();

        approvedOrders[orderHash] = msg.sender;
        emit DelegatedOrderCreated(orderHash, msg.sender);

        _ORDER_REGISTRATOR.registerOrder(order, extension);
    }

    /**
     * @notice Cancels an order previously created by the caller.
     * @dev Deletes the presign and invalidates the order at the protocol as its maker. Both matter: the
     * protocol validates ERC-1271 only on the first fill, so deleting the presign alone would not stop
     * further partial fills of an already-started order — the protocol-level invalidation kills those,
     * and the per-fill owner check in {preInteraction} backs that up.
     * @param order The order to cancel.
     */
    function cancelOrder(IOrderMixin.Order calldata order) external {
        bytes32 orderHash = _LIMIT_ORDER_PROTOCOL.hashOrder(order);
        if (approvedOrders[orderHash] != msg.sender) revert AccessDenied();
        delete approvedOrders[orderHash];
        emit DelegatedOrderCancelled(orderHash);

        _LIMIT_ORDER_PROTOCOL.cancelOrder(order.makerTraits, orderHash);
    }

    /**
     * @notice Grants the limit order protocol an unlimited allowance for a token this contract makes with.
     * @dev Permissionless and required once per maker asset: the protocol transfers the pulled funds out
     * of this contract with `transferFrom`, which needs this allowance. Unbounded is safe here because
     * the protocol only transfers within valid fills of presigned orders.
     * @param token The token to approve.
     */
    function approveRouter(IERC20 token) external {
        token.forceApprove(address(_LIMIT_ORDER_PROTOCOL), type(uint256).max);
    }

    /**
     * @notice See {IERC1271-isValidSignature}. The presign: a hash is signed while its order is approved.
     * @dev The signature bytes are ignored — authorization was given on-chain in {createOrder} — so fills
     * pass an empty signature.
     */
    function isValidSignature(bytes32 hash, bytes calldata /* signature */) external view returns (bytes4) {
        return approvedOrders[hash] != address(0) ? this.isValidSignature.selector : bytes4(0);
    }

    /**
     * @notice See {IPreInteraction-preInteraction}. Pulls exactly the filled amount from the order's
     * owner immediately before the protocol moves the maker asset to the taker.
     * @dev Checked on every fill, not just the first: a cancelled order has no owner on record and
     * cannot pull, whatever state the fill reached the protocol in.
     */
    function preInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 orderHash,
        address /* taker */,
        uint256 makingAmount,
        uint256 /* takingAmount */,
        uint256 /* remainingMakingAmount */,
        bytes calldata /* extraData */
    ) external {
        if (msg.sender != address(_LIMIT_ORDER_PROTOCOL)) revert OnlyLimitOrderProtocol();
        address owner = approvedOrders[orderHash];
        if (owner == address(0)) revert AccessDenied();

        IERC20(order.makerAsset.get()).safeTransferFrom(owner, address(this), makingAmount);
    }
}
