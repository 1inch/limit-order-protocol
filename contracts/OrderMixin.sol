// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/solidity-utils/contracts/interfaces/IWETH.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/ECDSA.sol";

import "./helpers/AmountCalculator.sol";
import "./helpers/NonceManager.sol";
import "./helpers/PredicateHelper.sol";
import "./interfaces/IOrderMixin.sol";
import "./interfaces/NotificationReceiver.sol";
import "./libraries/ArgumentsDecoder.sol";
import "./libraries/Callib.sol";
import "./libraries/Errors.sol";
import "./OrderLib.sol";

/// @title Regular Limit Order mixin
abstract contract OrderMixin is IOrderMixin, EIP712, AmountCalculator, NonceManager, PredicateHelper {
    using Callib for address;
    using SafeERC20 for IERC20;
    using ArgumentsDecoder for bytes;
    using OrderLib for OrderLib.Order;

    error UnknownOrder();
    error AccessDenied();
    error AlreadyFilled();
    error PermitLengthTooLow();
    error ZeroTargetIsForbidden();
    error RemainingAmountIsZero();
    error PrivateOrder();
    error BadSignature();
    error ReentrancyDetected();
    error PredicateIsNotTrue();
    error OnlyOneAmountShouldBeZero();
    error TakingAmountTooHigh();
    error MakingAmountTooLow();
    error SwapWithZeroAmount();
    error TransferFromMakerToTakerFailed();
    error TransferFromTakerToMakerFailed();
    error WrongAmount();
    error WrongGetter();
    error GetAmountCallFailed();

    /// @notice Emitted every time order gets filled, including partial fills
    event OrderFilled(
        address indexed maker,
        bytes32 orderHash,
        uint256 remaining
    );

    /// @notice Emitted when order gets cancelled
    event OrderCanceled(
        address indexed maker,
        bytes32 orderHash,
        uint256 remainingRaw
    );

    uint256 constant private _ORDER_DOES_NOT_EXIST = 0;
    uint256 constant private _ORDER_FILLED = 1;

    IWETH private immutable _WETH;  // solhint-disable-line var-name-mixedcase
    /// @notice Stores unfilled amounts for each order plus one.
    /// Therefore 0 means order doesn't exist and 1 means order was filled
    mapping(bytes32 => uint256) private _remaining;

    constructor(IWETH weth) {
        _WETH = weth;
    }

    /**
     * @notice See {IOrderMixin-remaining}.
     */
    function remaining(bytes32 orderHash) external view returns(uint256 /* amount */) {
        uint256 amount = _remaining[orderHash];
        if (amount == _ORDER_DOES_NOT_EXIST) revert UnknownOrder();
        unchecked { amount -= 1; }
        return amount;
    }

    /**
     * @notice See {IOrderMixin-remainingRaw}.
     */
    function remainingRaw(bytes32 orderHash) external view returns(uint256 /* rawAmount */) {
        return _remaining[orderHash];
    }

    /**
     * @notice See {IOrderMixin-remainingsRaw}.
     */
    function remainingsRaw(bytes32[] memory orderHashes) external view returns(uint256[] memory /* rawAmounts */) {
        uint256[] memory results = new uint256[](orderHashes.length);
        for (uint256 i = 0; i < orderHashes.length; i++) {
            results[i] = _remaining[orderHashes[i]];
        }
        return results;
    }

    error SimulationResults(bool success, bytes res);

    /**
     * @notice See {IOrderMixin-simulate}.
     */
    function simulate(address target, bytes calldata data) external {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory result) = target.delegatecall(data);
        revert SimulationResults(success, result);
    }

    /**
     * @notice See {IOrderMixin-cancelOrder}.
     */
    function cancelOrder(OrderLib.Order calldata order) external returns(uint256 orderRemaining, bytes32 orderHash) {
        if (order.maker != msg.sender) revert AccessDenied();

        orderHash = hashOrder(order);
        orderRemaining = _remaining[orderHash];
        if (orderRemaining == _ORDER_FILLED) revert AlreadyFilled();
        emit OrderCanceled(msg.sender, orderHash, orderRemaining);
        _remaining[orderHash] = _ORDER_FILLED;
    }

    /**
     * @notice See {IOrderMixin-fillOrder}.
     */
    function fillOrder(
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount
    ) external payable returns(uint256 /* actualMakingAmount */, uint256 /* actualTakingAmount */, bytes32 /* orderHash */) {
        return fillOrderTo(order, signature, interaction, makingAmount, takingAmount, thresholdAmount, msg.sender);
    }

    /**
     * @notice See {IOrderMixin-fillOrderToWithPermit}.
     */
    function fillOrderToWithPermit(
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount,
        address target,
        bytes calldata permit
    ) external returns(uint256 /* actualMakingAmount */, uint256 /* actualTakingAmount */, bytes32 /* orderHash */) {
        if (permit.length < 20) revert PermitLengthTooLow();
        {  // Stack too deep
            (address token, bytes calldata permitData) = permit.decodeTargetAndCalldata();
            IERC20(token).safePermit(permitData);
        }
        return fillOrderTo(order, signature, interaction, makingAmount, takingAmount, thresholdAmount, target);
    }

    /**
     * @notice See {IOrderMixin-fillOrderTo}.
     */
    function fillOrderTo(
        OrderLib.Order calldata order_,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount,
        address target
    ) public payable returns(uint256 actualMakingAmount, uint256 actualTakingAmount, bytes32 orderHash) {
        if (target == address(0)) revert ZeroTargetIsForbidden();
        orderHash = hashOrder(order_);

        OrderLib.Order calldata order = order_; // Helps with "Stack too deep"
        actualMakingAmount = makingAmount;
        actualTakingAmount = takingAmount;

        uint256 remainingMakerAmount = _remaining[orderHash];
        if (remainingMakerAmount == _ORDER_FILLED) revert RemainingAmountIsZero();
        if (order.allowedSender != address(0) && order.allowedSender != msg.sender) revert PrivateOrder();
        if (remainingMakerAmount == _ORDER_DOES_NOT_EXIST) {
            // First fill: validate order and permit maker asset
            if (!ECDSA.recoverOrIsValidSignature(order.maker, orderHash, signature)) revert BadSignature();
            remainingMakerAmount = order.makingAmount;

            bytes calldata permit = order.permit(); // Helps with "Stack too deep"
            if (permit.length >= 20) {
                // proceed only if permit length is enough to store address
                (address token, bytes calldata permitCalldata) = permit.decodeTargetAndCalldata();
                IERC20(token).safePermit(permitCalldata);
                if (_remaining[orderHash] != _ORDER_DOES_NOT_EXIST) revert ReentrancyDetected();
            }
        } else {
            unchecked { remainingMakerAmount -= 1; }
        }

        // Check if order is valid
        if (order.predicate().length > 0) {
            if (!checkPredicate(order)) revert PredicateIsNotTrue();
        }

        // Compute maker and taker assets amount
        if ((actualTakingAmount == 0) == (actualMakingAmount == 0)) {
            revert OnlyOneAmountShouldBeZero();
        } else if (actualTakingAmount == 0) {
            if (actualMakingAmount > remainingMakerAmount) {
                actualMakingAmount = remainingMakerAmount;
            }
            actualTakingAmount = _getTakingAmount(order.getTakingAmount(), orderHash, order.makingAmount, actualMakingAmount, order.takingAmount, remainingMakerAmount);
            // check that actual rate is not worse than what was expected
            // actualTakingAmount / actualMakingAmount <= thresholdAmount / makingAmount
            if (actualTakingAmount * makingAmount > thresholdAmount * actualMakingAmount) revert TakingAmountTooHigh();
        } else {
            actualMakingAmount = _getMakingAmount(order.getMakingAmount(), orderHash, order.takingAmount, actualTakingAmount, order.makingAmount, remainingMakerAmount);
            if (actualMakingAmount > remainingMakerAmount) {
                actualMakingAmount = remainingMakerAmount;
                actualTakingAmount = _getTakingAmount(order.getTakingAmount(), orderHash, order.makingAmount, actualMakingAmount, order.takingAmount, remainingMakerAmount);
            }
            // check that actual rate is not worse than what was expected
            // actualMakingAmount / actualTakingAmount >= thresholdAmount / takingAmount
            if (actualMakingAmount * takingAmount < thresholdAmount * actualTakingAmount) revert MakingAmountTooLow();
        }

        if (actualMakingAmount == 0 || actualTakingAmount == 0) revert SwapWithZeroAmount();

        // Update remaining amount in storage
        unchecked {
            remainingMakerAmount = remainingMakerAmount - actualMakingAmount;
            _remaining[orderHash] = remainingMakerAmount + 1;
        }
        emit OrderFilled(order_.maker, orderHash, remainingMakerAmount);

        // Maker can handle funds interactively
        if (order.preInteraction().length >= 20) {
            // proceed only if interaction length is enough to store address
            (address interactionTarget, bytes calldata interactionData) = order.preInteraction().decodeTargetAndCalldata();
            PreInteractionNotificationReceiver(interactionTarget).fillOrderPreInteraction(
                orderHash, order.maker, msg.sender, actualMakingAmount, actualTakingAmount, remainingMakerAmount, interactionData
            );
        }

        // Maker => Taker
        if (!_callTransferFrom(
            order.makerAsset,
            order.maker,
            target,
            actualMakingAmount,
            order.makerAssetData()
        )) revert TransferFromMakerToTakerFailed();

        if (interaction.length >= 20) {
            // proceed only if interaction length is enough to store address
            (address interactionTarget, bytes calldata interactionData) = interaction.decodeTargetAndCalldata();
            uint256 offeredTakingAmount = InteractionNotificationReceiver(interactionTarget).fillOrderInteraction(
                msg.sender, actualMakingAmount, actualTakingAmount, interactionData
            );

            if (offeredTakingAmount > actualTakingAmount &&
                !OrderLib.getterIsFrozen(order.getMakingAmount()) &&
                !OrderLib.getterIsFrozen(order.getTakingAmount()))
            {
                actualTakingAmount = offeredTakingAmount;
            }
        }

        // Taker => Maker
        if (order.takerAsset == address(_WETH) && msg.value > 0) {
            if (msg.value != actualTakingAmount) revert InvalidMsgValue();
            _WETH.deposit{ value: actualTakingAmount }();
            _WETH.transfer(order.receiver == address(0) ? order.maker : order.receiver, actualTakingAmount);
        } else {
            if (msg.value != 0) revert InvalidMsgValue();
            if (!_callTransferFrom(
                order.takerAsset,
                msg.sender,
                order.receiver == address(0) ? order.maker : order.receiver,
                actualTakingAmount,
                order.takerAssetData()
            )) revert TransferFromTakerToMakerFailed();
        }

        // Maker can handle funds interactively
        if (order.postInteraction().length >= 20) {
            // proceed only if interaction length is enough to store address
            (address interactionTarget, bytes calldata interactionData) = order.postInteraction().decodeTargetAndCalldata();
            PostInteractionNotificationReceiver(interactionTarget).fillOrderPostInteraction(
                 orderHash, order.maker, msg.sender, actualMakingAmount, actualTakingAmount, remainingMakerAmount, interactionData
            );
        }
    }

    /**
     * @notice See {IOrderMixin-checkPredicate}.
     */
    function checkPredicate(OrderLib.Order calldata order) public view returns(bool) {
        (bool success, uint256 res) = _selfStaticCall(order.predicate());
        return success && res == 1;
    }

    /**
     * @notice See {IOrderMixin-hashOrder}.
     */
    function hashOrder(OrderLib.Order calldata order) public view returns(bytes32) {
        return order.hash(_domainSeparatorV4());
    }

    function _callTransferFrom(address asset, address from, address to, uint256 amount, bytes calldata input) private returns(bool success) {
        bytes4 selector = IERC20.transferFrom.selector;
        /// @solidity memory-safe-assembly
        assembly { // solhint-disable-line no-inline-assembly
            let data := mload(0x40)

            mstore(data, selector)
            mstore(add(data, 0x04), from)
            mstore(add(data, 0x24), to)
            mstore(add(data, 0x44), amount)
            calldatacopy(add(data, 0x64), input.offset, input.length)
            let status := call(gas(), asset, 0, data, add(100, input.length), 0x0, 0x20)
            success := and(status, or(iszero(returndatasize()), and(gt(returndatasize(), 31), eq(mload(0), 1))))
        }
    }

    function _getMakingAmount(bytes calldata getter, bytes32 orderHash, uint256 orderTakingAmount, uint256 requestedTakingAmount, uint256 orderMakingAmount, uint256 remainingMakingAmount) private view returns(uint256) {
        if (getter.length == 0) {
            // Linear proportion
            return getMakingAmount(orderMakingAmount, orderTakingAmount, requestedTakingAmount);
        }
        return _callGetter(getter, orderHash, orderTakingAmount, requestedTakingAmount, orderMakingAmount, remainingMakingAmount);
    }

    function _getTakingAmount(bytes calldata getter, bytes32 orderHash, uint256 orderMakingAmount, uint256 requestedMakingAmount, uint256 orderTakingAmount, uint256 remainingMakingAmount) private view returns(uint256) {
        if (getter.length == 0) {
            // Linear proportion
            return getTakingAmount(orderMakingAmount, orderTakingAmount, requestedMakingAmount);
        }
        return _callGetter(getter, orderHash, orderMakingAmount, requestedMakingAmount, orderTakingAmount, remainingMakingAmount);
    }

    function _callGetter(bytes calldata getter, bytes32 orderHash, uint256 orderExpectedAmount, uint256 requestedAmount, uint256 orderResultAmount, uint256 remainingMakingAmount) private view returns(uint256) {
        if (getter.length == 1) {
            if (OrderLib.getterIsFrozen(getter)) {
                // On "x" getter calldata only exact amount is allowed
                if (requestedAmount != orderExpectedAmount) revert WrongAmount();
                return orderResultAmount;
            } else {
                revert WrongGetter();
            }
        } else {
            (address target, bytes calldata data) = getter.decodeTargetAndCalldata();
            (bool success, bytes memory result) = target.staticcall(abi.encodePacked(data, requestedAmount, remainingMakingAmount, orderHash));
            if (!success || result.length != 32) revert GetAmountCallFailed();
            return abi.decode(result, (uint256));
        }
    }
}
