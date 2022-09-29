// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;
pragma abicoder v1;

/**
 * @title A helper contract for managing nonce of tx sender
 */
contract NonceManager {
    error AdvanceNonceFailed();
    event NonceIncreased(address indexed maker, uint256 newNonce);

    mapping(address => uint256) public nonce;

    /**
     * @notice Advances nonce by one
     */
    function increaseNonce() external {
        advanceNonce(1);
    }

    /**
     * @notice Advances nonce by specified amount
     * @param amount The amount to advance nonce by
     */
    function advanceNonce(uint256 amount) public {
        if (amount == 0 || amount > 255) revert AdvanceNonceFailed();
        unchecked {
            uint256 newNonce = nonce[msg.sender] + amount;
            nonce[msg.sender] = newNonce;
            emit NonceIncreased(msg.sender, newNonce);
        }
    }

    /**
     * @notice Checks if `makerAddress` has specified `makerNonce`
     * @param makerAddress The address to check
     * @param makerNonce The nonce to check
     * @return Result True if `makerAddress` has specified nonce. Otherwise, false
     */
    function nonceEquals(address makerAddress, uint256 makerNonce) public view returns(bool) {
        return nonce[makerAddress] == makerNonce;
    }
}
