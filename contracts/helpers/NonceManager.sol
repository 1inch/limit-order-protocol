// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Counters.sol";


contract NonceManager {
    using Counters for Counters.Counter;

    mapping(address => Counters.Counter) private _nonces;

    function nonces(address makerAddress) external view returns(uint256) {
        return _nonces[makerAddress].current();
    }

    function advanceNonce() external {
        _nonces[msg.sender].increment();
    }

    function nonceEquals(address makerAddress, uint256 makerNonce) external view returns(bool) {
        return _nonces[makerAddress].current() == makerNonce;
    }
}
