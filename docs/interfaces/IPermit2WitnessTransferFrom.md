
## IPermit2WitnessTransferFrom

### Types list
- [TokenPermissions](#tokenpermissions)
- [PermitTransferFrom](#permittransferfrom)
- [SignatureTransferDetails](#signaturetransferdetails)

### Functions list
- [permitWitnessTransferFrom(permit, transferDetails, owner, witness, witnessTypeString, signature) external](#permitwitnesstransferfrom)

### Types
### TokenPermissions

```solidity
struct TokenPermissions {
  address token;
  uint256 amount;
}
```
### PermitTransferFrom

```solidity
struct PermitTransferFrom {
  struct IPermit2WitnessTransferFrom.TokenPermissions permitted;
  uint256 nonce;
  uint256 deadline;
}
```
### SignatureTransferDetails

```solidity
struct SignatureTransferDetails {
  address to;
  uint256 requestedAmount;
}
```

### Functions
### permitWitnessTransferFrom

```solidity
function permitWitnessTransferFrom(struct IPermit2WitnessTransferFrom.PermitTransferFrom permit, struct IPermit2WitnessTransferFrom.SignatureTransferDetails transferDetails, address owner, bytes32 witness, string witnessTypeString, bytes signature) external
```

