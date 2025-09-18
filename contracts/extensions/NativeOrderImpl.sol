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

contract NativeOrderImpl is IERC1271, EIP712Alien, OnlyWethReceiver {
    using Clones for address;
    using AddressLib for Address;
    using SafeERC20 for IERC20;
    using SafeERC20 for IWETH;
    using OrderLib for IOrderMixin.Order;
    using MakerTraitsLib for MakerTraits;

    event NativeOrderCancelled(bytes32 orderHash, uint256 balance);
    event NativeOrderCancelledByResolver(bytes32 orderHash, uint256 balance, uint256 resolverReward);

    error OnlyLimitOrderProtocolViolation(address sender, address limitOrderProtocol);
    error OnlyFactoryViolation(address sender, address factory);
    error OnlyMakerViolation(address sender, address maker);
    error ResolverAccessTokenMissing(address resolver, address accessToken);
    error OrderIsIncorrect(address expected, address actual);
    error OrderShouldBeExpired(uint256 currentTime, uint256 expirationTime);
    error CanNotCancelForZeroBalance();
    error RescueFundsTooMuch(uint256 requested, uint256 available);
    error CancellationDelayViolation(uint256 timePassedSinceExpiration, uint256 requiredDelay);

    uint256 private constant _CANCEL_GAS_LOWER_BOUND = 30_000;

    IWETH private immutable _WETH;
    address private immutable _LOP;
    address private immutable _IMPLEMENTATION = address(this);
    address private immutable _FACTORY;
    IERC20 private immutable _ACCESS_TOKEN;
    uint256 private immutable _CANCELLATION_DELAY;

    modifier onlyFactory {
        if (msg.sender != _FACTORY) revert OnlyFactoryViolation(msg.sender, _FACTORY);
        _;
    }

    modifier onlyResolver {
        if (_ACCESS_TOKEN.balanceOf(msg.sender) == 0) revert ResolverAccessTokenMissing(msg.sender, address(_ACCESS_TOKEN));
        _;
    }

    modifier onlyMaker(address maker) {
        if (msg.sender != maker) revert OnlyMakerViolation(msg.sender, maker);
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

    function depositAndApprove() external payable onlyFactory {
        _WETH.safeDeposit(msg.value);
        _WETH.forceApprove(_LOP, msg.value);
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns(bytes4) {
        // Extract order from signature via calldata type casting
        IOrderMixin.Order calldata makerOrder;
        assembly ("memory-safe") { // solhint-disable-line no-inline-assembly
            makerOrder := signature.offset
        }

        // Check order args by CREATE2 salt validation
        bytes32 makerOrderHash = makerOrder.hash(_domainSeparatorV4());
        address clone = _IMPLEMENTATION.predictDeterministicAddress(makerOrderHash, _FACTORY);
        if (clone != address(this)) {
            return bytes4(0);
        }

        // Check if patched order from signature matches LOP filling order
        bytes32 orderHash = _patchOrderMakerAndHash(makerOrder);
        if (orderHash != hash) {
            return bytes4(0);
        }

        return this.isValidSignature.selector;
    }

    function cancelOrder(IOrderMixin.Order calldata makerOrder) external onlyMaker(makerOrder.maker.get()) {
        uint256 balance = _cancelOrder(makerOrder, 0);
        bytes32 orderHash = _patchOrderMakerAndHash(makerOrder);
        emit NativeOrderCancelled(orderHash, balance);
    }

    function cancelExpiredOrderByResolver(IOrderMixin.Order calldata makerOrder, uint256 rewardLimit) external onlyResolver {
        uint256 orderExpiration = makerOrder.makerTraits.getExpirationTime();
        if (!makerOrder.makerTraits.isExpired()) revert OrderShouldBeExpired(block.timestamp, orderExpiration);

        uint256 resolverReward = 0;
        if (rewardLimit > 0) {
            if (block.timestamp - orderExpiration < _CANCELLATION_DELAY) revert CancellationDelayViolation(block.timestamp - orderExpiration, _CANCELLATION_DELAY);
            resolverReward = Math.min(rewardLimit, block.basefee * _CANCEL_GAS_LOWER_BOUND * 1.1e18 / 1e18);
        }
        uint256 balance = _cancelOrder(makerOrder, resolverReward);
        bytes32 orderHash = _patchOrderMakerAndHash(makerOrder);
        emit NativeOrderCancelledByResolver(orderHash, balance, resolverReward);
    }

    function _cancelOrder(IOrderMixin.Order calldata makerOrder, uint256 resolverReward) private returns(uint256 balance) {
        bytes32 makerOrderHash = makerOrder.hash(_domainSeparatorV4());
        address clone = _IMPLEMENTATION.predictDeterministicAddress(makerOrderHash, _FACTORY);
        if (clone != address(this)) revert OrderIsIncorrect(clone, address(this));

        balance = _WETH.safeBalanceOf(address(this));
        if (balance == 0) revert CanNotCancelForZeroBalance();

        _WETH.safeWithdraw(balance);
        if (resolverReward > 0) {
            balance -= resolverReward;
            (bool success, ) = msg.sender.call{ value: resolverReward }("");
            if (!success) revert Errors.ETHTransferFailed();
        }
        if (balance > 0) {
            (bool success, ) = makerOrder.maker.get().call{ value: balance }("");
            if (!success) revert Errors.ETHTransferFailed();
        }
    }

    function rescueFunds(address token, address to, uint256 amount) external onlyResolver {
        if (token == address(0)) {
            payable(to).transfer(amount);
        } else if (IWETH(token) == _WETH) {
            uint256 remainingOrderAmount = _WETH.allowance(address(this), _LOP);
            uint256 extraAmount = _WETH.safeBalanceOf(address(this)) - remainingOrderAmount;
            if (amount > extraAmount) revert RescueFundsTooMuch(amount, extraAmount);
            _WETH.safeTransfer(to, amount);
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _patchOrderMakerAndHash(IOrderMixin.Order memory order) private view returns(bytes32) {
        order.maker = Address.wrap(uint160(address(this)));
        return order.hashMemory(_domainSeparatorV4());
    }
}
