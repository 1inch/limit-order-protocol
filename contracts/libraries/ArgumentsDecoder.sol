// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;
pragma abicoder v1;

/// @title Library with gas efficient alternatives to `abi.decode`
library ArgumentsDecoder {
    function decodeUint256Memory(bytes memory data) internal pure returns(uint256) {
        uint256 value;
        assembly { // solhint-disable-line no-inline-assembly
            value := mload(add(data, 0x20))
        }
        return value;
    }

    function decodeUint256(bytes calldata data) internal pure returns(uint256) {
        uint256 value;
        assembly { // solhint-disable-line no-inline-assembly
            value := calldataload(data.offset)
        }
        return value;
    }

    function decodeBoolMemory(bytes memory data) internal pure returns(bool) {
        bool value;
        assembly { // solhint-disable-line no-inline-assembly
            value := eq(mload(add(data, 0x20)), 1)
        }
        return value;
    }


    function decodeBool(bytes calldata data) internal pure returns(bool) {
        bool value;
        assembly { // solhint-disable-line no-inline-assembly
            value := eq(calldataload(data.offset), 1)
        }
        return value;
    }

    function decodeTargetAndCalldata(bytes calldata data) internal pure returns(address, bytes calldata) {
        address target;
        bytes calldata args;
        assembly {  // solhint-disable-line no-inline-assembly
            target := shr(96, calldataload(data.offset))
        }
        args = data[20:];
        return (target, args);
    }
}
