


## Functions
### singlePrice
```solidity
  function singlePrice(
    contract AggregatorV3Interface inverseAndSpread
  ) external returns (uint256)
```
Calculates price of token relative to ETH scaled by 1e18


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`inverseAndSpread` | contract AggregatorV3Interface | concatenated inverse flag and spread.
Lowest 254 bits specify spread amount. Spread is scaled by 1e9, i.e. 101% = 1.01e9, 99% = 0.99e9.
Highest bit is set when oracle price should be inverted,
e.g. for DAI-ETH oracle, inverse=false means that we request DAI price in ETH
and inverse=true means that we request ETH price in DAI

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Token`| contract AggregatorV3Interface | price times amount
### doublePrice
```solidity
  function doublePrice(
  ) external returns (uint256)
```
Calculates price of token A relative to token B. Note that order is important



#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Token`| contract AggregatorV3Interface | A relative price times amount
