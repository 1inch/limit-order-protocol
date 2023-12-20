// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

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
    mapping(uint256 series => mapping(address maker => uint256 nonce)) public nonce;

    /// @notice Advances nonce by one
    function increaseNonce(uint8 series) external {
        advanceNonce(series, 1);
    }

    /// @notice Advances nonce by specified amount
    function advanceNonce(uint256 series, uint256 amount) public {
        if (amount == 0 || amount > 255) revert AdvanceNonceFailed();
        unchecked {
            uint256 newNonce = nonce[series][msg.sender] + amount;
            nonce[series][msg.sender] = newNonce;
            emit NonceIncreased(msg.sender, series, newNonce);
        }
    }

    /// @notice Checks if `makerAddress` has specified `makerNonce` for `series`
    /// @return Result True if `makerAddress` has specified nonce. Otherwise, false
    function nonceEquals(uint256 series, address makerAddress, uint256 makerNonce) public view returns(bool) {
        return nonce[series][makerAddress] == makerNonce;
    }

    /// @notice Checks passed time against block timestamp
    /// @return Result True if current block timestamp is lower than `time`. Otherwise, false
    function timestampBelow(uint256 time) public view returns(bool) {
        return block.timestamp < time;  // solhint-disable-line not-rely-on-time
    }

    function timestampBelowAndNonceEquals(uint256 timeNonceSeriesAccount) public view returns(bool) {
        uint256 _time = uint40(timeNonceSeriesAccount >> 216);
        uint256 _nonce = uint40(timeNonceSeriesAccount >> 176);
        uint256 _series = uint16(timeNonceSeriesAccount >> 160);
        address _account = address(uint160(timeNonceSeriesAccount));
        return timestampBelow(_time) && nonceEquals(_series, _account, _nonce);
    }
}
