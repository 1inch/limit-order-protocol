// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

type Offsets is uint256;

library OffsetsLib {
    error OffsetOutOfBounds();

    function get(Offsets offsets, bytes calldata concat, uint256 index) internal pure returns(bytes calldata result) {
        bytes4 exception = OffsetOutOfBounds.selector;
        assembly ("memory-safe") {  // solhint-disable-line no-inline-assembly
            let end := and(0xffffffff, shr(shl(5, index), offsets))
            switch end
            case 0 {
                // Keep length zero for non-initialized fields
                result.offset := 0
                result.length := 0
            }
            default {
                let begin := and(0xffffffff, shr(shl(5, index), shl(32, offsets)))
                result.offset := add(concat.offset, begin)
                result.length := sub(end, begin)
                if gt(add(result.offset, result.length), add(concat.offset, concat.length)) {
                    mstore(0, exception)
                    revert(0, 4)
                }
            }
        }
    }
}
