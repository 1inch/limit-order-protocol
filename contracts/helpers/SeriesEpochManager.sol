// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

/// @title A helper contract to manage nonce with the series
contract SeriesEpochManager {
    error AdvanceEpochFailed();
    event EpochIncreased(address indexed maker, uint256 series, uint256 newNonce);

    // {
    //    1: {
    //        '0x762f73Ad...842Ffa8': 0,
    //        '0xd20c41ee...32aaDe2': 1
    //    },
    //    2: {
    //        '0x762f73Ad...842Ffa8': 3,
    //        '0xd20c41ee...32aaDe2': 15
    //    },
    //    ...
    // }
    mapping(uint256 => uint256) private _epochs;

    /// @notice Returns nonce for `maker` and `series`
    function epoch(address maker, uint96 series) public view returns(uint256) {
        return _epochs[uint160(maker) | (uint256(series) << 160)];
    }

    /// @notice Advances nonce by one
    function increaseEpoch(uint96 series) external {
        advanceEpoch(series, 1);
    }

    /// @notice Advances nonce by specified amount
    function advanceEpoch(uint96 series, uint256 amount) public {
        if (amount == 0 || amount > 255) revert AdvanceEpochFailed();
        unchecked {
            uint256 key = uint160(msg.sender) | (uint256(series) << 160);
            uint256 newNonce = _epochs[key] + amount;
            _epochs[key] = newNonce;
            emit EpochIncreased(msg.sender, series, newNonce);
        }
    }

    /// @notice Checks if `maker` has specified `makerNonce` for `series`
    /// @return Result True if `maker` has specified nonce. Otherwise, false
    function epochEquals(address maker, uint256 series, uint256 makerNonce) public view returns(bool) {
        return _epochs[uint160(maker) | (uint256(series) << 160)] == makerNonce;
    }
}
