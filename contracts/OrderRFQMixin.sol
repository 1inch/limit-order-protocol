// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/solidity-utils/contracts/interfaces/IWETH.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/OnlyWethReceiver.sol";

import "./helpers/AmountCalculator.sol";
import "./interfaces/IInteractionNotificationReceiver.sol";
import "./interfaces/IOrderRFQMixin.sol";
import "./libraries/Errors.sol";
import "./OrderRFQLib.sol";

/// @title RFQ Limit Order mixin
abstract contract OrderRFQMixin is IOrderRFQMixin, EIP712, OnlyWethReceiver {
    using SafeERC20 for IERC20;
    using OrderRFQLib for OrderRFQLib.OrderRFQ;
    using CalldataLib for CalldataLib.Address;
    using CalldataLib for bytes;

    uint256 private constant _RAW_CALL_GAS_LIMIT = 5000;
    uint256 private constant _MAKER_AMOUNT_FLAG = 1 << 255;
    uint256 private constant _SIGNER_SMART_CONTRACT_HINT = 1 << 254;
    uint256 private constant _IS_VALID_SIGNATURE_65_BYTES = 1 << 253;
    uint256 private constant _UNWRAP_WETH_FLAG = 1 << 252;
    uint256 private constant _AMOUNT_MASK = ~(
        _MAKER_AMOUNT_FLAG |
        _SIGNER_SMART_CONTRACT_HINT |
        _IS_VALID_SIGNATURE_65_BYTES |
        _UNWRAP_WETH_FLAG
    );

    IWETH private immutable _WETH;  // solhint-disable-line var-name-mixedcase
    mapping(address => mapping(uint256 => uint256)) private _invalidator;

    constructor(IWETH weth) OnlyWethReceiver(address(weth)) {
        _WETH = weth;
    }

    /**
     * @notice See {IOrderRFQMixin-invalidatorForOrderRFQ}.
     */
    function invalidatorForOrderRFQ(address maker, uint256 slot) external view returns(uint256 /* result */) {
        return _invalidator[maker][slot];
    }

    /**
     * @notice See {IOrderRFQMixin-cancelOrderRFQ}.
     */
    function cancelOrderRFQ(uint256 orderInfo) external {
        _invalidateOrder(msg.sender, orderInfo, 0);
    }

    /**
     * @notice See {IOrderRFQMixin-cancelOrderRFQ}.
     */
    function cancelOrderRFQ(uint256 orderInfo, uint256 additionalMask) external {
        _invalidateOrder(msg.sender, orderInfo, additionalMask);
    }

    /**
     * @notice See {IOrderRFQMixin-fillOrderRFQ}.
     */
    function fillOrderRFQ(
        OrderRFQLib.OrderRFQ calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 flagsAndAmount
    ) external payable returns(uint256 /* filledMakingAmount */, uint256 /* filledTakingAmount */, bytes32 /* orderHash */) {
        return fillOrderRFQTo(order, signature, interaction, flagsAndAmount, msg.sender);
    }

    /**
     * @notice See {IOrderRFQMixin-fillOrderRFQCompact}.
     */
    function fillOrderRFQCompact(
        OrderRFQLib.OrderRFQ calldata order,
        bytes32 r,
        bytes32 vs,
        bytes calldata interaction,
        uint256 flagsAndAmount
    ) external payable returns(uint256 filledMakingAmount, uint256 filledTakingAmount, bytes32 orderHash) {
        orderHash = order.hash(_domainSeparatorV4());
        if (flagsAndAmount & _SIGNER_SMART_CONTRACT_HINT != 0) {
            if (flagsAndAmount & _IS_VALID_SIGNATURE_65_BYTES != 0) {
                if (!ECDSA.isValidSignature65(order.maker.get(), orderHash, r, vs)) revert RFQBadSignature();
            } else {
                if (!ECDSA.isValidSignature(order.maker.get(), orderHash, r, vs)) revert RFQBadSignature();
            }
        } else {
            if(!ECDSA.recoverOrIsValidSignature(order.maker.get(), orderHash, r, vs)) revert RFQBadSignature();
        }

        (filledMakingAmount, filledTakingAmount) = _fillOrderRFQTo(order, interaction, flagsAndAmount, msg.sender);
        emit OrderFilledRFQ(orderHash, filledMakingAmount);
    }

    /**
     * @notice See {IOrderRFQMixin-fillOrderRFQToWithPermit}.
     */
    function fillOrderRFQToWithPermit(
        OrderRFQLib.OrderRFQ calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 flagsAndAmount,
        address target,
        bytes calldata permit
    ) external returns(uint256 /* filledMakingAmount */, uint256 /* filledTakingAmount */, bytes32 /* orderHash */) {
        IERC20(order.takerAsset.get()).safePermit(permit);
        return fillOrderRFQTo(order, signature, interaction, flagsAndAmount, target);
    }

    /**
     * @notice See {IOrderRFQMixin-fillOrderRFQTo}.
     */
    function fillOrderRFQTo(
        OrderRFQLib.OrderRFQ calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 flagsAndAmount,
        address target
    ) public payable returns(uint256 filledMakingAmount, uint256 filledTakingAmount, bytes32 orderHash) {
        orderHash = order.hash(_domainSeparatorV4());
        if (flagsAndAmount & _SIGNER_SMART_CONTRACT_HINT != 0) {
            if (flagsAndAmount & _IS_VALID_SIGNATURE_65_BYTES != 0 && signature.length != 65) revert RFQBadSignature();
            if (!ECDSA.isValidSignature(order.maker.get(), orderHash, signature)) revert RFQBadSignature();
        } else {
            if(!ECDSA.recoverOrIsValidSignature(order.maker.get(), orderHash, signature)) revert RFQBadSignature();
        }
        (filledMakingAmount, filledTakingAmount) = _fillOrderRFQTo(order, interaction, flagsAndAmount, target);
        emit OrderFilledRFQ(orderHash, filledMakingAmount);
    }

    function _fillOrderRFQTo(
        OrderRFQLib.OrderRFQ calldata order,
        bytes calldata interaction,
        uint256 flagsAndAmount,
        address target
    ) private returns(uint256 makingAmount, uint256 takingAmount) {
        if (target == address(0)) revert RFQZeroTargetIsForbidden();

        address maker = order.maker.get();

        // Validate order
        if (order.allowedSender.get() != address(0) && order.allowedSender.get() != msg.sender) revert RFQPrivateOrder();

        {  // Stack too deep
            uint256 info = order.info;
            // Check time expiration
            uint256 expiration = uint128(info) >> 64;
            if (expiration != 0 && block.timestamp > expiration) revert OrderExpired(); // solhint-disable-line not-rely-on-time
            _invalidateOrder(maker, info, 0);
        }

        {  // Stack too deep
            uint256 orderMakingAmount = order.makingAmount;
            uint256 orderTakingAmount = order.takingAmount;
            uint256 amount = flagsAndAmount & _AMOUNT_MASK;
            // Compute partial fill if needed
            if (amount == 0) {
                // zero amount means whole order
                makingAmount = orderMakingAmount;
                takingAmount = orderTakingAmount;
            }
            else if (flagsAndAmount & _MAKER_AMOUNT_FLAG != 0) {
                if (amount > orderMakingAmount) revert MakingAmountExceeded();
                makingAmount = amount;
                takingAmount = AmountCalculator.getTakingAmount(orderMakingAmount, orderTakingAmount, makingAmount);
            }
            else {
                if (amount > orderTakingAmount) revert TakingAmountExceeded();
                takingAmount = amount;
                makingAmount = AmountCalculator.getMakingAmount(orderMakingAmount, orderTakingAmount, takingAmount);
            }
        }

        if (makingAmount == 0 || takingAmount == 0) revert RFQSwapWithZeroAmount();

        // Maker => Taker
        if (order.makerAsset.get() == address(_WETH) && flagsAndAmount & _UNWRAP_WETH_FLAG != 0) {
            _WETH.transferFrom(maker, address(this), makingAmount);
            _WETH.withdraw(makingAmount);
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, ) = target.call{value: makingAmount, gas: _RAW_CALL_GAS_LIMIT}("");
            if (!success) revert Errors.ETHTransferFailed();
        } else {
            IERC20(order.makerAsset.get()).safeTransferFrom(maker, target, makingAmount);
        }

        if (interaction.length >= 20) {
            // proceed only if interaction length is enough to store address
            (address interactionTarget, bytes calldata interactionData) = interaction.decodeTargetAndCalldata();
            uint256 offeredTakingAmount = IInteractionNotificationReceiver(interactionTarget).fillOrderInteraction(
                msg.sender, makingAmount, takingAmount, interactionData
            );

            if (offeredTakingAmount > takingAmount)
            {
                takingAmount = offeredTakingAmount;
            }
        }

        // Taker => Maker
        if (order.takerAsset.get() == address(_WETH) && msg.value > 0) {
            if (msg.value != takingAmount) revert Errors.InvalidMsgValue();
            _WETH.deposit{ value: takingAmount }();
            _WETH.transfer(maker, takingAmount);
        } else {
            if (msg.value != 0) revert Errors.InvalidMsgValue();
            IERC20(order.takerAsset.get()).safeTransferFrom(msg.sender, maker, takingAmount);
        }
    }

    function _invalidateOrder(address maker, uint256 orderInfo, uint256 additionalMask) private {
        uint256 invalidatorSlot = uint64(orderInfo) >> 8;
        uint256 invalidatorBits = (1 << uint8(orderInfo)) | additionalMask;
        mapping(uint256 => uint256) storage invalidatorStorage = _invalidator[maker];
        uint256 invalidator = invalidatorStorage[invalidatorSlot];
        if (invalidator & invalidatorBits == invalidatorBits) revert InvalidatedOrder();
        invalidatorStorage[invalidatorSlot] = invalidator | invalidatorBits;
    }
}
