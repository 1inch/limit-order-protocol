// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

import "./helpers/AmountCalculator.sol";
import "./libraries/ECDSA.sol";
import "./OrderRFQLib.sol";

/// @title RFQ Limit Order mixin
abstract contract OrderRFQMixin is EIP712, AmountCalculator {
    using SafeERC20 for IERC20;
    using OrderRFQLib for OrderRFQLib.OrderRFQ;

    /// @notice Emitted when RFQ gets filled
    event OrderFilledRFQ(
        bytes32 orderHash,
        uint256 makingAmount
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
        OrderRFQLib.OrderRFQ memory order,
        bytes calldata signature,
        uint256 makingAmount,
        uint256 takingAmount
    ) external returns(uint256 /* makingAmount */, uint256 /* takingAmount */, bytes32 /* orderHash */) {
        return fillOrderRFQTo(order, signature, makingAmount, takingAmount, msg.sender);
    }

    uint256 constant private _MAKER_AMOUNT_FLAG = 1 << 255;
    uint256 constant private _SIGNER_SMART_CONTRACT_HINT = 1 << 254;
    uint256 constant private _IS_VALID_SIGNATURE_65_BYTES = 1 << 253;
    uint256 constant private _AMOUNT_MASK = ~uint256(
        _MAKER_AMOUNT_FLAG |
        _SIGNER_SMART_CONTRACT_HINT |
        _IS_VALID_SIGNATURE_65_BYTES
    );

    function fillOrderRFQCompact(
        OrderRFQLib.OrderRFQ memory order,
        bytes32 r,
        bytes32 vs,
        uint256 amount
    ) external returns(uint256 filledMakingAmount, uint256 filledTakingAmount, bytes32 orderHash) {
        orderHash = _hashTypedDataV4(order.hash());
        if (amount & _SIGNER_SMART_CONTRACT_HINT != 0) {
            if (amount & _IS_VALID_SIGNATURE_65_BYTES != 0) {
                require(ECDSA.isValidSignature65(order.maker, orderHash, r, vs), "LOP: bad signature");
            } else {
                require(ECDSA.isValidSignature(order.maker, orderHash, r, vs), "LOP: bad signature");
            }
        } else {
            require(ECDSA.recoverOrIsValidSignature(order.maker, orderHash, r, vs), "LOP: bad signature");
        }

        if (amount & _MAKER_AMOUNT_FLAG != 0) {
            (filledMakingAmount, filledTakingAmount) = _fillOrderRFQTo(order, amount & _AMOUNT_MASK, 0, msg.sender);
        } else {
            (filledMakingAmount, filledTakingAmount) = _fillOrderRFQTo(order, 0, amount, msg.sender);
        }
        emit OrderFilledRFQ(orderHash, filledMakingAmount);
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
        OrderRFQLib.OrderRFQ memory order,
        bytes calldata signature,
        uint256 makingAmount,
        uint256 takingAmount,
        address target,
        bytes calldata permit
    ) external returns(uint256 /* makingAmount */, uint256 /* takingAmount */, bytes32 /* orderHash */) {
        IERC20(order.takerAsset).safePermit(permit);
        return fillOrderRFQTo(order, signature, makingAmount, takingAmount, target);
    }

    /// @notice Same as `fillOrderRFQ` but allows to specify funds destination instead of `msg.sender`
    /// @param order Order quote to fill
    /// @param signature Signature to confirm quote ownership
    /// @param makingAmount Making amount
    /// @param takingAmount Taking amount
    /// @param target Address that will receive swap funds
    function fillOrderRFQTo(
        OrderRFQLib.OrderRFQ memory order,
        bytes calldata signature,
        uint256 makingAmount,
        uint256 takingAmount,
        address target
    ) public returns(uint256 filledMakingAmount, uint256 filledTakingAmount, bytes32 orderHash) {
        orderHash = _hashTypedDataV4(order.hash());
        require(ECDSA.recoverOrIsValidSignature(order.maker, orderHash, signature), "LOP: bad signature");
        (filledMakingAmount, filledTakingAmount) = _fillOrderRFQTo(order, makingAmount, takingAmount, target);
        emit OrderFilledRFQ(orderHash, filledMakingAmount);
    }

    function _fillOrderRFQTo(
        OrderRFQLib.OrderRFQ memory order,
        uint256 makingAmount,
        uint256 takingAmount,
        address target
    ) private returns(uint256 /* filledMakingAmount */, uint256 /* filledTakingAmount */) {
        require(target != address(0), "LOP: zero target is forbidden");

        address maker = order.maker;

        // Validate order
        require(order.allowedSender == address(0) || order.allowedSender == msg.sender, "LOP: private order");

        {  // Stack too deep
            uint256 info = order.info;
            // Check time expiration
            uint256 expiration = uint128(info) >> 64;
            require(expiration == 0 || block.timestamp <= expiration, "LOP: order expired");  // solhint-disable-line not-rely-on-time
            _invalidateOrder(maker, info);
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
                require(makingAmount <= orderMakingAmount, "LOP: making amount exceeded");
                takingAmount = getTakingAmount(orderMakingAmount, orderTakingAmount, makingAmount);
            }
            else if (makingAmount == 0) {
                require(takingAmount <= orderTakingAmount, "LOP: taking amount exceeded");
                makingAmount = getMakingAmount(orderMakingAmount, orderTakingAmount, takingAmount);
            }
            else {
                revert("LOP: both amounts are non-zero");
            }
        }

        require(makingAmount > 0 && takingAmount > 0, "LOP: can't swap 0 amount");

        // Maker => Taker, Taker => Maker
        IERC20(order.makerAsset).safeTransferFrom(maker, target, makingAmount);
        IERC20(order.takerAsset).safeTransferFrom(msg.sender, maker, takingAmount);

        return (makingAmount, takingAmount);
    }

    function _invalidateOrder(address maker, uint256 orderInfo) private {
        uint256 invalidatorSlot = uint64(orderInfo) >> 8;
        uint256 invalidatorBit = 1 << uint8(orderInfo);
        mapping(uint256 => uint256) storage invalidatorStorage = _invalidator[maker];
        uint256 invalidator = invalidatorStorage[invalidatorSlot];
        require(invalidator & invalidatorBit == 0, "LOP: invalidated order");
        invalidatorStorage[invalidatorSlot] = invalidator | invalidatorBit;
    }
}
