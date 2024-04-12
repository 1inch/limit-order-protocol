// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

interface ICreate3Deployer {
    function deploy(bytes32 salt, bytes calldata code) external returns (address);
    function addressOf(bytes32 salt) external view returns (address);
}
