// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;
// pragma abicoder v1;

contract DutchAuction {
    function getMakingAmount(bytes calldata data, uint256 actualTakingAmount, uint256 /* remainingAmount */) public view returns(uint256) {
        (
            uint32 startTime,
            uint32 endTime,
            uint256 takingAmountStart,
            uint256 takingAmountEnd,
            uint256 makingAmount
        ) = abi.decode(data, (uint32, uint32, uint256, uint256, uint256));
        uint32 currentTime = block.timestamp <= startTime ? startTime : block.timestamp >= endTime ? endTime : uint32(block.timestamp);
        uint256 maxTakingAmount = (takingAmountStart *  (endTime - currentTime) + takingAmountEnd * (currentTime - startTime)) / (endTime - startTime);
        return actualTakingAmount * makingAmount / maxTakingAmount;
    }

    function getTakingAmount(bytes calldata data, uint256 actualMakingAmount, uint256 /* remainingAmount */) public view returns(uint256) {
        (
            uint32 startTime,
            uint32 endTime,
            uint256 takingAmountStart,
            uint256 takingAmountEnd,
            uint256 makingAmount
        ) = abi.decode(data, (uint32, uint32, uint256, uint256, uint256));
        uint32 currentTime = block.timestamp <= startTime ? startTime : block.timestamp >= endTime ? endTime : uint32(block.timestamp);
        uint256 maxTakingAmount = (takingAmountStart *  (endTime - currentTime) + takingAmountEnd * (currentTime - startTime)) / (endTime - startTime);
        return (actualMakingAmount * maxTakingAmount + makingAmount - 1) / makingAmount;
    }
}
