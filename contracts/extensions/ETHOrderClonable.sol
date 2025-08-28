// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { SafeERC20, IERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { OnlyWethReceiver } from "@1inch/solidity-utils/contracts/mixins/OnlyWethReceiver.sol";
import { IWETH } from "@1inch/solidity-utils/contracts/interfaces/IWETH.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

import { EIP712Alien } from "contracts/mocks/EIP712Alien.sol";
import { IPostInteraction } from "../interfaces/IPostInteraction.sol";
import { OrderLib, IOrderMixin } from "../OrderLib.sol";
import { MakerTraits, MakerTraitsLib } from "../libraries/MakerTraitsLib.sol";
import { ExtensionLib } from "../libraries/ExtensionLib.sol";
import { Auction, AuctionLib } from "../libraries/Auction.sol";

/// @title Extension that will allow to create Fusion+ order that sell ETH. ETH will be deposited into the clone.
contract ETHOrderClonable is OnlyWethReceiver, EIP712Alien {
    using Clones for address;
    using AddressLib for Address;
    using SafeERC20 for IWETH;
    using SafeERC20 for IERC20;
    using OrderLib for IOrderMixin.Order;
    using MakerTraitsLib for MakerTraits;
    using AuctionLib for Auction;

    error AccessDenied();
    error OnlySenderMismatch(address caller, address expected);
    error ThisIsFactoryViolation(address self, address factory);
    error ThisIsCloneViolation(address self, address clone);
    error ThisIsCloneForViolation(address self, address clone);
    error OnlyByFactoryViolation(address caller, address factory);
    error OnlyByCloneViolation(address caller, address clone);

    error IsValidSignatureFactoryDerivationMismatch(address expected, address actual);
    error OrderMakerShouldBeThisContract(address maker, address thisContract);
    error OrderReceiverShouldNotBeThis(address receiver, address self);
    error OrderMakingAmountShouldBeEqualToExpectedMsgValue(uint256 makingAmount, uint256 wethBalance);
    error CanNotCancelForZeroBalance();
    error ResolverAccessTokenMissing(address resolver, address accessToken);
    error ExpectedCloneAddressMismatch(address actual, address expected);
    error OrderShouldBeExpired(uint256 currentTime, uint256 orderExpirationTime);
    error SignatureShouldContainOrderAndTraitsButLengthIsWrong(uint256 expectedLength, uint256 actualLength);
    error ERC20TransferNotAllowed();

    event CloneDeployed(address maker, bytes32 orderHash, address clone, uint256 value);
    event CloneCancelled(address maker, bytes32 orderHash, uint256 value);

    struct OrderAndTraits {
        IOrderMixin.Order order;
        Auction auction;
    }

    uint256 private constant _ORDER_AND_TRAITS_BYTES_LENGTH = 8 * 32 + 32; // sizeof(IOrderMixin.Order) + sizeof(Auction)
    uint256 private constant _BUMP_BASE = 1_000;
    uint256 private constant _CANCEL_GAS_LOWER_BOUND = 30_000;

    address private immutable _FACTORY = address(this);
    address private immutable _LIMIT_ORDER_PROTOCOL;
    IWETH private immutable _WETH;
    IERC20 private immutable _ACCESS_TOKEN;

    modifier onlySender(address expected) {
        if (msg.sender != expected) revert OnlySenderMismatch(msg.sender, expected);
        _;
    }

    modifier onlyResolver {
        if (_ACCESS_TOKEN.balanceOf(msg.sender) == 0) revert ResolverAccessTokenMissing(msg.sender, address(_ACCESS_TOKEN));
        _;
    }

    modifier thisIsFactory {
        if (address(this) != _FACTORY) revert ThisIsFactoryViolation(address(this), _FACTORY);
        _;
    }

    modifier thisIsClone {
        if (address(this) == _FACTORY) revert ThisIsCloneViolation(address(this), _FACTORY);
        _;
    }

    modifier thisIsCloneFor(address maker, bytes32 origOrderHash, Auction auction) {
        address clone = addressOf(maker, origOrderHash, auction);
        if (address(this) != clone) revert ThisIsCloneForViolation(address(this), clone);
        _;
    }

    modifier onlyByFactory {
        if (msg.sender != _FACTORY) revert OnlyByFactoryViolation(msg.sender, _FACTORY);
        _;
    }

    modifier onlyByClone(address maker, bytes32 origOrderHash, Auction auction) {
        address clone = addressOf(maker, origOrderHash, auction);
        if (msg.sender != clone) revert OnlyByCloneViolation(msg.sender, clone);
        _;
    }

    modifier onlyLimitOrderProtocolOrOneOfTails(bytes calldata allowedMsgSenders) {
        if (!_onlyLimitOrderProtocolOrOneOfTails(allowedMsgSenders)) revert AccessDenied();
        _;
    }

    function _onlyLimitOrderProtocolOrOneOfTails(bytes calldata allowedMsgSenders) internal view returns (bool) {
        bytes10 shortAddress = bytes10(uint80(uint160(msg.sender)));
        for (uint256 i = 0; i < allowedMsgSenders.length; i += 10) {
            if (shortAddress == bytes10(allowedMsgSenders[i:])) {
                return true;
            }
        }
        return (msg.sender == _LIMIT_ORDER_PROTOCOL);
    }

    constructor(
        IWETH weth,
        address limitOrderProtocol,
        IERC20 accessToken
    )
        OnlyWethReceiver(address(weth))
        EIP712Alien(_LIMIT_ORDER_PROTOCOL, "1inch Limit Order Protocol", "4")
    {
        _WETH = weth;
        _LIMIT_ORDER_PROTOCOL = limitOrderProtocol;
        _ACCESS_TOKEN = accessToken;
    }

    // function validateOrder(
    //     address maker,
    //     IOrderMixin.Order calldata order,
    //     uint256 expectedMsgValue,
    //     address expectedClone
    // ) external view thisIsFactory returns(bool) {
    //     // Validate main order parameters
    //     if (order.maker.get() != expectedClone) revert OrderMakerShouldBeThisContract(order.maker.get(), address(this));
    //     if (order.getReceiver() == address(this) || order.getReceiver() == expectedClone) revert OrderReceiverShouldNotBeThis(order.getReceiver(), address(this));
    //     if (expectedMsgValue != order.makingAmount) revert OrderMakingAmountShouldBeEqualToExpectedMsgValue(order.makingAmount, expectedMsgValue);

    //     // EIP712Alien._domainSeparatorV4() is cheaper than call IOrderMixin(_LIMIT_ORDER_PROTOCOL).hashOrder(order);
    //     bytes32 orderHash = order.hash(_domainSeparatorV4());
    //     address clone = addressOf(maker, orderHash);
    //     if (clone != expectedClone) revert ExpectedCloneAddressMismatch(clone, expectedClone);
    //     return true;
    // }

    function makeSalt(address maker, bytes32 orderHash, Auction auction) public pure returns (bytes32) {
        return keccak256(abi.encode(maker, orderHash, auction));
    }

    function addressOf(address maker, bytes32 origOrderHash, Auction auction) public view returns (address) {
        bytes32 salt = makeSalt(maker, origOrderHash, auction);
        return _FACTORY.predictDeterministicAddress(salt, _FACTORY);
    }

    function deposit(bytes32 origOrderHash, Auction auction) external payable thisIsFactory returns (address clone) {
        bytes32 salt = makeSalt(msg.sender, origOrderHash, auction);
        clone = _FACTORY.cloneDeterministic(salt);
        ETHOrderClonable(payable(clone)).init{ value: msg.value }();
        emit CloneDeployed(msg.sender, origOrderHash, clone, msg.value);
    }

    function init()
        external
        payable
        thisIsClone
        onlyByFactory
    {
        _WETH.safeDeposit(msg.value);
        _WETH.forceApprove(_LIMIT_ORDER_PROTOCOL, msg.value);
    }

    function isValidSignature(bytes32 hash, bytes calldata signature)
        external
        view
        thisIsClone
        returns(bytes4)
    {
        if (signature.length != _ORDER_AND_TRAITS_BYTES_LENGTH) revert SignatureShouldContainOrderAndTraitsButLengthIsWrong(_ORDER_AND_TRAITS_BYTES_LENGTH, signature.length);
        OrderAndTraits calldata orderAndTraits;
        assembly ("memory-safe") {
            orderAndTraits := signature.offset
        }

        // Check order args by CREATE2 salt validation
        address maker = orderAndTraits.order.maker.get();
        bytes32 origOrderHash = orderAndTraits.order.hash(_domainSeparatorV4());
        address clone = addressOf(maker, origOrderHash, orderAndTraits.auction);
        if (clone != address(this)) {
            return bytes4(0);
        }

        // Check if patched order from signature matches LOP filling order
        IOrderMixin.Order memory order = orderAndTraits.order;
        order.maker = Address.wrap(uint160(address(this)));
        bytes32 orderHash = order.hashMemory(_domainSeparatorV4());
        if (orderHash != hash) {
            return bytes4(0);
        }

        return this.isValidSignature.selector;
    }

    function cancelOrder(bytes32 orderHash, Auction auction) external thisIsClone {
        _cancelOrder(msg.sender, orderHash, auction, 0);
    }

    function cancelExpiredOrderByResolver(address maker, IOrderMixin.Order calldata origOrder, Auction auction)
        external
        thisIsClone
        onlyResolver
    {
        uint256 orderExpirationTime = origOrder.makerTraits.getExpirationTime();
        if (orderExpirationTime > 0 && block.timestamp > orderExpirationTime) revert OrderShouldBeExpired(block.timestamp, orderExpirationTime);

        // Using EIP712Alien._domainSeparatorV4() is cheaper than call IOrderMixin(_LIMIT_ORDER_PROTOCOL).hashOrder(order);
        bytes32 origOrderHash = origOrder.hash(_domainSeparatorV4());
        uint256 resolverReward = getResolverReward(auction, orderExpirationTime);
        _cancelOrder(maker, origOrderHash, auction, resolverReward);
    }

    function _cancelOrder(address maker, bytes32 origOrderHash, Auction auction, uint256 resolverReward)
        private
        thisIsCloneFor(maker, origOrderHash, auction)
    {
        uint256 balance = _WETH.safeBalanceOf(address(this));
        if (balance == 0) revert CanNotCancelForZeroBalance();

        if (resolverReward > 0) {
            balance -= resolverReward;
            _WETH.safeWithdrawTo(resolverReward, msg.sender);
        }
        if (balance > 0) {
            _WETH.safeWithdrawTo(balance, maker);
        }
        emit CloneCancelled(maker, origOrderHash, balance);
    }

    function getResolverReward(Auction auction, uint256 orderExpirationTime) public view returns (uint256) {
        uint256 gasCostsBump = auction.currentValue(orderExpirationTime);
        return _CANCEL_GAS_LOWER_BOUND * block.basefee * (_BUMP_BASE + gasCostsBump) / _BUMP_BASE;
    }
}
