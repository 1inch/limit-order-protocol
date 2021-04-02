// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../libraries/UncheckedAddress.sol";


contract PredicateHelper {
    using UncheckedAddress for address;

    function or(address[] calldata targets, bytes[] calldata data) external view returns(bool) {
        for (uint i = 0; i < targets.length; i++) {
            bytes memory result = targets[i].uncheckedFunctionStaticCall(data[i], "PH: 'or' subcall failed");
            require(result.length == 32, "PH: invalid call result");
            if (abi.decode(result, (bool))) {
                return true;
            }
        }
        return false;
    }

    function and(address[] calldata targets, bytes[] calldata data) external view returns(bool) {
        for (uint i = 0; i < targets.length; i++) {
            bytes memory result = targets[i].uncheckedFunctionStaticCall(data[i], "PH: 'and' subcall failed");
            require(result.length == 32, "PH: invalid call result");
            if (!abi.decode(result, (bool))) {
                return false;
            }
        }
        return true;
    }

    function eq(uint256 value, address target, bytes memory data) external view returns(bool) {
        bytes memory result = target.uncheckedFunctionStaticCall(data, "PH: eq");
        return abi.decode(result, (uint256)) == value;
    }

    function lt(uint256 value, address target, bytes memory data) external view returns(bool) {
        bytes memory result = target.uncheckedFunctionStaticCall(data, "PH: lt");
        return abi.decode(result, (uint256)) < value;
    }

    function gt(uint256 value, address target, bytes memory data) external view returns(bool) {
        bytes memory result = target.uncheckedFunctionStaticCall(data, "PH: gt");
        return abi.decode(result, (uint256)) > value;
    }

    function timestampBelow(uint256 time) external view returns(bool) {
        return block.timestamp < time;  // solhint-disable-line not-rely-on-time
    }
}
