// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


contract NonceManager {
    event NonceIncreased(address indexed maker, uint256 newNonce);

    mapping(address => uint256) private _nonces;

    function nonce(address makerAddress) external view returns(uint256) {
        return _nonces[makerAddress];
    }

    function increaseNonce() external {
        advanceNonce(1);
    }

    function advanceNonce(uint8 amount) public {
        uint256 newNonce = _nonces[msg.sender] + amount;
        _nonces[msg.sender] = newNonce;
        emit NonceIncreased(msg.sender, newNonce);
    }

    function nonceEquals(address makerAddress, uint256 makerNonce) external view returns(bool) {
        return _nonces[makerAddress] == makerNonce;
    }
}
