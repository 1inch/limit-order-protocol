// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/solidity-utils/contracts/interfaces/IWETH.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/OnlyWethReceiver.sol";

import "./helpers/AmountCalculator.sol";
import "./libraries/Errors.sol";
import "./OrderRFQLib.sol";

/// @title RFQ Limit Order mixin
abstract contract OrderRFQMixin is EIP712, OnlyWethReceiver {
    using SafeERC20 for IERC20;
    using OrderRFQLib for OrderRFQLib.OrderRFQ;

    error RFQZeroTargetIsForbidden();
    error RFQPrivateOrder();
    error RFQBadSignature();
    error OrderExpired();
    error MakingAmountExceeded();
    error TakingAmountExceeded();
    error RFQSwapWithZeroAmount();
    error InvalidatedOrder();

    /**
     * @notice Emitted when RFQ gets filled
     * @param orderHash Hash of the order
     * @param makingAmount Amount of the maker asset that was transferred from maker to taker
     */
    event OrderFilledRFQ(
        bytes32 orderHash,
        uint256 makingAmount
    );

    uint256 private constant _RAW_CALL_GAS_LIMIT = 5000;
    IWETH private immutable _WETH;  // solhint-disable-line var-name-mixedcase
    mapping(address => mapping(uint256 => uint256)) private _invalidator;

    constructor(IWETH weth) OnlyWethReceiver(address(weth)) {
        _WETH = weth;
    }

    /**
     * @notice Returns bitmask for double-spend invalidators based on lowest byte of order.info and filled quotes
     * @param maker Maker address
     * @param slot Slot number to return bitmask for
     * @return result Each bit represents whether corresponding was already invalidated
     */
    function invalidatorForOrderRFQ(address maker, uint256 slot) external view returns(uint256 /* result */) {
        return _invalidator[maker][slot];
    }

    /**
     * @notice Cancels order's quote
     * @param orderInfo Order info (only order id in lowest 64 bits is used)
     */
    function cancelOrderRFQ(uint256 orderInfo) external {
        _invalidateOrder(msg.sender, orderInfo, 0);
    }

    /// @notice Cancels multiple order's quotes
    function cancelOrderRFQ(uint256 orderInfo, uint256 additionalMask) public {
        _invalidateOrder(msg.sender, orderInfo, additionalMask);
    }

    /**
     * @notice Fills order's quote, fully or partially (whichever is possible)
     * @param order Order quote to fill
     * @param signature Signature to confirm quote ownership
     * @param flagsAndAmount Fill configuration flags with amount packed in one slot
     * @return filledMakingAmount Actual amount transferred from maker to taker
     * @return filledTakingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     */
    function fillOrderRFQ(
        OrderRFQLib.OrderRFQ memory order,
        bytes calldata signature,
        uint256 flagsAndAmount
    ) external payable returns(uint256 /* filledMakingAmount */, uint256 /* filledTakingAmount */, bytes32 /* orderHash */) {
        return fillOrderRFQTo(order, signature, flagsAndAmount, msg.sender);
    }

    uint256 constant private _MAKER_AMOUNT_FLAG = 1 << 255;
    uint256 constant private _SIGNER_SMART_CONTRACT_HINT = 1 << 254;
    uint256 constant private _IS_VALID_SIGNATURE_65_BYTES = 1 << 253;
    uint256 constant private _UNWRAP_WETH_FLAG = 1 << 252;
    uint256 constant private _AMOUNT_MASK = ~(
        _MAKER_AMOUNT_FLAG |
        _SIGNER_SMART_CONTRACT_HINT |
        _IS_VALID_SIGNATURE_65_BYTES |
        _UNWRAP_WETH_FLAG
    );

    /**
     * @notice Fills order's quote, fully or partially, with compact signature
     * @param order Order quote to fill
     * @param r R component of signature
     * @param vs VS component of signature
     * @param flagsAndAmount Fill configuration flags with amount packed in one slot
     * - Bits 0-252 contain the amount to fill
     * - Bit 253 is used to indicate whether signature is 64-bit (0) or 65-bit (1)
     * - Bit 254 is used to indicate whether smart contract (1) signed the order or not (0)
     * - Bit 255 is used to indicate whether maker (1) or taker amount (0) is given in the amount parameter
     * @return filledMakingAmount Actual amount transferred from maker to taker
     * @return filledTakingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     */
    function fillOrderRFQCompact(
        OrderRFQLib.OrderRFQ memory order,
        bytes32 r,
        bytes32 vs,
        uint256 flagsAndAmount
    ) external payable returns(uint256 filledMakingAmount, uint256 filledTakingAmount, bytes32 orderHash) {
        orderHash = order.hash(_domainSeparatorV4());
        if (flagsAndAmount & _SIGNER_SMART_CONTRACT_HINT != 0) {
            if (flagsAndAmount & _IS_VALID_SIGNATURE_65_BYTES != 0) {
                if (!ECDSA.isValidSignature65(order.maker, orderHash, r, vs)) revert RFQBadSignature();
            } else {
                if (!ECDSA.isValidSignature(order.maker, orderHash, r, vs)) revert RFQBadSignature();
            }
        } else {
            if(!ECDSA.recoverOrIsValidSignature(order.maker, orderHash, r, vs)) revert RFQBadSignature();
        }

        (filledMakingAmount, filledTakingAmount) = _fillOrderRFQTo(order, flagsAndAmount, msg.sender);
        emit OrderFilledRFQ(orderHash, filledMakingAmount);
    }

    /**
     * @notice Fills Same as `fillOrderRFQTo` but calls permit first.
     * It allows to approve token spending and make a swap in one transaction.
     * Also allows to specify funds destination instead of `msg.sender`
     * @param order Order quote to fill
     * @param signature Signature to confirm quote ownership
     * @param flagsAndAmount Fill configuration flags with amount packed in one slot
     * @param target Address that will receive swap funds
     * @param permit Should consist of abiencoded token address and encoded `IERC20Permit.permit` call.
     * @return filledMakingAmount Actual amount transferred from maker to taker
     * @return filledTakingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     * @dev See tests for examples
     */
    function fillOrderRFQToWithPermit(
        OrderRFQLib.OrderRFQ memory order,
        bytes calldata signature,
        uint256 flagsAndAmount,
        address target,
        bytes calldata permit
    ) external returns(uint256 /* filledMakingAmount */, uint256 /* filledTakingAmount */, bytes32 /* orderHash */) {
        IERC20(order.takerAsset).safePermit(permit);
        return fillOrderRFQTo(order, signature, flagsAndAmount, target);
    }

    /**
     * @notice Same as `fillOrderRFQ` but allows to specify funds destination instead of `msg.sender`
     * @param order Order quote to fill
     * @param signature Signature to confirm quote ownership
     * @param flagsAndAmount Fill configuration flags with amount packed in one slot
     * @param target Address that will receive swap funds
     * @return filledMakingAmount Actual amount transferred from maker to taker
     * @return filledTakingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     */
    function fillOrderRFQTo(
        OrderRFQLib.OrderRFQ memory order,
        bytes calldata signature,
        uint256 flagsAndAmount,
        address target
    ) public payable returns(uint256 filledMakingAmount, uint256 filledTakingAmount, bytes32 orderHash) {
        orderHash = order.hash(_domainSeparatorV4());
        if (flagsAndAmount & _SIGNER_SMART_CONTRACT_HINT != 0) {
            if (flagsAndAmount & _IS_VALID_SIGNATURE_65_BYTES != 0 && signature.length != 65) revert RFQBadSignature();
            if (!ECDSA.isValidSignature(order.maker, orderHash, signature)) revert RFQBadSignature();
        } else {
            if(!ECDSA.recoverOrIsValidSignature(order.maker, orderHash, signature)) revert RFQBadSignature();
        }
        (filledMakingAmount, filledTakingAmount) = _fillOrderRFQTo(order, flagsAndAmount, target);
        emit OrderFilledRFQ(orderHash, filledMakingAmount);
    }

    function _fillOrderRFQTo(
        OrderRFQLib.OrderRFQ memory order,
        uint256 flagsAndAmount,
        address target
    ) private returns(uint256 makingAmount, uint256 takingAmount) {
        if (target == address(0)) revert RFQZeroTargetIsForbidden();

        address maker = order.maker;

        // Validate order
        if (order.allowedSender != address(0) && order.allowedSender != msg.sender) revert RFQPrivateOrder();

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
        if (order.makerAsset == address(_WETH) && flagsAndAmount & _UNWRAP_WETH_FLAG != 0) {
            _WETH.transferFrom(maker, address(this), makingAmount);
            _WETH.withdraw(makingAmount);
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, ) = target.call{value: makingAmount, gas: _RAW_CALL_GAS_LIMIT}("");
            if (!success) revert ETHTransferFailed();
        } else {
            IERC20(order.makerAsset).safeTransferFrom(maker, target, makingAmount);
        }

        // Taker => Maker
        if (order.takerAsset == address(_WETH) && msg.value > 0) {
            if (msg.value != takingAmount) revert InvalidMsgValue();
            _WETH.deposit{ value: takingAmount }();
            _WETH.transfer(maker, takingAmount);
        } else {
            if (msg.value != 0) revert InvalidMsgValue();
            IERC20(order.takerAsset).safeTransferFrom(msg.sender, maker, takingAmount);
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
