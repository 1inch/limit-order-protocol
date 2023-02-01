// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/solidity-utils/contracts/interfaces/IWETH.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/ECDSA.sol";

import "./helpers/PredicateHelper.sol";
import "./interfaces/IOrderMixin.sol";
import "./interfaces/IInteractionNotificationReceiver.sol";
import "./interfaces/IPreInteractionNotificationReceiver.sol";
import "./interfaces/IPostInteractionNotificationReceiver.sol";
import "./libraries/Errors.sol";
import "./OrderLib.sol";

/// @title Regular Limit Order mixin
abstract contract OrderMixin is IOrderMixin, EIP712, PredicateHelper {
    using SafeERC20 for IERC20;
    using OrderLib for OrderLib.Order;
    using CalldataLib for CalldataLib.Address;
    using CalldataLib for bytes;

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
    error TakingAmountIncreased();
    error SimulationResults(bool success, bytes res);

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

    uint256 private constant _RAW_CALL_GAS_LIMIT = 5000;
    uint256 private constant _ORDER_DOES_NOT_EXIST = 0;
    uint256 private constant _ORDER_FILLED = 1;
    uint256 private constant _SKIP_PERMIT_FLAG = 1 << 255;
    uint256 private constant _THRESHOLD_MASK = ~_SKIP_PERMIT_FLAG;

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
        unchecked { return amount - 1; }
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
        if (order.maker.get() != msg.sender) revert AccessDenied();

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
        uint256 skipPermitAndThresholdAmount
    ) external payable returns(uint256 /* actualMakingAmount */, uint256 /* actualTakingAmount */, bytes32 /* orderHash */) {
        return fillOrderTo(order, signature, interaction, makingAmount, takingAmount, skipPermitAndThresholdAmount, msg.sender);
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
        uint256 skipPermitAndThresholdAmount,
        address target,
        bytes calldata permit
    ) external returns(uint256 /* actualMakingAmount */, uint256 /* actualTakingAmount */, bytes32 /* orderHash */) {
        if (permit.length < 20) revert PermitLengthTooLow();
        {  // Stack too deep
            (address token, bytes calldata permitData) = permit.decodeTargetAndCalldata();
            IERC20(token).safePermit(permitData);
        }
        return fillOrderTo(order, signature, interaction, makingAmount, takingAmount, skipPermitAndThresholdAmount, target);
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
        uint256 skipPermitAndThresholdAmount,
        address target
    ) public payable returns(uint256 actualMakingAmount, uint256 actualTakingAmount, bytes32 orderHash) {
        if (target == address(0)) revert ZeroTargetIsForbidden();
        orderHash = hashOrder(order_);

        OrderLib.Order calldata order = order_; // Helps with "Stack too deep"
        actualMakingAmount = makingAmount;
        actualTakingAmount = takingAmount;

        uint256 remainingMakingAmount = _remaining[orderHash];
        if (remainingMakingAmount == _ORDER_FILLED) revert RemainingAmountIsZero();
        if (order.allowedSender.get() != address(0) && order.allowedSender.get() != msg.sender) revert PrivateOrder();
        if (remainingMakingAmount == _ORDER_DOES_NOT_EXIST) {
            // First fill: validate order and permit maker asset
            if (!ECDSA.recoverOrIsValidSignature(order.maker.get(), orderHash, signature)) revert BadSignature();
            remainingMakingAmount = order.makingAmount;

            bytes calldata permit = order.permit();
            if (skipPermitAndThresholdAmount & _SKIP_PERMIT_FLAG == 0 && permit.length >= 20) {
                // proceed only if taker is willing to execute permit and its length is enough to store address
                (address token, bytes calldata permitCalldata) = permit.decodeTargetAndCalldata();
                IERC20(token).safePermit(permitCalldata);
                if (_remaining[orderHash] != _ORDER_DOES_NOT_EXIST) revert ReentrancyDetected();
            }
        } else {
            unchecked { remainingMakingAmount -= 1; }
        }

        // Check if order is valid
        if (order.predicate().length > 0) {
            if (!checkPredicate(order)) revert PredicateIsNotTrue();
        }

        // Compute maker and taker assets amount
        if ((actualTakingAmount == 0) == (actualMakingAmount == 0)) {
            revert OnlyOneAmountShouldBeZero();
        } else if (actualTakingAmount == 0) {
            if (actualMakingAmount > remainingMakingAmount) {
                actualMakingAmount = remainingMakingAmount;
            }
            actualTakingAmount = order.getTakingAmount(actualMakingAmount, remainingMakingAmount, orderHash);
            uint256 thresholdAmount = skipPermitAndThresholdAmount & _THRESHOLD_MASK;
            // check that actual rate is not worse than what was expected
            // actualTakingAmount / actualMakingAmount <= thresholdAmount / makingAmount
            if (actualTakingAmount * makingAmount > thresholdAmount * actualMakingAmount) revert TakingAmountTooHigh();
        } else {
            actualMakingAmount = order.getMakingAmount(actualTakingAmount, remainingMakingAmount, orderHash);
            if (actualMakingAmount > remainingMakingAmount) {
                actualMakingAmount = remainingMakingAmount;
                actualTakingAmount = order.getTakingAmount(actualMakingAmount, remainingMakingAmount, orderHash);
                if (actualTakingAmount > takingAmount) revert TakingAmountIncreased();
            }
            uint256 thresholdAmount = skipPermitAndThresholdAmount & _THRESHOLD_MASK;
            // check that actual rate is not worse than what was expected
            // actualMakingAmount / actualTakingAmount >= thresholdAmount / takingAmount
            if (actualMakingAmount * takingAmount < thresholdAmount * actualTakingAmount) revert MakingAmountTooLow();
        }

        if (actualMakingAmount == 0 || actualTakingAmount == 0) revert SwapWithZeroAmount();

        // Update remaining amount in storage
        unchecked {
            remainingMakingAmount = remainingMakingAmount - actualMakingAmount;
            _remaining[orderHash] = remainingMakingAmount + 1;
        }
        emit OrderFilled(order_.maker.get(), orderHash, remainingMakingAmount);

        // Maker can handle funds interactively
        { // Stack too deep
            bytes calldata preInteraction = order.preInteraction();
            if (preInteraction.length >= 20) {
                // proceed only if interaction length is enough to store address
                (address interactionTarget, bytes calldata interactionData) = preInteraction.decodeTargetAndCalldata();
                IPreInteractionNotificationReceiver(interactionTarget).fillOrderPreInteraction(
                    orderHash, order.maker.get(), msg.sender, actualMakingAmount, actualTakingAmount, remainingMakingAmount, interactionData
                );
            }
        }

        // Maker => Taker
        if (!_callTransferFrom(
            order.makerAsset.get(),
            order.maker.get(),
            target,
            actualMakingAmount,
            order.makerAssetData()
        )) revert TransferFromMakerToTakerFailed();

        if (interaction.length >= 20) {
            // proceed only if interaction length is enough to store address
            (address interactionTarget, bytes calldata interactionData) = interaction.decodeTargetAndCalldata();
            uint256 offeredTakingAmount = IInteractionNotificationReceiver(interactionTarget).fillOrderInteraction(
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
        if (order.takerAsset.get() == address(_WETH) && msg.value > 0) {
            if (msg.value < actualTakingAmount) revert Errors.InvalidMsgValue();
            if (msg.value > actualTakingAmount) {
                unchecked {
                    // solhint-disable-next-line avoid-low-level-calls
                    (bool success, ) = msg.sender.call{value: msg.value - actualTakingAmount, gas: _RAW_CALL_GAS_LIMIT}("");
                    if (!success) revert Errors.ETHTransferFailed();
                }
            }
            _WETH.deposit{ value: actualTakingAmount }();
            _WETH.transfer(order.receiver.get() == address(0) ? order.maker.get() : order.receiver.get(), actualTakingAmount);
        } else {
            if (msg.value != 0) revert Errors.InvalidMsgValue();
            if (!_callTransferFrom(
                order.takerAsset.get(),
                msg.sender,
                order.receiver.get() == address(0) ? order.maker.get() : order.receiver.get(),
                actualTakingAmount,
                order.takerAssetData()
            )) revert TransferFromTakerToMakerFailed();
        }

        // Maker can handle funds interactively
        bytes calldata postInteraction = order.postInteraction();
        if (postInteraction.length >= 20) {
            // proceed only if interaction length is enough to store address
            (address interactionTarget, bytes calldata interactionData) = postInteraction.decodeTargetAndCalldata();
            IPostInteractionNotificationReceiver(interactionTarget).fillOrderPostInteraction(
                 orderHash, order.maker.get(), msg.sender, actualMakingAmount, actualTakingAmount, remainingMakingAmount, interactionData
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
            let status := call(gas(), asset, 0, data, add(0x64, input.length), 0x0, 0x20)
            success := and(status, or(iszero(returndatasize()), and(gt(returndatasize(), 31), eq(mload(0), 1))))
        }
    }
}
