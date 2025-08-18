// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/mixins/OnlyWethReceiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { EIP712Alien } from "contracts/mocks/EIP712Alien.sol";
import "../interfaces/IPostInteraction.sol";
import "../OrderLib.sol";

/// @title Extension that will allow to create limit order that sell ETH. ETH must be deposited into the contract.
contract ETHOrders is IPostInteraction, OnlyWethReceiver, EIP712Alien {
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

    event ETHDeposited(address maker, bytes32 orderHash, uint256 amount);
    event ETHOrderCancelled(bytes32 orderHash, uint256 amount);
    event ETHOrderCancelledByThirdParty(bytes32 orderHash, uint256 amount, uint256 reward);

    error OrderShouldHavePostInteractionCallFlag(MakerTraits makerTraits);
    error OrderMakerShouldBeThisContract(address maker, address thisContract);
    error OrderReceiverShouldBeMsgSender(address receiver, address msgSender);
    error OrderMakingAmountShouldBeEqualToMsgValue(uint256 makingAmount, uint256 msgValue);
    error OrderPostInteractionTargetShouldBeThisContract(address target, address thisContract);
    error OrderNotExpiredYet(uint256 currentTimestamp, uint256 expirationTimestamp);

    // add maker and expiration time
    struct Deposit {
        uint208 balance;
        uint16 maxGasCostsBump; // in basis points (1_000)
        uint32 auctionDuration;
    }

    uint256 private constant _BUMP_BASE = 1_000;
    uint256 private constant _CANCEL_GAS_LOWER_BOUND = 30_000;

    address private immutable _LIMIT_ORDER_PROTOCOL;
    IWETH private immutable _WETH;
    IERC20 private immutable _ACCESS_TOKEN;

    mapping(address maker => mapping(bytes32 orderHash => Deposit data)) public deposits;

    modifier onlyLimitOrderProtocol {
        if (msg.sender != _LIMIT_ORDER_PROTOCOL) revert AccessDenied();
        _;
    }

    modifier onlyResolver {
        if (_ACCESS_TOKEN.balanceOf(msg.sender) == 0) revert AccessDenied();
        _;
    }

    constructor(IWETH weth, address limitOrderProtocol, IERC20 accessToken)
        OnlyWethReceiver(address(weth))
        EIP712Alien(_LIMIT_ORDER_PROTOCOL, "1inch Limit Order Protocol", "4")
    {
        _WETH = weth;
        _LIMIT_ORDER_PROTOCOL = limitOrderProtocol;
        _ACCESS_TOKEN = accessToken;
        _WETH.forceApprove(limitOrderProtocol, type(uint256).max);
    }

    function depositForOrder(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        uint16 maxGasCostsBump,
        uint32 auctionDuration
    ) external payable {
        // Validate main order parameters
        if (order.maker.get() != address(this)) revert OrderMakerShouldBeThisContract(order.maker.get(), address(this));
        if (order.getReceiver() != msg.sender) revert OrderReceiverShouldBeMsgSender(order.getReceiver(), msg.sender);
        if (order.makingAmount != msg.value) revert OrderMakingAmountShouldBeEqualToMsgValue(order.makingAmount, msg.value);

        // Validate post interaction flag and target
        if (!order.makerTraits.needPostInteractionCall()) revert OrderShouldHavePostInteractionCallFlag(order.makerTraits);
        (bool isExtensionValid, bytes4 validationResult) = order.isValidExtension(extension);
        if (!isExtensionValid) {
            // solhint-disable-next-line no-inline-assembly
            assembly ("memory-safe") {
                mstore(0, validationResult)
                revert(0, 4)
            }
        }
        bytes calldata interaction = extension.postInteractionTargetAndData();
        if (interaction.length != 20 || address(bytes20(interaction)) != address(this)) revert OrderPostInteractionTargetShouldBeThisContract(address(bytes20(interaction)), address(this));

        // EIP712Alien._domainSeparatorV4() is cheaper than call IOrderMixin(_LIMIT_ORDER_PROTOCOL).hashOrder(order);
        bytes32 orderHash = order.hash(_domainSeparatorV4());
        depositForOrderHash(orderHash, maxGasCostsBump, auctionDuration);
    }

    function depositForOrderHash(
        bytes32 orderHash,
        uint16 maxGasCostsBump,
        uint32 auctionDuration
    ) public payable {
        if (deposits[msg.sender][orderHash].balance != 0) revert ExistingOrder();

        deposits[msg.sender][orderHash] = Deposit({
            balance: uint208(msg.value),
            maxGasCostsBump: maxGasCostsBump,
            auctionDuration: auctionDuration
        });
        _WETH.safeDeposit(msg.value);
        emit ETHDeposited(msg.sender, orderHash, msg.value);
    }

    function isValidSignature(bytes32 orderHash, bytes calldata signature) external view returns(bytes4) {
        address maker = address(uint160(bytes20(signature)));
        uint256 balance = deposits[maker][orderHash].balance;
        return (balance > 0) ? this.isValidSignature.selector : bytes4(0);
    }

    function cancelOrder(bytes32 orderHash) external {
        uint256 balance = deposits[msg.sender][orderHash].balance;
        deposits[msg.sender][orderHash].balance = 0;
        _WETH.safeWithdrawTo(balance, msg.sender);
    }

    function cancelExpiredOrderByResolver(IOrderMixin.Order calldata order) external onlyResolver {
        uint256 orderExpirationTime = order.makerTraits.getExpirationTime();
        if (orderExpirationTime > 0 && block.timestamp > orderExpirationTime) revert OrderNotExpiredYet(block.timestamp, order.makerTraits.getExpirationTime());

        address maker = order.maker.get();
        bytes32 orderHash = order.hash(_domainSeparatorV4()); // IOrderMixin(_LIMIT_ORDER_PROTOCOL).hashOrder(order);
        Deposit storage deposit = deposits[maker][orderHash];
        uint256 balance = deposit.balance;
        deposit.balance = 0;

        uint256 resolverReward = getResolverReward(deposit.maxGasCostsBump, orderExpirationTime, deposit.auctionDuration);
        if (resolverReward > 0) {
            balance -= resolverReward;
            _WETH.safeWithdrawTo(resolverReward, msg.sender);
        }
        if (balance > 0) {
            _WETH.safeWithdrawTo(balance, maker);
        }
    }

    function postInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 orderHash,
        address /* taker */,
        uint256 makingAmount,
        uint256 /* takingAmount */,
        uint256 /* remainingMakingAmount */,
        bytes calldata /* extraData */
    ) external onlyLimitOrderProtocol {
        deposits[order.maker.get()][orderHash].balance -= uint208(makingAmount);
    }

    function getResolverReward(uint256 maxGasCostsBump, uint256 orderExpirationTime, uint256 auctionDuration) public view returns (uint256) {
        uint256 gasCostsBump = getCurrentAuctionValue(maxGasCostsBump, orderExpirationTime, auctionDuration);
        return _CANCEL_GAS_LOWER_BOUND * block.basefee * (_BUMP_BASE + gasCostsBump) / _BUMP_BASE;
    }

    function getCurrentAuctionValue(uint256 maxAmount, uint256 start, uint256 duration) public view returns (uint256) {
        if (block.timestamp <= start) return 0;
        if (block.timestamp >= start + duration) return maxAmount;
        return maxAmount * (block.timestamp - start) / duration;
    }
}
