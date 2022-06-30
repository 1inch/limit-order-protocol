// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;
pragma abicoder v1;

import "../interfaces/IWhitelistRegistry.sol";

contract WhitelistRegistryMock is IWhitelistRegistry {
    bool public allowed;

    function allow() public {
        allowed = true;
    }

    function ban() public {
        allowed = false;
    }

    function status(address) external view returns (uint256) {
        if (allowed) {
            return 1;
        }

        return 0;
    }
}
