# ArgumentsDecoder


Library with gas efficient alternatives to `abi.decode`




## Functions
### decodeUint256Memory
```solidity
function decodeUint256Memory(
  bytes data
) internal returns (uint256 value)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`data` | bytes | 


### decodeUint256
```solidity
function decodeUint256(
  bytes data
) internal returns (uint256 value)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`data` | bytes | 


### decodeBoolMemory
```solidity
function decodeBoolMemory(
  bytes data
) internal returns (bool value)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`data` | bytes | 


### decodeBool
```solidity
function decodeBool(
  bytes data
) internal returns (bool value)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`data` | bytes | 


### decodeTargetAndCalldata
```solidity
function decodeTargetAndCalldata(
  bytes data
) internal returns (address target, bytes args)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`data` | bytes | 


