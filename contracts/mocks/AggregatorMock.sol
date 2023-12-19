// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV2V3Interface.sol";

/// @title Mock oracle that always returns specified token price
contract AggregatorMock is AggregatorV2V3Interface {
    error NoDataPresent();

    int256 private immutable _ANSWER;

    constructor(int256 answer) {
        _ANSWER = answer;
    }

    function decimals() external pure returns (uint8) {
        return 18;
    }

    function description() external pure returns (string memory) {
        return "AggregatorMock";
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function getRoundData(uint80 _roundId)
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        if (_roundId != 0) revert NoDataPresent();
        return latestRoundData();
    }

    function latestRoundData()
        public
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        // solhint-disable-next-line not-rely-on-time
        return (0, _ANSWER, block.timestamp - 100, block.timestamp - 100, 0);
    }

    function latestAnswer() public view returns (int256) {
        return _ANSWER;
    }

    function latestTimestamp() public view returns (uint256) {
        // solhint-disable-next-line not-rely-on-time
        return block.timestamp - 100;
    }

    function latestRound() external pure returns (uint256) {
        return 0;
    }

    function getAnswer(uint256 roundId) external view returns (int256) {
        if (roundId != 0) revert NoDataPresent();
        return latestAnswer();
    }

    function getTimestamp(uint256 roundId) external view returns (uint256) {
        if (roundId != 0) revert NoDataPresent();
        return latestTimestamp();
    }
}
