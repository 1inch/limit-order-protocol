// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

import "./helpers/AmountCalculator.sol";

/// @title RFQ Limit Order mixin
abstract contract OrderRFQMixin is EIP712, AmountCalculator {
    using SafeERC20 for IERC20;

    error RFQZeroTargetIsForbidden();
    error RFQPrivateOrder();
    error RFQBadSignature();
    error OrderExpired();
    error MakingAmountExceeded();
    error TakingAmountExceeded();
    error BothAmountsAreNonZero();
    error RFQSwapWithZeroAmount();
    error InvalidatedOrder();

    /// @notice Emitted when RFQ gets filled
    event OrderFilledRFQ(
        bytes32 orderHash,
        uint256 makingAmount
    );

    struct OrderRFQ {
        uint256 info;  // lowest 64 bits is the order id, next 64 bits is the expiration timestamp
        IERC20 makerAsset;
        IERC20 takerAsset;
        address maker;
        address allowedSender;  // equals to Zero address on public orders
        uint256 makingAmount;
        uint256 takingAmount;
    }

    bytes32 constant public LIMIT_ORDER_RFQ_TYPEHASH = keccak256(
        "OrderRFQ("
            "uint256 info,"
            "address makerAsset,"
            "address takerAsset,"
            "address maker,"
            "address allowedSender,"
            "uint256 makingAmount,"
            "uint256 takingAmount"
        ")"
    );

    mapping(address => mapping(uint256 => uint256)) private _invalidator;

    /// @notice Returns bitmask for double-spend invalidators based on lowest byte of order.info and filled quotes
    /// @return Result Each bit represents whether corresponding was already invalidated
    function invalidatorForOrderRFQ(address maker, uint256 slot) external view returns(uint256) {
        return _invalidator[maker][slot];
    }

    /// @notice Cancels order's quote
    function cancelOrderRFQ(uint256 orderInfo) external {
        _invalidateOrder(msg.sender, orderInfo);
    }

    /// @notice Fills order's quote, fully or partially (whichever is possible)
    /// @param order Order quote to fill
    /// @param signature Signature to confirm quote ownership
    /// @param makingAmount Making amount
    /// @param takingAmount Taking amount
    function fillOrderRFQ(
        OrderRFQ memory order,
        bytes calldata signature,
        uint256 makingAmount,
        uint256 takingAmount
    ) external returns(uint256 /* makingAmount */, uint256 /* takingAmount */, bytes32 /* orderHash */) {
        return fillOrderRFQTo(order, signature, makingAmount, takingAmount, msg.sender);
    }

    /// @notice Fills Same as `fillOrderRFQ` but calls permit first,
    /// allowing to approve token spending and make a swap in one transaction.
    /// Also allows to specify funds destination instead of `msg.sender`
    /// @param order Order quote to fill
    /// @param signature Signature to confirm quote ownership
    /// @param makingAmount Making amount
    /// @param takingAmount Taking amount
    /// @param target Address that will receive swap funds
    /// @param permit Should consist of abiencoded token address and encoded `IERC20Permit.permit` call.
    /// @dev See tests for examples
    function fillOrderRFQToWithPermit(
        OrderRFQ memory order,
        bytes calldata signature,
        uint256 makingAmount,
        uint256 takingAmount,
        address target,
        bytes calldata permit
    ) external returns(uint256 /* makingAmount */, uint256 /* takingAmount */, bytes32 /* orderHash */) {
        order.takerAsset.safePermit(permit);
        return fillOrderRFQTo(order, signature, makingAmount, takingAmount, target);
    }

    /// @notice Same as `fillOrderRFQ` but allows to specify funds destination instead of `msg.sender`
    /// @param order Order quote to fill
    /// @param signature Signature to confirm quote ownership
    /// @param makingAmount Making amount
    /// @param takingAmount Taking amount
    /// @param target Address that will receive swap funds
    function fillOrderRFQTo(
        OrderRFQ memory order,
        bytes calldata signature,
        uint256 makingAmount,
        uint256 takingAmount,
        address target
    ) public returns(uint256 /* makingAmount */, uint256 /* takingAmount */, bytes32 /* orderHash */) {
        if(target == address(0)) revert RFQZeroTargetIsForbidden();

        address maker = order.maker;

        // Validate order
        if(order.allowedSender != address(0) && order.allowedSender != msg.sender) revert RFQPrivateOrder();
        bytes32 orderHash = _hashTypedDataV4(keccak256(abi.encode(LIMIT_ORDER_RFQ_TYPEHASH, order)));
        if(!SignatureChecker.isValidSignatureNow(maker, orderHash, signature)) revert RFQBadSignature();

        {  // Stack too deep
            uint256 info = order.info;
            // Check time expiration
            uint256 expiration = uint128(info) >> 64;
            if(expiration != 0 && block.timestamp > expiration) revert OrderExpired(); // solhint-disable-line not-rely-on-time
            _invalidateOrder(maker, info);
        }

        {  // stack too deep
            uint256 orderMakingAmount = order.makingAmount;
            uint256 orderTakingAmount = order.takingAmount;
            // Compute partial fill if needed
            if (takingAmount == 0 && makingAmount == 0) {
                // Two zeros means whole order
                makingAmount = orderMakingAmount;
                takingAmount = orderTakingAmount;
            }
            else if (takingAmount == 0) {
                if(makingAmount > orderMakingAmount) revert MakingAmountExceeded();
                takingAmount = getTakingAmount(orderMakingAmount, orderTakingAmount, makingAmount);
            }
            else if (makingAmount == 0) {
                if(takingAmount > orderTakingAmount) revert TakingAmountExceeded();
                makingAmount = getMakingAmount(orderMakingAmount, orderTakingAmount, takingAmount);
            }
            else {
                revert BothAmountsAreNonZero();
            }
        }

        if(makingAmount == 0 || takingAmount == 0) revert RFQSwapWithZeroAmount();

        // Maker => Taker, Taker => Maker
        order.makerAsset.safeTransferFrom(maker, target, makingAmount);
        order.takerAsset.safeTransferFrom(msg.sender, maker, takingAmount);

        emit OrderFilledRFQ(orderHash, makingAmount);
        return (makingAmount, takingAmount, orderHash);
    }

    function _invalidateOrder(address maker, uint256 orderInfo) private {
        uint256 invalidatorSlot = uint64(orderInfo) >> 8;
        uint256 invalidatorBit = 1 << uint8(orderInfo);
        mapping(uint256 => uint256) storage invalidatorStorage = _invalidator[maker];
        uint256 invalidator = invalidatorStorage[invalidatorSlot];
        if(invalidator & invalidatorBit != 0) revert InvalidatedOrder();
        invalidatorStorage[invalidatorSlot] = invalidator | invalidatorBit;
    }
}
