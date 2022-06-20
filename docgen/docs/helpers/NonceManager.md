# NonceManager


A helper contract for managing nonce of tx sender




## Functions
### increaseNonce
```solidity
function increaseNonce(
) external
```
Advances nonce by one



### advanceNonce
```solidity
function advanceNonce(
  uint8 amount
) public
```
Advances nonce by specified amount

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`amount` | uint8 | 


### nonceEquals
```solidity
function nonceEquals(
  address makerAddress,
  uint256 makerNonce
) external returns (bool)
```
Checks if `makerAddress` has specified `makerNonce`


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
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
  uint256 newNonce
)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`maker` | address | 
|`newNonce` | uint256 | 

