// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { SafeERC20, IERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { OnlyWethReceiver } from "@1inch/solidity-utils/contracts/mixins/OnlyWethReceiver.sol";
import { IWETH } from "@1inch/solidity-utils/contracts/interfaces/IWETH.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

import { EIP712Alien } from "contracts/mocks/EIP712Alien.sol";
import { ChainablePostInteraction } from "./ChainablePostInteraction.sol";
import { OrderLib, IOrderMixin } from "../OrderLib.sol";
import { MakerTraits, MakerTraitsLib } from "../libraries/MakerTraitsLib.sol";
import { ExtensionLib } from "../libraries/ExtensionLib.sol";
import { Auction, AuctionLib } from "../libraries/Auction.sol";

/// @title Extension that will allow to create limit order that sell ETH. ETH must be deposited into the contract.
contract ETHOrders is ERC20, ChainablePostInteraction, OnlyWethReceiver, EIP712Alien {
    using SafeERC20 for IWETH;
    using SafeERC20 for IERC20;
    using OrderLib for IOrderMixin.Order;
    using MakerTraitsLib for MakerTraits;
    using ExtensionLib for bytes;
    using AddressLib for Address;
    using AuctionLib for Auction;

    event ETHDeposited(address maker, bytes32 orderHash, uint256 amount);
    event ETHOrderCancelled(bytes32 orderHash, uint256 amount);
    event ETHOrderCancelledByThirdParty(bytes32 orderHash, uint256 amount, uint256 reward);
    event ETHCancelled(address maker, bytes32 orderHash, uint256 amount);

    error OnlyResolverAccessDenied(address caller);
    error OrderShouldNotExist(address maker, bytes32 orderHash, uint256 balance);
    error OrderShouldRequirePostInteractionCall(MakerTraits makerTraits);
    error OrderMakerShouldBeThisContract(address maker, address thisContract);
    error OrderReceiverShouldNotBeThis(address receiver, address self);
    error OrderMakingAmountShouldBeEqualToMsgValue(uint256 makingAmount, uint256 msgValue);
    error OrderPostInteractionTargetShouldBeThisContract(address target, address thisContract);
    error OrderExtensionInvalid(bytes4 exception);
    error OrderShouldBeExpired(uint256 currentTimestamp, uint256 expirationTimestamp);
    error CanNotCancelForZeroBalance();
    error RescueFundsTooMuch(uint256 requested, uint256 available);
    error PostInteractionExtraDataShouldMatchMaker(address orderMaker, address maker);
    error TransferRestricted(address from, address to, uint256 value);

    /// @notice Bond information for an order
    /// @param balance The amount of ETH deposited for the order
    /// @param auction The base gas costs bump auction information
    struct Bond {
        uint208 balance;
        Auction auction; // maxGasBump in basis points (1_000)
    }

    uint256 private constant _BUMP_BASE = 1_000;
    uint256 private constant _CANCEL_GAS_LOWER_BOUND = 30_000;

    address private immutable _LIMIT_ORDER_PROTOCOL;
    IWETH private immutable _WETH;
    IERC20 private immutable _ACCESS_TOKEN;

    mapping(address maker => mapping(bytes32 orderHash => Bond)) public bonds;

    modifier onlyResolver {
        if (_ACCESS_TOKEN.balanceOf(msg.sender) == 0) revert OnlyResolverAccessDenied(msg.sender);
        _;
    }

    constructor(
        IWETH weth,
        address limitOrderProtocol,
        IERC20 accessToken,
        string memory name,
        string memory symbol
    )
        ERC20(name, symbol)
        ChainablePostInteraction(limitOrderProtocol)
        OnlyWethReceiver(address(weth))
        EIP712Alien(_LIMIT_ORDER_PROTOCOL, "1inch Limit Order Protocol", "4")
    {
        _WETH = weth;
        _LIMIT_ORDER_PROTOCOL = limitOrderProtocol;
        _ACCESS_TOKEN = accessToken;
        _WETH.forceApprove(limitOrderProtocol, type(uint256).max);
    }

    function deposit(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        Auction auction
    ) external payable {
        address maker = msg.sender;
        // Validate main order parameters
        if (order.maker.get() != address(this)) revert OrderMakerShouldBeThisContract(order.maker.get(), address(this));
        if (order.getReceiver() == address(this)) revert OrderReceiverShouldNotBeThis(order.getReceiver(), address(this));
        if (order.makingAmount != msg.value) revert OrderMakingAmountShouldBeEqualToMsgValue(order.makingAmount, msg.value);

        // Validate post interaction flag and target
        if (!order.makerTraits.needPostInteractionCall()) revert OrderShouldRequirePostInteractionCall(order.makerTraits);
        (bool isExtensionValid, bytes4 validationResult) = order.isValidExtension(extension);
        if (!isExtensionValid) revert OrderExtensionInvalid(validationResult);

        // Validate post-interaction target and data
        bytes calldata interaction = extension.postInteractionTargetAndData();
        // TODO: second condition can't be true for dynamic chaining
        if (interaction.length != 20 || address(bytes20(interaction)) != address(this)) revert OrderPostInteractionTargetShouldBeThisContract(address(bytes20(interaction)), address(this));
        address orderMaker = address(bytes20(interaction[20:40]));
        if (orderMaker != maker) revert PostInteractionExtraDataShouldMatchMaker(orderMaker, maker);

        // EIP712Alien._domainSeparatorV4() is cheaper than call IOrderMixin(_LIMIT_ORDER_PROTOCOL).hashOrder(order);
        bytes32 orderHash = order.hash(_domainSeparatorV4());
        if (bonds[maker][orderHash].balance != 0) revert OrderShouldNotExist(maker, orderHash, bonds[maker][orderHash].balance);

        // Effects and interactions
        _mint(msg.sender, msg.value);
        bonds[msg.sender][orderHash] = Bond({
            balance: uint208(msg.value),
            auction: auction
        });
        _WETH.safeDeposit(msg.value);
        emit ETHDeposited(msg.sender, orderHash, msg.value);
    }

    function isValidSignature(bytes32 orderHash, bytes calldata signature) external view returns(bytes4) {
        address maker = address(bytes20(signature));
        uint256 balance = bonds[maker][orderHash].balance;
        return (balance > 0) ? this.isValidSignature.selector : bytes4(0);
    }

    function cancelOrder(bytes32 orderHash) external {
        return _cancelOrder(msg.sender, orderHash, 0);
    }

    function cancelExpiredOrderByResolver(address maker, IOrderMixin.Order calldata order) external onlyResolver {
        uint256 orderExpirationTime = order.makerTraits.getExpirationTime();
        if (orderExpirationTime > 0 && block.timestamp > orderExpirationTime) revert OrderShouldBeExpired(block.timestamp, order.makerTraits.getExpirationTime());

        // Using EIP712Alien._domainSeparatorV4() is cheaper than call IOrderMixin(_LIMIT_ORDER_PROTOCOL).hashOrder(order);
        bytes32 orderHash = order.hash(_domainSeparatorV4());
        Bond storage bond = bonds[maker][orderHash];
        uint256 resolverReward = getResolverReward(bond.auction, orderExpirationTime);
        _cancelOrder(maker, orderHash, resolverReward);
    }

    function _cancelOrder(address maker, bytes32 orderHash, uint256 resolverReward) internal {
        uint256 balance = bonds[maker][orderHash].balance;
        if (balance == 0) revert CanNotCancelForZeroBalance();
        _burn(maker, balance);
        bonds[maker][orderHash].balance = 0;

        if (resolverReward > 0) {
            balance -= resolverReward;
            _WETH.safeWithdrawTo(resolverReward, msg.sender);
        }
        if (balance > 0) {
            _WETH.safeWithdrawTo(balance, maker);
        }
        emit ETHCancelled(maker, orderHash, balance);
    }

    function _postInteraction(
        IOrderMixin.Order calldata /* order */,
        bytes calldata /* extension */,
        bytes32 orderHash,
        address /* taker */,
        uint256 makingAmount,
        uint256 /* takingAmount */,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) internal override returns (bytes calldata) {
        address maker = address(bytes20(extraData[:20]));
        _burn(maker, makingAmount);
        bonds[maker][orderHash].balance -= uint208(makingAmount);
        return extraData[20:];
    }

    function getResolverReward(Auction auction, uint256 orderExpirationTime) public view returns (uint256) {
        uint256 gasCostsBump = auction.currentValue(orderExpirationTime);
        return _CANCEL_GAS_LOWER_BOUND * block.basefee * (_BUMP_BASE + gasCostsBump) / _BUMP_BASE;
    }

    function rescueFunds(address token, address to, uint256 amount) external onlyResolver {
        if (token == address(0)) {
            payable(to).transfer(amount);
        } else if (IWETH(token) == _WETH) {
            uint256 available = _WETH.safeBalanceOf(address(this)) - totalSupply();
            if (amount > available) revert RescueFundsTooMuch(amount, available);
            _WETH.safeWithdrawTo(amount, to);
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    // ERC20 override to prevent transfers
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) revert TransferRestricted(from, to, value);
        super._update(from, to, value);
    }
}
