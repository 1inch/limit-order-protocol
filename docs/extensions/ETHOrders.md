
## ETHOrders

### Types list
- [ETHOrder](#ethorder)

### Functions list
- [constructor(weth, limitOrderProtocol) public](#constructor)
- [ethOrdersBatch(orderHashes) external](#ethordersbatch)
- [ethOrderDeposit(order, extension) external](#ethorderdeposit)
- [cancelOrder(makerTraits, orderHash) external](#cancelorder)
- [isValidSignature(orderHash, signature) external](#isvalidsignature)
- [postInteraction(, , orderHash, , makingAmount, , , ) external](#postinteraction)

### Events list
- [ETHDeposited(orderHash, amount) ](#ethdeposited)
- [ETHOrderCancelled(orderHash, amount) ](#ethordercancelled)

### Errors list
- [AccessDenied() ](#accessdenied)
- [InvalidOrder() ](#invalidorder)
- [NotEnoughBalance() ](#notenoughbalance)
- [ExistingOrder() ](#existingorder)

### Types
### ETHOrder

ETH order struct.

```solidity
struct ETHOrder {
  address maker;
  uint96 balance;
}
```

### Functions
### constructor

```solidity
constructor(contract IWETH weth, address limitOrderProtocol) public
```

### ethOrdersBatch

```solidity
function ethOrdersBatch(bytes32[] orderHashes) external view returns (struct ETHOrders.ETHOrder[] ethOrders)
```

### ethOrderDeposit

```solidity
function ethOrderDeposit(struct IOrderMixin.Order order, bytes extension) external payable returns (bytes32 orderHash)
```

### cancelOrder

```solidity
function cancelOrder(MakerTraits makerTraits, bytes32 orderHash) external
```
Sets ordersMakersBalances to 0, refunds ETH and does standard order cancellation on Limit Order Protocol.

### isValidSignature

```solidity
function isValidSignature(bytes32 orderHash, bytes signature) external view returns (bytes4)
```
Checks if orderHash signature was signed with real order maker.

### postInteraction

```solidity
function postInteraction(struct IOrderMixin.Order, bytes, bytes32 orderHash, address, uint256 makingAmount, uint256, uint256, bytes) external
```
Callback method that gets called after all funds transfers.
Updates _ordersMakersBalances by makingAmount for order with orderHash.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
|  | struct IOrderMixin.Order |  |
|  | bytes |  |
| orderHash | bytes32 | Hash of the order being processed |
|  | address |  |
| makingAmount | uint256 | Actual making amount |
|  | uint256 |  |
|  | uint256 |  |
|  | bytes |  |

### Events
### ETHDeposited

```solidity
event ETHDeposited(bytes32 orderHash, uint256 amount)
```

### ETHOrderCancelled

```solidity
event ETHOrderCancelled(bytes32 orderHash, uint256 amount)
```

### Errors
### AccessDenied

```solidity
error AccessDenied()
```

### InvalidOrder

```solidity
error InvalidOrder()
```

### NotEnoughBalance

```solidity
error NotEnoughBalance()
```

### ExistingOrder

```solidity
error ExistingOrder()
```

