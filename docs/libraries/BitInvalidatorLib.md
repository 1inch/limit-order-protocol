
## BitInvalidatorLib

_The library provides a mechanism to invalidate objects based on a bit invalidator.
The bit invalidator holds a mapping where each key represents a slot number and each value contains an integer.
Each bit of the integer represents whether the object with corresponding index is valid or has been invalidated (0 - valid, 1 - invalidated).
The nonce given to access or invalidate an entity's state follows this structure:
- bits [0..7] represent the object state index in the slot.
- bits [8..255] represent the slot number (mapping key)._

### Types list
- [Data](#data)

### Functions list
- [checkSlot(self, nonce) internal](#checkslot)
- [checkAndInvalidate(self, nonce) internal](#checkandinvalidate)
- [massInvalidate(self, nonce, additionalMask) internal](#massinvalidate)

### Errors list
- [BitInvalidatedOrder() ](#bitinvalidatedorder)

### Types
### Data

```solidity
struct Data {
  mapping(uint256 => uint256) _raw;
}
```

### Functions
### checkSlot

```solidity
function checkSlot(struct BitInvalidatorLib.Data self, uint256 nonce) internal view returns (uint256)
```
Retrieves the validity status of entities in a specific slot.

_Each bit in the returned value corresponds to the validity of an entity. 0 for valid, 1 for invalidated._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| self | struct BitInvalidatorLib.Data | The data structure. |
| nonce | uint256 | The nonce identifying the slot. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | uint256 | result The validity status of entities in the slot as a uint256. |

### checkAndInvalidate

```solidity
function checkAndInvalidate(struct BitInvalidatorLib.Data self, uint256 nonce) internal
```
Checks the validity of a specific entity and invalidates it if valid.

_Throws an error if the entity has already been invalidated._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| self | struct BitInvalidatorLib.Data | The data structure. |
| nonce | uint256 | The nonce identifying the slot and the entity. |

### massInvalidate

```solidity
function massInvalidate(struct BitInvalidatorLib.Data self, uint256 nonce, uint256 additionalMask) internal returns (uint256 result)
```
Invalidates multiple entities in a single slot.

_The entities to be invalidated are identified by setting their corresponding bits to 1 in a mask._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| self | struct BitInvalidatorLib.Data | The data structure. |
| nonce | uint256 | The nonce identifying the slot. |
| additionalMask | uint256 | A mask of bits to be invalidated. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
result | uint256 | Resulting validity status of entities in the slot as a uint256. |

### Errors
### BitInvalidatedOrder

```solidity
error BitInvalidatedOrder()
```

_The error is thrown when an attempt is made to invalidate an already invalidated entity._

