// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

type Offsets is uint256;

/// @title OffsetsLib
/// @dev A library for retrieving values by offsets from a concatenated calldata.
library OffsetsLib {

    /// @dev Error to be thrown when the offset is out of bounds.
    error OffsetOutOfBounds();

    /**
     * @notice Retrieves the field value calldata corresponding to the provided field index from the concatenated calldata.
     * @dev 
     * The function performs the following steps:
     * 1. Retrieve the start and end of the segment corresponding to the provided index from the offsets array.
     * 2. Get the value from segment using offset and length calculated based on the start and end of the segment.
     * 3. Throw `OffsetOutOfBounds` error if the length of the segment is greater than the length of the concatenated data.
     * @param offsets The offsets encoding the start and end of each segment within the concatenated calldata.
     * @param concat The concatenated calldata.
     * @param index The index of the segment to retrieve. The field index 0 corresponds to the lowest bytes of the offsets array.
     * @return result The calldata from a segment of the concatenated calldata corresponding to the provided index.
     */
    function get(Offsets offsets, bytes calldata concat, uint256 index) internal pure returns(bytes calldata result) {
        bytes4 exception = OffsetOutOfBounds.selector;
        assembly ("memory-safe") {  // solhint-disable-line no-inline-assembly
            let bitShift := shl(5, index)                                   // bitShift = index * 32
            let begin := and(0xffffffff, shr(bitShift, shl(32, offsets)))   // begin = offsets[ bitShift : bitShift + 32 ]
            let end := and(0xffffffff, shr(bitShift, offsets))              // end   = offsets[ bitShift + 32 : bitShift + 64 ]
            result.offset := add(concat.offset, begin)
            result.length := sub(end, begin)
            if gt(end, concat.length) {
                mstore(0, exception)
                revert(0, 4)
            }
        }
    }
}
