
## RangeAmountCalculator

A range limit order is a strategy used to sell an asset within a specified price range.
For instance, suppose you anticipate the value of ETH to increase in the next week from its
current worth of 3000 DAI to a minimum of 4000 DAI.
In that case, you can create an ETH -> DAI limit order within the price range of 3000 -> 4000.
For example, you could create an order to sell 10 ETH within that price range.

When someone places a bid for the entire limit order, they may purchase it all at once at
an average price of 3500 DAI. Alternatively, the limit order may be executed in portions.
For instance, the buyer might purchase 1 ETH for 3050 DAI, then another 1 ETH for 3150 DAI, and so on.

Function of the changing price of makerAsset tokens in takerAsset tokens by the filling amount of makerAsset tokens in order:
     priceEnd - priceStart
y = ----------------------- * x + priceStart
          totalAmount

### Functions list
- [getTakingAmount(order, , , , makingAmount, remainingMakingAmount, extraData) external](#gettakingamount)
- [getMakingAmount(order, , , , takingAmount, remainingMakingAmount, extraData) external](#getmakingamount)
- [getRangeTakerAmount(priceStart, priceEnd, orderMakingAmount, makingAmount, remainingMakingAmount) public](#getrangetakeramount)
- [getRangeMakerAmount(priceStart, priceEnd, orderMakingAmount, takingAmount, remainingMakingAmount) public](#getrangemakeramount)

### Errors list
- [IncorrectRange() ](#incorrectrange)

### Functions
### getTakingAmount

```solidity
function getTakingAmount(struct IOrderMixin.Order order, bytes, bytes32, address, uint256 makingAmount, uint256 remainingMakingAmount, bytes extraData) external pure returns (uint256)
```

### getMakingAmount

```solidity
function getMakingAmount(struct IOrderMixin.Order order, bytes, bytes32, address, uint256 takingAmount, uint256 remainingMakingAmount, bytes extraData) external pure returns (uint256)
```

### getRangeTakerAmount

```solidity
function getRangeTakerAmount(uint256 priceStart, uint256 priceEnd, uint256 orderMakingAmount, uint256 makingAmount, uint256 remainingMakingAmount) public pure returns (uint256)
```

### getRangeMakerAmount

```solidity
function getRangeMakerAmount(uint256 priceStart, uint256 priceEnd, uint256 orderMakingAmount, uint256 takingAmount, uint256 remainingMakingAmount) public pure returns (uint256)
```

### Errors
### IncorrectRange

```solidity
error IncorrectRange()
```

