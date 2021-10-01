// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./helpers/AmountCalculator.sol";
import "./helpers/ChainlinkCalculator.sol";
import "./helpers/NonceManager.sol";
import "./helpers/PredicateHelper.sol";
import "./interfaces/InteractiveNotificationReceiver.sol";
import "./interfaces/IDaiLikePermit.sol";
import "./libraries/ArgumentsDecoder.sol";
import "./libraries/Permitable.sol";

abstract contract OrderMixin is
    EIP712,
    AmountCalculator,
    ChainlinkCalculator,
    NonceManager,
    PredicateHelper,
    Permitable
{
    using Address for address;
    using ArgumentsDecoder for bytes;

    // Expiration Mask:
    //   predicate := PredicateHelper.timestampBelow(deadline)
    //
    // Maker Nonce:
    //   predicate := this.nonceEquals(makerAddress, makerNonce)

    event OrderFilled(
        address indexed maker,
        bytes32 orderHash,
        uint256 remaining
    );

    event OrderCanceled(
        address indexed maker,
        bytes32 orderHash
    );

    struct Order {
        uint256 salt;
        address makerAsset;
        address takerAsset;
        bytes makerAssetData; // (transferFrom.selector, signer, ______, makerAmount, ...)
        bytes takerAssetData; // (transferFrom.selector, sender, signer, takerAmount, ...)
        bytes getMakerAmount; // this.staticcall(abi.encodePacked(bytes, swapTakerAmount)) => (swapMakerAmount)
        bytes getTakerAmount; // this.staticcall(abi.encodePacked(bytes, swapMakerAmount)) => (swapTakerAmount)
        bytes predicate;      // this.staticcall(bytes) => (bool)
        bytes permit;         // On first fill: permit.1.call(abi.encodePacked(permit.selector, permit.2))
        bytes interaction;
    }

    bytes32 constant public LIMIT_ORDER_TYPEHASH = keccak256(
        "Order(uint256 salt,address makerAsset,address takerAsset,bytes makerAssetData,bytes takerAssetData,bytes getMakerAmount,bytes getTakerAmount,bytes predicate,bytes permit,bytes interaction)"
    );

    uint256 constant private _FUNCTION_CALL_OFFSET = 0x24;
    uint256 constant private _BYTES_OFFSET = 0x20;
    uint256 constant private _FROM_INDEX = 0;
    uint256 constant private _TO_INDEX = 1;
    uint256 constant private _AMOUNT_INDEX = 2;

    mapping(bytes32 => uint256) private _remaining;

    /// @notice Returns unfilled amount for order. Throws if order does not exist
    function remaining(bytes32 orderHash) external view returns(uint256 amount) {
        amount = _remaining[orderHash];
        require(amount > 0, "LOP: Unknown order");
        unchecked {
            amount -= 1;
        }
    }

    /// @notice Returns unfilled amount for order
    /// @return Result Unfilled amount of order plus one if order exists. Otherwise 0
    function remainingRaw(bytes32 orderHash) external view returns(uint256) {
        return _remaining[orderHash];
    }

    /// @notice Same as `remainingRaw` but for multiple orders
    function remainingsRaw(bytes32[] memory orderHashes) external view returns(uint256[] memory results) {
        results = new uint256[](orderHashes.length);
        for (uint i = 0; i < orderHashes.length; i++) {
            results[i] = _remaining[orderHashes[i]];
        }
    }

    /// @notice Checks order predicate
    function checkPredicate(Order memory order) public view returns(bool) {
        bytes memory result = address(this).functionStaticCall(order.predicate, "LOP: predicate call failed");
        require(result.length == 32, "LOP: invalid predicate return");
        return result.decodeBool(_BYTES_OFFSET, 0);
    }

    /**
     * @notice Calls every target with corresponding data. Then reverts with CALL_RESULTS_0101011 where zeroes and ones
     * denote failure or success of the corresponding call
     * @param targets Array of addresses that will be called
     * @param data Array of data that will be passed to each call
     */
    function simulateCalls(address[] calldata targets, bytes[] calldata data) external {
        require(targets.length == data.length, "LOP: array size mismatch");
        bytes memory reason = new bytes(targets.length);
        for (uint i = 0; i < targets.length; i++) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, bytes memory result) = targets[i].call(data[i]);
            if (success && result.length > 0) {
                success = result.decodeBool(_BYTES_OFFSET, 0);
            }
            reason[i] = success ? bytes1("1") : bytes1("0");
        }

        // Always revert and provide per call results
        revert(string(abi.encodePacked("CALL_RESULTS_", reason)));
    }

    /// @notice Cancels order by setting remaining amount to zero
    function cancelOrder(Order memory order) external {
        require(order.makerAssetData.decodeAddress(_FUNCTION_CALL_OFFSET, _FROM_INDEX) == msg.sender, "LOP: Access denied");

        bytes32 orderHash = _hash(order);
        require(_remaining[orderHash] != 1, "LOP: already filled");
        _remaining[orderHash] = 1;
        emit OrderCanceled(msg.sender, orderHash);
    }

    /// @notice Fills an order. If one doesn't exist (first fill) it will be created using order.makerAssetData
    /// @param order Order quote to fill
    /// @param signature Signature to confirm quote ownership
    /// @param makingAmount Making amount
    /// @param takingAmount Taking amount
    /// @param thresholdAmount If makingAmout > 0 this is max takingAmount, else it is min makingAmount
    function fillOrder(
        Order memory order,
        bytes calldata signature,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount
    ) external returns(uint256, uint256) {
        return fillOrderTo(order, signature, makingAmount, takingAmount, thresholdAmount, msg.sender);
    }

    function fillOrderToWithPermit(
        Order memory order,
        bytes calldata signature,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount,
        address target,
        bytes calldata permit
    ) external returns(uint256, uint256) {
        _permit(permit);
        return fillOrderTo(order, signature, makingAmount, takingAmount, thresholdAmount, target);
    }

    function fillOrderTo(
        Order memory order,
        bytes calldata signature,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount,
        address target
    ) public returns(uint256, uint256) {
        bytes32 orderHash = _hash(order);

        {  // Stack too deep
            uint256 remainingMakerAmount;
            { // Stack too deep
                remainingMakerAmount = _remaining[orderHash];
                if (remainingMakerAmount == 0) {
                    // First fill: validate order and permit maker asset
                    _validate(order.makerAssetData, order.takerAssetData, signature, orderHash);
                    remainingMakerAmount = order.makerAssetData.decodeUint256(_FUNCTION_CALL_OFFSET, _AMOUNT_INDEX);
                    if (order.permit.length > 0) {
                        _permit(order.permit);
                        require(_remaining[orderHash] == 0, "LOP: reentrancy detected");
                    }
                } else {
                    unchecked {
                        remainingMakerAmount -= 1;
                    }
                }
            }

            // Check if order is valid
            if (order.predicate.length > 0) {
                require(checkPredicate(order), "LOP: predicate returned false");
            }

            // Compute maker and taker assets amount
            if ((takingAmount == 0) == (makingAmount == 0)) {
                revert("LOP: only one amount should be 0");
            }
            else if (takingAmount == 0) {
                if (makingAmount > remainingMakerAmount) {
                    makingAmount = remainingMakerAmount;
                }
                takingAmount = _callGetTakerAmount(order, makingAmount);
                require(takingAmount <= thresholdAmount, "LOP: taking amount too high");
            }
            else {
                makingAmount = _callGetMakerAmount(order, takingAmount);
                if (makingAmount > remainingMakerAmount) {
                    makingAmount = remainingMakerAmount;
                    takingAmount = _callGetTakerAmount(order, makingAmount);
                }
                require(makingAmount >= thresholdAmount, "LOP: making amount too low");
            }

            require(makingAmount > 0 && takingAmount > 0, "LOP: can't swap 0 amount");

            // Update remaining amount in storage
            unchecked {
                remainingMakerAmount = remainingMakerAmount - makingAmount;
                _remaining[orderHash] = remainingMakerAmount + 1;
            }
            emit OrderFilled(msg.sender, orderHash, remainingMakerAmount);
        }

        // Taker => Maker
        _callTakerAssetTransferFrom(order.takerAsset, order.takerAssetData, takingAmount);

        // Maker can handle funds interactively
        if (order.interaction.length > 0) {
            (address interactionTarget, bytes memory interactionData) = order.interaction.decodeTargetAndCalldata();
            InteractiveNotificationReceiver(interactionTarget).notifyFillOrder(
                msg.sender, order.makerAsset, order.takerAsset, makingAmount, takingAmount, interactionData
            );
        }

        // Maker => Taker
        _callMakerAssetTransferFrom(order.makerAsset, order.makerAssetData, target, makingAmount);

        return (makingAmount, takingAmount);
    }

    function _permit(bytes memory permitData) private {
        (address token, bytes memory permit) = permitData.decodeTargetAndCalldata();
        _permitMemory(token, permit);
    }

    function _hash(Order memory order) private view returns(bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    LIMIT_ORDER_TYPEHASH,
                    order.salt,
                    order.makerAsset,
                    order.takerAsset,
                    keccak256(order.makerAssetData),
                    keccak256(order.takerAssetData),
                    keccak256(order.getMakerAmount),
                    keccak256(order.getTakerAmount),
                    keccak256(order.predicate),
                    keccak256(order.permit),
                    keccak256(order.interaction)
                )
            )
        );
    }

    function _validate(bytes memory makerAssetData, bytes memory takerAssetData, bytes memory signature, bytes32 orderHash) private view {
        require(makerAssetData.length >= 100, "LOP: bad makerAssetData.length");
        require(takerAssetData.length >= 100, "LOP: bad takerAssetData.length");
        require(makerAssetData.decodeSelector() == IERC20.transferFrom.selector, "LOP: bad makerAssetData.selector");
        require(takerAssetData.decodeSelector() == IERC20.transferFrom.selector, "LOP: bad takerAssetData.selector");

        address maker = address(makerAssetData.decodeAddress(_FUNCTION_CALL_OFFSET, _FROM_INDEX));
        require(SignatureChecker.isValidSignatureNow(maker, orderHash, signature), "LOP: bad signature");
    }

    function _callMakerAssetTransferFrom(address makerAsset, bytes memory makerAssetData, address taker, uint256 makingAmount) private {
        // Patch receiver or validate private order
        address orderTakerAddress = makerAssetData.decodeAddress(_FUNCTION_CALL_OFFSET, _TO_INDEX);
        if (orderTakerAddress != address(0)) {
            require(orderTakerAddress == msg.sender, "LOP: private order");
        }
        if (orderTakerAddress != taker) {
            makerAssetData.patchAddress(_TO_INDEX, taker);
        }
        _makeCall(makerAsset, makerAssetData, makingAmount);
    }

    function _callTakerAssetTransferFrom(address takerAsset, bytes memory takerAssetData, uint256 takingAmount) private {
        // Patch spender
        takerAssetData.patchAddress(_FROM_INDEX, msg.sender);
        _makeCall(takerAsset, takerAssetData, takingAmount);
    }

    function _makeCall(address asset, bytes memory assetData, uint256 amount) private {
        assetData.patchUint256(_AMOUNT_INDEX, amount);
        bytes memory result = asset.functionCall(assetData, "LOP: asset.call failed");
        if (result.length > 0) {
            require(result.decodeBool(_BYTES_OFFSET, 0), "LOP: asset.call bad result");
        }
    }

    function _callGetMakerAmount(Order memory order, uint256 takerAmount) private view returns(uint256 makerAmount) {
        if (order.getMakerAmount.length == 0) {
            // On empty order.getMakerAmount calldata only whole fills are allowed
            require(takerAmount == order.takerAssetData.decodeUint256(_FUNCTION_CALL_OFFSET, _AMOUNT_INDEX), "LOP: wrong taker amount");
            return order.makerAssetData.decodeUint256(_FUNCTION_CALL_OFFSET, _AMOUNT_INDEX);
        }
        bytes memory result = address(this).functionStaticCall(abi.encodePacked(order.getMakerAmount, takerAmount), "LOP: getMakerAmount call failed");
        require(result.length == 32, "LOP: invalid getMakerAmount ret");
        return result.decodeUint256(_BYTES_OFFSET, 0);
    }

    function _callGetTakerAmount(Order memory order, uint256 makerAmount) private view returns(uint256 takerAmount) {
        if (order.getTakerAmount.length == 0) {
            // On empty order.getTakerAmount calldata only whole fills are allowed
            require(makerAmount == order.makerAssetData.decodeUint256(_FUNCTION_CALL_OFFSET, _AMOUNT_INDEX), "LOP: wrong maker amount");
            return order.takerAssetData.decodeUint256(_FUNCTION_CALL_OFFSET, _AMOUNT_INDEX);
        }
        bytes memory result = address(this).functionStaticCall(abi.encodePacked(order.getTakerAmount, makerAmount), "LOP: getTakerAmount call failed");
        require(result.length == 32, "LOP: invalid getTakerAmount ret");
        return result.decodeUint256(_BYTES_OFFSET, 0);
    }
}
