// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;
pragma abicoder v1;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";


/// @title A helper contract for interactions with https://docs.chain.link
contract ChainlinkCalculator {
    using SafeCast for int256;

    uint256 private constant _SPREAD_DENOMINATOR = 1e9;
    uint256 private constant _INVERSE_MASK = 1 << 255;

    /// @notice Calculates price of token relative to oracle unit (ETH or USD)
    /// @param inverseAndSpread concatenated inverse flag and spread.
    /// Lowest 254 bits specify spread amount. Spread is scaled by 1e9, i.e. 101% = 1.01e9, 99% = 0.99e9.
    /// Highest bit is set when oracle price should be inverted,
    /// e.g. for DAI-ETH oracle, inverse=false means that we request DAI price in ETH
    /// and inverse=true means that we request ETH price in DAI
    /// @return Amount * spread * oracle price
    function singlePrice(AggregatorV3Interface oracle, uint256 inverseAndSpread, uint256 amount) external view returns(uint256) {
        (, int256 latestAnswer,,,) = oracle.latestRoundData();
        bool inverse = inverseAndSpread & _INVERSE_MASK > 0;
        uint256 spread = inverseAndSpread & (~_INVERSE_MASK);
        if (inverse) {
            return amount * spread * (10 ** oracle.decimals()) / latestAnswer.toUint256() / _SPREAD_DENOMINATOR;
        } else {
            return amount * spread * latestAnswer.toUint256() / (10 ** oracle.decimals()) / _SPREAD_DENOMINATOR;
        }
    }

    /// @notice Calculates price of token A relative to token B. Note that order is important
    /// @return Result Token A relative price times amount
    function doublePrice(AggregatorV3Interface oracle1, AggregatorV3Interface oracle2, uint256 spread, int256 decimalsScale, uint256 amount) external view returns(uint256) {
        require(oracle1.decimals() == oracle2.decimals(), "CC: oracle decimals don't match");
        (, int256 latestAnswer1,,,) = oracle1.latestRoundData();
        (, int256 latestAnswer2,,,) = oracle2.latestRoundData();
        if (decimalsScale > 0) {
            return amount * spread * latestAnswer1.toUint256() * (10 ** decimalsScale.toUint256()) / latestAnswer2.toUint256() / _SPREAD_DENOMINATOR;
        } else if (decimalsScale < 0) {
            return amount * spread * latestAnswer1.toUint256() / latestAnswer2.toUint256() / _SPREAD_DENOMINATOR / (10 ** (-decimalsScale).toUint256());
        } else {
            return amount * spread * latestAnswer1.toUint256() / latestAnswer2.toUint256() / _SPREAD_DENOMINATOR;
        }
    }
}
