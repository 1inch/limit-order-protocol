# WhitelistChecker






## Derives
- PreInteractionNotificationReceiver

## Functions
### constructor
```solidity
function constructor(
  contract IWhitelistRegistry _whitelistRegistry
) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_whitelistRegistry` | contract IWhitelistRegistry | 


### fillOrderPreInteraction
```solidity
function fillOrderPreInteraction(
  address taker,
  address makerAsset,
  address takerAsset,
  uint256 makingAmount,
  uint256 takingAmount,
  bytes nextInteractiveData
) external
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`taker` | address | 
|`makerAsset` | address | 
|`takerAsset` | address | 
|`makingAmount` | uint256 | 
|`takingAmount` | uint256 | 
|`nextInteractiveData` | bytes | 


