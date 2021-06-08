


## Functions
### or
```solidity
  function or(
  ) external returns (bool)
```
Calls every target with corresponding data



#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`True`| address[] | if call to any target returned True. Otherwise, false
### and
```solidity
  function and(
  ) external returns (bool)
```
Calls every target with corresponding data



#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`True`| address[] | if calls to all targets returned True. Otherwise, false
### eq
```solidity
  function eq(
    uint256 value
  ) external returns (bool)
```
Calls target with specified data and tests if it's equal to the value


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`value` | uint256 | Value to test

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`True`| uint256 | if call to target returns the same value as `value`. Otherwise, false
### lt
```solidity
  function lt(
    uint256 value
  ) external returns (bool)
```
Calls target with specified data and tests if it's lower than value


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`value` | uint256 | Value to test

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`True`| uint256 | if call to target returns value which is lower than `value`. Otherwise, false
### gt
```solidity
  function gt(
    uint256 value
  ) external returns (bool)
```
Calls target with specified data and tests if it's bigger than value


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`value` | uint256 | Value to test

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`True`| uint256 | if call to target returns value which is bigger than `value`. Otherwise, false
### timestampBelow
```solidity
  function timestampBelow(
  ) external returns (bool)
```
Checks passed time against block timestamp



#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`True`| uint256 | if current block timestamp is lower than `time`. Otherwise, false
