// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
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
import "./libraries/InputLib.sol";
import "./OrderLib.sol";

/// @title Regular Limit Order mixin
abstract contract OrderMixin is IOrderMixin, EIP712, PredicateHelper {
    using SafeERC20 for IERC20;
    using SafeERC20 for IWETH;
    using OrderLib for OrderLib.Order;
    using AddressLib for Address;
    using ConstraintsLib for Constraints;
    using InputLib for Input;

    uint256 private constant _RAW_CALL_GAS_LIMIT = 5000;
    uint256 private constant _ORDER_DOES_NOT_EXIST = 0;
    uint256 private constant _ORDER_FILLED = 1;

    IWETH private immutable _WETH;  // solhint-disable-line var-name-mixedcase

    /// @notice Stores unfilled amounts for each order plus one.
    /// Therefore 0 means order doesn't exist and 1 means order was filled
    mapping(address => mapping(bytes32 => uint256)) private _remaining;

    constructor(IWETH weth) {
        _WETH = weth;
    }

    /**
     * @notice See {IOrderMixin-remaining}.
     */
    function remaining(address maker, bytes32 orderHash) external view returns(uint256 /* amount */) {
        uint256 amount = _remaining[maker][orderHash];
        if (amount == _ORDER_DOES_NOT_EXIST) revert UnknownOrder();
        unchecked { return amount - 1; }
    }

    /**
     * @notice See {IOrderMixin-remainingRaw}.
     */
    function remainingRaw(address maker, bytes32 orderHash) external view returns(uint256 /* rawAmount */) {
        return _remaining[maker][orderHash];
    }

    /**
     * @notice See {IOrderMixin-remainingsRaw}.
     */
    function remainingsRaw(address[] calldata makers, bytes32[] calldata orderHashes) external view returns(uint256[] memory /* rawAmounts */) {
        uint256[] memory results = new uint256[](orderHashes.length);
        for (uint256 i = 0; i < orderHashes.length; i++) {
            results[i] = _remaining[makers[i]][orderHashes[i]];
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
    function cancelOrder(bytes32 orderHash) public returns(uint256 orderRemaining) {
        return _cancelOrder(_remaining[msg.sender], orderHash);
    }

    /**
     * @notice See {IOrderMixin-cancelOrders}.
     */
    function cancelOrders(bytes32[] calldata orderHashes) external returns(uint256[] memory orderRemaining) {
        orderRemaining = new uint256[](orderHashes.length);
        mapping(bytes32 => uint256) storage remainingPtr = _remaining[msg.sender];
        for (uint256 i = 0; i < orderHashes.length; i++) {
            orderRemaining[i] = _cancelOrder(remainingPtr, orderHashes[i]);
        }
    }

    /**
     * @notice See {IOrderMixin-fillOrder}.
     */
    function fillOrder(
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        Input input,
        uint256 threshold
    ) external payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash) {
        return fillOrderTo(order, signature, interaction, input, threshold, msg.sender);
    }

    /**
     * @notice See {IOrderMixin-fillOrderToWithPermit}.
     */
    function fillOrderToWithPermit(
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        Input input,
        uint256 threshold,
        address target,
        bytes calldata permit
    ) external returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash) {
        if (permit.length < 20) revert PermitLengthTooLow();
        IERC20(address(bytes20(permit))).safePermit(permit[20:]);
        return fillOrderTo(order, signature, interaction, input, threshold, target);
    }

    /**
     * @notice See {IOrderMixin-fillOrderTo}.
     */
    function fillOrderTo(
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        Input input,
        uint256 threshold,
        address target
    ) public payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash) {
        if (target == address(0)) {
            target = msg.sender;
        }

        // Validate order
        if (!order.constraints.isAllowedSender(msg.sender)) revert PrivateOrder();
        if (order.constraints.isExpired()) revert OrderExpired();
        if (!nonceEquals(order.maker.get(), order.constraints.series(), order.constraints.nonce())) revert WrongSeriesNonce();

        // Check remaining amount
        orderHash = hashOrder(order);
        mapping(bytes32 => uint256) storage remainingPtr = _remaining[order.maker.get()];
        uint256 remainingMakingAmount = remainingPtr[orderHash];
        if (remainingMakingAmount == _ORDER_FILLED) revert RemainingAmountIsZero();
        if (remainingMakingAmount == _ORDER_DOES_NOT_EXIST) {
            // First fill: validate order and permit maker asset
            if (!ECDSA.recoverOrIsValidSignature(order.maker.get(), orderHash, signature)) revert BadSignature();
            remainingMakingAmount = order.makingAmount;

            if (!input.skipOrderPermit()) {
                bytes calldata permit = order.permit();
                if (permit.length >= 20) {
                    // proceed only if taker is willing to execute permit and its length is enough to store address
                    IERC20(address(bytes20(permit))).safePermit(permit[20:]);
                    if (remainingPtr[orderHash] != _ORDER_DOES_NOT_EXIST) revert ReentrancyDetected();
                }
            }
        } else {
            unchecked { remainingMakingAmount -= 1; }
        }

        // Check if orders predicate allows filling
        {  // Stack too deep
            bytes calldata predicate = order.predicate();
            if (predicate.length > 0) {
                if (!checkPredicate(predicate)) revert PredicateIsNotTrue();
            }
        }

        // Compute maker and taker assets amount
        {  // Stack too deep
            uint256 amount = input.amount();
            if (input.isMakingAmount()) {
                // Taker gonna fill rest of the order or specified maker amount
                makingAmount = Math.min(amount, remainingMakingAmount);
                takingAmount = order.getTakingAmount(makingAmount, remainingMakingAmount, orderHash);
                // check that actual rate is not worse than what was expected
                // takingAmount / makingAmount <= threshold / amount
                if (amount == makingAmount) {
                    // It's gas optimization due this check doesn't involve SafeMath
                    if (takingAmount > threshold) revert TakingAmountTooHigh();
                }
                else {
                    if (takingAmount * amount > threshold * makingAmount) revert TakingAmountTooHigh();
                }
            }
            else {
                // Taker gonna fill specified taker amount
                takingAmount = amount;
                makingAmount = order.getMakingAmount(takingAmount, remainingMakingAmount, orderHash);
                if (makingAmount > remainingMakingAmount) {
                    // Try to decrease taking amount because computed making amount exceeds remaining amount
                    makingAmount = remainingMakingAmount;
                    takingAmount = order.getTakingAmount(makingAmount, remainingMakingAmount, orderHash);
                    if (takingAmount > amount) revert TakingAmountIncreased(); // TODO: check if this is necessary, threshold check should be enough
                }
                // check that actual rate is not worse than what was expected
                // makingAmount / takingAmount >= threshold / amount
                if (amount == takingAmount) {
                    // It's gas optimization due this check doesn't involve SafeMath
                    if (makingAmount < threshold) revert MakingAmountTooLow();
                }
                else {
                    if (makingAmount * amount < threshold * takingAmount) revert MakingAmountTooLow();
                }
            }
        }
        if (makingAmount == 0 || takingAmount == 0) revert SwapWithZeroAmount();

        // Update remaining amount in storage
        unchecked {
            remainingMakingAmount = remainingMakingAmount - makingAmount;
            remainingPtr[orderHash] = remainingMakingAmount + 1;
        }
        emit OrderFilled(order.maker.get(), orderHash, remainingMakingAmount);

        // Maker can handle funds interactively
        { // Stack too deep
            bytes calldata preInteraction = order.preInteraction();
            if (preInteraction.length >= 20) {
                // proceed only if interaction length is enough to store address
                IPreInteractionNotificationReceiver(address(bytes20(preInteraction))).fillOrderPreInteraction(
                    orderHash, order.maker.get(), msg.sender, makingAmount, takingAmount, remainingMakingAmount, preInteraction[20:]
                );
            }
        }

        // Maker => Taker
        if (order.makerAsset.get() == address(_WETH) && input.needUnwrapWeth()) {
            _WETH.safeTransferFrom(order.maker.get(), address(this), makingAmount);
            _WETH.safeWithdrawTo(makingAmount, target);
        } else {
            if (!_callTransferFrom(
                order.makerAsset.get(),
                order.maker.get(),
                target,
                makingAmount,
                order.makerAssetData()
            )) revert TransferFromMakerToTakerFailed();
        }

        if (interaction.length >= 20) {
            // proceed only if interaction length is enough to store address
            uint256 offeredTakingAmount = IInteractionNotificationReceiver(address(bytes20(interaction))).fillOrderInteraction(
                msg.sender, makingAmount, takingAmount, interaction[20:]
            );
            if (offeredTakingAmount > takingAmount && order.constraints.allowImproveRateViaInteraction()) {
                takingAmount = offeredTakingAmount;
            }
        }

        // Taker => Maker
        if (order.takerAsset.get() == address(_WETH) && msg.value > 0) { // TODO: check balance to get ETH in interaction?
            if (msg.value < takingAmount) revert Errors.InvalidMsgValue();
            if (msg.value > takingAmount) {
                unchecked {
                    // solhint-disable-next-line avoid-low-level-calls
                    (bool success, ) = msg.sender.call{value: msg.value - takingAmount, gas: _RAW_CALL_GAS_LIMIT}("");
                    if (!success) revert Errors.ETHTransferFailed();
                }
            }
            _WETH.safeDeposit(takingAmount);
            _WETH.safeTransfer(order.receiver.get() == address(0) ? order.maker.get() : order.receiver.get(), takingAmount);
        } else {
            if (msg.value != 0) revert Errors.InvalidMsgValue();
            if (!_callTransferFrom(
                order.takerAsset.get(),
                msg.sender,
                order.receiver.get() == address(0) ? order.maker.get() : order.receiver.get(),
                takingAmount,
                order.takerAssetData()
            )) revert TransferFromTakerToMakerFailed();
        }

        // Maker can handle funds interactively
        bytes calldata postInteraction = order.postInteraction();
        if (postInteraction.length >= 20) {
            // proceed only if interaction length is enough to store address
            IPostInteractionNotificationReceiver(address(bytes20(postInteraction))).fillOrderPostInteraction(
                 orderHash, order.maker.get(), msg.sender, makingAmount, takingAmount, remainingMakingAmount, postInteraction[20:]
            );
        }
    }

    /**
     * @notice See {IOrderMixin-checkPredicate}.
     */
    function checkPredicate(bytes calldata predicate) public view returns(bool) {
        (bool success, uint256 res) = _selfStaticCall(predicate);
        return success && res == 1;
    }

    /**
     * @notice See {IOrderMixin-hashOrder}.
     */
    function hashOrder(OrderLib.Order calldata order) public view returns(bytes32) {
        return order.hash(_domainSeparatorV4());
    }

    function _cancelOrder(mapping(bytes32 => uint256) storage remainingPtr, bytes32 orderHash) private returns(uint256 orderRemaining) {
        orderRemaining = remainingPtr[orderHash];
        if (orderRemaining == _ORDER_FILLED) revert AlreadyFilled();
        emit OrderCanceled(msg.sender, orderHash, orderRemaining);
        remainingPtr[orderHash] = _ORDER_FILLED;
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
