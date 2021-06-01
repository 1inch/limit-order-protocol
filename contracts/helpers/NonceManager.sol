// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


contract NonceManager {
    event NonceIncreased(address indexed maker, uint256 newNonce);

    mapping(address => uint256) public nonce;

    function increaseNonce() external {
        advanceNonce(1);
    }

    function advanceNonce(uint8 amount) public {
        emit NonceIncreased(msg.sender, nonce[msg.sender] += amount);
    }

    function nonceEquals(address makerAddress, uint256 makerNonce) external view returns(bool) {
        return nonce[makerAddress] == makerNonce;
    }
}
