// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/solidity-utils/contracts/interfaces/IWETH.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

import "./interfaces/IOrderMixin.sol";
import "./interfaces/IPostInteractionNotificationReceiver.sol";
import "./libraries/Errors.sol";
import "./OrderLib.sol";
import "hardhat/console.sol";

/// @title ETH limit orders contract
contract ETHOrders is EIP712("1inch Limit Order Protocol", "3"), IPostInteractionNotificationReceiver {
    using SafeERC20 for IERC20;
    using OrderLib for OrderLib.Order;
    using AddressLib for Address;

    error AccessDenied();
    error ETHTransferFailed();
    error InvalidOrder();
    error NotEnoughBalance();
    error ExistingOrder();

    bytes4 private constant _MAGICVALUE = 0x1626ba7e;
    uint256 private constant _ORDER_DOES_NOT_EXIST = 0;
    uint256 private constant _ORDER_FILLED = 1;
    uint256 private constant _SKIP_PERMIT_FLAG = 1 << 255;
    uint256 private constant _THRESHOLD_MASK = ~_SKIP_PERMIT_FLAG;

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
        if (msg.sender != _limitOrderProtocol) {
            revert AccessDenied();
        }
        _;
    }

    constructor(IWETH weth, address limitOrderProtocol) {
        _WETH = weth;
        _limitOrderProtocol = limitOrderProtocol;
        _WETH.approve(limitOrderProtocol, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF);
    }

    function ethOrderBalances(bytes32[] calldata orderHashes) external view returns(uint256[] memory /* rawAmounts */) {
        uint256[] memory results = new uint256[](orderHashes.length);
        for (uint256 i = 0; i < orderHashes.length; i++) {
            results[i] = ethOrderBalance[orderHashes[i]];
        }
        return results;
    }

    /*
     * @notice Checks if ETH order is valid, makes ETH deposit for an order, saves real maker and wraps ETH into WETH.
     */
    function ethOrderDeposit(OrderLib.Order calldata order) external payable returns(bytes32 orderHash) {
        if (order.maker.get() != address(this)) revert AccessDenied();
        if (order.receiver.get() != msg.sender) revert AccessDenied();
        if (order.makingAmount != msg.value) revert InvalidOrder();
        if (orderMakers[orderHash] != address(0)) revert ExistingOrder();
        bytes calldata interaction = order.postInteraction();
        if (interaction.length < 20) {
            revert InvalidOrder();
        }
        address interactionTarget = address(bytes20(interaction));
        if (interactionTarget != address(this)) {
            revert InvalidOrder();
        }
        orderHash = IOrderMixin(_limitOrderProtocol).hashOrder(order);
        orderMakers[orderHash] = msg.sender;
        ethOrderBalance[orderHash] = msg.value;
        _WETH.deposit{ value: msg.value }();
        emit ETHDeposited(orderHash, msg.value);
    }

    /**
     * @notice Sets ethOrderBalance to 0, refunds ETH and does standard order cancellation on Limit Order Protocol.
     */
    function cancelOrder(OrderLib.Order calldata order) external returns(uint256 orderRemaining, bytes32 orderHash) {
        if (order.maker.get() != address(this)) revert AccessDenied();
        if (order.receiver.get() != msg.sender) revert AccessDenied();
        (orderRemaining, orderHash) = IOrderMixin(_limitOrderProtocol).cancelOrder(order);
        uint256 refundETHAmount = ethOrderBalance[orderHash];
        ethOrderBalance[orderHash] = 0;
        _WETH.transfer(msg.sender, refundETHAmount);
        emit ETHOrderCancelled(orderHash, refundETHAmount);
    }

    /**
     * @notice Checks if orderHash signature was signed with real order maker.
     */
    function isValidSignature(bytes32 orderHash, bytes calldata signature) external view returns(bytes4) {
        if (ECDSA.recoverOrIsValidSignature(orderMakers[orderHash], orderHash, signature)) {
            return _MAGICVALUE;
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
    function fillOrderPostInteraction(
        bytes32 orderHash,
        address /* maker */,
        address /* taker */,
        uint256 makingAmount,
        uint256 /* takingAmount */,
        uint256 /* remainingAmount */,
        bytes memory /* interactionData */
    ) external onlyLimitOrderProtocol {
        if (ethOrderBalance[orderHash] < makingAmount) {
            revert NotEnoughBalance();
        }
        ethOrderBalance[orderHash] -= makingAmount;
    }
}
