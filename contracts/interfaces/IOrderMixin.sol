// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

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

    struct FillArgs {
        Order order;    // Order quote to fill
        uint256 amount; // Taker amount to fill
        Limits limits;  // Specifies threshold as maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount. Top-most bit specifies whether taker wants to skip maker's permit.
    }

    error InvalidatedOrder();
    error TakingAmountExceeded();
    error PrivateOrder();
    error BadSignature();
    error OrderExpired();
    error WrongSeriesNonce();
    error SwapWithZeroAmount();
    error PartialFillNotAllowed();
    error OrderIsNotSuitableForMassInvalidation();
    error EpochManagerAndBitInvalidatorsAreIncompatible();
    error ReentrancyDetected();
    error PredicateIsNotTrue();
    error TakingAmountTooHigh();
    error MakingAmountTooLow();
    error TransferFromMakerToTakerFailed();
    error TransferFromTakerToMakerFailed();
    error Permit2TransferFromMakerToTakerFailed();
    error Permit2TransferFromTakerToMakerFailed();
    error MismatchArraysLengths();
    error InvalidPermit2Transfer();

    /**
     * @notice Emitted when order gets filled
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
     * @notice Cancels orders' quotes
     * @param orderConstraints Orders constraints
     * @param orderHashes Hashes of the orders to cancel
     */
    function cancelOrders(Constraints[] calldata orderConstraints, bytes32[] calldata orderHashes) external;

    /**
     * @notice Cancels all quotes of the maker (works for bit-invalidating orders only)
     * @param orderConstraints Order constraints
     * @param additionalMask Additional bitmask to invalidate orders
     */
    function bitsInvalidateForOrder(Constraints orderConstraints, uint256 additionalMask) external;

    /**
     * @notice Returns order hash, hashed with limit order protocol contract EIP712
     * @param order Order
     * @return orderHash Hash of the order
     */
    function hashOrder(IOrderMixin.Order calldata order) external view returns(bytes32 orderHash);

    /**
     * @notice Fills order's quote, fully or partially (whichever is possible)
     * @param args Main fill order arguments
     * @param r R component of signature
     * @param vs VS component of signature
     * @return makingAmount Actual amount transferred from maker to taker
     * @return takingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     */
    function fillOrder(
        FillArgs calldata args,
        bytes32 r,
        bytes32 vs
    ) external payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash);

    /**
     * @notice Same as `fillOrder` but allows to specify funds destination instead of `msg.sender`
     * @param args Main fill order arguments
     * @param r R component of signature
     * @param vs VS component of signature
     * @param target Address that will receive swap funds
     * @param interaction A call data for Interactive. Taker may execute interaction after getting maker assets and before sending taker assets.
     * @return makingAmount Actual amount transferred from maker to taker
     * @return takingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     */
    function fillOrderTo(
        FillArgs calldata args,
        bytes32 r,
        bytes32 vs,
        address target,
        bytes calldata interaction
    ) external payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash);

    function fillOrderToExt(
        FillArgs calldata args,
        bytes32 r,
        bytes32 vs,
        address target,
        bytes calldata interaction,
        bytes calldata extension
    ) external payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash);

    /**
     * @notice Same as `fillOrderTo` but calls permit first.
     * It allows to approve token spending and make a swap in one transaction.
     * Also allows to specify funds destination instead of `msg.sender`
     * @param args Main fill order arguments
     * @param r R component of signature
     * @param vs VS component of signature
     * @param target Address that will receive swap funds
     * @param interaction A call data for Interactive. Taker may execute interaction after getting maker assets and before sending taker assets.
     * @param permit Should contain abi-encoded calldata for `IERC20Permit.permit` call
     * @return makingAmount Actual amount transferred from maker to taker
     * @return takingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     * @dev See tests for examples
     */
    function fillOrderToWithPermit(
        FillArgs calldata args,
        bytes32 r,
        bytes32 vs,
        address target,
        bytes calldata interaction,
        bytes calldata permit
    ) external returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash);

    /**
     * @notice Same as `fillOrderTo` but calls permit first.
     * It allows to approve token spending and make a swap in one transaction.
     * Also allows to specify funds destination instead of `msg.sender`
     * @param args Main fill order arguments
     * @param signature Signature to confirm quote ownership
     * @param target Address that will receive swap funds
     * @param interaction A call data for Interactive. Taker may execute interaction after getting maker assets and before sending taker assets.
     * @param permit Should contain abi-encoded calldata for `IERC20Permit.permit` call
     * @return makingAmount Actual amount transferred from maker to taker
     * @return takingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     * @dev See tests for examples
     */
    function fillContractOrder(
        FillArgs calldata args,
        bytes calldata signature,
        address target,
        bytes calldata interaction,
        bytes calldata permit
    ) external returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash);
}
