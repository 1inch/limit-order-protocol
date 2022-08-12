// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;
pragma abicoder v1;

/// @title A helper contract for managing nonce of tx sender
contract NonceManager {
    error AdvanceNonceFailed();
    event NonceIncreased(address indexed maker, uint256 newNonce);

    mapping(address => uint256) public nonce;

    /// @notice Advances nonce by one
    function increaseNonce() external {
        advanceNonce(1);
    }

    /// @notice Advances nonce by specified amount
    function advanceNonce(uint8 amount) public {
        if (amount == 0) revert AdvanceNonceFailed();
        uint256 newNonce = nonce[msg.sender] + amount;
        nonce[msg.sender] = newNonce;
        emit NonceIncreased(msg.sender, newNonce);
    }

    /// @notice Checks if `makerAddress` has specified `makerNonce`
    /// @return Result True if `makerAddress` has specified nonce. Otherwise, false
    function nonceEquals(address makerAddress, uint256 makerNonce) public view returns(bool) {
        return nonce[makerAddress] == makerNonce;
    }
}
