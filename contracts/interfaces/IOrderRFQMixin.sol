// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../OrderRFQLib.sol";

interface IOrderRFQMixin {
    error RFQZeroTargetIsForbidden();
    error RFQPrivateOrder();
    error RFQBadSignature();
    error OrderExpired();
    error MakingAmountExceeded();
    error TakingAmountExceeded();
    error RFQSwapWithZeroAmount();
    error InvalidatedOrder();

    /**
     * @notice Emitted when RFQ gets filled
     * @param orderHash Hash of the order
     * @param makingAmount Amount of the maker asset that was transferred from maker to taker
     */
    event OrderFilledRFQ(
        bytes32 orderHash,
        uint256 makingAmount
    );

     /* @notice Returns bitmask for double-spend invalidators based on lowest byte of order.info and filled quotes
     * @param maker Maker address
     * @param slot Slot number to return bitmask for
     * @return result Each bit represents whether corresponding was already invalidated
     */
    function invalidatorForOrderRFQ(address maker, uint256 slot) external view returns(uint256);

    /**
     * @notice Cancels order's quote
     * @param orderInfo Order info (only order id in lowest 64 bits is used)
     */
    function cancelOrderRFQ(uint256 orderInfo) external;

    /// @notice Cancels multiple order's quotes
    function cancelOrderRFQ(uint256 orderInfo, uint256 additionalMask) external;

    /**
     * @notice Fills order's quote, fully or partially (whichever is possible)
     * @param order Order quote to fill
     * @param signature Signature to confirm quote ownership
     * @param interaction A call data for InteractiveNotificationReceiver. Taker may execute interaction after getting maker assets and before sending taker assets.
     * @param flagsAndAmount Fill configuration flags with amount packed in one slot
     * @return filledMakingAmount Actual amount transferred from maker to taker
     * @return filledTakingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     */
    function fillOrderRFQ(
        OrderRFQLib.OrderRFQ calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 flagsAndAmount
    ) external payable returns(uint256 filledMakingAmount, uint256 filledTakingAmount, bytes32 orderHash);

    /**
     * @notice Fills order's quote, fully or partially, with compact signature
     * @param order Order quote to fill
     * @param r R component of signature
     * @param vs VS component of signature
     * @param interaction A call data for InteractiveNotificationReceiver. Taker may execute interaction after getting maker assets and before sending taker assets.
     * @param flagsAndAmount Fill configuration flags with amount packed in one slot
     * - Bits 0-251 contain the amount to fill
     * - Bit 252 is used to indicate whether weth should be unwrapped to eth
     * - Bit 253 is used to indicate whether signature is 64-bit (0) or 65-bit (1)
     * - Bit 254 is used to indicate whether smart contract (1) signed the order or not (0)
     * - Bit 255 is used to indicate whether maker (1) or taker amount (0) is given in the amount parameter
     * @return filledMakingAmount Actual amount transferred from maker to taker
     * @return filledTakingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     */
    function fillOrderRFQCompact(
        OrderRFQLib.OrderRFQ calldata order,
        bytes32 r,
        bytes32 vs,
        bytes calldata interaction,
        uint256 flagsAndAmount
    ) external payable returns(uint256 filledMakingAmount, uint256 filledTakingAmount, bytes32 orderHash);

    /**
     * @notice Same as `fillOrderRFQTo` but calls permit first.
     * It allows to approve token spending and make a swap in one transaction.
     * Also allows to specify funds destination instead of `msg.sender`
     * @param order Order quote to fill
     * @param signature Signature to confirm quote ownership
     * @param interaction A call data for InteractiveNotificationReceiver. Taker may execute interaction after getting maker assets and before sending taker assets.
     * @param flagsAndAmount Fill configuration flags with amount packed in one slot
     * @param target Address that will receive swap funds
     * @param permit Should contain abi-encoded calldata for `IERC20Permit.permit` call
     * @return filledMakingAmount Actual amount transferred from maker to taker
     * @return filledTakingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     * @dev See tests for examples
     */
    function fillOrderRFQToWithPermit(
        OrderRFQLib.OrderRFQ calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 flagsAndAmount,
        address target,
        bytes calldata permit
    ) external returns(uint256 filledMakingAmount, uint256 filledTakingAmount, bytes32 orderHash);

    /**
     * @notice Same as `fillOrderRFQ` but allows to specify funds destination instead of `msg.sender`
     * @param order Order quote to fill
     * @param signature Signature to confirm quote ownership
     * @param flagsAndAmount Fill configuration flags with amount packed in one slot
     * @param target Address that will receive swap funds
     * @return filledMakingAmount Actual amount transferred from maker to taker
     * @return filledTakingAmount Actual amount transferred from taker to maker
     * @return orderHash Hash of the filled order
     */
    function fillOrderRFQTo(
        OrderRFQLib.OrderRFQ calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 flagsAndAmount,
        address target
    ) external payable returns(uint256 filledMakingAmount, uint256 filledTakingAmount, bytes32 orderHash);
}