
## AmountCalculatorLib

### Functions list
- [getMakingAmount(orderMakerAmount, orderTakerAmount, swapTakerAmount) internal](#getmakingamount)
- [getTakingAmount(orderMakerAmount, orderTakerAmount, swapMakerAmount) internal](#gettakingamount)

### Functions
### getMakingAmount

```solidity
function getMakingAmount(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapTakerAmount) internal pure returns (uint256)
```
Calculates maker amount

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | uint256 | Result Floored maker amount |

### getTakingAmount

```solidity
function getTakingAmount(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapMakerAmount) internal pure returns (uint256)
```
Calculates taker amount

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | uint256 | Result Ceiled taker amount |

