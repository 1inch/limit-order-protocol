
## Permit2Proxy

A proxy contract that enables using Uniswap's Permit2 `permitTransferFrom` within the limit order protocol without the witness functionality.

> **Important:** This proxy should only be used with orders that have partial fills disabled (`NO_PARTIAL_FILLS_FLAG` set in maker traits). Permit2's `SignatureTransfer` nonces are single-use — the nonce is consumed on the first fill, which means any subsequent partial fill attempt will revert.

### Functions list
- [constructor(_immutableOwner, _permit2) public](#constructor)
- [func_nZHTch(from, to, amount, permit, sig) external](#func_nzhtch)

### Errors list
- [Permit2ProxyBadSelector()](#permit2proxybadselector)

### Functions
### constructor

```solidity
constructor(address _immutableOwner, address _permit2) public
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _immutableOwner | address | The address of the limit order protocol contract |
| _permit2 | address | The Permit2 contract address. Use `0x000000000022D473030F116dDEE9F6B43aC78BA3` for EVM chains or `0x0000000000225e31d15943971f47ad3022f714fa` for zkSync |

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

