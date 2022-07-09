// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@1inch/solidity-utils/contracts/interfaces/IWETH.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/ECDSA.sol";

import "./helpers/AmountCalculator.sol";
import "./helpers/NonceManager.sol";
import "./helpers/PredicateHelper.sol";
import "./interfaces/IOrderMixin.sol";
import "./interfaces/NotificationReceiver.sol";
import "./libraries/ArgumentsDecoder.sol";
import "./libraries/Callib.sol";
import "./libraries/Errors.sol";
import "./OrderLib.sol";

/// @title Regular Limit Order mixin
abstract contract OrderMixin is IOrderMixin, EIP712, AmountCalculator, NonceManager, PredicateHelper, IERC721 {
    using Callib for address;
    using SafeERC20 for IERC20;
    using ArgumentsDecoder for bytes;
    using OrderLib for OrderLib.Order;
    using OrderLib for OrderLib.NFTOrder;

    error UnknownOrder();
    error AccessDenied();
    error AlreadyFilled();
    error PermitLengthTooLow();
    error ZeroTargetIsForbidden();
    error RemainingAmountIsZero();
    error PrivateOrder();
    error BadSignature();
    error ReentrancyDetected();
    error PredicateIsNotTrue();
    error OnlyOneAmountShouldBeZero();
    error TakingAmountTooHigh();
    error MakingAmountTooLow();
    error SwapWithZeroAmount();
    error TransferFromMakerToTakerFailed();
    error TransferFromTakerToMakerFailed();
    error WrongAmount();
    error WrongGetter();
    error GetAmountCallFailed();

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

    IWETH private immutable _WETH;  // solhint-disable-line var-name-mixedcase
    /// @notice Stores unfilled amounts for each order plus one.
    /// Therefore 0 means order doesn't exist and 1 means order was filled
    mapping(bytes32 => uint256) private _remaining;

    constructor(IWETH weth) {
        _WETH = weth;
    }

    /**
     * @notice See {IOrderMixin-remaining}.
     */
    function remaining(bytes32 orderHash) external view returns(uint256 /* amount */) {
        uint256 amount = _remaining[orderHash];
        if (amount == _ORDER_DOES_NOT_EXIST) revert UnknownOrder();
        unchecked { amount -= 1; }
        return amount;
    }

    /**
     * @notice See {IOrderMixin-remainingRaw}.
     */
    function remainingRaw(bytes32 orderHash) external view returns(uint256 /* rawAmount */) {
        return _remaining[orderHash];
    }

    /**
     * @notice See {IOrderMixin-remainingsRaw}.
     */
    function remainingsRaw(bytes32[] memory orderHashes) external view returns(uint256[] memory /* rawAmounts */) {
        uint256[] memory results = new uint256[](orderHashes.length);
        for (uint256 i = 0; i < orderHashes.length; i++) {
            results[i] = _remaining[orderHashes[i]];
        }
        return results;
    }

    error SimulationResults(bool success, bytes res);

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
    function cancelOrder(OrderLib.Order calldata order) external returns(uint256 orderRemaining, bytes32 orderHash) {
        if (order.maker != msg.sender) revert AccessDenied();

        orderHash = hashOrder(order);
        orderRemaining = _remaining[orderHash];
        if (orderRemaining == _ORDER_FILLED) revert AlreadyFilled();
        emit OrderCanceled(msg.sender, orderHash, orderRemaining);
        _remaining[orderHash] = _ORDER_FILLED;
    }

    /**
     * @notice See {IOrderMixin-fillOrder}.
     */
    
    function fillOrderNFTnoSwap(
        OrderLib.NFTOrder calldata order,
        bytes calldata signature,
        bytes calldata interaction
    ) external payable returns(bytes32 /* orderHash */) {
        return fillNFTOrderTo(order, signature, interaction, msg.sender);
    }
    
    function fillOrderNFTwithSwap(
        OrderLib.NFTOrder calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 takingAmount,
        uint256 thresholdAmount
    ) external payable returns(bytes32 /* orderHash */) {
        return fillNFTOrderTo(order, signature, interaction, msg.sender);
    }

    /**
     * @notice See {IOrderMixin-fillOrderToWithPermit}.
     */
    
    function fillNFTOrderTo(
        OrderLib.NFTOrder calldata order_,
        bytes calldata signature,
        bytes calldata interaction,
        address target
    ) public payable returns(bytes32 orderHash) {
        if (target == address(0)) revert ZeroTargetIsForbidden();
        orderHash = '0x0';

        OrderLib.NFTOrder calldata order = order_; // Helps with "Stack too deep"
        

        uint256 remainingMakerAmount = _remaining[orderHash];
        if (remainingMakerAmount == _ORDER_FILLED) revert RemainingAmountIsZero();
        if (order.allowedSender != address(0) && order.allowedSender != msg.sender) revert PrivateOrder();
        if (remainingMakerAmount == _ORDER_DOES_NOT_EXIST) {
            // First fill: validate order and permit maker asset
            if (!ECDSA.recoverOrIsValidSignature(order.seller, orderHash, signature)) revert BadSignature();
            remainingMakerAmount = 1;

            //PERMIT DATA REMOVED
            // This line needs to permit the seller to sell the NFT
            // bytes calldata permit = order.permit(); 
            
            
        } else {
            unchecked { remainingMakerAmount -= 1; }
        }

        // PREDICATE INFORMATION REMOVED
        // Check if order is valid
        

        // Compute maker and taker assets amount

        // Maker => Taker
        if (!_callTransferNFTFrom(
            order.NFTAddress,
            order.seller,
            target,
            order.tokenID
        )) revert TransferFromMakerToTakerFailed();

        // Taker => Maker
        if (order.offerAsset == address(_WETH) && msg.value > 0) {
            if (msg.value != order.offerAmount) revert InvalidMsgValue();
            _WETH.deposit{ value: order.offerAmount }();
            _WETH.transfer(order.receiver == address(0) ? order.seller : order.receiver, order.offerAmount);
        } else {
            if (msg.value != 0) revert InvalidMsgValue();
            if (!_callTransferFrom(
                order.offerAsset,
                msg.sender,
                order.receiver == address(0) ? order.seller : order.receiver,
                order.offerAmount
            )) revert TransferFromTakerToMakerFailed();
        }

        // CONFIRMATION EVENT REMOVED
        
    }

    /**
     * @notice See {IOrderMixin-fillOrderTo}.
     */
    
    /**
     * @notice See {IOrderMixin-checkPredicate}.
     */
    function checkPredicate(OrderLib.Order calldata order) public view returns(bool) {
        (bool success, uint256 res) = _selfStaticCall(order.predicate());
        return success && res == 1;
    }

    /**
     * @notice See {IOrderMixin-hashOrder}.
     */
    function hashOrder(OrderLib.Order calldata order) public view returns(bytes32) {
        return order.hash(_domainSeparatorV4());
    }


    function _callTransferNFTFrom(address asset, address from, address to, uint256 tokenID) private returns(bool success) {
        IERC721(asset).transferFrom(from, to, tokenID);
    }



    function _callTransferFrom(address asset, address from, address to, uint256 amount) private returns(bool success) {
        IERC20(asset).transferFrom( from, to, amount);
    }



    function _getMakingAmount(bytes calldata getter, bytes32 orderHash, uint256 orderExpectedAmount, uint256 amount, uint256 orderResultAmount, uint256 remainingAmount) private view returns(uint256) {
        if (getter.length == 0) {
            // Linear proportion
            return getMakingAmount(orderResultAmount, orderExpectedAmount, amount);
        }
        return _callGetter(getter, orderHash, orderExpectedAmount, amount, orderResultAmount, remainingAmount);
    }

    function _getTakingAmount(bytes calldata getter, bytes32 orderHash, uint256 orderExpectedAmount, uint256 amount, uint256 orderResultAmount, uint256 remainingAmount) private view returns(uint256) {
        if (getter.length == 0) {
            // Linear proportion
            return getTakingAmount(orderExpectedAmount, orderResultAmount, amount);
        }
        return _callGetter(getter, orderHash, orderExpectedAmount, amount, orderResultAmount, remainingAmount);
    }

    function _callGetter(bytes calldata getter, bytes32 orderHash, uint256 orderExpectedAmount, uint256 amount, uint256 orderResultAmount, uint256 remainingAmount) private view returns(uint256) {
        if (getter.length == 1) {
            if (OrderLib.getterIsFrozen(getter)) {
                // On "x" getter calldata only exact amount is allowed
                if (amount != orderExpectedAmount) revert WrongAmount();
                return orderResultAmount;
            } else {
                revert WrongGetter();
            }
        } else {
            (address target, bytes calldata data) = getter.decodeTargetAndCalldata();
            (bool success, bytes memory result) = target.staticcall(abi.encodePacked(data, amount, remainingAmount, orderHash));
            if (!success || result.length != 32) revert GetAmountCallFailed();
            return abi.decode(result, (uint256));
        }
    }
}
