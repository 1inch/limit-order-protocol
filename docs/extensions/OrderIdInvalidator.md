
## OrderIdInvalidator

OrderIdInvalidator stores pairs (orderId, orderHash)
that allows to execute only one order with the same orderId

### Functions list
- [constructor(limitOrderProtocol_) public](#constructor)
- [preInteraction(order, , orderHash, , , , , extraData) external](#preinteraction)

### Errors list
- [AccessDenied() ](#accessdenied)
- [InvalidOrderHash() ](#invalidorderhash)

### Functions
### constructor

```solidity
constructor(address limitOrderProtocol_) public
```

### preInteraction

```solidity
function preInteraction(struct IOrderMixin.Order order, bytes, bytes32 orderHash, address, uint256, uint256, uint256, bytes extraData) external
```

### Errors
### AccessDenied

```solidity
error AccessDenied()
```

### InvalidOrderHash

```solidity
error InvalidOrderHash()
```

