// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import "../libraries/ConstraintsLib.sol";
import "../libraries/LimitsLib.sol";

interface IOrderMixin {
    struct Order {
        uint256 salt;
        Address maker;
        Address makerAsset;
        Address takerAsset;
        uint256 makingAmount;
        uint256 takingAmount;
        Constraints constraints;
    }

    error InvalidatedOrder();
    error RFQTakingAmountIncreased();
    error RFQPrivateOrder();
    error RFQBadSignature();
    error RFQOrderExpired();
    error RFQWrongSeriesNonce();
    error MakingAmountExceeded();
    error TakingAmountExceeded();
    error RFQSwapWithZeroAmount();
    error RFQPartialFillNotAllowed();
    error OrderIsnotSuitableForMassInvalidation();
    error EpochManagerAndBitInvalidatorsAreIncompatible();
    error RFQReentrancyDetected();
    error RFQPredicateIsNotTrue();
    error RFQTakingAmountTooHigh();
    error RFQMakingAmountTooLow();
    error RFQTransferFromMakerToTakerFailed();
    error RFQTransferFromTakerToMakerFailed();

    /**
     * @notice Emitted when RFQ gets filled
     * @param orderHash Hash of the order
     * @param makingAmount Amount of the maker asset that was transferred from maker to taker
     */
    event OrderFilled(
        bytes32 orderHash,
        uint256 makingAmount
    );

    /**
     * @notice Returns bitmask for double-spend invalidators based on lowest byte of order.info and filled quotes
     * @param maker Maker address
     * @param slot Slot number to return bitmask for
     * @return result Each bit represents whether corresponding was already invalidated
     */
    function bitInvalidatorForOrder(address maker, uint256 slot) external view returns(uint256 /* result */);

    /**
     * @notice Returns bitmask for double-spend invalidators based on lowest byte of order.info and filled quotes
     * @param orderHash Hash of the order
     * @return remaining Remaining amount of the order
     */
    function remainingInvalidatorForOrder(address maker, bytes32 orderHash) external view returns(uint256 remaining);

    /**
     * @notice Returns bitmask for double-spend invalidators based on lowest byte of order.info and filled quotes
     * @param orderHash Hash of the order
     * @return remainingRaw Remaining amount of the order plus 1 if order was partially filled, otherwise 0
     */
    function rawRemainingInvalidatorForOrder(address maker, bytes32 orderHash) external view returns(uint256 remainingRaw);

    /**
     * @notice Cancels order's quote
     * @param orderConstraints Order constraints
     * @param orderHash Hash of the order to cancel
     */
    function cancelOrder(Constraints orderConstraints, bytes32 orderHash) external;

    /**
     * @notice Cancels all quotes of the maker (works for bit-invalidating orders only)
     * @param orderConstraints Order constraints
     * @param additionalMask Additional bitmask to invalidate orders
     */
    function bitsInvalidateForOrder(Constraints orderConstraints, uint256 additionalMask) external;

    /**
     * @notice Fills order's quote, fully or partially (whichever is possible)
     * @param order Order quote to fill
     * @param r R component of signature
     * @param vs VS component of signature
     * @param amount Taker amount to fill
     * @param limits Specifies threshold as maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount. Top-most bit specifies whether taker wants to skip maker's permit.
     * @return makingAmount Actual amount transferred from maker to taker
     * @return takingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     */
    function fillOrder(
        Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        Limits limits
    ) external payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash);

    /**
     * @notice Same as `fillOrder` but allows to specify funds destination instead of `msg.sender`
     * @param order Order quote to fill
     * @param r R component of signature
     * @param vs VS component of signature
     * @param amount Taker amount to fill
     * @param limits Specifies threshold as maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount. Top-most bit specifies whether taker wants to skip maker's permit.
     * @param target Address that will receive swap funds
     * @param interaction A call data for Interactive. Taker may execute interaction after getting maker assets and before sending taker assets.
     * @return makingAmount Actual amount transferred from maker to taker
     * @return takingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     */
    function fillOrderTo(
        Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        Limits limits,
        address target,
        bytes calldata interaction
    ) external payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash);

    /**
     * @notice Same as `fillOrderTo` but calls permit first.
     * It allows to approve token spending and make a swap in one transaction.
     * Also allows to specify funds destination instead of `msg.sender`
     * @param order Order quote to fill
     * @param r R component of signature
     * @param vs VS component of signature
     * @param amount Taker amount to fill
     * @param limits Specifies threshold as maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount. Top-most bit specifies whether taker wants to skip maker's permit.
     * @param target Address that will receive swap funds
     * @param interaction A call data for Interactive. Taker may execute interaction after getting maker assets and before sending taker assets.
     * @param permit Should contain abi-encoded calldata for `IERC20Permit.permit` call
     * @return makingAmount Actual amount transferred from maker to taker
     * @return takingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     * @dev See tests for examples
     */
    function fillOrderToWithPermit(
        Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        Limits limits,
        address target,
        bytes calldata interaction,
        bytes calldata permit
    ) external returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash);

    /**
     * @notice Same as `fillOrderTo` but calls permit first.
     * It allows to approve token spending and make a swap in one transaction.
     * Also allows to specify funds destination instead of `msg.sender`
     * @param order Order quote to fill
     * @param signature Signature to confirm quote ownership
     * @param amount Taker amount to fill
     * @param limits Specifies threshold as maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount. Top-most bit specifies whether taker wants to skip maker's permit.
     * @param target Address that will receive swap funds
     * @param interaction A call data for Interactive. Taker may execute interaction after getting maker assets and before sending taker assets.
     * @param permit Should contain abi-encoded calldata for `IERC20Permit.permit` call
     * @return makingAmount Actual amount transferred from maker to taker
     * @return takingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     * @dev See tests for examples
     */
    function fillContractOrder(
        Order calldata order,
        bytes calldata signature,
        uint256 amount,
        Limits limits,
        address target,
        bytes calldata interaction,
        bytes calldata permit
    ) external returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash);
}
