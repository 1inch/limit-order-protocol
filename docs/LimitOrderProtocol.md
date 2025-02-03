
## LimitOrderProtocol

Limit order protocol provides two different order types
- Regular Limit Order
- RFQ Order

Both types provide similar order-fulfilling functionality. The difference is that regular order offers more customization options and features, while RFQ order is extremely gas efficient but without ability to customize.

Regular limit order additionally supports
- Execution predicates. Conditions for order execution are set with predicates. For example, expiration timestamp or block number, price for stop loss or take profit strategies.
- Callbacks to notify maker on order execution

See [OrderMixin](OrderMixin.md) for more details.

RFQ orders supports
- Expiration time
- Cancellation by order id
- Partial Fill (only once)

See [OrderMixin](OrderMixin.md) for more details.

### Functions list
- [constructor(_weth) public](#constructor)
- [DOMAIN_SEPARATOR() external](#domain_separator)
- [pause() external](#pause)
- [unpause() external](#unpause)

### Functions
### constructor

```solidity
constructor(contract IWETH _weth) public
```

### DOMAIN_SEPARATOR

```solidity
function DOMAIN_SEPARATOR() external view returns (bytes32)
```

_Returns the domain separator for the current chain (EIP-712)_

### pause

```solidity
function pause() external
```
Pauses all the trading functionality in the contract.

### unpause

```solidity
function unpause() external
```
Unpauses all the trading functionality in the contract.

