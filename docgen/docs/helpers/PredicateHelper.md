# PredicateHelper


A helper contract for executing boolean functions on arbitrary target call results




## Functions
### or
```solidity
function or(
  address[] targets,
  bytes[] data
) external returns (bool)
```
Calls every target with corresponding data


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`targets` | address[] | 
|`data` | bytes[] | 

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Result`| bool | True if call to any target returned True. Otherwise, false

### and
```solidity
function and(
  address[] targets,
  bytes[] data
) external returns (bool)
```
Calls every target with corresponding data


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`targets` | address[] | 
|`data` | bytes[] | 

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Result`| bool | True if calls to all targets returned True. Otherwise, false

### eq
```solidity
function eq(
  uint256 value,
  address target,
  bytes data
) external returns (bool)
```
Calls target with specified data and tests if it's equal to the value


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`value` | uint256 | Value to test  
|`target` | address | 
|`data` | bytes | 

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Result`| bool | True if call to target returns the same value as `value`. Otherwise, false

### lt
```solidity
function lt(
  uint256 value,
  address target,
  bytes data
) external returns (bool)
```
Calls target with specified data and tests if it's lower than value


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`value` | uint256 | Value to test  
|`target` | address | 
|`data` | bytes | 

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Result`| bool | True if call to target returns value which is lower than `value`. Otherwise, false

### gt
```solidity
function gt(
  uint256 value,
  address target,
  bytes data
) external returns (bool)
```
Calls target with specified data and tests if it's bigger than value


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`value` | uint256 | Value to test  
|`target` | address | 
|`data` | bytes | 

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Result`| bool | True if call to target returns value which is bigger than `value`. Otherwise, false

### timestampBelow
```solidity
function timestampBelow(
  uint256 time
) external returns (bool)
```
Checks passed time against block timestamp


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`time` | uint256 | 

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Result`| bool | True if current block timestamp is lower than `time`. Otherwise, false

