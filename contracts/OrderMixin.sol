// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/utils/math/Math.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/solidity-utils/contracts/interfaces/IWETH.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/OnlyWethReceiver.sol";

import "./helpers/AmountCalculator.sol";
import "./helpers/PredicateHelper.sol";
import "./interfaces/ITakerInteraction.sol";
import "./interfaces/IPreInteraction.sol";
import "./interfaces/IPostInteraction.sol";
import "./interfaces/IOrderMixin.sol";
import "./libraries/Errors.sol";
import "./libraries/LimitsLib.sol";
import "./libraries/BitInvalidatorLib.sol";
import "./libraries/RemainingInvalidatorLib.sol";
import "./OrderLib.sol";

/// @title RFQ Limit Order mixin
abstract contract OrderMixin is IOrderMixin, EIP712, OnlyWethReceiver, PredicateHelper {
    using SafeERC20 for IERC20;
    using SafeERC20 for IWETH;
    using OrderLib for OrderLib.Order;
    using OrderLib for bytes;
    using AddressLib for Address;
    using ConstraintsLib for Constraints;
    using LimitsLib for Limits;
    using BitInvalidatorLib for BitInvalidatorLib.Data;
    using RemainingInvalidatorLib for RemainingInvalidator;

    uint256 private constant _RAW_CALL_GAS_LIMIT = 5000;

    IWETH private immutable _WETH;  // solhint-disable-line var-name-mixedcase
    mapping(address => BitInvalidatorLib.Data) private _bitInvalidator;
    mapping(address => mapping(bytes32 => RemainingInvalidator)) private _remainingInvalidator;

    constructor(IWETH weth) OnlyWethReceiver(address(weth)) {
        _WETH = weth;
    }

    /**
     * @notice See {IOrderMixin-bitInvalidatorForOrder}.
     */
    function bitInvalidatorForOrder(address maker, uint256 slot) external view returns(uint256 /* result */) {
        return _bitInvalidator[maker].checkSlot(slot);
    }

    /**
     * @notice See {IOrderMixin-remainingInvalidatorForOrder}.
     */
    function remainingInvalidatorForOrder(address maker, bytes32 orderHash) external view returns(uint256 remaining) {
        return _remainingInvalidator[maker][orderHash].remaining();
    }

    /**
     * @notice See {IOrderMixin-rawRemainingInvalidatorForOrder}.
     */
    function rawRemainingInvalidatorForOrder(address maker, bytes32 orderHash) external view returns(uint256 remainingRaw) {
        return RemainingInvalidator.unwrap(_remainingInvalidator[maker][orderHash]);
    }

    /**
     * @notice See {IOrderMixin-cancelOrder}.
     */
    function cancelOrder(Constraints orderConstraints, bytes32 orderHash) external {
        if (orderConstraints.useBitInvalidator()) {
            _bitInvalidator[msg.sender].massInvalidate(orderConstraints.nonceOrEpoch(), 0);
        } else {
            _remainingInvalidator[msg.sender][orderHash] = RemainingInvalidatorLib.fullyFilled();
        }
    }

    /**
     * @notice See {IOrderMixin-bitsInvalidateForOrder}.
     */
    function bitsInvalidateForOrder(Constraints orderConstraints, uint256 additionalMask) external {
        if (!orderConstraints.useBitInvalidator()) revert OrderIsnotSuitableForMassInvalidation();
        _bitInvalidator[msg.sender].massInvalidate(orderConstraints.nonceOrEpoch(), additionalMask);
    }

     /**
     * @notice See {IOrderMixin-hashOrder}.
     */
    function hashOrder(OrderLib.Order calldata order) public view returns(bytes32) {
        return order.hash(_domainSeparatorV4());
    }

    /**
     * @notice See {IOrderMixin-checkPredicate}.
     */
    function checkPredicateRFQ(bytes calldata predicate) public view returns(bool) {
        (bool success, uint256 res) = _selfStaticCall(predicate);
        return success && res == 1;
    }

    /**
     * @notice See {IOrderMixin-fillOrder}.
     */
    function fillOrder(
        OrderLib.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        Limits limits
    ) external payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash) {
        return fillOrderTo(order, r, vs, amount, limits, msg.sender, msg.data[:0]);
    }

    /**
     * @notice See {IOrderMixin-fillOrder}.
     */
    function fillOrderExt(
        OrderLib.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        Limits limits,
        bytes calldata extension
    ) external payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash) {
        return fillOrderToExt(order, r, vs, amount, limits, msg.sender, msg.data[:0], extension);
    }

    /**
     * @notice See {IOrderMixin-fillOrderTo}.
     */
    function fillOrderTo(
        OrderLib.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        Limits limits,
        address target,
        bytes calldata interaction
    ) public payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash) {
        return fillOrderToExt(order, r, vs, amount, limits, target, interaction, msg.data[:0]);
    }

    function fillOrderToExt(
        OrderLib.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        Limits limits,
        address target,
        bytes calldata interaction,
        bytes calldata extension
    ) public payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash) {
        order.validateExtension(extension);
        orderHash = order.hash(_domainSeparatorV4());

        // Check signature and apply order permit only on the first fill
        uint256 remainingMakingAmount = _checkRemainingMakingAmount(order, orderHash);
        if (remainingMakingAmount == order.makingAmount) {
            if (order.maker.get() != ECDSA.recover(orderHash, r, vs)) revert RFQBadSignature(); // TODO: maybe optimize best case scenario and remove this check? (30 gas)
            if (!limits.skipOrderPermit()) {
                _applyOrderPermit(order, orderHash, extension);
            }
        }

        (makingAmount, takingAmount) = _fillOrderTo(order, orderHash, extension, remainingMakingAmount, amount, limits, target, _wrap(interaction));
    }

    /**
     * @notice See {IOrderMixin-fillOrderToWithPermit}.
     */
    function fillOrderToWithPermit(
        OrderLib.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        Limits limits,
        address target,
        bytes calldata interaction,
        bytes calldata permit
    ) external returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash) {
        IERC20(order.takerAsset.get()).safePermit(permit);
        return fillOrderTo(order, r, vs, amount, limits, target, interaction);
    }

    /**
     * @notice See {IOrderMixin-fillContractOrder}.
     */
    function fillContractOrder(
        OrderLib.Order calldata order,
        bytes calldata signature,
        uint256 amount,
        Limits limits,
        address target,
        bytes calldata interaction,
        bytes calldata permit
    ) external returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash) {
        return fillContractOrderExt(order, signature, amount, limits, target, interaction, permit, msg.data[:0]);
    }

    function fillContractOrderExt(
        OrderLib.Order calldata order,
        bytes calldata signature,
        uint256 amount,
        Limits limits,
        address target,
        bytes calldata interaction,
        bytes calldata permit,
        bytes calldata extension
    ) public returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash) {
        if (permit.length > 0) {
            IERC20(order.takerAsset.get()).safePermit(permit);
        }
        order.validateExtension(extension);
        orderHash = order.hash(_domainSeparatorV4());

        // Check signature and apply order permit only on the first fill
        uint256 remainingMakingAmount = _checkRemainingMakingAmount(order, orderHash);
        if (remainingMakingAmount == order.makingAmount) {
            if (!ECDSA.isValidSignature(order.maker.get(), orderHash, signature)) revert RFQBadSignature();
            if (!limits.skipOrderPermit()) {
                _applyOrderPermit(order, orderHash, extension);
            }
        }

        (makingAmount, takingAmount) = _fillOrderTo(order, orderHash, extension, remainingMakingAmount, amount, limits, target, _wrap(interaction));
    }

    function _fillOrderTo(
        OrderLib.Order calldata order,
        bytes32 orderHash,
        bytes calldata extension,
        uint256 remainingMakingAmount,
        uint256 amount,
        Limits limits,
        address target,
        WrappedCalldata interactionWrapped // Stack too deep
    ) private returns(uint256 makingAmount, uint256 takingAmount) {
        if (target == address(0)) {
            target = msg.sender;
        }

        // Validate order
        if (!order.constraints.isAllowedSender(msg.sender)) revert RFQPrivateOrder();
        if (order.constraints.isExpired()) revert RFQOrderExpired();
        if (order.constraints.needCheckEpochManager()) {
            if (order.constraints.useBitInvalidator()) revert EpochManagerAndBitInvalidatorsAreIncompatible();
            if (!nonceEquals(order.maker.get(), order.constraints.series(), order.constraints.nonceOrEpoch())) revert RFQWrongSeriesNonce();
        }

        // Check if orders predicate allows filling
        if (order.constraints.hasExtension()) {
            bytes calldata predicate = extension.predicate();
            if (predicate.length > 0) {
                if (!checkPredicateRFQ(predicate)) revert RFQPredicateIsNotTrue();
            }
        }

        // Compute maker and taker assets amount
        if (limits.isMakingAmount()) {
            makingAmount = Math.min(amount, remainingMakingAmount);
            takingAmount = order.calculateTakingAmount(extension, makingAmount, remainingMakingAmount, orderHash);
            // check that actual rate is not worse than what was expected
            // takingAmount / makingAmount <= threshold / amount
            if (amount == makingAmount) {
                // It's gas optimization due this check doesn't involve SafeMath
                if (takingAmount > limits.threshold()) revert RFQTakingAmountTooHigh();
            }
            else {
                if (takingAmount * amount > limits.threshold() * makingAmount) revert RFQTakingAmountTooHigh();
            }
        }
        else {
            takingAmount = amount;
            makingAmount = order.calculateMakingAmount(extension, takingAmount, remainingMakingAmount, orderHash);
            if (makingAmount > remainingMakingAmount) {
                // Try to decrease taking amount because computed making amount exceeds remaining amount
                makingAmount = remainingMakingAmount;
                takingAmount = order.calculateTakingAmount(extension, makingAmount, remainingMakingAmount, orderHash);
                if (takingAmount > amount) revert RFQTakingAmountIncreased();
            }
            // check that actual rate is not worse than what was expected
            // makingAmount / takingAmount >= threshold / amount
            if (amount == takingAmount) {
                // It's gas optimization due this check doesn't involve SafeMath
                if (makingAmount < limits.threshold()) revert RFQMakingAmountTooLow();
            }
            else {
                if (makingAmount * amount < limits.threshold() * takingAmount) revert RFQMakingAmountTooLow();
            }
        }
        if (makingAmount == 0 || takingAmount == 0) revert RFQSwapWithZeroAmount(); // TODO: chekc if bit OR is cheaper

        // Invalidate order depending on constraints
        if (order.constraints.useBitInvalidator()) {
            _bitInvalidator[order.maker.get()].checkAndInvalidate(order.constraints.nonceOrEpoch());
        } else {
            _remainingInvalidator[order.maker.get()][orderHash] = RemainingInvalidatorLib.remains(remainingMakingAmount, makingAmount);
        }

        // Pre interaction, where maker can prepare funds interactively
        if (order.constraints.needPreInteractionCall()) {
            bytes calldata data = extension.preInteractionTargetAndData();
            address listener = order.maker.get();
            if (data.length > 0) {
                listener = address(bytes20(data));
                data = data[20:];
            }

            // IPreInteraction(listener).preInteraction(order, orderHash, msg.sender, makingAmount, takingAmount, data);
            bytes4 selector = IPreInteraction.preInteraction.selector;
            /// @solidity memory-safe-assembly
            assembly { // solhint-disable-line no-inline-assembly
                let ptr := mload(0x40)
                mstore(ptr, selector)
                calldatacopy(add(ptr, 4), order, 0xe0) // 7 * 0x20
                mstore(add(ptr, 0xe4), orderHash)
                mstore(add(ptr, 0x104), caller())
                mstore(add(ptr, 0x124), makingAmount)
                mstore(add(ptr, 0x144), takingAmount)
                mstore(add(ptr, 0x164), 0x180)
                mstore(add(ptr, 0x184), data.length)
                calldatacopy(add(ptr, 0x1a4), data.offset, data.length)
                if iszero(call(gas(), listener, 0, ptr, add(0x1a4, data.length), 0, 0)) {
                    returndatacopy(ptr, 0, returndatasize())
                    revert(ptr, returndatasize())
                }
            }
        }

        // Maker => Taker
        if (order.makerAsset.get() == address(_WETH) && limits.needUnwrapWeth()) {
            _WETH.safeTransferFrom(order.maker.get(), address(this), makingAmount);
            _WETH.safeWithdrawTo(makingAmount, target);
        } else {
            if (!_callTransferFromWithSuffix(
                order.makerAsset.get(),
                order.maker.get(),
                target,
                makingAmount,
                extension.makerAssetData()
            )) revert RFQTransferFromMakerToTakerFailed();
        }

        {  // Stack too deep
            bytes calldata interaction = _unwrap(interactionWrapped);
            if (interaction.length >= 20) {
                // proceed only if interaction length is enough to store address
                uint256 offeredTakingAmount = ITakerInteraction(address(bytes20(interaction))).fillOrderInteraction(
                    msg.sender, makingAmount, takingAmount, interaction[20:]
                );
                if (offeredTakingAmount > takingAmount && order.constraints.allowImproveRateViaInteraction()) {
                    takingAmount = offeredTakingAmount;
                }
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
            _WETH.safeTransfer(extension.getReceiver(order), takingAmount);
        } else {
            if (msg.value != 0) revert Errors.InvalidMsgValue();
            if (!_callTransferFromWithSuffix(
                order.takerAsset.get(),
                msg.sender,
                extension.getReceiver(order),
                takingAmount,
                extension.takerAssetData()
            )) revert RFQTransferFromTakerToMakerFailed();
        }

        // Post interaction, where maker can handle funds interactively
        if (order.constraints.needPostInteractionCall()) {
            bytes calldata data = extension.postInteractionTargetAndData();
            address listener = order.maker.get();
            if (data.length > 0) {
                listener = address(bytes20(data));
                data = data[20:];
            }

            // IPostInteraction(listener).postInteraction(order, orderHash, msg.sender, makingAmount, takingAmount, data);
            bytes4 selector = IPostInteraction.postInteraction.selector;
            /// @solidity memory-safe-assembly
            assembly { // solhint-disable-line no-inline-assembly
                let ptr := mload(0x40)
                mstore(ptr, selector)
                calldatacopy(add(ptr, 4), order, 0xe0) // 7 * 0x20
                mstore(add(ptr, 0xe4), orderHash)
                mstore(add(ptr, 0x104), caller())
                mstore(add(ptr, 0x124), makingAmount)
                mstore(add(ptr, 0x144), takingAmount)
                mstore(add(ptr, 0x164), 0x180)
                mstore(add(ptr, 0x184), data.length)
                calldatacopy(add(ptr, 0x1a4), data.offset, data.length)
                if iszero(call(gas(), listener, 0, ptr, add(0x1a4, data.length), 0, 0)) {
                    returndatacopy(ptr, 0, returndatasize())
                    revert(ptr, returndatasize())
                }
            }
        }

        emit OrderFilled(orderHash, makingAmount);
    }

    function _checkRemainingMakingAmount(OrderLib.Order calldata order, bytes32 orderHash) private view returns(uint256 remainingMakingAmount) {
        if (order.constraints.useBitInvalidator()) {
            remainingMakingAmount = order.makingAmount;
        } else {
            remainingMakingAmount = _remainingInvalidator[order.maker.get()][orderHash].remaining(order.makingAmount);
        }
        if (remainingMakingAmount == 0) revert InvalidatedOrder();
    }

    function _applyOrderPermit(OrderLib.Order calldata order, bytes32 orderHash, bytes calldata extension) private {
        bytes calldata orderPermit = extension.permitTargetAndData();
        if (orderPermit.length >= 20) {
            // proceed only if taker is willing to execute permit and its length is enough to store address
            IERC20(address(bytes20(orderPermit))).safePermit(orderPermit[20:]);
            if (!order.constraints.useBitInvalidator()) {
                // Bit orders are not subjects for reentrancy, but we still need to check remaining-based orders for reentrancy
                if (!_remainingInvalidator[order.maker.get()][orderHash].doesNotExist()) revert RFQReentrancyDetected();
            }
        }
    }

    function _callTransferFromWithSuffix(address asset, address from, address to, uint256 amount, bytes calldata suffix) private returns(bool success) {
        bytes4 selector = IERC20.transferFrom.selector;
        /// @solidity memory-safe-assembly
        assembly { // solhint-disable-line no-inline-assembly
            let data := mload(0x40)
            mstore(data, selector)
            mstore(add(data, 0x04), from)
            mstore(add(data, 0x24), to)
            mstore(add(data, 0x44), amount)
            if suffix.length {
                calldatacopy(add(data, 0x64), suffix.offset, suffix.length)
            }
            let status := call(gas(), asset, 0, data, add(0x64, suffix.length), 0x0, 0x20)
            success := and(status, or(iszero(returndatasize()), and(gt(returndatasize(), 31), eq(mload(0), 1))))
        }
    }

    type WrappedCalldata is uint256;

    function _wrap(bytes calldata cd) private pure returns(WrappedCalldata wrapped) {
        /// @solidity memory-safe-assembly
        assembly {  // solhint-disable-line no-inline-assembly
            wrapped := or(shl(128, cd.offset), cd.length)
        }
    }

    function _unwrap(WrappedCalldata wrapped) private pure returns(bytes calldata cd) {
        /// @solidity memory-safe-assembly
        assembly {  // solhint-disable-line no-inline-assembly
            cd.offset := shr(128, wrapped)
            cd.length := and(wrapped, 0xffffffffffffffffffffffffffffffff)
        }
    }
}
