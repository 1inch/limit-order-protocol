// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/utils/math/Math.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/solidity-utils/contracts/interfaces/IWETH.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/OnlyWethReceiver.sol";

import "./helpers/AmountCalculator.sol";
import "./helpers/SeriesNonceManager.sol";
import "./interfaces/ITakerInteraction.sol";
import "./interfaces/IPreInteractionRFQ.sol";
import "./interfaces/IPostInteractionRFQ.sol";
import "./interfaces/IOrderRFQMixin.sol";
import "./libraries/Errors.sol";
import "./libraries/InputLib.sol";
import "./libraries/BitInvalidatorLib.sol";
import "./libraries/RemainingInvalidatorLib.sol";
import "./OrderRFQLib.sol";

/// @title RFQ Limit Order mixin
abstract contract OrderRFQMixin is IOrderRFQMixin, EIP712, OnlyWethReceiver, SeriesNonceManager {
    using SafeERC20 for IERC20;
    using SafeERC20 for IWETH;
    using OrderRFQLib for OrderRFQLib.OrderRFQ;
    using AddressLib for Address;
    using ConstraintsLib for Constraints;
    using InputLib for Input;
    using BitInvalidatorLib for BitInvalidatorLib.Data;
    using RemainingInvalidatorLib for RemainingInvalidator;

    uint256 private constant _RAW_CALL_GAS_LIMIT = 5000;

    IWETH private immutable _WETH;  // solhint-disable-line var-name-mixedcase
    mapping(address => BitInvalidatorLib.Data) private _bitInvalidator;
    mapping(bytes32 => RemainingInvalidator) private _remainingInvalidator;

    constructor(IWETH weth) OnlyWethReceiver(address(weth)) {
        _WETH = weth;
    }

    /**
     * @notice See {IOrderRFQMixin-bitInvalidatorForOrderRFQ}.
     */
    function bitInvalidatorForOrderRFQ(address maker, uint256 slot) external view returns(uint256 /* result */) {
        return _bitInvalidator[maker].checkSlot(slot);
    }

    /**
     * @notice See {IOrderRFQMixin-remainingInvalidatorForOrderRFQ}.
     */
    function remainingInvalidatorForOrderRFQ(bytes32 orderHash) external view returns(uint256 remaining) {
        return _remainingInvalidator[orderHash].remaining();
    }

    /**
     * @notice See {IOrderRFQMixin-rawRemainingInvalidatorForOrderRFQ}.
     */
    function rawRemainingInvalidatorForOrderRFQ(bytes32 orderHash) external view returns(uint256 remainingRaw) {
        return RemainingInvalidator.unwrap(_remainingInvalidator[orderHash]);
    }

    /**
     * @notice See {IOrderRFQMixin-cancelOrderRFQ}.
     */
    function cancelOrderRFQ(Constraints orderConstraints, bytes32 orderHash) external {
        if (orderConstraints.allowPartialFills() && orderConstraints.allowMultipleFills()) {
            _remainingInvalidator[orderHash] = RemainingInvalidatorLib.invalid();
        } else {
            _bitInvalidator[msg.sender].massInvalidate(orderConstraints.nonce(), 0);
        }
    }

    /**
     * @notice See {IOrderRFQMixin-massCancelOrderRFQ}.
     */
    function massCancelOrderRFQ(Constraints orderConstraints, uint256 additionalMask) external {
        if (orderConstraints.allowPartialFills() && orderConstraints.allowMultipleFills()) revert OrderIsnotSuitableForMassInvalidation();
        _bitInvalidator[msg.sender].massInvalidate(orderConstraints.nonce(), additionalMask);
    }

    /**
     * @notice See {IOrderRFQMixin-fillOrderRFQ}.
     */
    function fillOrderRFQ(
        OrderRFQLib.OrderRFQ calldata order,
        bytes32 r,
        bytes32 vs,
        Input input
    ) external payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash) {
        return fillOrderRFQTo(order, r, vs, input, msg.sender, msg.data[:0]);
    }

    /**
     * @notice See {IOrderRFQMixin-fillOrderRFQTo}.
     */
    function fillOrderRFQTo(
        OrderRFQLib.OrderRFQ calldata order,
        bytes32 r,
        bytes32 vs,
        Input input,
        address target,
        bytes calldata interaction
    ) public payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash) {
        orderHash = order.hash(_domainSeparatorV4());

        // Prevalidate order depending on constraints
        uint256 remainingMakingAmount = order.makingAmount;
        if (order.constraints.useBitInvalidator()) {
            if (order.maker.get() != ECDSA.recover(orderHash, r, vs)) revert RFQBadSignature(); // TODO: maybe optimize best case scenario and remove this check? (30 gas)
        } else {
            RemainingInvalidator invalidator = _remainingInvalidator[orderHash];
            remainingMakingAmount = invalidator.remaining();
            if (invalidator.doesNotExist()) {
                if (order.maker.get() != ECDSA.recover(orderHash, r, vs)) revert RFQBadSignature(); // TODO: maybe optimize best case scenario and remove this check? (30 gas)
            }
        }

        (makingAmount, takingAmount) = _fillOrderRFQTo(order, orderHash, remainingMakingAmount, input, target, interaction);
        emit OrderFilledRFQ(orderHash, makingAmount);
    }

    /**
     * @notice See {IOrderRFQMixin-fillOrderRFQToWithPermit}.
     */
    function fillOrderRFQToWithPermit(
        OrderRFQLib.OrderRFQ calldata order,
        bytes32 r,
        bytes32 vs,
        Input input,
        address target,
        bytes calldata interaction,
        bytes calldata permit
    ) external returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash) {
        IERC20(order.takerAsset.get()).safePermit(permit);
        return fillOrderRFQTo(order, r, vs, input, target, interaction);
    }

    /**
     * @notice See {IOrderRFQMixin-fillContractOrderRFQ}.
     */
    function fillContractOrderRFQ(
        OrderRFQLib.OrderRFQ calldata order,
        bytes calldata signature,
        Input input,
        address target,
        bytes calldata interaction,
        bytes calldata permit
    ) external returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash) {
        if (permit.length > 0) {
            IERC20(order.takerAsset.get()).safePermit(permit);
        }
        orderHash = order.hash(_domainSeparatorV4());

        // Prevalidate order depending on constraints
        uint256 remainingMakingAmount = order.makingAmount;
        if (order.constraints.useBitInvalidator()) {
            if (!ECDSA.isValidSignature(order.maker.get(), orderHash, signature)) revert RFQBadSignature();
        } else {
            RemainingInvalidator invalidator = _remainingInvalidator[orderHash];
            remainingMakingAmount = invalidator.remaining();
            if (invalidator.doesNotExist()) {
                if (!ECDSA.isValidSignature(order.maker.get(), orderHash, signature)) revert RFQBadSignature();
            }
        }

        (makingAmount, takingAmount) = _fillOrderRFQTo(order, orderHash, remainingMakingAmount, input, target, interaction);
        emit OrderFilledRFQ(orderHash, makingAmount);
    }

    function _fillOrderRFQTo(
        OrderRFQLib.OrderRFQ calldata order,
        bytes32 orderHash,
        uint256 remainingMakingAmount,
        Input input,
        address target,
        bytes calldata interaction
    ) private returns(uint256 makingAmount, uint256 takingAmount) {
        if (target == address(0)) {
            target = msg.sender;
        }

        // Validate order
        address maker = order.maker.get();
        if (!order.constraints.isAllowedSender(msg.sender)) revert RFQPrivateOrder();
        if (order.constraints.isExpired()) revert RFQOrderExpired();
        if (order.constraints.needCheckEpochManager()) {
            if (!nonceEquals(maker, order.constraints.series(), order.constraints.epoch())) revert RFQWrongSeriesNonce();
        }

        // Compute maker and taker assets amount
        {  // Stack too deep
            uint256 amount = input.amount();
            if (input.isMakingAmount()) {
                makingAmount = Math.min(amount, remainingMakingAmount);
                takingAmount = AmountCalculator.getTakingAmount(order.makingAmount, order.takingAmount, makingAmount);
            }
            else {
                takingAmount = amount;
                makingAmount = AmountCalculator.getMakingAmount(order.makingAmount, order.takingAmount, takingAmount);
                if (makingAmount > remainingMakingAmount) {
                    // Try to decrease taking amount because computed making amount exceeds remaining amount
                    makingAmount = remainingMakingAmount;
                    takingAmount = AmountCalculator.getTakingAmount(order.makingAmount, order.takingAmount, makingAmount);
                    if (takingAmount > amount) revert RFQTakingAmountIncreased();
                }
            }
            if (makingAmount == 0 || takingAmount == 0) revert RFQSwapWithZeroAmount();
        }

        // Invalidate order depending on constraints
        if (order.constraints.useBitInvalidator()) {
            _bitInvalidator[maker].checkAndInvalidate(order.constraints.nonce());
        } else {
            _remainingInvalidator[orderHash] = RemainingInvalidatorLib.remains(remainingMakingAmount, makingAmount);
        }

        // Maker can handle funds interactively
        if (order.constraints.needPreInteractionCall()) {
            // IPreInteractionRFQ(maker).preInteractionRFQ(order, orderHash, msg.sender, makingAmount, takingAmount);
            bytes4 selector = IPreInteractionRFQ.preInteractionRFQ.selector;
            /// @solidity memory-safe-assembly
            assembly { // solhint-disable-line no-inline-assembly
                let ptr := mload(0x40)
                mstore(ptr, selector)
                calldatacopy(add(ptr, 4), order, 0xe0) // 7 * 0x20
                mstore(add(ptr, 0xe4), orderHash)
                mstore(add(ptr, 0x104), caller())
                mstore(add(ptr, 0x124), makingAmount)
                mstore(add(ptr, 0x144), takingAmount)
                if iszero(call(gas(), maker, 0, ptr, 0x164, 0, 0)) {
                    returndatacopy(ptr, 0, returndatasize())
                    revert(ptr, returndatasize())
                }
            }
        }

        // Maker => Taker
        if (order.makerAsset.get() == address(_WETH) && input.needUnwrapWeth()) {
            _WETH.safeTransferFrom(maker, address(this), makingAmount);
            _WETH.safeWithdrawTo(makingAmount, target);
        } else {
            IERC20(order.makerAsset.get()).safeTransferFrom(maker, target, makingAmount);
        }

        if (interaction.length >= 20) {
            // proceed only if interaction length is enough to store address
            uint256 offeredTakingAmount = ITakerInteraction(address(bytes20(interaction))).fillOrderInteraction(
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
            _WETH.safeTransfer(maker, takingAmount);
        } else {
            if (msg.value != 0) revert Errors.InvalidMsgValue();
            IERC20(order.takerAsset.get()).safeTransferFrom(msg.sender, maker, takingAmount);
        }

        // Maker can handle funds interactively
        if (order.constraints.needPostInteractionCall()) {
            // IPostInteractionRFQ(maker).postInteractionRFQ(order, orderHash, msg.sender, makingAmount, takingAmount);
            bytes4 selector = IPostInteractionRFQ.postInteractionRFQ.selector;
            /// @solidity memory-safe-assembly
            assembly { // solhint-disable-line no-inline-assembly
                let ptr := mload(0x40)
                mstore(ptr, selector)
                calldatacopy(add(ptr, 4), order, 0xe0) // 7 * 0x20
                mstore(add(ptr, 0xe4), orderHash)
                mstore(add(ptr, 0x104), caller())
                mstore(add(ptr, 0x124), makingAmount)
                mstore(add(ptr, 0x144), takingAmount)
                if iszero(call(gas(), maker, 0, ptr, 0x164, 0, 0)) {
                    returndatacopy(ptr, 0, returndatasize())
                    revert(ptr, returndatasize())
                }
            }
        }
    }
}
