// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

/// @title A helper contract to execute static calls expecting single uint256 as output
library Callib {
    function staticcallForUint(address target, bytes calldata input) internal view returns(bool success, uint256 res) {
        /// @solidity memory-safe-assembly
        assembly { // solhint-disable-line no-inline-assembly
            let data := mload(0x40)

            calldatacopy(data, input.offset, input.length)
            success := staticcall(gas(), target, data, input.length, 0x0, 0x20)
            if success {
                success := eq(returndatasize(), 32)
                res := mload(0)
            }
        }
    }
}
