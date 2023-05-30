// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/utils/math/Math.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/solidity-utils/contracts/interfaces/IWETH.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/OnlyWethReceiver.sol";

import "./helpers/PredicateHelper.sol";
import "./helpers/SeriesEpochManager.sol";
import "./interfaces/ITakerInteraction.sol";
import "./interfaces/IPreInteraction.sol";
import "./interfaces/IPostInteraction.sol";
import "./interfaces/IOrderMixin.sol";
import "./libraries/Errors.sol";
import "./libraries/TakerTraitsLib.sol";
import "./libraries/BitInvalidatorLib.sol";
import "./libraries/RemainingInvalidatorLib.sol";
import "./OrderLib.sol";

/// @title Limit Order mixin
abstract contract OrderMixin is IOrderMixin, EIP712, OnlyWethReceiver, PredicateHelper, SeriesEpochManager {
    using SafeERC20 for IERC20;
    using SafeERC20 for IWETH;
    using OrderLib for IOrderMixin.Order;
    using ExtensionLib for bytes;
    using AddressLib for Address;
    using MakerTraitsLib for MakerTraits;
    using TakerTraitsLib for TakerTraits;
    using BitInvalidatorLib for BitInvalidatorLib.Data;
    using RemainingInvalidatorLib for RemainingInvalidator;

    uint256 private constant _RAW_CALL_GAS_LIMIT = 5000;
    address private constant _PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

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
    function remainingInvalidatorForOrder(address maker, bytes32 orderHash) external view returns(uint256 /* remaining */) {
        return _remainingInvalidator[maker][orderHash].remaining();
    }

    /**
     * @notice See {IOrderMixin-rawRemainingInvalidatorForOrder}.
     */
    function rawRemainingInvalidatorForOrder(address maker, bytes32 orderHash) external view returns(uint256 /* remainingRaw */) {
        return RemainingInvalidator.unwrap(_remainingInvalidator[maker][orderHash]);
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
    function cancelOrder(MakerTraits makerTraits, bytes32 orderHash) public {
        if (makerTraits.useBitInvalidator()) {
            _bitInvalidator[msg.sender].massInvalidate(makerTraits.nonceOrEpoch(), 0);
        } else {
            _remainingInvalidator[msg.sender][orderHash] = RemainingInvalidatorLib.fullyFilled();
        }
    }

    /**
     * @notice See {IOrderMixin-cancelOrders}.
     */
    function cancelOrders(MakerTraits[] calldata makerTraits, bytes32[] calldata orderHashes) external {
        if (makerTraits.length != orderHashes.length) revert MismatchArraysLengths();
        unchecked {
            for (uint256 i = 0; i < makerTraits.length; i++) {
                cancelOrder(makerTraits[i], orderHashes[i]);
            }
        }
    }

    /**
     * @notice See {IOrderMixin-bitsInvalidateForOrder}.
     */
    function bitsInvalidateForOrder(MakerTraits makerTraits, uint256 additionalMask) external {
        if (!makerTraits.useBitInvalidator()) revert OrderIsNotSuitableForMassInvalidation();
        _bitInvalidator[msg.sender].massInvalidate(makerTraits.nonceOrEpoch(), additionalMask);
    }

     /**
     * @notice See {IOrderMixin-hashOrder}.
     */
    function hashOrder(IOrderMixin.Order calldata order) external view returns(bytes32) {
        return order.hash(_domainSeparatorV4());
    }

    /**
     * @notice See {IOrderMixin-checkPredicate}.
     */
    function checkPredicate(bytes calldata predicate) public view returns(bool) {
        (bool success, uint256 res) = _staticcallForUint(address(this), predicate);
        return success && res == 1;
    }

    /**
     * @notice See {IOrderMixin-fillOrder}.
     */
    function fillOrder(
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        TakerTraits takerTraits
    ) external payable returns(uint256 /* makingAmount */, uint256 /* takingAmount */, bytes32 /* orderHash */) {
        return fillOrderToExt(order, r, vs, amount, takerTraits, msg.sender, msg.data[:0], msg.data[:0]);
    }

    /**
     * @notice See {IOrderMixin-fillOrderExt}.
     */
    function fillOrderExt(
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        TakerTraits takerTraits,
        bytes calldata extension
    ) external payable returns(uint256 /* makingAmount */, uint256 /* takingAmount */, bytes32 /* orderHash */) {
        return fillOrderToExt(order, r, vs, amount, takerTraits, msg.sender, msg.data[:0], extension);
    }

    /**
     * @notice See {IOrderMixin-fillOrderTo}.
     */
    function fillOrderTo(
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        TakerTraits takerTraits,
        address target,
        bytes calldata interaction
    ) external payable returns(uint256 /* makingAmount */, uint256 /* takingAmount */, bytes32 /* orderHash */) {
        return fillOrderToExt(order, r, vs, amount, takerTraits, target, interaction, msg.data[:0]);
    }

    /**
     * @notice See {IOrderMixin-fillOrderToExt}.
     */
    function fillOrderToExt(
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        TakerTraits takerTraits,
        address target,
        bytes calldata interaction,
        bytes calldata extension
    ) public payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash) {
        order.validateExtension(extension);
        orderHash = order.hash(_domainSeparatorV4());

        // Check signature and apply order permit only on the first fill
        uint256 remainingMakingAmount = _checkRemainingMakingAmount(order, orderHash);
        if (remainingMakingAmount == order.makingAmount) {
            address maker = order.maker.get();
            if (maker == address(0) || maker != ECDSA.recover(orderHash, r, vs)) revert BadSignature();
            if (!takerTraits.skipMakerPermit()) {
                _applyMakerPermit(order, orderHash, extension);
            }
        }

        (makingAmount, takingAmount) = _fillOrderTo(order, orderHash, extension, remainingMakingAmount, amount, takerTraits, target, interaction);
    }

    /**
     * @notice See {IOrderMixin-fillOrderToWithPermit}.
     */
    function fillOrderToWithPermit(
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        TakerTraits takerTraits,
        address target,
        bytes calldata interaction,
        bytes calldata permit
    ) external returns(uint256 /* makingAmount */, uint256 /* takingAmount */, bytes32 /* orderHash */) {
        IERC20(order.takerAsset.get()).safePermit(permit);
        return fillOrderToExt(order, r, vs, amount, takerTraits, target, interaction, msg.data[:0]);
    }

    /**
     * @notice See {IOrderMixin-fillContractOrder}.
     */
    function fillContractOrder(
        IOrderMixin.Order calldata order,
        bytes calldata signature,
        uint256 amount,
        TakerTraits takerTraits,
        address target,
        bytes calldata interaction
    ) external returns(uint256 /* makingAmount */, uint256 /* takingAmount */, bytes32 /* orderHash */) {
        return fillContractOrderExt(order, signature, amount, takerTraits, target, interaction, msg.data[:0], msg.data[:0]);
    }

    /**
     * @notice See {IOrderMixin-fillContractOrderWithPermit}.
     */
    function fillContractOrderWithPermit(
        IOrderMixin.Order calldata order,
        bytes calldata signature,
        uint256 amount,
        TakerTraits takerTraits,
        address target,
        bytes calldata interaction,
        bytes calldata permit
    ) external returns(uint256 /* makingAmount */, uint256 /* takingAmount */, bytes32 /* orderHash */) {
        return fillContractOrderExt(order, signature, amount, takerTraits, target, interaction, permit, msg.data[:0]);
    }

    /**
     * @notice See {IOrderMixin-fillContractOrderExt}.
     */
    function fillContractOrderExt(
        IOrderMixin.Order calldata order,
        bytes calldata signature,
        uint256 amount,
        TakerTraits takerTraits,
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
            if (!ECDSA.isValidSignature(order.maker.get(), orderHash, signature)) revert BadSignature();
            if (!takerTraits.skipMakerPermit()) {
                _applyMakerPermit(order, orderHash, extension);
            }
        }

        (makingAmount, takingAmount) = _fillOrderTo(order, orderHash, extension, remainingMakingAmount, amount, takerTraits, target, interaction);
    }

    function _fillOrderTo(
        IOrderMixin.Order calldata order,
        bytes32 orderHash,
        bytes calldata extension,
        uint256 remainingMakingAmount,
        uint256 amount,
        TakerTraits takerTraits,
        address target,
        bytes calldata interaction
    ) private returns(uint256 makingAmount, uint256 takingAmount) {
        if (target == address(0)) {
            target = msg.sender;
        }

        // Validate order
        if (!order.makerTraits.isAllowedSender(msg.sender)) revert PrivateOrder();
        if (order.makerTraits.isExpired()) revert OrderExpired();
        if (order.makerTraits.needCheckEpochManager()) {
            if (order.makerTraits.useBitInvalidator()) revert EpochManagerAndBitInvalidatorsAreIncompatible();
            if (!epochEquals(order.maker.get(), order.makerTraits.series(), order.makerTraits.nonceOrEpoch())) revert WrongSeriesNonce();
        }

        // Check if orders predicate allows filling
        if (extension.length > 0) {
            bytes calldata predicate = extension.predicate();
            if (predicate.length > 0) {
                if (!checkPredicate(predicate)) revert PredicateIsNotTrue();
            }
        }

        // Compute maker and taker assets amount
        if (takerTraits.isMakingAmount()) {
            makingAmount = Math.min(amount, remainingMakingAmount);
            takingAmount = order.calculateTakingAmount(extension, makingAmount, remainingMakingAmount, orderHash);

            uint256 threshold = takerTraits.threshold();
            if (threshold > 0) {
                // Check rate: takingAmount / makingAmount <= threshold / amount
                if (amount == makingAmount) {  // Gas optimization, no SafeMath.mul()
                    if (takingAmount > threshold) revert TakingAmountTooHigh();
                } else {
                    if (takingAmount * amount > threshold * makingAmount) revert TakingAmountTooHigh();
                }
            }
        }
        else {
            takingAmount = amount;
            makingAmount = order.calculateMakingAmount(extension, takingAmount, remainingMakingAmount, orderHash);
            if (makingAmount > remainingMakingAmount) {
                // Try to decrease taking amount because computed making amount exceeds remaining amount
                makingAmount = remainingMakingAmount;
                takingAmount = order.calculateTakingAmount(extension, makingAmount, remainingMakingAmount, orderHash);
                if (takingAmount > amount) revert TakingAmountExceeded();
            }

            uint256 threshold = takerTraits.threshold();
            if (threshold > 0) {
                // Check rate: makingAmount / takingAmount >= threshold / amount
                if (amount == takingAmount) { // Gas optimization, no SafeMath.mul()
                    if (makingAmount < threshold) revert MakingAmountTooLow();
                } else {
                    if (makingAmount * amount < threshold * takingAmount) revert MakingAmountTooLow();
                }
            }
        }
        if (!order.makerTraits.allowPartialFills() && makingAmount != order.makingAmount) revert PartialFillNotAllowed();
        unchecked { if (makingAmount * takingAmount == 0) revert SwapWithZeroAmount(); }

        // Invalidate order depending on makerTraits
        if (order.makerTraits.useBitInvalidator()) {
            _bitInvalidator[order.maker.get()].checkAndInvalidate(order.makerTraits.nonceOrEpoch());
        } else {
            _remainingInvalidator[order.maker.get()][orderHash] = RemainingInvalidatorLib.remains(remainingMakingAmount, makingAmount);
        }

        // Pre interaction, where maker can prepare funds interactively
        if (order.makerTraits.needPreInteractionCall()) {
            bytes calldata data = extension.preInteractionTargetAndData();
            address listener = order.maker.get();
            if (data.length > 19) {
                listener = address(bytes20(data));
                data = data[20:];
            }
            IPreInteraction(listener).preInteraction(
                order, orderHash, msg.sender, makingAmount, takingAmount, remainingMakingAmount, data
            );
        }

        // Maker => Taker
        {
            bool needUnwrap = order.makerAsset.get() == address(_WETH) && takerTraits.unwrapWeth();
            address receiver = needUnwrap ? address(this) : target;
            if (order.makerTraits.usePermit2()) {
                if (extension.makerAssetSuffix().length > 0) revert InvalidPermit2Transfer();
                IERC20(order.makerAsset.get()).safeTransferFromPermit2(order.maker.get(), receiver, makingAmount);
            } else {
                if (!_callTransferFromWithSuffix(
                    order.makerAsset.get(),
                    order.maker.get(),
                    receiver,
                    makingAmount,
                    extension.makerAssetSuffix()
                )) revert TransferFromMakerToTakerFailed();
            }
            if (needUnwrap) {
                _WETH.safeWithdrawTo(makingAmount, target);
            }
        }

        if (interaction.length >= 20) {
            // proceed only if interaction length is enough to store address
            uint256 offeredTakingAmount = ITakerInteraction(address(bytes20(interaction))).takerInteraction(
                order, orderHash, msg.sender, makingAmount, takingAmount, remainingMakingAmount, interaction[20:]
            );
            if (offeredTakingAmount > takingAmount && order.makerTraits.allowImproveRateViaInteraction()) {
                takingAmount = offeredTakingAmount;
            }
        }

        // Taker => Maker
        if (order.takerAsset.get() == address(_WETH) && msg.value > 0) {
            if (msg.value < takingAmount) revert Errors.InvalidMsgValue();
            if (msg.value > takingAmount) {
                unchecked {
                    // solhint-disable-next-line avoid-low-level-calls
                    (bool success, ) = msg.sender.call{value: msg.value - takingAmount, gas: _RAW_CALL_GAS_LIMIT}("");
                    if (!success) revert Errors.ETHTransferFailed();
                }
            }

            if (order.makerTraits.unwrapWeth()) {
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, ) = order.getReceiver().call{value: takingAmount, gas: _RAW_CALL_GAS_LIMIT}("");
                if (!success) revert Errors.ETHTransferFailed();
            } else {
                _WETH.safeDeposit(takingAmount);
                _WETH.safeTransfer(order.getReceiver(), takingAmount);
            }
        } else {
            if (msg.value != 0) revert Errors.InvalidMsgValue();

            bool needUnwrap = order.takerAsset.get() == address(_WETH) && order.makerTraits.unwrapWeth();
            address receiver = needUnwrap ? address(this) : order.getReceiver();
            if (takerTraits.usePermit2()) {
                if (extension.takerAssetSuffix().length > 0) revert InvalidPermit2Transfer();
                IERC20(order.takerAsset.get()).safeTransferFromPermit2(msg.sender, receiver, takingAmount);
            } else {
                if (!_callTransferFromWithSuffix(
                    order.takerAsset.get(),
                    msg.sender,
                    receiver,
                    takingAmount,
                    extension.takerAssetSuffix()
                )) revert TransferFromTakerToMakerFailed();
            }

            if (needUnwrap) {
                _WETH.safeWithdrawTo(takingAmount, order.getReceiver());
            }
        }

        // Post interaction, where maker can handle funds interactively
        if (order.makerTraits.needPostInteractionCall()) {
            bytes calldata data = extension.postInteractionTargetAndData();
            address listener = order.maker.get();
            if (data.length > 19) {
                listener = address(bytes20(data));
                data = data[20:];
            }
            IPostInteraction(listener).postInteraction(
                order, orderHash, msg.sender, makingAmount, takingAmount, remainingMakingAmount, data
            );
        }

        emit OrderFilled(orderHash, makingAmount);
    }

    function _checkRemainingMakingAmount(IOrderMixin.Order calldata order, bytes32 orderHash) private view returns(uint256 remainingMakingAmount) {
        if (order.makerTraits.useBitInvalidator()) {
            remainingMakingAmount = order.makingAmount;
        } else {
            remainingMakingAmount = _remainingInvalidator[order.maker.get()][orderHash].remaining(order.makingAmount);
        }
        if (remainingMakingAmount == 0) revert InvalidatedOrder();
    }

    function _applyMakerPermit(IOrderMixin.Order calldata order, bytes32 orderHash, bytes calldata extension) private {
        bytes calldata makerPermit = extension.makerPermit();
        if (makerPermit.length >= 20) {
            // proceed only if taker is willing to execute permit and its length is enough to store address
            IERC20(address(bytes20(makerPermit))).safePermit(makerPermit[20:]);
            if (!order.makerTraits.useBitInvalidator()) {
                // Bit orders are not subjects for reentrancy, but we still need to check remaining-based orders for reentrancy
                if (!_remainingInvalidator[order.maker.get()][orderHash].isNewOrder()) revert ReentrancyDetected();
            }
        }
    }

    function _callTransferFromWithSuffix(address asset, address from, address to, uint256 amount, bytes calldata suffix) private returns(bool success) {
        bytes4 selector = IERC20.transferFrom.selector;
        assembly ("memory-safe") { // solhint-disable-line no-inline-assembly
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
}
