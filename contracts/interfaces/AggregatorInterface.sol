// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface AggregatorInterface {
    function latestAnswer() external view returns (int256);
    function latestTimestamp() external view returns (uint256);
}
