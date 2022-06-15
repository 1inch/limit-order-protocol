// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./helpers/AmountCalculator.sol";
import "./helpers/ChainlinkCalculator.sol";
import "./helpers/NonceManager.sol";
import "./helpers/PredicateHelper.sol";
import "./interfaces/NotificationReceiver.sol";
import "./libraries/ArgumentsDecoder.sol";
import "./libraries/Permitable.sol";
import "./libraries/Callib.sol";
import "./OrderLib.sol";

/// @title Regular Limit Order mixin
abstract contract OrderMixin is
    EIP712,
    AmountCalculator,
    ChainlinkCalculator,
    NonceManager,
    PredicateHelper,
    Permitable
{
    using Callib for address;
    using ArgumentsDecoder for bytes;
    using OrderLib for OrderLib.Order;

    /// @notice Emitted every time order gets filled, including partial fills
    event OrderFilled(
        address indexed maker,
        bytes32 orderHash,
        uint256 remaining
    );

    /// @notice Emitted when order gets cancelled
    event OrderCanceled(
        address indexed maker,
        bytes32 orderHash,
        uint256 remainingRaw
    );

    uint256 constant private _ORDER_DOES_NOT_EXIST = 0;
    uint256 constant private _ORDER_FILLED = 1;

    /// @notice Stores unfilled amounts for each order plus one.
    /// Therefore 0 means order doesn't exist and 1 means order was filled
    mapping(bytes32 => uint256) private _remaining;

    /// @notice Returns unfilled amount for order. Throws if order does not exist
    function remaining(bytes32 orderHash) external view returns(uint256) {
        uint256 amount = _remaining[orderHash];
        require(amount != _ORDER_DOES_NOT_EXIST, "LOP: Unknown order");
        unchecked { amount -= 1; }
        return amount;
    }

    /// @notice Returns unfilled amount for order
    /// @return Result Unfilled amount of order plus one if order exists. Otherwise 0
    function remainingRaw(bytes32 orderHash) external view returns(uint256) {
        return _remaining[orderHash];
    }

    /// @notice Same as `remainingRaw` but for multiple orders
    function remainingsRaw(bytes32[] memory orderHashes) external view returns(uint256[] memory) {
        uint256[] memory results = new uint256[](orderHashes.length);
        for (uint256 i = 0; i < orderHashes.length; i++) {
            results[i] = _remaining[orderHashes[i]];
        }
        return results;
    }

    error SimulationResults(bool success, bytes res);

    /**
     * @notice Delegates execution to custom implementation. Could be used to validate if `transferFrom` works properly
     * @param target Addresses that will be delegated
     * @param data Data that will be passed to delegatee
     */
    function simulate(address target, bytes calldata data) external {
        // solhint-disable-next-lineavoid-low-level-calls
        (bool success, bytes memory result) = target.delegatecall(data);
        revert SimulationResults(success, result);
    }

    /// @notice Cancels order by setting remaining amount to zero
    function cancelOrder(OrderLib.Order calldata order) external returns(uint256 orderRemaining, bytes32 orderHash) {
        require(order.maker == msg.sender, "LOP: Access denied");

        orderHash = hashOrder(order);
        orderRemaining = _remaining[orderHash];
        require(orderRemaining != _ORDER_FILLED, "LOP: already filled");
        emit OrderCanceled(msg.sender, orderHash, orderRemaining);
        _remaining[orderHash] = _ORDER_FILLED;
    }

    /// @notice Fills an order. If one doesn't exist (first fill) it will be created using order.makerAssetData
    /// @param order Order quote to fill
    /// @param signature Signature to confirm quote ownership
    /// @param makingAmount Making amount
    /// @param takingAmount Taking amount
    /// @param thresholdAmount Specifies maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount
    function fillOrder(
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount
    ) external returns(uint256 /* actualMakingAmount */, uint256 /* actualTakingAmount */, bytes32 orderHash) {
        return fillOrderTo(order, signature, interaction, makingAmount, takingAmount, thresholdAmount, msg.sender);
    }

    /// @notice Same as `fillOrder` but calls permit first,
    /// allowing to approve token spending and make a swap in one transaction.
    /// Also allows to specify funds destination instead of `msg.sender`
    /// @param order Order quote to fill
    /// @param signature Signature to confirm quote ownership
    /// @param makingAmount Making amount
    /// @param takingAmount Taking amount
    /// @param thresholdAmount Specifies maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount
    /// @param target Address that will receive swap funds
    /// @param permit Should consist of abiencoded token address and encoded `IERC20Permit.permit` call.
    /// @dev See tests for examples
    function fillOrderToWithPermit(
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount,
        address target,
        bytes calldata permit
    ) external returns(uint256 /* actualMakingAmount */, uint256 /* actualTakingAmount */, bytes32 orderHash) {
        require(permit.length >= 20, "LOP: permit length too low");
        {  // Stack too deep
            (address token, bytes calldata permitData) = permit.decodeTargetAndCalldata();
            _permit(token, permitData);
        }
        return fillOrderTo(order, signature, interaction, makingAmount, takingAmount, thresholdAmount, target);
    }

    /// @notice Same as `fillOrder` but allows to specify funds destination instead of `msg.sender`
    /// @param order_ Order quote to fill
    /// @param signature Signature to confirm quote ownership
    /// @param makingAmount Making amount
    /// @param takingAmount Taking amount
    /// @param thresholdAmount Specifies maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount
    /// @param target Address that will receive swap funds
    function fillOrderTo(
        OrderLib.Order calldata order_,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount,
        address target
    ) public returns(uint256 /* actualMakingAmount */, uint256 /* actualTakingAmount */, bytes32 orderHash) {
        require(target != address(0), "LOP: zero target is forbidden");
        orderHash = hashOrder(order_);

        OrderLib.Order calldata order = order_; // Helps with "Stack too deep"

        {  // Stack too deep
            uint256 remainingMakerAmount = _remaining[orderHash];
            require(remainingMakerAmount != _ORDER_FILLED, "LOP: remaining amount is 0");
            require(order.allowedSender == address(0) || order.allowedSender == msg.sender, "LOP: private order");
            if (remainingMakerAmount == _ORDER_DOES_NOT_EXIST) {
                // First fill: validate order and permit maker asset
                require(SignatureChecker.isValidSignatureNow(order.maker, orderHash, signature), "LOP: bad signature");
                remainingMakerAmount = order.makingAmount;

                bytes calldata permit = order.permit(); // Helps with "Stack too deep"
                if (permit.length >= 20) {
                    // proceed only if permit length is enough to store address
                    (address token, bytes calldata permitCalldata) = permit.decodeTargetAndCalldata();
                    _permit(token, permitCalldata);
                    require(_remaining[orderHash] == _ORDER_DOES_NOT_EXIST, "LOP: reentrancy detected");
                }
            } else {
                unchecked { remainingMakerAmount -= 1; }
            }

            // Check if order is valid
            if (order.predicate().length > 0) {
                require(checkPredicate(order), "LOP: predicate is not true");
            }

            // Compute maker and taker assets amount
            if ((takingAmount == 0) == (makingAmount == 0)) {
                revert("LOP: only one amount should be 0");
            } else if (takingAmount == 0) {
                uint256 requestedMakingAmount = makingAmount;
                if (makingAmount > remainingMakerAmount) {
                    makingAmount = remainingMakerAmount;
                }
                takingAmount = _callGetter(order.getTakingAmount(), order.makingAmount, makingAmount, order.takingAmount);
                // check that actual rate is not worse than what was expected
                // takingAmount / makingAmount <= thresholdAmount / requestedMakingAmount
                require(takingAmount * requestedMakingAmount <= thresholdAmount * makingAmount, "LOP: taking amount too high");
            } else {
                uint256 requestedTakingAmount = takingAmount;
                makingAmount = _callGetter(order.getMakingAmount(), order.takingAmount, takingAmount, order.makingAmount);
                if (makingAmount > remainingMakerAmount) {
                    makingAmount = remainingMakerAmount;
                    takingAmount = _callGetter(order.getTakingAmount(), order.makingAmount, makingAmount, order.takingAmount);
                }
                // check that actual rate is not worse than what was expected
                // makingAmount / takingAmount >= thresholdAmount / requestedTakingAmount
                require(makingAmount * requestedTakingAmount >= thresholdAmount * takingAmount, "LOP: making amount too low");
            }

            require(makingAmount > 0 && takingAmount > 0, "LOP: can't swap 0 amount");

            // Update remaining amount in storage
            unchecked {
                remainingMakerAmount = remainingMakerAmount - makingAmount;
                _remaining[orderHash] = remainingMakerAmount + 1;
            }
            emit OrderFilled(msg.sender, orderHash, remainingMakerAmount);
        }

        // Maker can handle funds interactively
        if (order.preInteraction().length >= 20) {
            // proceed only if interaction length is enough to store address
            (address interactionTarget, bytes calldata interactionData) = order.preInteraction().decodeTargetAndCalldata();
            PreInteractionNotificationReceiver(interactionTarget).fillOrderPreInteraction(
                msg.sender, order.makerAsset, order.takerAsset, makingAmount, takingAmount, interactionData
            );
        }

        // Maker => Taker
        require(_callTransferFrom(
            order.makerAsset,
            order.maker,
            target,
            makingAmount,
            order.makerAssetData()
        ), "LOP: maker to taker failed");

        if (interaction.length >= 20) {
            // proceed only if interaction length is enough to store address
            (address interactionTarget, bytes calldata interactionData) = interaction.decodeTargetAndCalldata();
            InteractionNotificationReceiver(interactionTarget).fillOrderInteraction(
                msg.sender, order.makerAsset, order.takerAsset, makingAmount, takingAmount, interactionData
            );
        }

        // Taker => Maker
        require(_callTransferFrom(
            order.takerAsset,
            msg.sender,
            order.receiver == address(0) ? order.maker : order.receiver,
            takingAmount,
            order.takerAssetData()
        ), "LOP: taker to maker failed");

        // Maker can handle funds interactively
        if (order.postInteraction().length >= 20) {
            // proceed only if interaction length is enough to store address
            (address interactionTarget, bytes calldata interactionData) = order.postInteraction().decodeTargetAndCalldata();
            PostInteractionNotificationReceiver(interactionTarget).fillOrderPostInteraction(
                msg.sender, order.makerAsset, order.takerAsset, makingAmount, takingAmount, interactionData
            );
        }

        return (makingAmount, takingAmount, orderHash);
    }

    /// @notice Checks order predicate
    function checkPredicate(OrderLib.Order calldata order) public view returns(bool) {
        (bool success, uint256 res) = address(this).staticcallForUint(order.predicate());
        return success && res == 1;
    }

    function hashOrder(OrderLib.Order calldata order) public view returns(bytes32) {
        return _hashTypedDataV4(order.hash());
    }

    function _callTransferFrom(address asset, address from, address to, uint256 amount, bytes calldata input) private returns(bool success) {
        bytes4 selector = IERC20.transferFrom.selector;
        assembly { // solhint-disable-line no-inline-assembly
            let data := mload(0x40)
            mstore(0x40, add(data, add(100, input.length)))

            mstore(data, selector)
            mstore(add(data, 0x04), from)
            mstore(add(data, 0x24), to)
            mstore(add(data, 0x44), amount)
            calldatacopy(add(data, 0x64), input.offset, input.length)
            let status := call(gas(), asset, 0, data, add(100, input.length), 0x0, 0x20)
            success := and(status, or(iszero(returndatasize()), and(gt(returndatasize(), 31), eq(mload(0), 1))))
        }
    }

    function _callGetter(bytes calldata getter, uint256 orderExpectedAmount, uint256 amount, uint256 orderResultAmount) private view returns(uint256) {
        if (getter.length == 0) {
            // On empty getter calldata only exact amount is allowed
            require(amount == orderExpectedAmount, "LOP: wrong amount");
            return orderResultAmount;
        } else if (getter.length == 1) {
            // Linear proportion
            if (getter[0] == "m") {
                return amount * orderExpectedAmount / orderResultAmount;
            } else if (getter[0] == "t") {
                return (amount * orderResultAmount + orderExpectedAmount - 1) / orderExpectedAmount;
            } else {
                revert("LOP: wrong getter");
            }
        } else {
            (bool success, bytes memory result) = address(this).staticcall(abi.encodePacked(getter, amount));
            require(success && result.length == 32, "LOP: getAmount call failed");
            return result.decodeUint256Memory();
        }
    }
}
