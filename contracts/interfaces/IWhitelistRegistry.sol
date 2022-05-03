// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

interface IWhitelistRegistry {
    function status(address addr) external view returns(uint256);
}
