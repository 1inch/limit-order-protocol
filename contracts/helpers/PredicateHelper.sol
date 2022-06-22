// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "../libraries/Callib.sol";
import "../libraries/ArgumentsDecoder.sol";

/// @title A helper contract for executing boolean functions on arbitrary target call results
contract PredicateHelper {
    using Callib for address;
    using ArgumentsDecoder for bytes;

    /// @notice Calls every target with corresponding data
    /// @return Result True if call to any target returned True. Otherwise, false
    function or(uint256 offsets, bytes calldata data) external view returns(bool) {
        uint256 current;
        uint256 previous;
        for (uint256 i = 0; (current = uint32(offsets >> (i << 5))) != 0; i++) {
            bytes calldata slice = data[previous:current];
            (address target, bytes calldata input) = slice.decodeTargetAndCalldata();
            (bool success, uint256 res) = target.staticcallForUint(input);
            if (success && res == 1) {
                return true;
            }
            previous = current;
        }
        return false;
    }

    /// @notice Calls every target with corresponding data
    /// @return Result True if calls to all targets returned True. Otherwise, false
    function and(uint256 offsets, bytes calldata data) external view returns(bool) {
        uint256 current;
        uint256 previous;
        for (uint256 i = 0; (current = uint32(offsets >> (i << 5))) != 0; i++) {
            bytes calldata slice = data[previous:current];
            (address target, bytes calldata input) = slice.decodeTargetAndCalldata();
            (bool success, uint256 res) = target.staticcallForUint(input);
            if (!success || res != 1) {
                return false;
            }
            previous = current;
        }
        return true;
    }

    /// @notice Calls target with specified data and tests if it's equal to the value
    /// @param value Value to test
    /// @return Result True if call to target returns the same value as `value`. Otherwise, false
    function eq(uint256 value, bytes calldata data) external view returns(bool) {
        (address target, bytes calldata input) = data.decodeTargetAndCalldata();
        (bool success, uint256 res) = target.staticcallForUint(input);
        return success && res == value;
    }

    /// @notice Calls target with specified data and tests if it's lower than value
    /// @param value Value to test
    /// @return Result True if call to target returns value which is lower than `value`. Otherwise, false
    function lt(uint256 value, bytes calldata data) external view returns(bool) {
        (address target, bytes calldata input) = data.decodeTargetAndCalldata();
        (bool success, uint256 res) = target.staticcallForUint(input);
        return success && res < value;
    }

    /// @notice Calls target with specified data and tests if it's bigger than value
    /// @param value Value to test
    /// @return Result True if call to target returns value which is bigger than `value`. Otherwise, false
    function gt(uint256 value, bytes calldata data) external view returns(bool) {
        (address target, bytes calldata input) = data.decodeTargetAndCalldata();
        (bool success, uint256 res) = target.staticcallForUint(input);
        return success && res > value;
    }

    /// @notice Checks passed time against block timestamp
    /// @return Result True if current block timestamp is lower than `time`. Otherwise, false
    function timestampBelow(uint256 time) external view returns(bool) {
        return block.timestamp < time;  // solhint-disable-line not-rely-on-time
    }
}
