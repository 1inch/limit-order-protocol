// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "../interfaces/IAmountGetter.sol";

/// @title A helper that implements price decay over time from max to min
/// @notice The contract implements Dutch auction price calculation for 1inch limit orders, it is used by 1inch Fusion
contract DutchAuctionCalculator is IAmountGetter {
    using Math for uint256;

    uint256 private constant _LOW_128_BITS = 0xffffffffffffffffffffffffffffffff;

    function getMakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external view returns (uint256) {
        (
            uint256 startTimeEndTime,
            uint256 takingAmountStart,
            uint256 takingAmountEnd
        ) = abi.decode(extraData, (uint256, uint256, uint256));

        uint256 calculatedTakingAmount = _calculateAuctionTakingAmount(startTimeEndTime, takingAmountStart, takingAmountEnd);
        return order.makingAmount * takingAmount / calculatedTakingAmount;
    }

    function getTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 makingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external view returns (uint256) {
        (
            uint256 startTimeEndTime,
            uint256 takingAmountStart,
            uint256 takingAmountEnd
        ) = abi.decode(extraData, (uint256, uint256, uint256));

        uint256 calculatedTakingAmount = _calculateAuctionTakingAmount(startTimeEndTime, takingAmountStart, takingAmountEnd);
        return (calculatedTakingAmount * makingAmount).ceilDiv(order.makingAmount);
    }

    function _calculateAuctionTakingAmount(uint256 startTimeEndTime, uint256 takingAmountStart, uint256 takingAmountEnd) private view returns(uint256) {
        uint256 startTime = startTimeEndTime >> 128;
        uint256 endTime = startTimeEndTime & _LOW_128_BITS;
        uint256 currentTime = Math.max(startTime, Math.min(endTime, block.timestamp));  // solhint-disable-line not-rely-on-time
        return (takingAmountStart * (endTime - currentTime) + takingAmountEnd * (currentTime - startTime)) / (endTime - startTime);
    }
}
