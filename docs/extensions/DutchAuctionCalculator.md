
## DutchAuctionCalculator

The contract implements Dutch auction price calculation for 1inch limit orders, it is used by 1inch Fusion

### Functions list
- [getMakingAmount(order, , , , takingAmount, , extraData) external](#getmakingamount)
- [getTakingAmount(order, , , , makingAmount, , extraData) external](#gettakingamount)

### Functions
### getMakingAmount

```solidity
function getMakingAmount(struct IOrderMixin.Order order, bytes, bytes32, address, uint256 takingAmount, uint256, bytes extraData) external view returns (uint256)
```

### getTakingAmount

```solidity
function getTakingAmount(struct IOrderMixin.Order order, bytes, bytes32, address, uint256 makingAmount, uint256, bytes extraData) external view returns (uint256)
```

