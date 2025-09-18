// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { IERC1271 } from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { SafeERC20, IERC20, IWETH } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { OnlyWethReceiver } from "@1inch/solidity-utils/contracts/mixins/OnlyWethReceiver.sol";

import { MakerTraits, MakerTraitsLib } from "../libraries/MakerTraitsLib.sol";
import { Errors } from "../libraries/Errors.sol";
import { EIP712Alien } from "../mocks/EIP712Alien.sol";
import { OrderLib, IOrderMixin } from "../OrderLib.sol";

// This contract is owning makers' funds for native orders
contract NativeOrderImpl is IERC1271, EIP712Alien, OnlyWethReceiver {
    using Clones for address;
    using AddressLib for Address;
    using SafeERC20 for IERC20;
    using SafeERC20 for IWETH;
    using OrderLib for IOrderMixin.Order;
    using MakerTraitsLib for MakerTraits;

    event NativeOrderCancelled(uint256 balance);
    event NativeOrderCancelledByResolver(uint256 balance, uint256 resolverReward);

    error OnlyFactoryViolation(address sender, address factory);
    error OnlyMakerViolation(address sender, uint80 makerTail);
    error ResolverAccessTokenMissing(address resolver, address accessToken);
    error OrderShouldBeExpired(uint256 currentTime, uint256 expirationTime);
    error CanNotCancelForZeroBalance();
    error CancellationDelayViolation(uint256 timePassedSinceExpiration, uint256 requiredDelay);
    error WrongMakerArgument(address maker, uint80 expectedTail);

    uint256 private constant _CANCEL_GAS_LOWER_BOUND = 70_000;

    IWETH private immutable _WETH;
    address private immutable _LOP;
    address private immutable _FACTORY;
    IERC20 private immutable _ACCESS_TOKEN;
    uint256 private immutable _CANCELLATION_DELAY;

    struct Purpose {
        uint80 orderHashTail;
        uint80 makerTail;
        uint40 expiration;
    }

    Purpose public purpose;

    modifier onlyFactory {
        if (msg.sender != _FACTORY) revert OnlyFactoryViolation(msg.sender, _FACTORY);
        _;
    }

    modifier onlyMaker {
        if (uint80(uint160(msg.sender)) != purpose.makerTail) revert OnlyMakerViolation(msg.sender, purpose.makerTail);
        _;
    }

    modifier onlyResolver {
        if (_ACCESS_TOKEN.balanceOf(msg.sender) == 0) revert ResolverAccessTokenMissing(msg.sender, address(_ACCESS_TOKEN));
        _;
    }

    constructor(
        IWETH weth,
        address nativeOrderFactory,
        address limitOrderProtocol,
        IERC20 accessToken,
        uint256 cancellationDelay, // Recommended 60 seconds delay after order expiration for rewardable cancellation
        string memory name,
        string memory version
    )
        OnlyWethReceiver(address(weth))
        EIP712Alien(limitOrderProtocol, name, version)
    {
        _WETH = weth;
        _LOP = limitOrderProtocol;
        _FACTORY = nativeOrderFactory;
        _ACCESS_TOKEN = accessToken;
        _CANCELLATION_DELAY = cancellationDelay;
    }

    function deposit(address maker, bytes32 orderHash, uint40 expiration) external payable onlyFactory {
        purpose = Purpose({
            orderHashTail: uint80(uint256(orderHash)),
            makerTail: uint80(uint160(maker)),
            expiration: expiration
        });
        _WETH.safeDeposit(msg.value);
        _WETH.forceApprove(_LOP, msg.value);
    }

    function isValidSignature(bytes32 hash, bytes calldata /* signature */) external view returns(bytes4) {
        uint80 orderHashTail = purpose.orderHashTail;
        uint256 expiration = purpose.expiration;
        if (uint80(uint256(hash)) != orderHashTail) {
            return 0xffffffff;
        }
        if (block.timestamp >= expiration) {
            return 0xffffffff;
        }
        return this.isValidSignature.selector;
    }

    function cancelOrder() external onlyMaker {
        uint256 balance = _WETH.safeBalanceOf(address(this));
        _WETH.safeWithdrawTo(balance, msg.sender);
        emit NativeOrderCancelled(balance);
    }

    function rescueFunds(address token, address to, uint256 amount) external onlyMaker {
        if (token == address(0)) {
            (bool success, ) = to.call{ value: amount }("");
            if (!success) revert Errors.ETHTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function cancelExpiredOrderByResolver(address maker, uint256 rewardLimit) external onlyResolver {
        uint80 makerTail = purpose.makerTail;
        uint256 purposeExpiration = purpose.expiration;
        if (uint80(uint160(maker)) != makerTail) revert WrongMakerArgument(maker, makerTail);
        if (block.timestamp < purposeExpiration) revert OrderShouldBeExpired(block.timestamp, purposeExpiration);

        uint256 balance = _WETH.safeBalanceOf(address(this));
        if (balance == 0) revert CanNotCancelForZeroBalance();
        uint256 resolverReward;
        if (rewardLimit > 0) {
            if (block.timestamp - purposeExpiration < _CANCELLATION_DELAY) revert CancellationDelayViolation(block.timestamp - purposeExpiration, _CANCELLATION_DELAY);
            resolverReward = Math.min(rewardLimit, block.basefee * _CANCEL_GAS_LOWER_BOUND * 1.1e18 / 1e18); // base fee + 10%
            balance -= resolverReward;
            (bool success, ) = msg.sender.call{ value: resolverReward }("");
            if (!success) revert Errors.ETHTransferFailed();
        }
        if (balance > 0) {
            (bool success, ) = maker.call{ value: balance }("");
            if (!success) revert Errors.ETHTransferFailed();
        }
        emit NativeOrderCancelledByResolver(balance, resolverReward);
    }
}
