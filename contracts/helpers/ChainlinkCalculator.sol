// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "../interfaces/AggregatorInterface.sol";

/// @title A helper contract for interactions with https://docs.chain.link
contract ChainlinkCalculator {
    using SafeCast for int256;

    uint256 private constant _SPREAD_DENOMINATOR = 1e9;
    uint256 private constant _ORACLE_EXPIRATION_TIME = 30 minutes;
    uint256 private constant _INVERSE_MASK = 1 << 255;

    /// @notice Calculates price of token relative to ETH scaled by 1e18
    /// @param inverseAndSpread concatenated inverse flag and spread.
    /// Lowest 254 bits specify spread amount. Spread is scaled by 1e9, i.e. 101% = 1.01e9, 99% = 0.99e9.
    /// Highest bit is set when oracle price should be inverted,
    /// e.g. for DAI-ETH oracle, inverse=false means that we request DAI price in ETH
    /// and inverse=true means that we request ETH price in DAI
    /// @return Result Token price times amount
    function singlePrice(AggregatorInterface oracle, uint256 inverseAndSpread, uint256 amount) external view returns(uint256) {
        // solhint-disable-next-line not-rely-on-time
        require(oracle.latestTimestamp() + _ORACLE_EXPIRATION_TIME > block.timestamp, "CC: stale data");
        bool inverse = inverseAndSpread & _INVERSE_MASK > 0;
        uint256 spread = inverseAndSpread & (~_INVERSE_MASK);
        if (inverse) {
            return amount * spread * 1e18 / oracle.latestAnswer().toUint256() / _SPREAD_DENOMINATOR;
        } else {
            return amount * spread * oracle.latestAnswer().toUint256() / 1e18 / _SPREAD_DENOMINATOR;
        }
    }

    /// @notice Calculates price of token A relative to token B. Note that order is important
    /// @return Result Token A relative price times amount
    function doublePrice(AggregatorInterface oracle1, AggregatorInterface oracle2, uint256 spread, uint256 amount) external view returns(uint256) {
        // solhint-disable-next-line not-rely-on-time
        require(oracle1.latestTimestamp() + _ORACLE_EXPIRATION_TIME > block.timestamp, "CC: stale data O1");
        // solhint-disable-next-line not-rely-on-time
        require(oracle2.latestTimestamp() + _ORACLE_EXPIRATION_TIME > block.timestamp, "CC: stale data O2");

        return amount * spread * oracle1.latestAnswer().toUint256() / oracle2.latestAnswer().toUint256() / _SPREAD_DENOMINATOR;
    }
}
