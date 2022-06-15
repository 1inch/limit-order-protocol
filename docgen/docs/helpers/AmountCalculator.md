# AmountCalculator


A helper contract for calculations related to order amounts




## Functions
### getMakingAmount
```solidity
function getMakingAmount(
  uint256 orderMakerAmount,
  uint256 orderTakerAmount,
  uint256 swapTakerAmount
) public returns (uint256)
```
Calculates maker amount


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`orderMakerAmount` | uint256 | 
|`orderTakerAmount` | uint256 | 
|`swapTakerAmount` | uint256 | 

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Result`| uint256 | Floored maker amount

### getTakingAmount
```solidity
function getTakingAmount(
  uint256 orderMakerAmount,
  uint256 orderTakerAmount,
  uint256 swapMakerAmount
) public returns (uint256)
```
Calculates taker amount


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`orderMakerAmount` | uint256 | 
|`orderTakerAmount` | uint256 | 
|`swapMakerAmount` | uint256 | 

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Result`| uint256 | Ceiled taker amount

### arbitraryStaticCall
```solidity
function arbitraryStaticCall(
  address target,
  bytes data
) external returns (uint256)
```
Performs an arbitrary call to target with data


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`target` | address | 
|`data` | bytes | 

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Result`| uint256 | Bytes transmuted to uint256

