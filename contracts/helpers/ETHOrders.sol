// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/OnlyWethReceiver.sol";

import "../interfaces/IPostInteraction.sol";
import "../OrderLib.sol";

/// @title ETH limit orders contract
contract ETHOrders is IPostInteraction, OnlyWethReceiver {
    using SafeERC20 for IWETH;
    using OrderLib for IOrderMixin.Order;
    using ConstraintsLib for Constraints;
    using ExtensionLib for bytes;
    using AddressLib for Address;

    error AccessDenied();
    error ETHTransferFailed();
    error InvalidOrder();
    error NotEnoughBalance();
    error ExistingOrder();

    address private immutable _limitOrderProtocol;
    IWETH private immutable _WETH; // solhint-disable-line var-name-mixedcase
    // Tracks ETH balances for orders.
    mapping(bytes32 => uint256) public ethOrderBalance;
    // Order makers to verify signatures against
    mapping(bytes32 => address) public orderMakers;

    event ETHDeposited(bytes32 orderHash, uint256 amount);
    event ETHOrderCancelled(bytes32 orderHash, uint256 amount);

    /// @notice Only limit order protocol can call this contract.
    modifier onlyLimitOrderProtocol() {
        if (msg.sender != _limitOrderProtocol) revert AccessDenied();

        _;
    }

    constructor(IWETH weth, address limitOrderProtocol) OnlyWethReceiver(address(weth)) {
        _WETH = weth;
        _limitOrderProtocol = limitOrderProtocol;
        _WETH.approve(limitOrderProtocol, type(uint256).max);
    }

    /*
     * @notice Returns batch of eth order balances for batch of orders hashes.
     */
    function ethOrderBalances(bytes32[] calldata orderHashes) external view returns(uint256[] memory rawAmounts) {
        rawAmounts = new uint256[](orderHashes.length);
        for (uint256 i = 0; i < orderHashes.length; i++) {
            rawAmounts[i] = ethOrderBalance[orderHashes[i]];
        }
    }

    /*
     * @notice Checks if ETH order is valid, makes ETH deposit for an order, saves real maker and wraps ETH into WETH.
     */
    function ethOrderDeposit(IOrderMixin.Order calldata order, bytes calldata extension) external payable returns(bytes32 orderHash) {
        if (!order.constraints.needPostInteractionCall()) revert InvalidOrder();
        order.validateExtension(extension);
        if (order.maker.get() != address(this)) revert AccessDenied();
        if (extension.getReceiver(order) != msg.sender) revert AccessDenied();
        if (order.makingAmount != msg.value) revert InvalidOrder();
        bytes calldata interaction = extension.postInteractionTargetAndData();
        if (interaction.length != 20 || address(bytes20(interaction)) != address(this)) revert InvalidOrder();
        orderHash = IOrderMixin(_limitOrderProtocol).hashOrder(order);
        if (orderMakers[orderHash] != address(0)) revert ExistingOrder();
        orderMakers[orderHash] = msg.sender;
        ethOrderBalance[orderHash] = msg.value;
        _WETH.safeDeposit(msg.value);
        emit ETHDeposited(orderHash, msg.value);
    }

    /**
     * @notice Sets ethOrderBalance to 0, refunds ETH and does standard order cancellation on Limit Order Protocol.
     */
    function cancelOrder(Constraints orderConstraints, bytes32 orderHash) external {
        if (orderMakers[orderHash] != msg.sender) revert InvalidOrder();
        IOrderMixin(_limitOrderProtocol).cancelOrder(orderConstraints, orderHash);
        uint256 refundETHAmount = ethOrderBalance[orderHash];
        ethOrderBalance[orderHash] = 0;
        _WETH.safeWithdrawTo(refundETHAmount, msg.sender);
        emit ETHOrderCancelled(orderHash, refundETHAmount);
    }

    /**
     * @notice Checks if orderHash signature was signed with real order maker.
     */
    function isValidSignature(bytes32 orderHash, bytes calldata signature) external view returns(bytes4) {
        if (ECDSA.recoverOrIsValidSignature(orderMakers[orderHash], orderHash, signature)) {
            return IERC1271.isValidSignature.selector;
        } else {
            return 0xffffffff;
        }
    }

    /**
     * @notice Callback method that gets called after all funds transfers.
     * Updates ethOrderBalance by makingAmount for order with orderHash.
     * @param orderHash Hash of the order being processed
     * @param makingAmount Actual making amount
     */
    function postInteraction(
        IOrderMixin.Order calldata /*order*/,
        bytes32 orderHash,
        address /*taker*/,
        uint256 makingAmount,
        uint256 /*takingAmount*/,
        uint256 /*remainingMakingAmount*/,
        bytes calldata /*extraData*/
    ) external onlyLimitOrderProtocol {
        if (ethOrderBalance[orderHash] < makingAmount) revert NotEnoughBalance();
        ethOrderBalance[orderHash] -= makingAmount;
    }
}
