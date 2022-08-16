// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "../libraries/ArgumentsDecoder.sol";
import "./NonceManager.sol";

/// @title A helper contract for executing boolean functions on arbitrary target call results
contract PredicateHelper is NonceManager {
    using ArgumentsDecoder for bytes;

    error ArbitraryStaticCallFailed();

    /// @notice Calls every target with corresponding data
    /// @return Result True if call to any target returned True. Otherwise, false
    function or(uint256 offsets, bytes calldata data) public view returns(bool) {
        uint256 current;
        uint256 previous;
        for (uint256 i = 0; (current = uint32(offsets >> i)) != 0; i += 32) {
            (bool success, uint256 res) = _selfStaticCall(data[previous:current]);
            if (success && res == 1) {
                return true;
            }
            previous = current;
        }
        return false;
    }

    /// @notice Calls every target with corresponding data
    /// @return Result True if calls to all targets returned True. Otherwise, false
    function and(uint256 offsets, bytes calldata data) public view returns(bool) {
        uint256 current;
        uint256 previous;
        for (uint256 i = 0; (current = uint32(offsets >> i)) != 0; i += 32) {
            (bool success, uint256 res) = _selfStaticCall(data[previous:current]);
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
    function eq(uint256 value, bytes calldata data) public view returns(bool) {
        (bool success, uint256 res) = _selfStaticCall(data);
        return success && res == value;
    }

    /// @notice Calls target with specified data and tests if it's lower than value
    /// @param value Value to test
    /// @return Result True if call to target returns value which is lower than `value`. Otherwise, false
    function lt(uint256 value, bytes calldata data) public view returns(bool) {
        (bool success, uint256 res) = _selfStaticCall(data);
        return success && res < value;
    }

    /// @notice Calls target with specified data and tests if it's bigger than value
    /// @param value Value to test
    /// @return Result True if call to target returns value which is bigger than `value`. Otherwise, false
    function gt(uint256 value, bytes calldata data) public view returns(bool) {
        (bool success, uint256 res) = _selfStaticCall(data);
        return success && res > value;
    }

    /// @notice Checks passed time against block timestamp
    /// @return Result True if current block timestamp is lower than `time`. Otherwise, false
    function timestampBelow(uint256 time) public view returns(bool) {
        return block.timestamp < time;  // solhint-disable-line not-rely-on-time
    }

    /// @notice Performs an arbitrary call to target with data
    /// @return Result Bytes transmuted to uint256
    function arbitraryStaticCall(address target, bytes calldata data) public view returns(uint256) {
        (bool success, uint256 res) = _staticcallForUint(target, data);
        if (!success) revert ArbitraryStaticCallFailed();
        return res;
    }

    function timestampBelowAndNonceEquals(uint256 timeNonceAccount) public view returns(bool) {
        uint256 _time = uint48(timeNonceAccount >> 208);
        uint256 _nonce = uint48(timeNonceAccount >> 160);
        address _account = address(uint160(timeNonceAccount));
        return timestampBelow(_time) && nonceEquals(_account, _nonce);
    }

    function _selfStaticCall(bytes calldata data) internal view returns(bool, uint256) {
        uint256 selector = uint32(data.decodeSelector());
        uint256 arg = data.decodeUint256(4);

        // special case for the most often used predicate
        if (selector == uint32(this.timestampBelowAndNonceEquals.selector)) {  // 0x2cc2878d
            return (true, timestampBelowAndNonceEquals(arg) ? 1 : 0);
        }

        if (selector < uint32(this.arbitraryStaticCall.selector)) {  // 0xbf15fcd8
            if (selector < uint32(this.eq.selector)) {  // 0x6fe7b0ba
                if (selector == uint32(this.gt.selector)) {  // 0x4f38e2b8
                    return (true, gt(arg, data.decodeTailCalldata(100)) ? 1 : 0);
                } else if (selector == uint32(this.timestampBelow.selector)) {  // 0x63592c2b
                    return (true, timestampBelow(arg) ? 1 : 0);
                }
            } else {
                if (selector == uint32(this.eq.selector)) {  // 0x6fe7b0ba
                    return (true, eq(arg, data.decodeTailCalldata(100)) ? 1 : 0);
                } else if (selector == uint32(this.or.selector)) {  // 0x74261145
                    return (true, or(arg, data.decodeTailCalldata(100)) ? 1 : 0);
                }
            }
        } else {
            if (selector < uint32(this.lt.selector)) {  // 0xca4ece22
                if (selector == uint32(this.arbitraryStaticCall.selector)) {  // 0xbf15fcd8
                    return (true, arbitraryStaticCall(address(uint160(arg)), data.decodeTailCalldata(100)));
                } else if (selector == uint32(this.and.selector)) {  // 0xbfa75143
                    return (true, and(arg, data.decodeTailCalldata(100)) ? 1 : 0);
                }
            } else {
                if (selector == uint32(this.lt.selector)) {  // 0xca4ece22
                    return (true, lt(arg, data.decodeTailCalldata(100)) ? 1 : 0);
                } else if (selector == uint32(this.nonceEquals.selector)) {  // 0xcf6fc6e3
                    return (true, nonceEquals(address(uint160(arg)), data.decodeUint256(0x24)) ? 1 : 0);
                }
            }
        }

        return _staticcallForUint(address(this), data);
    }

    function _staticcallForUint(address target, bytes calldata input) private view returns(bool success, uint256 res) {
        /// @solidity memory-safe-assembly
        assembly { // solhint-disable-line no-inline-assembly
            let data := mload(0x40)

            calldatacopy(data, input.offset, input.length)
            success := staticcall(gas(), target, data, input.length, 0x0, 0x20)
            success := and(success, eq(returndatasize(), 32))
            if success {
                res := mload(0)
            }
        }
    }
}
