// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;
pragma abicoder v1;

contract DutchAuctionCalculator {
    uint256 private constant _LOW_128_BITS = 0xffffffffffffffffffffffffffffffff;

    function getMakingAmount(uint256 startTimeEndTime, uint256 takingAmountStart, uint256 takingAmountEnd, uint256 makingAmount, uint256 requestedTakingAmount) external view returns(uint256) {
        uint256 calculatedTakingAmount = _calculateAuctionTakingAmount(startTimeEndTime, takingAmountStart, takingAmountEnd);
        return requestedTakingAmount * makingAmount / calculatedTakingAmount;
    }

    function getTakingAmount(uint256 startTimeEndTime, uint256 takingAmountStart, uint256 takingAmountEnd, uint256 makingAmount, uint256 requestedMakingAmount) external view returns(uint256) {
        uint256 calculatedTakingAmount = _calculateAuctionTakingAmount(startTimeEndTime, takingAmountStart, takingAmountEnd);
        return (requestedMakingAmount * calculatedTakingAmount + makingAmount - 1) / makingAmount;
    }

    function _calculateAuctionTakingAmount(uint256 startTimeEndTime, uint256 takingAmountStart, uint256 takingAmountEnd) private view returns(uint256) {
        uint256 startTime = startTimeEndTime >> 128;
        uint256 endTime = startTimeEndTime & _LOW_128_BITS;
        // solhint-disable-next-line not-rely-on-time
        uint256 currentTime = block.timestamp < startTime ? startTime : block.timestamp > endTime ? endTime : block.timestamp;
        return (takingAmountStart * (endTime - currentTime) + takingAmountEnd * (currentTime - startTime)) / (endTime - startTime);
    }
}
