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

/// @title Extension that will allow to create Fusion+ order that sell ETH. ETH will be deposited into the clone.
contract ETHOrderClonable is OnlyWethReceiver, EIP712Alien {
    using Clones for address;
    using AddressLib for Address;
    using SafeERC20 for IWETH;
    using SafeERC20 for IERC20;
    using OrderLib for IOrderMixin.Order;
    using MakerTraitsLib for MakerTraits;

    error OnlySenderMismatch(address caller, address expected);
    error OnlyFactoryViolation(address caller, address factory);
    error OnlyCloneViolation(address caller, address clone);

    error IsValidSignatureFactoryDerivationMismatch(address expected, address actual);
    error OrderMakerShouldBeThisContract(address maker, address thisContract);
    error OrderReceiverShouldNotBeThis(address receiver, address self);
    error OrderMakingAmountShouldBeEqualToExpectedMsgValue(uint256 makingAmount, uint256 wethBalance);
    error CanNotCancelForZeroBalance();
    error ResolverAccessTokenMissing(address resolver, address accessToken);
    error ExpectedCloneAddressMismatch(address actual, address expected);
    error OrderShouldBeExpired(uint256 currentTime, uint256 orderExpirationTime);

    event EscrowDeployed(address maker, bytes32 orderHash, address clone, uint256 value);
    event EscrowCancelled(address maker, bytes32 orderHash, uint256 value);

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

    modifier onlyFactory {
        if (address(this) != _FACTORY) revert OnlyFactoryViolation(msg.sender, _FACTORY);
        _;
    }

    modifier onlyClone {
        if (address(this) == _FACTORY) revert OnlyCloneViolation(msg.sender, address(this));
        _;
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
        _WETH.forceApprove(limitOrderProtocol, type(uint256).max);
    }

    function validateOrder(
        address maker,
        IOrderMixin.Order calldata order,
        uint256 expectedMsgValue,
        address expectedClone
    ) external view onlyFactory returns(bool) {
        // Validate main order parameters
        if (order.maker.get() != expectedClone) revert OrderMakerShouldBeThisContract(order.maker.get(), address(this));
        if (order.getReceiver() == address(this) || order.getReceiver() == expectedClone) revert OrderReceiverShouldNotBeThis(order.getReceiver(), address(this));
        if (expectedMsgValue != order.makingAmount) revert OrderMakingAmountShouldBeEqualToExpectedMsgValue(order.makingAmount, expectedMsgValue);

        // EIP712Alien._domainSeparatorV4() is cheaper than call IOrderMixin(_LIMIT_ORDER_PROTOCOL).hashOrder(order);
        bytes32 orderHash = order.hash(_domainSeparatorV4());
        address clone = addressOf(maker, orderHash);
        if (clone != expectedClone) revert ExpectedCloneAddressMismatch(clone, expectedClone);
        return true;
    }

    function addressOf(address maker, bytes32 orderHash) public view returns (address) {
        bytes32 salt = keccak256(abi.encode(maker, orderHash));
        return _FACTORY.predictDeterministicAddress(salt, _FACTORY);
    }

    function deposit(bytes32 orderHash) external payable onlyFactory returns (address clone) {
        bytes32 salt = keccak256(abi.encode(msg.sender, orderHash));
        clone = _FACTORY.cloneDeterministic(salt);
        _WETH.safeDeposit(msg.value);
        _WETH.safeTransfer(clone, msg.value);
        emit EscrowDeployed(msg.sender, orderHash, clone, msg.value);
    }

    function isValidSignature(bytes32 orderHash, bytes calldata signature) external view onlyClone returns(bytes4) {
        address maker = address(bytes20(signature[:20]));
        address clone = addressOf(maker, orderHash);
        if (clone != address(this)) revert IsValidSignatureFactoryDerivationMismatch(clone, address(this));
        return this.isValidSignature.selector;
    }

    function cancelOrder(bytes32 orderHash) external onlyClone {
        _cancelOrder(msg.sender, orderHash);
    }

    function cancelExpiredOrderByResolver(address maker, IOrderMixin.Order calldata order) external onlyClone onlyResolver {
        uint256 orderExpirationTime = order.makerTraits.getExpirationTime();
        if (orderExpirationTime > 0 && block.timestamp > orderExpirationTime) revert OrderShouldBeExpired(block.timestamp, order.makerTraits.getExpirationTime());

        // Using EIP712Alien._domainSeparatorV4() is cheaper than call IOrderMixin(_LIMIT_ORDER_PROTOCOL).hashOrder(order);
        bytes32 orderHash = order.hash(_domainSeparatorV4());
        _cancelOrder(maker, orderHash);
    }

    function _cancelOrder(address maker, bytes32 orderHash) private {
        address clone = addressOf(maker, orderHash);
        if (clone != address(this)) revert IsValidSignatureFactoryDerivationMismatch(clone, address(this));

        uint256 balance = _WETH.safeBalanceOf(address(this));
        if (balance == 0) revert CanNotCancelForZeroBalance();
        _WETH.safeWithdrawTo(balance, msg.sender);
        emit EscrowCancelled(msg.sender, orderHash, balance);
    }
}
