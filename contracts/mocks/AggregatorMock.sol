// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../interfaces/AggregatorInterface.sol";


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
