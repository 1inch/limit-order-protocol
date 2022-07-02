// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "../libraries/Math.sol";

/**
 * Range limit order is used to sell an asset within a given price range.
 * For example, right now ETH is worth 3000 DAI and you believe that within the next week the price of ETH will rise and reach at least 4000 DAI.
 * In this case, you can create an ETH -> DAI limit order with a price range of 3000 -> 4000.
 * Let's say you created a similar order for the amount of 10 ETH.
 * Someone can file the entire limit at once at an average price of 3500 DAI.
 * But it is also possible that the limit-order will be filed in parts.
 * First, someone buys 1 ETH at the price of 3050 DAI, then another 1 ETH at the price of 3150 DAI, and so on.
 */
contract RangeAmountCalculator {

    function getRangeTakerAmount(
        uint256 priceStart,
        uint256 priceEnd,
        uint256 totalLiquidity,
        uint256 fillAmount,
        uint256 filledFor
    ) public pure returns(uint256) {
        unchecked {
            uint256 remainingLiquidity = totalLiquidity - filledFor;
            uint256 filledForAfterFill = filledFor + fillAmount;
            uint256 remainingLiquidityAfterFill = remainingLiquidity - fillAmount;

            uint256 amountBeforeFill = priceStart * remainingLiquidity + priceEnd * filledFor;
            uint256 amountAfterFill = priceStart * remainingLiquidityAfterFill + priceEnd * filledForAfterFill;
            uint256 price = (amountBeforeFill + amountAfterFill) / totalLiquidity / 2;

            return fillAmount * price / 1e18;
        }
    }

    function getRangeMakerAmount(
        uint256 priceStart,
        uint256 priceEnd,
        uint256 totalLiquidity,
        uint256 takingAmount,
        uint256 filledFor
    ) public pure returns(uint256) {
        unchecked {
            uint256 priceRangeDiff = priceEnd - priceStart;
            uint256 liquidityRemaining = totalLiquidity - filledFor;
            uint256 priceStartSqr = priceStart * priceStart;

            uint256 d = 4 * (
                2 * totalLiquidity * takingAmount * priceRangeDiff
                + priceEnd * priceEnd * filledFor * filledFor
                + priceStartSqr * totalLiquidity * totalLiquidity
                + priceStartSqr * filledFor * filledFor
                - 2 * priceStartSqr * totalLiquidity * filledFor
                + 2 * priceStart * priceEnd * filledFor * liquidityRemaining
            );

            return (Math.sqrt(d / 4) - priceStart * liquidityRemaining - priceEnd * filledFor) / priceRangeDiff / 1e18;
        }
    }
}
