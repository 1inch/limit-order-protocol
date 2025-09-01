// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { IERC1271 } from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { SafeERC20, IERC20, IWETH } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { OnlyWethReceiver } from "@1inch/solidity-utils/contracts/mixins/OnlyWethReceiver.sol";

import { MakerTraits, MakerTraitsLib } from "../libraries/MakerTraitsLib.sol";
import { EIP712Alien } from "../mocks/EIP712Alien.sol";
import { OrderLib, IOrderMixin } from "../OrderLib.sol";

contract NativeOrderImpl is IERC1271, EIP712Alien, OnlyWethReceiver {
    using Clones for address;
    using AddressLib for Address;
    using SafeERC20 for IERC20;
    using SafeERC20 for IWETH;
    using OrderLib for IOrderMixin.Order;
    using MakerTraitsLib for MakerTraits;

    event NativeOrderCancelled(bytes32 orderHash, uint256 balance, uint256 resolverReward);

    error OnlyLimitOrderProtocolViolation(address sender, address limitOrderProtocol);
    error OnlyFactoryViolation(address sender, address factory);
    error ResolverAccessTokenMissing(address resolver, address accessToken);
    error OrderIsIncorrect(address expected, address actual);
    error OrderShouldBeExpired(uint256 currentTime, uint256 expirationTime);
    error CanNotCancelForZeroBalance();
    error RescueFundsTooMuch(uint256 requested, uint256 available);

    uint256 private constant _CANCEL_GAS_LOWER_BOUND = 30_000;

    IWETH private immutable _WETH;
    address private immutable _LOP;
    address private immutable _IMPLEMENTATION = address(this);
    address private immutable _FACTORY;
    IERC20 private immutable _ACCESS_TOKEN;

    modifier onlyLOP {
        if (msg.sender != _LOP) revert OnlyLimitOrderProtocolViolation(msg.sender, _LOP);
        _;
    }

    modifier onlyFactory {
        if (msg.sender != _FACTORY) revert OnlyFactoryViolation(msg.sender, _FACTORY);
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
        IERC20 accessToken
    )
        OnlyWethReceiver(address(weth))
        EIP712Alien(limitOrderProtocol, "1inch Limit Order Protocol", "4")
    {
        _WETH = weth;
        _LOP = limitOrderProtocol;
        _FACTORY = nativeOrderFactory;
        _ACCESS_TOKEN = accessToken;
    }

    function name() external pure returns (string memory) {
        return "Fusion WETH";
    }

    function symbol() external pure returns (string memory) {
        return "FWETH";
    }

    function decimals() external pure returns (uint8) {
        return 18;
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
        address clone = _FACTORY.predictDeterministicAddress(makerOrderHash, _FACTORY);
        if (clone != address(this)) {
            return bytes4(0);
        }

        // Check if patched order from signature matches LOP filling order
        IOrderMixin.Order memory order = makerOrder;
        order.maker = Address.wrap(uint160(address(this)));
        bytes32 orderHash = order.hashMemory(_domainSeparatorV4());
        if (orderHash != hash) {
            return bytes4(0);
        }

        return this.isValidSignature.selector;
    }

    function cancelOrder(IOrderMixin.Order calldata makerOrder) external {
        _cancelOrder(makerOrder, 0);
    }

    function cancelExpiredOrderByResolver(IOrderMixin.Order calldata makerOrder, uint256 rewardLimit) external onlyResolver {
        uint256 orderExpirationTime = makerOrder.makerTraits.getExpirationTime();
        if (orderExpirationTime > 0 && block.timestamp > orderExpirationTime) revert OrderShouldBeExpired(block.timestamp, orderExpirationTime);

        uint256 resolverReward = Math.min(rewardLimit, block.basefee * _CANCEL_GAS_LOWER_BOUND * 1.1e18 / 1e18);
        _cancelOrder(makerOrder, resolverReward);
    }

    function _cancelOrder(IOrderMixin.Order calldata makerOrder, uint256 resolverReward) private {
        bytes32 makerOrderHash = makerOrder.hash(_domainSeparatorV4());
        address clone = _FACTORY.predictDeterministicAddress(makerOrderHash, _FACTORY);
        if (clone != address(this)) revert OrderIsIncorrect(clone, address(this));

        uint256 balance = _WETH.safeBalanceOf(address(this));
        if (balance == 0) revert CanNotCancelForZeroBalance();

        _WETH.safeWithdraw(balance);
        if (resolverReward > 0) {
            balance -= resolverReward;
            payable(msg.sender).transfer(resolverReward);
        }
        if (balance > 0) {
            payable(makerOrder.maker.get()).transfer(balance);
        }

        IOrderMixin.Order memory order = makerOrder;
        order.maker = Address.wrap(uint160(address(this)));
        bytes32 orderHash = order.hashMemory(_domainSeparatorV4());
        emit NativeOrderCancelled(orderHash, balance, resolverReward);
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
}
