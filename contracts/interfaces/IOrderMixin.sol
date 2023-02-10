// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../OrderLib.sol";
import "../libraries/InputLib.sol";

interface IOrderMixin {
    error WrongNonce();
    error WrongSeriesNonce();
    error UnknownOrder();
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
     * @param maker Maker address
     * @param orderHash Order's hash. Can be obtained by the `hashOrder` function
     * @return amount Unfilled amount
     */
    function remaining(address maker, bytes32 orderHash) external view returns(uint256 amount);

    /**
     * @notice Returns unfilled amount for order
     * @param maker Maker address
     * @param orderHash Order's hash. Can be obtained by the `hashOrder` function
     * @return rawAmount Unfilled amount of order plus one if order exists. Otherwise 0
     */
    function remainingRaw(address maker, bytes32 orderHash) external view returns(uint256 rawAmount);

    /**
     * @notice Same as `remainingRaw` but for multiple orders
     * @param makers Array of makers addresses
     * @param orderHashes Array of hashes
     * @return rawAmounts Array of amounts for each order plus one if order exists or 0 otherwise
     */
    function remainingsRaw(address[] calldata makers, bytes32[] calldata orderHashes) external view returns(uint256[] memory rawAmounts);

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
     * @notice Cancels order of msg.sender
     * @dev Order is cancelled by setting remaining amount to _ORDER_FILLED value
     * @param orderHash Hash of the order to cancel
     * @return orderRemaining Unfilled amount of order before cancellation
     */
    function cancelOrder(bytes32 orderHash) external returns(uint256 orderRemaining);

    /**
     * @notice Cancels multiple orders of msg.sender
     * @dev Order is cancelled by setting remaining amount to _ORDER_FILLED value
     * @param orderHashes Array of hashes of orders to cancel
     * @return orderRemaining Array of unfilled amounts of orders before cancellation
     */
    function cancelOrders(bytes32[] calldata orderHashes) external returns(uint256[] memory orderRemaining);

    /**
     * @notice Fills an order. If one doesn't exist (first fill) it will be created using order.makerAssetData
     * @param order Order quote to fill
     * @param r R part of the signature
     * @param vs V and S parts of the signature
     * @param input Fill configuration flags with amount packed in one slot
     * @param threshold Specifies maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount. Top-most bit specifies whether taker wants to skip maker's permit.
     * @return makingAmount Actual amount transferred from maker to taker
     * @return takingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     */
    function fillOrder(
        OrderLib.Order calldata order,
        bytes32 r,
        bytes32 vs,
        Input input,
        uint256 threshold
    ) external payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash);

    /**
     * @notice Same as `fillOrder` but works only on prefiller orders
     * @param order Order quote to fill
     * @param maker Maker address
     * @param input Fill configuration flags with amount packed in one slot
     * @param threshold Specifies maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount. Top-most bit specifies whether taker wants to skip maker's permit.
     */
    function refillOrder(
        OrderLib.Order calldata order,
        Address maker,
        Input input,
        uint256 threshold
    ) external payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash);

    /**
     * @notice Same as `fillOrder` but allows to specify funds destination instead of `msg.sender`
     * @param order_ Order quote to fill
     * @param r R part of the signature
     * @param vs V and S parts of the signature
     * @param input Fill configuration flags with amount packed in one slot
     * @param threshold Specifies maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount. Top-most bit specifies whether taker wants to skip maker's permit.
     * @param target Address that will receive swap funds
     * @param interaction A call data for Interactive. Taker may execute interaction after getting maker assets and before sending taker assets.
     * @return makingAmount Actual amount transferred from maker to taker
     * @return takingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     */
    function fillOrderTo(
        OrderLib.Order calldata order_,
        bytes32 r,
        bytes32 vs,
        Input input,
        uint256 threshold,
        address target,
        bytes calldata interaction
    ) external payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash);

    /**
     * @notice Same as `fillOrderTo` but calls permit first,
     * allowing to approve token spending and make a swap in one transaction.
     * Also allows to specify funds destination instead of `msg.sender`
     * @dev See tests for examples
     * @param order Order quote to fill
     * @param r R part of the signature
     * @param vs V and S parts of the signature
     * @param input Fill configuration flags with amount packed in one slot
     * @param threshold Specifies maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount. Top-most bit specifies whether taker wants to skip maker's permit.
     * @param target Address that will receive swap funds
     * @param interaction A call data for Interactive. Taker may execute interaction after getting maker assets and before sending taker assets.
     * @param permit Should consist of abiencoded token address and encoded `IERC20Permit.permit` call.
     * @return makingAmount Actual amount transferred from maker to taker
     * @return takingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     */
    function fillOrderToWithPermit(
        OrderLib.Order calldata order,
        bytes32 r,
        bytes32 vs,
        Input input,
        uint256 threshold,
        address target,
        bytes calldata interaction,
        bytes calldata permit
    ) external returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash);

    /**
     * @notice Same as `fillOrderTo` but calls permit first,
     * allowing to approve token spending and make a swap in one transaction.
     * Also allows to specify funds destination instead of `msg.sender`
     * @dev See tests for examples
     * @param order Order quote to fill
     * @param signature Signature to confirm quote ownership
     * @param maker Smart contract that signed the order
     * @param input Fill configuration flags with amount packed in one slot
     * @param threshold Specifies maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount. Top-most bit specifies whether taker wants to skip maker's permit.
     * @param target Address that will receive swap funds
     * @param interaction A call data for Interactive. Taker may execute interaction after getting maker assets and before sending taker assets.
     * @param permit Should consist of abiencoded token address and encoded `IERC20Permit.permit` call.
     * @return makingAmount Actual amount transferred from maker to taker
     * @return takingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     */
    function fillContractOrder(
        OrderLib.Order calldata order,
        bytes calldata signature,
        Address maker,
        Input input,
        uint256 threshold,
        address target,
        bytes calldata interaction,
        bytes calldata permit
    ) external returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash);
}
