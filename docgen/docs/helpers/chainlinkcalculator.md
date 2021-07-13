# ChainlinkCalculator

A helper contract for interactions with https://docs.chain.link



## Functions
### singlePrice
```solidity
function singlePrice(
  contract AggregatorV3Interface oracle,
  uint256 inverseAndSpread,
  uint256 amount
) external returns (uint256)
```
Calculates price of token relative to ETH scaled by 1e18


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`oracle` | contract AggregatorV3Interface | concatenated inverse flag and spread. Lowest 254 bits specify spread amount. Spread is scaled by 1e9, i.e. 101% = 1.01e9, 99% = 0.99e9. Highest bit is set when oracle price should be inverted, e.g. for DAI-ETH oracle, inverse=false means that we request DAI price in ETH and inverse=true means that we request ETH price in DAI  
|`inverseAndSpread` | uint256 | 
|`amount` | uint256 | 

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Result`| contract AggregatorV3Interface | Token price times amount
### doublePrice
```solidity
function doublePrice(
  contract AggregatorV3Interface oracle1,
  contract AggregatorV3Interface oracle2,
  uint256 spread,
  uint256 amount
) external returns (uint256)
```
Calculates price of token A relative to token B. Note that order is important


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`oracle1` | contract AggregatorV3Interface | 
|`oracle2` | contract AggregatorV3Interface | 
|`spread` | uint256 | 
|`amount` | uint256 | 

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Result`| contract AggregatorV3Interface | Token A relative price times amount
