// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/// @title Library with gas efficient alternatives to `abi.decode`
library ArgumentsDecoder {
    function decodeUint256(bytes memory data) internal pure returns(uint256 value) {
        assembly { // solhint-disable-line no-inline-assembly
            value := mload(add(data, 0x20))
        }
    }

    function decodeBool(bytes memory data) internal pure returns(bool value) {
        assembly { // solhint-disable-line no-inline-assembly
            value := mload(add(data, 0x20))
        }
    }

    function decodeTargetAndCalldata(bytes memory data) internal pure returns(address target, bytes memory args) {
        assembly {  // solhint-disable-line no-inline-assembly
            target := mload(add(data, 0x14))
            args := add(data, 0x14)
            mstore(args, sub(mload(data), 0x14))
        }
    }

    function decodeTargetAndData(bytes calldata data) internal pure returns(address target, bytes calldata args) {
        assembly {  // solhint-disable-line no-inline-assembly
            target := shr(96, calldataload(data.offset))
        }
        args = data[20:];
    }
}
