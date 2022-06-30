// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

import "./helpers/AmountCalculator.sol";
import "./helpers/NonceManager.sol";
import "./helpers/PredicateHelper.sol";
import "./interfaces/NotificationReceiver.sol";
import "./libraries/ArgumentsDecoder.sol";
import "./libraries/Callib.sol";
import "./libraries/ECDSA.sol";
import "./OrderLib.sol";

/// @title Regular Limit Order mixin
abstract contract OrderMixin is
    EIP712,
    AmountCalculator,
    NonceManager,
    PredicateHelper
{
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
    error getAmountCallFailed();

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

    /// @notice Stores unfilled amounts for each order plus one.
    /// Therefore 0 means order doesn't exist and 1 means order was filled
    mapping(bytes32 => uint256) private _remaining;

    /**
     * @notice Returns unfilled amount for order. Throws if order does not exist
     * @param orderHash Order's hash. Obtained by `hashOrder` function
     * @return amount Unfilled amount
     */
    function remaining(bytes32 orderHash) external view returns(uint256 /* amount */) {
        uint256 amount = _remaining[orderHash];
        if (amount == _ORDER_DOES_NOT_EXIST) revert UnknownOrder();
        unchecked { amount -= 1; }
        return amount;
    }

    /**
     * @notice Returns unfilled amount for order
     * @param orderHash Order's hash. Obtained by [Order.hash()](OrderLib.md#hash)
     * @return rawAmount Unfilled amount of order plus one if order exists. Otherwise 0
     */
    function remainingRaw(bytes32 orderHash) external view returns(uint256 /* rawAmount */) {
        return _remaining[orderHash];
    }

    /**
     * @notice Same as `remainingRaw` but for multiple orders
     * @param orderHashes array of hashes
     * @return rawAmounts array of amounts for each order plus one if order exists or 0 otherwise
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
     * @notice Delegates execution to custom implementation. Could be used to validate if `transferFrom` works properly
     * @param target Addresses that will be delegated
     * @param data Data that will be passed to delegatee
     */
    function simulate(address target, bytes calldata data) external {
        // solhint-disable-next-lineavoid-low-level-calls
        (bool success, bytes memory result) = target.delegatecall(data);
        revert SimulationResults(success, result);
    }

    /**
     * @notice Cancels order.
     * @dev Order is cancelled by setting remaining amount to _ORDER_FILLED value
     * @param order Order quote to cancel
     * @return orderRemaining Unfilled amount of order before cancellation
     * @return orderHash Order's hash. Obtained by `hashOrder` function
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
     * @notice Fills an order. If one doesn't exist (first fill) it will be created using order.makerAssetData
     * @param order Order quote to fill
     * @param signature Signature to confirm quote ownership
     * @param makingAmount Making amount
     * @param takingAmount Taking amount
     * @param thresholdAmount Specifies maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount
     * @return actualMakingAmount Actual amount transferred from maker to taker
     * @return actualTakingAmount Actual amount transferred from taker to maker
     * @return orderHash Order's hash. Obtained by [Order.hash()](OrderLib.md#hash)
     */
    function fillOrder(
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount
    ) external returns(uint256 /* actualMakingAmount */, uint256 /* actualTakingAmount */, bytes32 /* orderHash */) {
        return fillOrderTo(order, signature, interaction, makingAmount, takingAmount, thresholdAmount, msg.sender);
    }

    /**
     * @notice Same as `fillOrder` but calls permit first,
     * allowing to approve token spending and make a swap in one transaction.
     * Also allows to specify funds destination instead of `msg.sender`
     * @dev See tests for examples
     * @param order Order quote to fill
     * @param signature Signature to confirm quote ownership
     * @param makingAmount Making amount
     * @param takingAmount Taking amount
     * @param thresholdAmount Specifies maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount
     * @param target Address that will receive swap funds
     * @param permit Should consist of abiencoded token address and encoded `IERC20Permit.permit` call.
     * @return actualMakingAmount Actual amount transferred from maker to taker
     * @return actualTakingAmount Actual amount transferred from taker to maker
     * @return orderHash Order's hash. Obtained by [Order.hash()](OrderLib.md#hash)
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
     * @notice Same as `fillOrder` but allows to specify funds destination instead of `msg.sender`
     * @param order_ Order quote to fill
     * @param signature Signature to confirm quote ownership
     * @param makingAmount Making amount
     * @param takingAmount Taking amount
     * @param thresholdAmount Specifies maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount
     * @param target Address that will receive swap funds
     * @return actualMakingAmount Actual amount transferred from maker to taker
     * @return actualTakingAmount Actual amount transferred from taker to maker
     * @return orderHash Order's hash. Obtained by [Order.hash()](OrderLib.md#hash)
     */
    function fillOrderTo(
        OrderLib.Order calldata order_,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount,
        address target
    ) public returns(uint256 actualMakingAmount, uint256 actualTakingAmount, bytes32 orderHash) {
        if (target == address(0)) revert ZeroTargetIsForbidden();
        orderHash = hashOrder(order_);

        OrderLib.Order calldata order = order_; // Helps with "Stack too deep"
        actualMakingAmount = makingAmount;
        actualTakingAmount = takingAmount;

        {  // Stack too deep
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
                actualTakingAmount = _callGetter(order.getTakingAmount(), order.makingAmount, actualMakingAmount, order.takingAmount);
                // check that actual rate is not worse than what was expected
                // actualTakingAmount / actualMakingAmount <= thresholdAmount / makingAmount
                if (actualTakingAmount * makingAmount > thresholdAmount * actualMakingAmount) revert TakingAmountTooHigh();
            } else {
                actualMakingAmount = _callGetter(order.getMakingAmount(), order.takingAmount, actualTakingAmount, order.makingAmount);
                if (actualMakingAmount > remainingMakerAmount) {
                    actualMakingAmount = remainingMakerAmount;
                    actualTakingAmount = _callGetter(order.getTakingAmount(), order.makingAmount, actualMakingAmount, order.takingAmount);
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
            emit OrderFilled(msg.sender, orderHash, remainingMakerAmount);
        }

        // Maker can handle funds interactively
        if (order.preInteraction().length >= 20) {
            // proceed only if interaction length is enough to store address
            (address interactionTarget, bytes calldata interactionData) = order.preInteraction().decodeTargetAndCalldata();
            PreInteractionNotificationReceiver(interactionTarget).fillOrderPreInteraction(
                msg.sender, order.makerAsset, order.takerAsset, actualMakingAmount, actualTakingAmount, interactionData
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
                msg.sender, order.makerAsset, order.takerAsset, actualMakingAmount, actualTakingAmount, interactionData
            );
            if (offeredTakingAmount > actualTakingAmount && !order.takingAmountIsFrosen()) {
                actualTakingAmount = offeredTakingAmount;
            }
        }

        // Taker => Maker
        if (!_callTransferFrom(
            order.takerAsset,
            msg.sender,
            order.receiver == address(0) ? order.maker : order.receiver,
            actualTakingAmount,
            order.takerAssetData()
        )) revert TransferFromTakerToMakerFailed();

        // Maker can handle funds interactively
        if (order.postInteraction().length >= 20) {
            // proceed only if interaction length is enough to store address
            (address interactionTarget, bytes calldata interactionData) = order.postInteraction().decodeTargetAndCalldata();
            PostInteractionNotificationReceiver(interactionTarget).fillOrderPostInteraction(
                msg.sender, order.makerAsset, order.takerAsset, actualMakingAmount, actualTakingAmount, interactionData
            );
        }
    }

    /// @notice Checks order predicate
    function checkPredicate(OrderLib.Order calldata order) public view returns(bool) {
        (bool success, uint256 res) = address(this).staticcallForUint(order.predicate());
        return success && res == 1;
    }

    /**
     * @notice Кeturns the hash of the fully encoded EIP712 order hash for this domain.
     */
    function hashOrder(OrderLib.Order calldata order) public view returns(bytes32) {
        return _hashTypedDataV4(order.hash());
    }

    function _callTransferFrom(address asset, address from, address to, uint256 amount, bytes calldata input) private returns(bool success) {
        bytes4 selector = IERC20.transferFrom.selector;
        assembly { // solhint-disable-line no-inline-assembly
            let data := mload(0x40)
            mstore(0x40, add(data, add(100, input.length)))

            mstore(data, selector)
            mstore(add(data, 0x04), from)
            mstore(add(data, 0x24), to)
            mstore(add(data, 0x44), amount)
            calldatacopy(add(data, 0x64), input.offset, input.length)
            let status := call(gas(), asset, 0, data, add(100, input.length), 0x0, 0x20)
            success := and(status, or(iszero(returndatasize()), and(gt(returndatasize(), 31), eq(mload(0), 1))))
        }
    }

    function _callGetter(bytes calldata getter, uint256 orderExpectedAmount, uint256 amount, uint256 orderResultAmount) private view returns(uint256) {
        if (getter.length == 0) {
            // On empty getter calldata only exact amount is allowed
            if (amount != orderExpectedAmount) revert WrongAmount();
            return orderResultAmount;
        } else if (getter.length == 1) {
            // Linear proportion
            if (getter[0] == "m") {
                return getMakingAmount(orderResultAmount, orderExpectedAmount, amount);
            } else if (getter[0] == "t") {
                return getTakingAmount(orderExpectedAmount, orderResultAmount, amount);
            } else {
                revert WrongGetter();
            }
        } else {
            (address target, bytes calldata data) = getter.decodeTargetAndCalldata();
            (bool success, bytes memory result) = target.staticcall(abi.encodePacked(data, amount));
            if (!success || result.length != 32) revert getAmountCallFailed();
            return result.decodeUint256Memory();
        }
    }
}
