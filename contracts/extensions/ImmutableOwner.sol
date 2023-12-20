// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

/// @title A helper contract with helper modifiers to allow access to original contract creator only
contract ImmutableOwner {
    error IOAccessDenied();

    address public immutable IMMUTABLE_OWNER;

    modifier onlyImmutableOwner {
        if (msg.sender != IMMUTABLE_OWNER) revert IOAccessDenied();
        _;
    }

    constructor(address _immutableOwner) {
        IMMUTABLE_OWNER = _immutableOwner;
    }
}
