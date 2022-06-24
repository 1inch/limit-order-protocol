// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;
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

    function decodeUint256(bytes calldata data, uint256 offset) internal pure returns(uint256 value) {
        assembly { // solhint-disable-line no-inline-assembly
            value := calldataload(add(data.offset, offset))
        }
    }

    function decodeSelector(bytes calldata data) internal pure returns(bytes4 value) {
        assembly { // solhint-disable-line no-inline-assembly
            value := calldataload(data.offset)
        }
    }

    function decodeSelector(bytes calldata data, uint256 offset) internal pure returns(bytes4 value) {
        assembly { // solhint-disable-line no-inline-assembly
            value := calldataload(add(data.offset, offset))
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

    function decodeTailCalldata(bytes calldata data, uint256 tailOffset) internal pure returns(bytes calldata args) {
        assembly {  // solhint-disable-line no-inline-assembly
            args.offset := add(data.offset, tailOffset)
            args.length := sub(data.length, tailOffset)
        }
    }

    function decodeTargetAndCalldata(bytes calldata data) internal pure returns(address target, bytes calldata args) {
        assembly {  // solhint-disable-line no-inline-assembly
            target := shr(96, calldataload(data.offset))
        }
        args = data[20:];
    }
}
