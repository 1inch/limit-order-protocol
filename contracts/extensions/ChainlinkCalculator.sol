// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "../interfaces/IOrderMixin.sol";
import "../interfaces/IAmountGetter.sol";

// solhint-disable not-rely-on-time

/// @title A helper contract for interactions with https://docs.chain.link
contract ChainlinkCalculator is IAmountGetter {
    using SafeCast for int256;

    error DifferentOracleDecimals();
    error StaleOraclePrice();

    uint256 private constant _SPREAD_DENOMINATOR = 1e9;
    uint256 private constant _ORACLE_TTL = 4 hours;
    bytes1 private constant _INVERSE_FLAG = 0x80;
    bytes1 private constant _DOUBLE_PRICE_FLAG = 0x40;

    /// @notice Calculates price of token A relative to token B. Note that order is important
    /// @return result Token A relative price times amount
    function doublePrice(AggregatorV3Interface oracle1, AggregatorV3Interface oracle2, int256 decimalsScale, uint256 amount) external view returns(uint256 result) {
        return _doublePrice(oracle1, oracle2, decimalsScale, amount);
    }

    function getMakingAmount(
        IOrderMixin.Order calldata /* order */,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external view returns (uint256) {
        return _getSpreadedAmount(takingAmount, extraData);
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
        return _getSpreadedAmount(makingAmount, extraData);
    }

    /// @notice Calculates price of token relative to oracle unit (ETH or USD)
    /// The first byte of the blob contain inverse and useDoublePrice flags,
    /// The inverse flag is set when oracle price should be inverted,
    /// e.g. for DAI-ETH oracle, inverse=false means that we request DAI price in ETH
    /// and inverse=true means that we request ETH price in DAI
    /// The useDoublePrice flag is set when needs price for two custom tokens (other than ETH or USD)
    /// @return Amount * spread * oracle price
    function _getSpreadedAmount(uint256 amount, bytes calldata blob) internal view returns(uint256) {
        bytes1 flags = bytes1(blob[:1]);
        if (flags & _DOUBLE_PRICE_FLAG == _DOUBLE_PRICE_FLAG) {
            AggregatorV3Interface oracle1 = AggregatorV3Interface(address(bytes20(blob[1:21])));
            AggregatorV3Interface oracle2 = AggregatorV3Interface(address(bytes20(blob[21:41])));
            int256 decimalsScale = int256(uint256(bytes32(blob[41:73])));
            uint256 spread = uint256(bytes32(blob[73:105]));
            return _doublePrice(oracle1, oracle2, decimalsScale, spread * amount) / _SPREAD_DENOMINATOR;
        } else {
            AggregatorV3Interface oracle = AggregatorV3Interface(address(bytes20(blob[1:21])));
            uint256 spread = uint256(bytes32(blob[21:53]));
            (, int256 latestAnswer,, uint256 updatedAt,) = oracle.latestRoundData();
            // solhint-disable-next-line not-rely-on-time
            if (updatedAt + _ORACLE_TTL < block.timestamp) revert StaleOraclePrice();
            if (flags & _INVERSE_FLAG == _INVERSE_FLAG) {
                return spread * amount * (10 ** oracle.decimals()) / latestAnswer.toUint256() / _SPREAD_DENOMINATOR;
            } else {
                return spread * amount * latestAnswer.toUint256() / (10 ** oracle.decimals()) / _SPREAD_DENOMINATOR;
            }
        }
    }

    function _doublePrice(AggregatorV3Interface oracle1, AggregatorV3Interface oracle2, int256 decimalsScale, uint256 amount) internal view returns(uint256 result) {
        if (oracle1.decimals() != oracle2.decimals()) revert DifferentOracleDecimals();

        {
            (, int256 latestAnswer,, uint256 updatedAt,) = oracle1.latestRoundData();
            // solhint-disable-next-line not-rely-on-time
            if (updatedAt + _ORACLE_TTL < block.timestamp) revert StaleOraclePrice();
            result = amount * latestAnswer.toUint256();
        }

        if (decimalsScale > 0) {
            result *= 10 ** decimalsScale.toUint256();
        } else if (decimalsScale < 0) {
            result /= 10 ** (-decimalsScale).toUint256();
        }

        {
            (, int256 latestAnswer,, uint256 updatedAt,) = oracle2.latestRoundData();
            // solhint-disable-next-line not-rely-on-time
            if (updatedAt + _ORACLE_TTL < block.timestamp) revert StaleOraclePrice();
            result /= latestAnswer.toUint256();
        }
    }
}

// solhint-enable not-rely-on-time
