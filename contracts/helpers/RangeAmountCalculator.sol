// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * Range limit order is used to sell an asset within a given price range.
 * In this order each maker's token is more expensive than previous. Maker sets min and max cost prices for makerAsset's tokens.
 * For example, right now ETH is worth 3000 DAI and you believe that within the next week the price of ETH will rise and reach at least 4000 DAI.
 * In this case, you can create an ETH -> DAI limit order with a price range of 3000 -> 4000.
 * Let's say you created a similar order for the amount of 10 ETH.
 * Someone can file the entire limit at once at an average price of 3500 DAI.
 * But it is also possible that the limit-order will be filled in parts.
 * First, someone buys 1 ETH at the price of 3050 DAI, then another 1 ETH at the price of 3150 DAI, and so on.
 *
 * Function of the changing price of makerAsset tokens in takerAsset tokens by the filling amount of makerAsset tokens in order:
 *      priceEnd - priceStart
 * y = ----------------------- * x + priceStart
 *           totalAmount
 */
contract RangeAmountCalculator {

    error IncorrectRange();

    modifier correctPrices(uint256 priceStart, uint256 priceEnd) {
        if (priceEnd <= priceStart) revert IncorrectRange();
        _;
    }

    function getRangeTakerAmount(
        uint256 priceStart,
        uint256 priceEnd,
        uint256 totalAmount,
        uint256 fillAmount,
        uint256 remainingMakingAmount
    ) public correctPrices(priceStart, priceEnd) pure returns(uint256) {
        uint256 alreadyFilledMakingAmount = totalAmount - remainingMakingAmount;
        /**
         * rangeTakerAmount = (
         *       f(makerAmountFilled) + f(makerAmountFilled + fillAmount)
         *   ) * fillAmount / 2 / 1e18
         *
         *  scaling to 1e18 happens to have better price accuracy
         */
        return (
            (priceEnd - priceStart) * (2 * alreadyFilledMakingAmount + fillAmount) / totalAmount +
            2 * priceStart
        ) * fillAmount / 2e18;
    }

    function getRangeMakerAmount(
        uint256 priceStart,
        uint256 priceEnd,
        uint256 totalLiquidity,
        uint256 takingAmount,
        uint256 remainingMakingAmount
    ) public correctPrices(priceStart, priceEnd) pure returns(uint256) {
        uint256 alreadyFilledMakingAmount = totalLiquidity - remainingMakingAmount;
        uint256 b = priceStart;
        uint256 k = (priceEnd - priceStart) * 1e18 / totalLiquidity;
        uint256 bDivK = priceStart * totalLiquidity / (priceEnd - priceStart);
        return (Math.sqrt(
            (
                b * bDivK +
                alreadyFilledMakingAmount * (2 * b + k * alreadyFilledMakingAmount / 1e18) +
                2 * takingAmount * 1e18
            ) / k * 1e18
        ) - bDivK) - alreadyFilledMakingAmount;
    }
}
