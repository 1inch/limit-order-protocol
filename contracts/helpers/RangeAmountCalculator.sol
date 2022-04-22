// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

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
            // TODO: looks like wrong formula. Because when we fill a full order at the start we never get the end price
            uint256 price = (amountBeforeFill + amountAfterFill) / totalLiquidity / 2;

            return fillAmount * price;
        }
    }

    function getRangeMakerAmount(
            uint256 priceStart,
            uint256 priceEnd,
            uint256 totalLiquidity,
            uint256 takingAmount,
            uint256 filledFor
        ) public pure returns(uint256) {
            // TODO: set correct formula
            unchecked {
                uint256 remainingLiquidity = totalLiquidity - filledFor;
                uint256 priceDiff = priceEnd - priceStart;

                return (
                takingAmount * 2 * totalLiquidity
                - priceStart * remainingLiquidity
                - priceEnd * filledFor
                - priceStart * totalLiquidity) / priceDiff;
            }
        }
}
