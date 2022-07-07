// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

import "./interfaces/IWETH.sol";
import "./helpers/AmountCalculator.sol";
import "./OrderRFQLib.sol";

/// @title RFQ Limit Order mixin
abstract contract OrderRFQMixin is EIP712, AmountCalculator {
    using SafeERC20 for IERC20;
    using OrderRFQLib for OrderRFQLib.OrderRFQ;

    error RFQZeroTargetIsForbidden();
    error RFQPrivateOrder();
    error RFQBadSignature();
    error OrderExpired();
    error MakingAmountExceeded();
    error TakingAmountExceeded();
    error BothAmountsAreNonZero();
    error RFQSwapWithZeroAmount();
    error InvalidatedOrder();
    error ETHTransferFailed();
    error InvalidMsgValue();

    /**
     * @notice Emitted when RFQ gets filled
     * @param orderHash Hash of the order
     * @param makingAmount Amount of the maker asset that was transferred from maker to taker
     */
    event OrderFilledRFQ(
        bytes32 orderHash,
        uint256 makingAmount
    );

    IWETH private immutable _WETH;  // solhint-disable-line var-name-mixedcase
    mapping(address => mapping(uint256 => uint256)) private _invalidator;

    constructor(IWETH weth) {
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
     * @param makingAmount Making amount
     * @param takingAmount Taking amount
     * @return filledMakingAmount Actual amount transferred from maker to taker
     * @return filledTakingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     */
    function fillOrderRFQ(
        OrderRFQLib.OrderRFQ memory order,
        bytes calldata signature,
        uint256 makingAmount,
        uint256 takingAmount
    ) external returns(uint256 /* filledMakingAmount */, uint256 /* filledTakingAmount */, bytes32 /* orderHash */) {
        return fillOrderRFQTo(order, signature, makingAmount, takingAmount, msg.sender);
    }

    uint256 constant private _UNWRAP_WETH_MASK = 1 << 255;
    uint256 constant private _MAKER_AMOUNT_FLAG = 1 << 255;
    uint256 constant private _SIGNER_SMART_CONTRACT_HINT = 1 << 254;
    uint256 constant private _IS_VALID_SIGNATURE_65_BYTES = 1 << 253;
    uint256 constant private _AMOUNT_MASK = ~uint256(
        _MAKER_AMOUNT_FLAG |
        _SIGNER_SMART_CONTRACT_HINT |
        _IS_VALID_SIGNATURE_65_BYTES
    );

    /**
     * @notice Fills order's quote, fully or partially, with compact signuture
     * @param order Order quote to fill
     * @param r R component of signature
     * @param vs VS component of signature
     * @param amount Amount to fill and flags.
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
        uint256 amount
    ) external payable returns(uint256 filledMakingAmount, uint256 filledTakingAmount, bytes32 orderHash) {
        orderHash = order.hash(_domainSeparatorV4());
        if (amount & _SIGNER_SMART_CONTRACT_HINT != 0) {
            if (amount & _IS_VALID_SIGNATURE_65_BYTES != 0) {
                if (!ECDSA.isValidSignature65(order.maker, orderHash, r, vs)) revert RFQBadSignature();
            } else {
                if (!ECDSA.isValidSignature(order.maker, orderHash, r, vs)) revert RFQBadSignature();
            }
        } else {
            if(!ECDSA.recoverOrIsValidSignature(order.maker, orderHash, r, vs)) revert RFQBadSignature();
        }

        if (amount & _MAKER_AMOUNT_FLAG != 0) {
            (filledMakingAmount, filledTakingAmount) = _fillOrderRFQTo(order, amount & _AMOUNT_MASK, 0, msg.sender);
        } else {
            (filledMakingAmount, filledTakingAmount) = _fillOrderRFQTo(order, 0, amount & _AMOUNT_MASK, msg.sender);
        }
        emit OrderFilledRFQ(orderHash, filledMakingAmount);
    }

    /**
     * @notice Fills Same as `fillOrderRFQ` but calls permit first.
     * It allows to approve token spending and make a swap in one transaction.
     * Also allows to specify funds destination instead of `msg.sender`
     * @param order Order quote to fill
     * @param signature Signature to confirm quote ownership
     * @param makingAmount Making amount
     * @param takingAmount Taking amount
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
        uint256 makingAmount,
        uint256 takingAmount,
        address target,
        bytes calldata permit
    ) external returns(uint256 /* filledMakingAmount */, uint256 /* filledTakingAmount */, bytes32 /* orderHash */) {
        IERC20(order.takerAsset).safePermit(permit);
        return fillOrderRFQTo(order, signature, makingAmount, takingAmount, target);
    }

    /**
     * @notice Same as `fillOrderRFQ` but allows to specify funds destination instead of `msg.sender`
     * @param order Order quote to fill
     * @param signature Signature to confirm quote ownership
     * @param makingAmount Making amount
     * @param takingAmount Taking amount
     * @param target Address that will receive swap funds
     * @return filledMakingAmount Actual amount transferred from maker to taker
     * @return filledTakingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     */
    function fillOrderRFQTo(
        OrderRFQLib.OrderRFQ memory order,
        bytes calldata signature,
        uint256 makingAmount,
        uint256 takingAmount,
        address target
    ) public payable returns(uint256 filledMakingAmount, uint256 filledTakingAmount, bytes32 orderHash) {
        orderHash = order.hash(_domainSeparatorV4());
        if (!ECDSA.recoverOrIsValidSignature(order.maker, orderHash, signature)) revert RFQBadSignature();
        (filledMakingAmount, filledTakingAmount) = _fillOrderRFQTo(order, makingAmount, takingAmount, target);
        emit OrderFilledRFQ(orderHash, filledMakingAmount);
    }

    function _fillOrderRFQTo(
        OrderRFQLib.OrderRFQ memory order,
        uint256 makingAmount,
        uint256 takingAmount,
        address target
    ) private returns(uint256 /* filledMakingAmount */, uint256 /* filledTakingAmount */) {
        if (target == address(0)) revert RFQZeroTargetIsForbidden();

        address maker = order.maker;
        bool unwrapWETH = (order.info & _UNWRAP_WETH_MASK) > 0;

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
            // Compute partial fill if needed
            if (takingAmount == 0 && makingAmount == 0) {
                // Two zeros means whole order
                makingAmount = orderMakingAmount;
                takingAmount = orderTakingAmount;
            }
            else if (takingAmount == 0) {
                if (makingAmount > orderMakingAmount) revert MakingAmountExceeded();
                takingAmount = getTakingAmount(orderMakingAmount, orderTakingAmount, makingAmount);
            }
            else if (makingAmount == 0) {
                if (takingAmount > orderTakingAmount) revert TakingAmountExceeded();
                makingAmount = getMakingAmount(orderMakingAmount, orderTakingAmount, takingAmount);
            }
            else {
                revert BothAmountsAreNonZero();
            }
        }

        if (makingAmount == 0 || takingAmount == 0) revert RFQSwapWithZeroAmount();

        // Maker => Taker
        if (order.makerAsset == address(_WETH) && unwrapWETH) {
            _WETH.transferFrom(maker, address(this), makingAmount);
            _WETH.withdraw(makingAmount);
            (bool success, ) = target.call{value: makingAmount}("");  // solhint-disable-line avoid-low-level-calls
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

        return (makingAmount, takingAmount);
    }

    function _invalidateOrder(address maker, uint256 orderInfo, uint256 additionalMask) private {
        uint256 invalidatorSlot = uint64(orderInfo) >> 8;
        uint256 invalidatorBits = (1 << uint8(orderInfo)) | additionalMask;
        mapping(uint256 => uint256) storage invalidatorStorage = _invalidator[maker];
        uint256 invalidator = invalidatorStorage[invalidatorSlot];
        if (invalidator & invalidatorBits != 0) revert InvalidatedOrder();
        invalidatorStorage[invalidatorSlot] = invalidator | invalidatorBits;
    }
}
