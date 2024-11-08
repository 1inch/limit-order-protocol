
## IAmountGetter

### Functions list
- [getMakingAmount(order, extension, orderHash, taker, takingAmount, remainingMakingAmount, extraData) external](#getmakingamount)
- [getTakingAmount(order, extension, orderHash, taker, makingAmount, remainingMakingAmount, extraData) external](#gettakingamount)

### Functions
### getMakingAmount

```solidity
function getMakingAmount(struct IOrderMixin.Order order, bytes extension, bytes32 orderHash, address taker, uint256 takingAmount, uint256 remainingMakingAmount, bytes extraData) external view returns (uint256)
```
View method that gets called to determine the actual making amount

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | Order being processed |
| extension | bytes | Order extension data |
| orderHash | bytes32 | Hash of the order being processed |
| taker | address | Taker address |
| takingAmount | uint256 | Actual taking amount |
| remainingMakingAmount | uint256 | Order remaining making amount |
| extraData | bytes | Extra data |

### getTakingAmount

```solidity
function getTakingAmount(struct IOrderMixin.Order order, bytes extension, bytes32 orderHash, address taker, uint256 makingAmount, uint256 remainingMakingAmount, bytes extraData) external view returns (uint256)
```
View method that gets called to determine the actual making amount

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | Order being processed |
| extension | bytes | Order extension data |
| orderHash | bytes32 | Hash of the order being processed |
| taker | address | Taker address |
| makingAmount | uint256 | Actual taking amount |
| remainingMakingAmount | uint256 | Order remaining making amount |
| extraData | bytes | Extra data |

