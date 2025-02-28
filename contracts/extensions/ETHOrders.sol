// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/mixins/OnlyWethReceiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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
    error OrderNotExpired();
    error RewardIsTooBig();
    error CancelOrderByResolverIsForbidden();

    /// @notice ETH order struct.
    struct ETHOrder {
        address maker;
        uint96 balance;
        uint16 maximumPremium;
        uint32 auctionDuration;
    }

    uint256 private constant _PREMIUM_BASE = 1e3;
    uint256 private constant _CANCEL_GAS_LOWER_BOUND = 30000;

    address private immutable _LIMIT_ORDER_PROTOCOL;
    IWETH private immutable _WETH;
    IERC20 private immutable _ACCESS_TOKEN;

    mapping(bytes32 orderHash => ETHOrder data) public ordersMakersBalances;

    event ETHDeposited(bytes32 orderHash, uint256 amount);
    event ETHOrderCancelled(bytes32 orderHash, uint256 amount);
    event ETHOrderCancelledByThirdParty(bytes32 orderHash, uint256 amount, uint256 reward);

    /// @notice Only limit order protocol can call this contract.
    modifier onlyLimitOrderProtocol() {
        if (msg.sender != _LIMIT_ORDER_PROTOCOL) revert AccessDenied();

        _;
    }

    constructor(IWETH weth, address limitOrderProtocol, IERC20 accessToken) OnlyWethReceiver(address(weth)) {
        _WETH = weth;
        _LIMIT_ORDER_PROTOCOL = limitOrderProtocol;
        _ACCESS_TOKEN = accessToken;
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
    function ethOrderDeposit(
        IOrderMixin.Order calldata order, 
        bytes calldata extension, 
        uint16 maximumPremium, 
        uint32 auctionDuration
    ) external payable returns(bytes32 orderHash) {
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
            balance: uint96(msg.value),
            maximumPremium: maximumPremium,
            auctionDuration: auctionDuration
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
     * @notice Allows third-party to cancel an expired order and receive a reward.
     * @param makerTraits The traits of the maker
     * @param orderHash Hash of the order to cancel
     */
    function cancelOrderByResolver(MakerTraits makerTraits, bytes32 orderHash) external {
        unchecked {
            if (_ACCESS_TOKEN.balanceOf(msg.sender) == 0) revert AccessDenied();
            if (!makerTraits.isExpired()) revert OrderNotExpired();
            ETHOrder memory ethOrder = ordersMakersBalances[orderHash];
            if (ethOrder.maker == address(0)) revert InvalidOrder();
            if (ethOrder.maximumPremium == 0) revert CancelOrderByResolverIsForbidden();
            IOrderMixin(_LIMIT_ORDER_PROTOCOL).cancelOrder(makerTraits, orderHash);
            uint256 reward = _CANCEL_GAS_LOWER_BOUND * block.basefee * (_PREMIUM_BASE + _getCurrentPremiumMultiplier(ethOrder, makerTraits.getExpirationTime())) / _PREMIUM_BASE;
            if (reward > ethOrder.balance) revert RewardIsTooBig();
            uint256 refundETHAmount = ethOrder.balance - reward;
            ordersMakersBalances[orderHash].balance = 0;
            if (reward > 0) {
                _WETH.safeWithdrawTo(reward, msg.sender);
            }
            if (refundETHAmount > 0) {
                _WETH.safeWithdrawTo(refundETHAmount, ethOrder.maker);
            }
            emit ETHOrderCancelledByThirdParty(orderHash, ethOrder.balance, reward);
        }
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

    /**
     * @notice Calculates the current premium multiplier based on time since expiration.
     * @param order The ETH order
     * @param expirationTime The expiration time of the order
     * @return The current premium multiplier (scaled by 1e3)
     */
    function _getCurrentPremiumMultiplier(ETHOrder memory order, uint256 expirationTime) private view returns (uint256) {
        unchecked {
            if (block.timestamp <= expirationTime) {
                return 0;
            }
            uint256 timeElapsed = block.timestamp - expirationTime;
            if (timeElapsed >= order.auctionDuration) {
                return order.maximumPremium;
            }
            return (timeElapsed * order.maximumPremium) / order.auctionDuration;
        }
    }
}
