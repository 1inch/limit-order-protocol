// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;
pragma abicoder v1;

/// @title A helper contract for calculations related to order amounts
library AmountCalculator {
    /// @notice Calculates maker amount
    /// @return Result Floored maker amount
    function getMakingAmount(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapTakerAmount) internal pure returns(uint256) {
        return swapTakerAmount * orderMakerAmount / orderTakerAmount;
    }

    /// @notice Calculates taker amount
    /// @return Result Ceiled taker amount
    function getTakingAmount(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapMakerAmount) internal pure returns(uint256) {
        return (swapMakerAmount * orderTakerAmount + orderMakerAmount - 1) / orderMakerAmount;
    }
}
