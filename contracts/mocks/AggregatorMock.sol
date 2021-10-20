// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;
pragma abicoder v1;

import "../interfaces/AggregatorInterface.sol";

/// @title Mock oracle that always returns specified token price
contract AggregatorMock is AggregatorInterface {
    int256 private immutable _answer;

    constructor(int256 answer) {
        _answer = answer;
    }

    function latestAnswer() external view override returns (int256) {
        return _answer;
    }

    function latestTimestamp() external view override returns (uint256) {
        // solhint-disable-next-line not-rely-on-time
        return block.timestamp - 100;
    }
}
