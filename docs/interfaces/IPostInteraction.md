
## IPostInteraction

### Functions list
- [postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData) external](#postinteraction)

### Functions
### postInteraction

```solidity
function postInteraction(struct IOrderMixin.Order order, bytes extension, bytes32 orderHash, address taker, uint256 makingAmount, uint256 takingAmount, uint256 remainingMakingAmount, bytes extraData) external
```
Callback method that gets called after all fund transfers

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | Order being processed |
| extension | bytes | Order extension data |
| orderHash | bytes32 | Hash of the order being processed |
| taker | address | Taker address |
| makingAmount | uint256 | Actual making amount |
| takingAmount | uint256 | Actual taking amount |
| remainingMakingAmount | uint256 | Order remaining making amount |
| extraData | bytes | Extra data |

