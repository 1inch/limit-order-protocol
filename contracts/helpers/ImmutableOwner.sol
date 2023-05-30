// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

/// @title A helper contract with helper modifiers to allow access to original contract creator only
contract ImmutableOwner {
    error IOAccessDenied();

    address public immutable immutableOwner;

    modifier onlyImmutableOwner {
        if (msg.sender != immutableOwner) revert IOAccessDenied();
        _;
    }

    constructor(address _immutableOwner) {
        immutableOwner = _immutableOwner;
    }
}
