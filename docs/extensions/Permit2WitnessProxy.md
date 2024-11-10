
## Permit2WitnessProxy

### Types list
- [Witness](#witness)

### Functions list
- [constructor(_immutableOwner) public](#constructor)
- [func_801zDya(from, to, amount, permit, witness, sig) external](#func_801zdya)

### Errors list
- [Permit2WitnessProxyBadSelector() ](#permit2witnessproxybadselector)

### Types
### Witness

```solidity
struct Witness {
  bytes32 salt;
}
```

### Functions
### constructor

```solidity
constructor(address _immutableOwner) public
```

### func_801zDya

```solidity
function func_801zDya(address from, address to, uint256 amount, struct IPermit2WitnessTransferFrom.PermitTransferFrom permit, bytes32 witness, bytes sig) external
```
Proxy transfer method for `Permit2.permitWitnessTransferFrom`. Selector must match `IERC20.transferFrom`

### Errors
### Permit2WitnessProxyBadSelector

```solidity
error Permit2WitnessProxyBadSelector()
```

