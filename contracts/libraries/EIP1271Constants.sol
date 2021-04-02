// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../interfaces/IEIP1271.sol";


library EIP1271Constants {
    // bytes4(keccak256("isValidSignature(bytes32,bytes)")) = 0x1626ba7e
    bytes4 constant internal _MAGIC_VALUE = IEIP1271.isValidSignature.selector;
}
