// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "../interfaces/IOrderMixin.sol";
import "../interfaces/IAmountGetter.sol";

/// @title A helper contract for interactions with https://docs.chain.link
contract ChainlinkCalculator is IAmountGetter {
    using SafeCast for int256;

    error DifferentOracleDecimals();
    error StaleOraclePrice();

    uint256 private constant _SPREAD_DENOMINATOR = 1e9;
    uint256 private constant _ORACLE_TTL = 4 hours;

    function getMakingAmount(
        IOrderMixin.Order calldata /* order */,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external view returns (uint256) {
        (
            AggregatorV3Interface oracle,
            uint256 spread
        ) = abi.decode(extraData, (AggregatorV3Interface, uint256));

        /// @notice Calculates price of token relative to oracle unit (ETH or USD)
        /// Lowest 254 bits specify spread amount. Spread is scaled by 1e9, i.e. 101% = 1.01e9, 99% = 0.99e9.
        /// Highest bit is set when oracle price should be inverted,
        /// e.g. for DAI-ETH oracle, inverse=false means that we request DAI price in ETH
        /// and inverse=true means that we request ETH price in DAI
        /// @return Amount * spread * oracle price
        (, int256 latestAnswer,, uint256 updatedAt,) = oracle.latestRoundData();
        if (updatedAt + _ORACLE_TTL < block.timestamp) revert StaleOraclePrice(); // solhint-disable-line not-rely-on-time
        return takingAmount * spread * latestAnswer.toUint256() / (10 ** oracle.decimals()) / _SPREAD_DENOMINATOR;
    }

    function getTakingAmount(
        IOrderMixin.Order calldata /* order */,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 makingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external view returns (uint256) {
        (
            AggregatorV3Interface oracle,
            uint256 spread
        ) = abi.decode(extraData, (AggregatorV3Interface, uint256));

        /// @notice Calculates price of token relative to oracle unit (ETH or USD)
        /// Lowest 254 bits specify spread amount. Spread is scaled by 1e9, i.e. 101% = 1.01e9, 99% = 0.99e9.
        /// Highest bit is set when oracle price should be inverted,
        /// e.g. for DAI-ETH oracle, inverse=false means that we request DAI price in ETH
        /// and inverse=true means that we request ETH price in DAI
        /// @return Amount * spread * oracle price
        (, int256 latestAnswer,, uint256 updatedAt,) = oracle.latestRoundData();
        if (updatedAt + _ORACLE_TTL < block.timestamp) revert StaleOraclePrice(); // solhint-disable-line not-rely-on-time
        return makingAmount * spread * (10 ** oracle.decimals()) / latestAnswer.toUint256() / _SPREAD_DENOMINATOR;
    }

    /// @notice Calculates price of token A relative to token B. Note that order is important
    /// @return result Token A relative price times amount
    function doublePrice(AggregatorV3Interface oracle1, AggregatorV3Interface oracle2, uint256 spread, int256 decimalsScale, uint256 amount) external view returns(uint256 result) {
        if (oracle1.decimals() != oracle2.decimals()) revert DifferentOracleDecimals();

        {
            (, int256 latestAnswer1,, uint256 updatedAt,) = oracle1.latestRoundData();
            if (updatedAt + _ORACLE_TTL < block.timestamp) revert StaleOraclePrice(); // solhint-disable-line not-rely-on-time
            result = amount * spread * latestAnswer1.toUint256();
        }

        if (decimalsScale > 0) {
            result *= 10 ** decimalsScale.toUint256();
        } else if (decimalsScale < 0) {
            result /= 10 ** (-decimalsScale).toUint256();
        }

        {
            (, int256 latestAnswer2,, uint256 updatedAt,) = oracle2.latestRoundData();
            if (updatedAt + _ORACLE_TTL < block.timestamp) revert StaleOraclePrice(); // solhint-disable-line not-rely-on-time
            result /= latestAnswer2.toUint256() * _SPREAD_DENOMINATOR;
        }
    }
}
