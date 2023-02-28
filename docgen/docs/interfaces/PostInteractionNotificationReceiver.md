# PostInteraction







## Functions
### postInteraction
```solidity
function postInteraction(
  address taker,
  address makerAsset,
  address takerAsset,
  uint256 makingAmount,
  uint256 takingAmount,
  bytes interactiveData
) external
```
Callback method that gets called after taker transferred funds to maker but before
the opposite transfer happened

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`taker` | address | 
|`makerAsset` | address | 
|`takerAsset` | address | 
|`makingAmount` | uint256 | 
|`takingAmount` | uint256 | 
|`interactiveData` | bytes | 


