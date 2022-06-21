// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;
pragma abicoder v1;

/// @title Library with gas efficient alternatives to `abi.decode`
library ArgumentsDecoder {
    function decodeUint256Memory(bytes memory data) internal pure returns(uint256 value) {
        assembly { // solhint-disable-line no-inline-assembly
            value := mload(add(data, 0x20))
        }
    }

    function decodeUint256(bytes calldata data) internal pure returns(uint256 value) {
        assembly { // solhint-disable-line no-inline-assembly
            value := calldataload(data.offset)
        }
    }

    function decodeBoolMemory(bytes memory data) internal pure returns(bool value) {
        assembly { // solhint-disable-line no-inline-assembly
            value := eq(mload(add(data, 0x20)), 1)
        }
    }

    function decodeBool(bytes calldata data) internal pure returns(bool value) {
        assembly { // solhint-disable-line no-inline-assembly
            value := eq(calldataload(data.offset), 1)
        }
    }

    function decodeTargetAndCalldata(bytes calldata data, address defaultValue) internal pure returns(address target, bytes calldata args) {
        if (data[0] == "d") {
            target = defaultValue;
            args = data[1:]; // reverts if data.length < 1
        } else {
            assembly {  // solhint-disable-line no-inline-assembly
                target := shr(96, shl(8, calldataload(data.offset)))
            }
            args = data[21:]; // reverts if data.length < 21
        }
    }
}
