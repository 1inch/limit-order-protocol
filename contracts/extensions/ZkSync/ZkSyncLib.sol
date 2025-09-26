// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

/**
 * @title Library for ZkSync contracts.
 * @custom:security-contact security@1inch.io
 */
library ZkSyncLib {
    // keccak256("zksyncCreate2")
    bytes32 constant private _CREATE2_PREFIX = 0x2020dba91b30cc0006188af794c2fb30dd8520db7e2c088b7fc7c103c00ca494;

    /**
     * @notice Returns the address of the contract deployed with CREATE2.
     * @param salt The salt used for the deployment.
     * @param bytecodeHash The hash of the bytecode.
     * @param deployer The address of the deployer.
     * @param inputHash The hash of the input.
     * @return addr The computed address.
     */
    function computeAddressZkSync(
        bytes32 salt,
        bytes32 bytecodeHash,
        address deployer,
        bytes32 inputHash
    ) internal pure returns (address addr) {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(ptr, _CREATE2_PREFIX)
            mstore(add(ptr, 0x20), deployer)
            mstore(add(ptr, 0x40), salt)
            mstore(add(ptr, 0x60), bytecodeHash)
            mstore(add(ptr, 0x80), inputHash)
            addr := and(keccak256(ptr, 0xa0), 0xffffffffffffffffffffffffffffffffffffffff)
        }
    }
}
