// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "../libraries/ExtensionLib.sol";

contract ExtensionMock {
    using ExtensionLib for bytes;

    function getCustomData(bytes calldata extension) external pure returns (bytes calldata) {
        return extension.customData();
    }
}
