// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "../libraries/Callib.sol";

/// @title A helper contract for executing boolean functions on arbitrary target call results
contract PredicateHelper {
    using Callib for address;

    /// @notice Calls every target with corresponding data
    /// @return Result True if call to any target returned True. Otherwise, false
    function or(address[] calldata targets, bytes[] calldata data) external view returns(bool) {
        require(targets.length == data.length, "PH: input array size mismatch");
        for (uint256 i = 0; i < targets.length; i++) {
            (bool success, uint256 res) = targets[i].staticcallForUint(data[i]);
            if (success && res == 1) {
                return true;
            }
        }
        return false;
    }

    /// @notice Calls every target with corresponding data
    /// @return Result True if calls to all targets returned True. Otherwise, false
    function and(address[] calldata targets, bytes[] calldata data) external view returns(bool) {
        require(targets.length == data.length, "PH: input array size mismatch");
        for (uint256 i = 0; i < targets.length; i++) {
            (bool success, uint256 res) = targets[i].staticcallForUint(data[i]);
            if (!success || res != 1) {
                return false;
            }
        }
        return true;
    }

    /// @notice Calls target with specified data and tests if it's equal to the value
    /// @param value Value to test
    /// @return Result True if call to target returns the same value as `value`. Otherwise, false
    function eq(uint256 value, address target, bytes calldata data) external view returns(bool) {
        (bool success, uint256 res) = target.staticcallForUint(data);
        return success && res == value;
    }

    /// @notice Calls target with specified data and tests if it's lower than value
    /// @param value Value to test
    /// @return Result True if call to target returns value which is lower than `value`. Otherwise, false
    function lt(uint256 value, address target, bytes calldata data) external view returns(bool) {
        (bool success, uint256 res) = target.staticcallForUint(data);
        return success && res < value;
    }

    /// @notice Calls target with specified data and tests if it's bigger than value
    /// @param value Value to test
    /// @return Result True if call to target returns value which is bigger than `value`. Otherwise, false
    function gt(uint256 value, address target, bytes calldata data) external view returns(bool) {
        (bool success, uint256 res) = target.staticcallForUint(data);
        return success && res > value;
    }

    /// @notice Checks passed time against block timestamp
    /// @return Result True if current block timestamp is lower than `time`. Otherwise, false
    function timestampBelow(uint256 time) external view returns(bool) {
        return block.timestamp < time;  // solhint-disable-line not-rely-on-time
    }

    // TODO: check gas is cheaper after trimming zeroes (even for new calldata gas cost)
    function timestampBelowCompact(bytes4 time) external view returns(bool) {
        return block.timestamp < (uint256(bytes32(time)) >> 224);  // solhint-disable-line not-rely-on-time
    }
}
