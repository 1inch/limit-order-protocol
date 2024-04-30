// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/mixins/OnlyWethReceiver.sol";

import "../interfaces/IPostInteraction.sol";
import "../OrderLib.sol";

/// @title Extension that will allow to create limit order that sell ETH. ETH must be deposited into the contract.
contract ETHOrders is IPostInteraction, OnlyWethReceiver {
    using SafeERC20 for IWETH;
    using OrderLib for IOrderMixin.Order;
    using MakerTraitsLib for MakerTraits;
    using ExtensionLib for bytes;
    using AddressLib for Address;

    error AccessDenied();
    error InvalidOrder();
    error NotEnoughBalance();
    error ExistingOrder();

    /// @notice ETH order struct.
    struct ETHOrder {
        address maker;
        uint96 balance;
    }

    address private immutable _LIMIT_ORDER_PROTOCOL;
    IWETH private immutable _WETH;
    /// @notice Makers and their uint96 ETH balances in single mapping.
    mapping(bytes32 orderHash => ETHOrder data) public ordersMakersBalances;

    event ETHDeposited(bytes32 orderHash, uint256 amount);
    event ETHOrderCancelled(bytes32 orderHash, uint256 amount);

    /// @notice Only limit order protocol can call this contract.
    modifier onlyLimitOrderProtocol() {
        if (msg.sender != _LIMIT_ORDER_PROTOCOL) revert AccessDenied();

        _;
    }

    constructor(IWETH weth, address limitOrderProtocol) OnlyWethReceiver(address(weth)) {
        _WETH = weth;
        _LIMIT_ORDER_PROTOCOL = limitOrderProtocol;
        _WETH.approve(limitOrderProtocol, type(uint256).max);
    }

    /*
     * @notice Returns batch of eth order for batch of orders hashes.
     */
    function ethOrdersBatch(bytes32[] calldata orderHashes) external view returns(ETHOrder[] memory ethOrders) {
        ethOrders = new ETHOrder[](orderHashes.length);
        for (uint256 i = 0; i < orderHashes.length; i++) {
            ethOrders[i] = ordersMakersBalances[orderHashes[i]];
        }
    }

    /*
     * @notice Checks if ETH order is valid, makes ETH deposit for an order, saves real maker and wraps ETH into WETH.
     */
    function ethOrderDeposit(IOrderMixin.Order calldata order, bytes calldata extension) external payable returns(bytes32 orderHash) {
        if (!order.makerTraits.needPostInteractionCall()) revert InvalidOrder();
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
        if (order.maker.get() != address(this)) revert AccessDenied();
        if (order.getReceiver() != msg.sender) revert AccessDenied();
        if (order.makingAmount != msg.value) revert InvalidOrder();
        bytes calldata interaction = extension.postInteractionTargetAndData();
        if (interaction.length != 20 || address(bytes20(interaction)) != address(this)) revert InvalidOrder();
        orderHash = IOrderMixin(_LIMIT_ORDER_PROTOCOL).hashOrder(order);
        if (ordersMakersBalances[orderHash].maker != address(0)) revert ExistingOrder();
        ordersMakersBalances[orderHash] = ETHOrder({
            maker: msg.sender,
            balance: uint96(msg.value)
        });
        _WETH.safeDeposit(msg.value);
        emit ETHDeposited(orderHash, msg.value);
    }

    /**
     * @notice Sets ordersMakersBalances to 0, refunds ETH and does standard order cancellation on Limit Order Protocol.
     */
    function cancelOrder(MakerTraits makerTraits, bytes32 orderHash) external {
        if (ordersMakersBalances[orderHash].maker != msg.sender) revert InvalidOrder();
        IOrderMixin(_LIMIT_ORDER_PROTOCOL).cancelOrder(makerTraits, orderHash);
        uint256 refundETHAmount = ordersMakersBalances[orderHash].balance;
        ordersMakersBalances[orderHash].balance = 0;
        _WETH.safeWithdrawTo(refundETHAmount, msg.sender);
        emit ETHOrderCancelled(orderHash, refundETHAmount);
    }

    /**
     * @notice Checks if orderHash signature was signed with real order maker.
     */
    function isValidSignature(bytes32 orderHash, bytes calldata signature) external view returns(bytes4) {
        if (ECDSA.recoverOrIsValidSignature(ordersMakersBalances[orderHash].maker, orderHash, signature)) {
            return IERC1271.isValidSignature.selector;
        } else {
            return 0xffffffff;
        }
    }

    /**
     * @notice Callback method that gets called after all funds transfers.
     * Updates _ordersMakersBalances by makingAmount for order with orderHash.
     * @param orderHash Hash of the order being processed
     * @param makingAmount Actual making amount
     */
    function postInteraction(
        IOrderMixin.Order calldata /*order*/,
        bytes calldata /* extension */,
        bytes32 orderHash,
        address /*taker*/,
        uint256 makingAmount,
        uint256 /*takingAmount*/,
        uint256 /*remainingMakingAmount*/,
        bytes calldata /*extraData*/
    ) external onlyLimitOrderProtocol {
        if (ordersMakersBalances[orderHash].balance < makingAmount) revert NotEnoughBalance();
        unchecked {
            ordersMakersBalances[orderHash].balance -= uint96(makingAmount);
        }
    }
}
