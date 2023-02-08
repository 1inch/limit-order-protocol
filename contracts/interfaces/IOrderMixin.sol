// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../OrderLib.sol";
import "../libraries/InputLib.sol";

interface IOrderMixin {
    error UnknownOrder();
    error AccessDenied();
    error AlreadyFilled();
    error PermitLengthTooLow();
    error RemainingAmountIsZero();
    error PrivateOrder();
    error OrderExpired();
    error BadSignature();
    error ReentrancyDetected();
    error PredicateIsNotTrue();
    error TakingAmountTooHigh();
    error MakingAmountTooLow();
    error SwapWithZeroAmount();
    error TransferFromMakerToTakerFailed();
    error TransferFromTakerToMakerFailed();
    error TakingAmountIncreased();
    error SimulationResults(bool success, bytes res);

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

    /**
     * @notice Returns unfilled amount for order. Throws if order does not exist
     * @param orderHash Order's hash. Can be obtained by the `hashOrder` function
     * @return amount Unfilled amount
     */
    function remaining(bytes32 orderHash) external view returns(uint256 amount);

    /**
     * @notice Returns unfilled amount for order
     * @param orderHash Order's hash. Can be obtained by the `hashOrder` function
     * @return rawAmount Unfilled amount of order plus one if order exists. Otherwise 0
     */
    function remainingRaw(bytes32 orderHash) external view returns(uint256 rawAmount);

    /**
     * @notice Same as `remainingRaw` but for multiple orders
     * @param orderHashes Array of hashes
     * @return rawAmounts Array of amounts for each order plus one if order exists or 0 otherwise
     */
    function remainingsRaw(bytes32[] memory orderHashes) external view returns(uint256[] memory rawAmounts);

    /**
     * @notice Checks order predicate
     * @param predicate Order predicate to check
     * @return result Predicate evaluation result. True if predicate allows to fill the order, false otherwise
     */
    function checkPredicate(bytes calldata predicate) external view returns(bool result);

    /**
     * @notice Returns order hash according to EIP712 standard
     * @param order Order to get hash for
     * @return orderHash Hash of the order
     */
    function hashOrder(OrderLib.Order calldata order) external view returns(bytes32 orderHash);

    /**
     * @notice Delegates execution to custom implementation. Could be used to validate if `transferFrom` works properly
     * @dev The function always reverts and returns the simulation results in revert data.
     * @param target Addresses that will be delegated
     * @param data Data that will be passed to delegatee
     */
    function simulate(address target, bytes calldata data) external;

    /**
     * @notice Cancels order.
     * @dev Order is cancelled by setting remaining amount to _ORDER_FILLED value
     * @param order Order quote to cancel
     * @return orderRemaining Unfilled amount of order before cancellation
     * @return orderHash Hash of the filled order
     */
    function cancelOrder(OrderLib.Order calldata order) external returns(uint256 orderRemaining, bytes32 orderHash);

    /**
     * @notice Fills an order. If one doesn't exist (first fill) it will be created using order.makerAssetData
     * @param order Order quote to fill
     * @param signature Signature to confirm quote ownership
     * @param interaction A call data for InteractiveNotificationReceiver. Taker may execute interaction after getting maker assets and before sending taker assets.
     * @param input Fill configuration flags with amount packed in one slot
     * @param skipPermitAndThresholdAmount Specifies maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount. Top-most bit specifies whether taker wants to skip maker's permit.
     * @return actualMakingAmount Actual amount transferred from maker to taker
     * @return actualTakingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     */
    function fillOrder(
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        Input input,
        uint256 skipPermitAndThresholdAmount
    ) external payable returns(uint256 actualMakingAmount, uint256 actualTakingAmount, bytes32 orderHash);

    /**
     * @notice Same as `fillOrderTo` but calls permit first,
     * allowing to approve token spending and make a swap in one transaction.
     * Also allows to specify funds destination instead of `msg.sender`
     * @dev See tests for examples
     * @param order Order quote to fill
     * @param signature Signature to confirm quote ownership
     * @param interaction A call data for InteractiveNotificationReceiver. Taker may execute interaction after getting maker assets and before sending taker assets.
     * @param input Fill configuration flags with amount packed in one slot
     * @param skipPermitAndThresholdAmount Specifies maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount. Top-most bit specifies whether taker wants to skip maker's permit.
     * @param target Address that will receive swap funds
     * @param permit Should consist of abiencoded token address and encoded `IERC20Permit.permit` call.
     * @return actualMakingAmount Actual amount transferred from maker to taker
     * @return actualTakingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     */
    function fillOrderToWithPermit(
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        Input input,
        uint256 skipPermitAndThresholdAmount,
        address target,
        bytes calldata permit
    ) external returns(uint256 actualMakingAmount, uint256 actualTakingAmount, bytes32 orderHash);

    /**
     * @notice Same as `fillOrder` but allows to specify funds destination instead of `msg.sender`
     * @param order_ Order quote to fill
     * @param signature Signature to confirm quote ownership
     * @param interaction A call data for InteractiveNotificationReceiver. Taker may execute interaction after getting maker assets and before sending taker assets.
     * @param input Fill configuration flags with amount packed in one slot
     * @param skipPermitAndThresholdAmount Specifies maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount. Top-most bit specifies whether taker wants to skip maker's permit.
     * @param target Address that will receive swap funds
     * @return actualMakingAmount Actual amount transferred from maker to taker
     * @return actualTakingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     */
    function fillOrderTo(
        OrderLib.Order calldata order_,
        bytes calldata signature,
        bytes calldata interaction,
        Input input,
        uint256 skipPermitAndThresholdAmount,
        address target
    ) external payable returns(uint256 actualMakingAmount, uint256 actualTakingAmount, bytes32 orderHash);
}
