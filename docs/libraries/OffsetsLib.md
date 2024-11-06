
## Offsets

## OffsetsLib

_A library for retrieving values by offsets from a concatenated calldata._

### Functions list
- [get(offsets, concat, index) internal](#get)

### Errors list
- [OffsetOutOfBounds() ](#offsetoutofbounds)

### Functions
### get

```solidity
function get(Offsets offsets, bytes concat, uint256 index) internal pure returns (bytes result)
```
Retrieves the field value calldata corresponding to the provided field index from the concatenated calldata.

_The function performs the following steps:
1. Retrieve the start and end of the segment corresponding to the provided index from the offsets array.
2. Get the value from segment using offset and length calculated based on the start and end of the segment.
3. Throw `OffsetOutOfBounds` error if the length of the segment is greater than the length of the concatenated data._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| offsets | Offsets | The offsets encoding the start and end of each segment within the concatenated calldata. |
| concat | bytes | The concatenated calldata. |
| index | uint256 | The index of the segment to retrieve. The field index 0 corresponds to the lowest bytes of the offsets array. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
result | bytes | The calldata from a segment of the concatenated calldata corresponding to the provided index. |

### Errors
### OffsetOutOfBounds

```solidity
error OffsetOutOfBounds()
```

_Error to be thrown when the offset is out of bounds._

