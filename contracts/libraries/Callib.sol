// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;
pragma abicoder v1;

/// @title A helper contract to manage nonce with the series
library Callib {
    function compactStaticcallForUint(address defaultTarget, bytes calldata data) internal view returns(bool success, uint256 res) {
        assembly {  // solhint-disable-line no-inline-assembly
            let firstByte := byte(0, calldataload(data.offset))
            switch shr(7, firstByte)
            case 1 {
                defaultTarget := shr(96, shl(8, calldataload(data.offset)))
                data.offset := add(data.offset, 21)
                data.length := sub(data.length, 21)
            }
            default {
                data.offset := add(data.offset, 1)
                data.length := sub(data.length, 1)
            }

            let ptr := mload(0x40)
            let ptrSize := 0

            let numOfArguments := and(0x7f, firstByte)
            let fixedLength := add(4, mul(32, numOfArguments))
            switch or(eq(data.length, fixedLength), eq(127, numOfArguments))
            case 1 {
                ptrSize := data.length
                mstore(0x40, add(ptr, ptrSize))

                calldatacopy(ptr, data.offset, data.length)
            }
            default {
                let dynamicLength := sub(data.length, fixedLength)

                ptrSize := add(data.length, 0x40)
                mstore(0x40, add(ptr, ptrSize))

                calldatacopy(ptr, data.offset, fixedLength)
                mstore(add(ptr, fixedLength), add(fixedLength, 28))
                mstore(add(ptr, add(fixedLength, 0x20)), dynamicLength)
                calldatacopy(add(ptr, add(fixedLength, 0x40)), add(data.offset, fixedLength), dynamicLength)
            }

            success := staticcall(gas(), defaultTarget, ptr, ptrSize, 0x0, 0x20)
            if success {
                success := eq(returndatasize(), 32)
                res := mload(0)
            }
        }
    }
}
