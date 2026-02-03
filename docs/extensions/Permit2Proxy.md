
## Permit2Proxy

A proxy contract that enables using Uniswap's Permit2 `permitTransferFrom` within the limit order protocol without the witness functionality.

### Functions list
- [constructor(_immutableOwner) public](#constructor)
- [func_nZHTch(from, to, amount, permit, sig) external](#func_nzhtch)

### Errors list
- [Permit2ProxyBadSelector()](#permit2proxybadselector)

### Functions
### constructor

```solidity
constructor(address _immutableOwner) public
```

### func_nZHTch

```solidity
function func_nZHTch(address from, address to, uint256 amount, struct IPermit2TransferFrom.PermitTransferFrom permit, bytes sig) external
```
Proxy transfer method for `Permit2.permitTransferFrom`. Selector must match `IERC20.transferFrom`

The function name `func_nZHTch` is chosen so that its selector equals `0x23b872dd` (same as `IERC20.transferFrom`), allowing it to be used as a maker asset in limit orders.

### Errors
### Permit2ProxyBadSelector

```solidity
error Permit2ProxyBadSelector()
```

Thrown in the constructor if the function selector doesn't match `IERC20.transferFrom.selector`.

