# SeriesNonceManager


A helper contract to manage nonce with the series




## Functions
### increaseNonce
```solidity
function increaseNonce(
  uint8 series
) external
```
Advances nonce by one

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`series` | uint8 | 


### advanceNonce
```solidity
function advanceNonce(
  uint8 series,
  uint8 amount
) public
```
Advances nonce by specified amount

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`series` | uint8 | 
|`amount` | uint8 | 


### nonceEquals
```solidity
function nonceEquals(
  uint8 series,
  address makerAddress,
  uint256 makerNonce
) external returns (bool)
```
Checks if `makerAddress` has specified `makerNonce` for `series`


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`series` | uint8 | 
|`makerAddress` | address | 
|`makerNonce` | uint256 | 

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Result`| bool | True if `makerAddress` has specified nonce. Otherwise, false

## Events
### NonceIncreased
```solidity
event NonceIncreased(
  address maker,
  uint8 series,
  uint256 newNonce
)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`maker` | address | 
|`series` | uint8 | 
|`newNonce` | uint256 | 

