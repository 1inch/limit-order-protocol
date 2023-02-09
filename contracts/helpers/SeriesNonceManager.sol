// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

/// @title A helper contract to manage nonce with the series
contract SeriesNonceManager {
    error AdvanceNonceFailed();
    event NonceIncreased(address indexed maker, uint256 series, uint256 newNonce);

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
    mapping(uint256 => uint256) private _nonces;

    /// @notice Returns nonce for `maker` and `series`
    function nonce(address maker, uint8 series) public view returns(uint256) {
        return _nonces[uint160(maker) | (uint256(series) << 160)];
    }

    /// @notice Advances nonce by one
    function increaseNonce(uint8 series) external {
        advanceNonce(series, 1);
    }

    /// @notice Advances nonce by specified amount
    function advanceNonce(uint256 series, uint256 amount) public {
        if (amount == 0 || amount > 255) revert AdvanceNonceFailed();
        unchecked {
            uint256 key = uint160(msg.sender) | (series << 160);
            uint256 newNonce = _nonces[key] + amount;
            _nonces[key] = newNonce;
            emit NonceIncreased(msg.sender, series, newNonce);
        }
    }

    /// @notice Checks if `maker` has specified `makerNonce` for `series`
    /// @return Result True if `maker` has specified nonce. Otherwise, false
    function nonceEquals(address maker, uint256 series, uint256 makerNonce) public view returns(bool) {
        return _nonces[uint160(maker) | (series << 160)] == makerNonce;
    }
}
