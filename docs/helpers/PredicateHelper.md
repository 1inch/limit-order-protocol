
## PredicateHelper

### Functions list
- [or(offsets, data) public](#or)
- [and(offsets, data) public](#and)
- [not(data) public](#not)
- [eq(value, data) public](#eq)
- [lt(value, data) public](#lt)
- [gt(value, data) public](#gt)
- [arbitraryStaticCall(target, data) public](#arbitrarystaticcall)
- [_staticcallForUint(target, data) internal](#_staticcallforuint)

### Errors list
- [ArbitraryStaticCallFailed() ](#arbitrarystaticcallfailed)

### Functions
### or

```solidity
function or(uint256 offsets, bytes data) public view returns (bool)
```
Calls every target with corresponding data

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | Result True if call to any target returned True. Otherwise, false |

### and

```solidity
function and(uint256 offsets, bytes data) public view returns (bool)
```
Calls every target with corresponding data

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | Result True if calls to all targets returned True. Otherwise, false |

### not

```solidity
function not(bytes data) public view returns (bool)
```
Calls target with specified data and tests if it's equal to 0

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | Result True if call to target returns 0. Otherwise, false |

### eq

```solidity
function eq(uint256 value, bytes data) public view returns (bool)
```
Calls target with specified data and tests if it's equal to the value

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| value | uint256 | Value to test |
| data | bytes |  |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | Result True if call to target returns the same value as `value`. Otherwise, false |

### lt

```solidity
function lt(uint256 value, bytes data) public view returns (bool)
```
Calls target with specified data and tests if it's lower than value

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| value | uint256 | Value to test |
| data | bytes |  |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | Result True if call to target returns value which is lower than `value`. Otherwise, false |

### gt

```solidity
function gt(uint256 value, bytes data) public view returns (bool)
```
Calls target with specified data and tests if it's bigger than value

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| value | uint256 | Value to test |
| data | bytes |  |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | Result True if call to target returns value which is bigger than `value`. Otherwise, false |

### arbitraryStaticCall

```solidity
function arbitraryStaticCall(address target, bytes data) public view returns (uint256)
```
Performs an arbitrary call to target with data

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | uint256 | Result Bytes transmuted to uint256 |

### _staticcallForUint

```solidity
function _staticcallForUint(address target, bytes data) internal view returns (bool success, uint256 res)
```

### Errors
### ArbitraryStaticCallFailed

```solidity
error ArbitraryStaticCallFailed()
```

