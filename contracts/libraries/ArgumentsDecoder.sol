// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;
pragma abicoder v1;

/// @title Library with gas efficient alternatives to `abi.decode`
/// @notice Methods with `gas ineffective from contract with abicoder v1` comment mean
///     that it's more gas effective to use `abi.decode` in contracts with `pragma abicoder v1`
library ArgumentsDecoder {

    error IncorrectDataLength();

    /// gas ineffective from contract with abicoder v1
    function decodeUint256Memory(bytes memory data) internal pure returns(uint256 value) {
        if (data.length < 32) revert IncorrectDataLength();
        /// @solidity memory-safe-assembly
        assembly { // solhint-disable-line no-inline-assembly
            value := mload(add(data, 0x20))
        }
    }

    /// gas ineffective from contract with abicoder v1
    function decodeUint256(bytes calldata data) internal pure returns(uint256 value) {
        if (data.length < 32) revert IncorrectDataLength();
        /// @solidity memory-safe-assembly
        assembly { // solhint-disable-line no-inline-assembly
            value := calldataload(data.offset)
        }
    }

    function decodeUint256(bytes calldata data, uint256 offset) internal pure returns(uint256 value) {
        if (data.length < offset + 32) revert IncorrectDataLength();
        /// @solidity memory-safe-assembly
        assembly { // solhint-disable-line no-inline-assembly
            value := calldataload(add(data.offset, offset))
        }
    }

    function decodeSelector(bytes calldata data) internal pure returns(bytes4 value) {
        if (data.length < 4) revert IncorrectDataLength();
        /// @solidity memory-safe-assembly
        assembly { // solhint-disable-line no-inline-assembly
            value := calldataload(data.offset)
        }
    }

    function decodeSelector(bytes calldata data, uint256 offset) internal pure returns(bytes4 value) {
        if (data.length < offset + 4) revert IncorrectDataLength();
        /// @solidity memory-safe-assembly
        assembly { // solhint-disable-line no-inline-assembly
            value := calldataload(add(data.offset, offset))
        }
    }

    /// gas ineffective from contract with abicoder v1
    function decodeBoolMemory(bytes memory data) internal pure returns(bool value) {
        if (data.length < 32) revert IncorrectDataLength();
        /// @solidity memory-safe-assembly
        assembly { // solhint-disable-line no-inline-assembly
            value := eq(mload(add(data, 0x20)), 1)
        }
    }

    function decodeTailCalldata(bytes calldata data, uint256 tailOffset) internal pure returns(bytes calldata args) {
        if (data.length < tailOffset) revert IncorrectDataLength();
        /// @solidity memory-safe-assembly
        assembly {  // solhint-disable-line no-inline-assembly
            args.offset := add(data.offset, tailOffset)
            args.length := sub(data.length, tailOffset)
        }
    }

    function decodeTargetAndCalldata(bytes calldata data) internal pure returns(address target, bytes calldata args) {
        if (data.length < 20) revert IncorrectDataLength();
        /// @solidity memory-safe-assembly
        assembly {  // solhint-disable-line no-inline-assembly
            target := shr(96, calldataload(data.offset))
            args.offset := add(data.offset, 20)
            args.length := sub(data.length, 20)
        }
    }
}
