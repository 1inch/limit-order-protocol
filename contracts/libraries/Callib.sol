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
                data.offset := add(data.offset, 1)
                data.length := sub(data.length, 1)
            }
            default {
                defaultTarget := shr(96, shl(8, calldataload(data.offset)))
                data.offset := add(data.offset, 21)
                data.length := sub(data.length, 21)
            }

            let ptr := mload(0x40)
            let ptrSize := 0

            let numOfArguments := and(127, firstByte)
            switch numOfArguments
            case 127 {
                ptrSize := data.length
                mstore(0x40, add(ptr, ptrSize))

                calldatacopy(ptr, data.offset, data.length)
            }
            default {
                let fixedLength := add(4, mul(32, numOfArguments))
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

    // function staticcallForUint(address target, bytes calldata input) internal view returns(bool success, uint256 res) {
    //     assembly { // solhint-disable-line no-inline-assembly
    //         let data := mload(0x40)

    //         let fixedLength := add(4, mul(32, byte(0, calldataload(input.offset))))
    //         let fixedLengthPlusOne := add(fixedLength, 1)
    //         let dynamicLength := sub(input.length, fixedLengthPlusOne)
    //         let inputSize
    //         switch dynamicLength
    //         case 0 {
    //             mstore(0x40, add(data, sub(input.length, 1)))

    //             inputSize := sub(input.length, 1)
    //             calldatacopy(data, add(input.offset, 1), inputSize)
    //         }
    //         default {
    //             mstore(0x40, add(data, add(input.length, 0x3f)))

    //             inputSize := add(add(fixedLength, dynamicLength), 0x3f)
    //             calldatacopy(data, add(input.offset, 1), fixedLength)
    //             mstore(add(data, fixedLength), add(fixedLength, 28))
    //             mstore(add(data, add(fixedLength, 0x20)), dynamicLength)
    //             calldatacopy(add(data, add(fixedLength, 0x40)), add(input.offset, fixedLengthPlusOne), dynamicLength)
    //         }

    //         success := staticcall(gas(), target, data, inputSize, 0x0, 0x20)
    //         if success {
    //             success := eq(returndatasize(), 32)
    //             res := mload(0)
    //         }
    //     }
    // }
}
