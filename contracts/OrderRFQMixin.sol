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
import "./libraries/InputLib.sol";
import "./OrderRFQLib.sol";

/// @title RFQ Limit Order mixin
abstract contract OrderRFQMixin is IOrderRFQMixin, EIP712, OnlyWethReceiver {
    using SafeERC20 for IERC20;
    using SafeERC20 for IWETH;
    using OrderRFQLib for OrderRFQLib.OrderRFQ;
    using AddressLib for Address;
    using ConstraintsLib for Constraints;
    using InputLib for Input;

    uint256 private constant _RAW_CALL_GAS_LIMIT = 5000;

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
    function cancelOrderRFQ(uint256 nonce) external {
        _invalidateOrder(msg.sender, nonce, 0);
    }

    /**
     * @notice See {IOrderRFQMixin-cancelOrderRFQ}.
     */
    function cancelOrderRFQ(uint256 nonce, uint256 additionalMask) external {
        _invalidateOrder(msg.sender, nonce, additionalMask);
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
        address maker = ECDSA.recover(orderHash, r, vs);
        if (maker == address(0)) revert RFQBadSignature(); // TODO: maybe optimize best case scenario and remove this check? (30 gas)
        (makingAmount, takingAmount) = _fillOrderRFQTo(order, maker, input, target, interaction);
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
    ) external returns(uint256 /* makingAmount */, uint256 /* takingAmount */, bytes32 /* orderHash */) {
        IERC20(order.takerAsset.get()).safePermit(permit);
        return fillOrderRFQTo(order, r, vs, input, target, interaction);
    }

    /**
     * @notice See {IOrderRFQMixin-fillContractOrderRFQ}.
     */
    function fillContractOrderRFQ(
        OrderRFQLib.OrderRFQ calldata order,
        bytes calldata signature,
        Address maker,
        Input input,
        address target,
        bytes calldata interaction,
        bytes calldata permit
    ) external returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash) {
        if (permit.length > 0) {
            IERC20(order.takerAsset.get()).safePermit(permit);
        }
        orderHash = order.hash(_domainSeparatorV4());
        if (!ECDSA.isValidSignature(maker.get(), orderHash, signature)) revert RFQBadSignature();
        (makingAmount, takingAmount) = _fillOrderRFQTo(order, maker.get(), input, target, interaction);
        emit OrderFilledRFQ(orderHash, makingAmount);
    }

    function _fillOrderRFQTo(
        OrderRFQLib.OrderRFQ calldata order,
        address maker,
        Input input,
        address target,
        bytes calldata interaction
    ) private returns(uint256 makingAmount, uint256 takingAmount) {
        if (target == address(0)) {
            target = msg.sender;
        }

        // Validate order
        if (!order.constraints.isAllowedSender(msg.sender)) revert RFQPrivateOrder();
        if (order.constraints.isExpired()) revert RFQOrderExpired();
        _invalidateOrder(maker, order.constraints.nonce(), 0);

        // Compute maker and taker assets amount
        {  // Stack too deep
            uint256 amount = input.amount();
            if (amount == 0 || !order.constraints.allowPartialFills()) {
                makingAmount = order.makingAmount;
                takingAmount = order.takingAmount;
            }
            else if (input.isMakingAmount()) {
                makingAmount = amount;
                takingAmount = AmountCalculator.getTakingAmount(order.makingAmount, order.takingAmount, makingAmount);
                if (makingAmount > order.makingAmount) revert MakingAmountExceeded();
                if (takingAmount == 0) revert RFQSwapWithZeroAmount();
            }
            else {
                takingAmount = amount;
                makingAmount = AmountCalculator.getMakingAmount(order.makingAmount, order.takingAmount, takingAmount);
                if (takingAmount > order.takingAmount) revert TakingAmountExceeded();
                if (makingAmount == 0) revert RFQSwapWithZeroAmount();
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
            uint256 offeredTakingAmount = IInteractionNotificationReceiver(address(bytes20(interaction))).fillOrderInteraction(
                msg.sender, makingAmount, takingAmount, interaction[20:]
            );
            if (offeredTakingAmount > takingAmount && order.constraints.allowImproveRateViaInteraction()) {
                takingAmount = offeredTakingAmount;
            }
        }

        // Taker => Maker
        if (order.takerAsset.get() == address(_WETH) && msg.value > 0) { // TODO: check balance to get ETH in interaction?
            if (msg.value != takingAmount) revert Errors.InvalidMsgValue();
            _WETH.safeDeposit(takingAmount);
            _WETH.safeTransfer(maker, takingAmount);
        } else {
            if (msg.value != 0) revert Errors.InvalidMsgValue();
            IERC20(order.takerAsset.get()).safeTransferFrom(msg.sender, maker, takingAmount);
        }
    }

    function _invalidateOrder(address maker, uint256 nonce, uint256 additionalMask) private {
        uint256 invalidatorSlot = nonce >> 8;
        uint256 invalidatorBits = (1 << uint8(nonce)) | additionalMask;
        mapping(uint256 => uint256) storage invalidatorStorage = _invalidator[maker];
        uint256 invalidator = invalidatorStorage[invalidatorSlot];
        if (invalidator & invalidatorBits == invalidatorBits) revert InvalidatedOrder();
        invalidatorStorage[invalidatorSlot] = invalidator | invalidatorBits;
    }
}
