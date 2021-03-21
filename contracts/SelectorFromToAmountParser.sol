// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./utils/BytesParser.sol";


library SelectorFromToAmountParser {
    using BytesParser for bytes;

    function getArgumentSelector(bytes memory data) internal pure returns(bytes4) {
        return (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3];
    }

    function getArgumentFrom(bytes memory data) internal pure returns(address) {
        return address(uint160(uint256(data.sliceBytes32(4))));
    }

    function getArgumentTo(bytes memory data) internal pure returns(address) {
        return address(uint160(uint256(data.sliceBytes32(36))));
    }

    function getArgumentAmount(bytes memory data) internal pure returns(uint256) {
        return uint256(data.sliceBytes32(68));
    }
}
