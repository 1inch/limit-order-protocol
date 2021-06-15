# ArgumentsDecoder





## Functions
### decodeSelector
```solidity
function decodeSelector(
  bytes data
) internal returns (bytes4 selector)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`data` | bytes | 


### decodeAddress
```solidity
function decodeAddress(
  bytes data,
  uint256 argumentIndex
) internal returns (address account)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`data` | bytes | 
|`argumentIndex` | uint256 | 


### decodeUint256
```solidity
function decodeUint256(
  bytes data,
  uint256 argumentIndex
) internal returns (uint256 value)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`data` | bytes | 
|`argumentIndex` | uint256 | 


### patchAddress
```solidity
function patchAddress(
  bytes data,
  uint256 argumentIndex,
  address account
) internal
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`data` | bytes | 
|`argumentIndex` | uint256 | 
|`account` | address | 


### patchUint256
```solidity
function patchUint256(
  bytes data,
  uint256 argumentIndex,
  uint256 value
) internal
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`data` | bytes | 
|`argumentIndex` | uint256 | 
|`value` | uint256 | 


