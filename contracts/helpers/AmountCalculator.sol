// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "../libraries/Callib.sol";

/// @title A helper contract for calculations related to order amounts
contract AmountCalculator {
    using Callib for address;

    /// @notice Calculates maker amount
    /// @return Result Floored maker amount
    function getMakingAmount(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapTakerAmount) public pure returns(uint256) {
        return swapTakerAmount * orderMakerAmount / orderTakerAmount;
    }

    /// @notice Calculates taker amount
    /// @return Result Ceiled taker amount
    function getTakingAmount(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapMakerAmount) public pure returns(uint256) {
        return (swapMakerAmount * orderTakerAmount + orderMakerAmount - 1) / orderMakerAmount;
    }
}
