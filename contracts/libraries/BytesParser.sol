// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


library BytesParser {
    function sliceBytes32(bytes memory data, uint256 start) internal pure returns(bytes32 result) {
        require(start + 32 <= data.length, "BP: sliceBytes32 out of range");
        assembly {  // solhint-disable-line no-inline-assembly
            result := mload(add(add(data, 0x20), start))
        }
    }

    function patchBytes32(bytes memory data, uint256 start, bytes32 value) internal pure returns(bytes memory result) {
        require(start + 32 <= data.length, "BP: patchBytes32 out of range");
        assembly {  // solhint-disable-line no-inline-assembly
            mstore(add(add(data, 0x20), start), value)
        }
        return data;
    }
}
