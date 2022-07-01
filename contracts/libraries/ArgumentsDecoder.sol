// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;
pragma abicoder v1;

/// @title Library with gas efficient alternatives to `abi.decode`
library ArgumentsDecoder {
    error IncorrectDataLength();

    function decodeUint256(bytes calldata data, uint256 offset) internal pure returns(uint256 value) {
        unchecked { if (data.length < offset + 32) revert IncorrectDataLength(); }
        // no memory ops inside so this insertion is automatically memory safe
        assembly { // solhint-disable-line no-inline-assembly
            value := calldataload(add(data.offset, offset))
        }
    }

    function decodeSelector(bytes calldata data) internal pure returns(bytes4 value) {
        if (data.length < 4) revert IncorrectDataLength();
        // no memory ops inside so this insertion is automatically memory safe
        assembly { // solhint-disable-line no-inline-assembly
            value := calldataload(data.offset)
        }
    }

    function decodeTailCalldata(bytes calldata data, uint256 tailOffset) internal pure returns(bytes calldata args) {
        if (data.length < tailOffset) revert IncorrectDataLength();
        // no memory ops inside so this insertion is automatically memory safe
        assembly {  // solhint-disable-line no-inline-assembly
            args.offset := add(data.offset, tailOffset)
            args.length := sub(data.length, tailOffset)
        }
    }

    function decodeTargetAndCalldata(bytes calldata data) internal pure returns(address target, bytes calldata args) {
        if (data.length < 20) revert IncorrectDataLength();
        // no memory ops inside so this insertion is automatically memory safe
        assembly {  // solhint-disable-line no-inline-assembly
            target := shr(96, calldataload(data.offset))
            args.offset := add(data.offset, 20)
            args.length := sub(data.length, 20)
        }
    }
}
