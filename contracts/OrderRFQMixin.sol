// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./helpers/AmountCalculator.sol";
import "./libraries/Permitable.sol";
import "./libraries/EC.sol";
import "./OrderRFQLib.sol";

library SafeERC20 {
    error TransferFromFailed();

    function safeTransferFrom(IERC20 token, address from, address to, uint value) internal {
        bytes4 selector = IERC20.transferFrom.selector;
        bool success;
        assembly { // solhint-disable-line no-inline-assembly
            let data := mload(0x40)
            mstore(0x40, add(data, 100))

            mstore(data, selector)
            mstore(add(data, 0x04), from)
            mstore(add(data, 0x24), to)
            mstore(add(data, 0x44), value)
            let status := call(gas(), token, 0, data, 100, 0x0, 0x20)
            success := and(status, or(iszero(returndatasize()), and(gt(returndatasize(), 31), eq(mload(0), 1))))
        }
        if (!success) {
            revert TransferFromFailed();
        }
    }
}

/// @title RFQ Limit Order mixin
abstract contract OrderRFQMixin is EIP712, AmountCalculator, Permitable {
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

    function fillOrderRFQCompact(
        OrderRFQLib.OrderRFQ memory order,
        bytes32 r,
        bytes32 vs,
        uint256 amount
    ) external returns(uint256 filledMakingAmount, uint256 filledTakingAmount, bytes32 orderHash) {
        orderHash = _hashTypedDataV4(order.hash());
        require(order.maker == EC.recover(orderHash, r, vs), "LOP: bad signature");
        // require(order.maker == ECDSA.recover(orderHash, r, vs), "LOP: bad signature");

        if (amount >> 255 == 0) {
            (filledMakingAmount, filledTakingAmount) = _fillOrderRFQTo(order, amount, 0, msg.sender);
        } else {
            (filledMakingAmount, filledTakingAmount) = _fillOrderRFQTo(order, 0, amount & ~uint256(1 << 255), msg.sender);
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
        _permit(address(order.takerAsset), permit);
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
        require(EC.isValidSignatureNow(order.maker, orderHash, signature), "LOP: bad signature");
        (filledMakingAmount, filledTakingAmount) = _fillOrderRFQTo(order, makingAmount, takingAmount, target);
        emit OrderFilledRFQ(orderHash, makingAmount);
    }

    function _fillOrderRFQTo(
        OrderRFQLib.OrderRFQ memory order,
        uint256 makingAmount,
        uint256 takingAmount,
        address target
    ) private returns(uint256 /* makingAmount */, uint256 /* takingAmount */) {
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
