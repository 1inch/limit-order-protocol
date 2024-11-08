
## SafeOrderBuilder

_The contract is responsible for building and signing limit orders for the GnosisSafe.
The contract uses oracles to adjust the order taking amount based on the volatility of the maker and taker assets._

### Types list
- [OracleQueryParams](#oraclequeryparams)

### Functions list
- [constructor(limitOrderProtocol, orderRegistrator) public](#constructor)
- [buildAndSignOrder(order, extension, makerAssetOracleParams, takerAssetOracleParams) external](#buildandsignorder)

### Errors list
- [StaleOraclePrice() ](#staleoracleprice)

### Types
### OracleQueryParams

```solidity
struct OracleQueryParams {
  contract AggregatorV3Interface oracle;
  uint256 originalAnswer;
  uint256 ttl;
}
```

### Functions
### constructor

```solidity
constructor(contract IOrderMixin limitOrderProtocol, contract IOrderRegistrator orderRegistrator) public
```

### buildAndSignOrder

```solidity
function buildAndSignOrder(struct IOrderMixin.Order order, bytes extension, struct SafeOrderBuilder.OracleQueryParams makerAssetOracleParams, struct SafeOrderBuilder.OracleQueryParams takerAssetOracleParams) external
```
Builds and signs a limit order for the GnosisSafe.
The order is signed by the GnosisSafe and registered in the order registrator.
The order taking amount is adjusted based on the volatility of the maker and taker assets.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | The order to be built and signed. |
| extension | bytes | The extension data associated with the order. |
| makerAssetOracleParams | struct SafeOrderBuilder.OracleQueryParams | The oracle query parameters for the maker asset. |
| takerAssetOracleParams | struct SafeOrderBuilder.OracleQueryParams | The oracle query parameters for the taker asset. |

### Errors
### StaleOraclePrice

```solidity
error StaleOraclePrice()
```

