


## Functions
### getMakerAmount
```solidity
  function getMakerAmount(
  ) external returns (uint256)
```
Calculates maker amount



#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Floored`| uint256 | maker amount
### getTakerAmount
```solidity
  function getTakerAmount(
  ) external returns (uint256)
```
Calculates taker amount



#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Ceiled`| uint256 | taker amount
### arbitraryStaticCall
```solidity
  function arbitraryStaticCall(
  ) external returns (uint256)
```
Performs an arbitrary call to target with data



#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Result`| address | bytes transmuted to uint256
