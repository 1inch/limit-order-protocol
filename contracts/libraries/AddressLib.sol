// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

library AddressLib {
    type Address is uint256;

    function get(Address account) internal pure returns (address) {
        return address(uint160(Address.unwrap(account)));
    }
}
