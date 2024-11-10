
## ApprovalPreInteraction

### Functions list
- [constructor(_immutableOwner, _maker) public](#constructor)
- [preInteraction(order, , , , makingAmount, , , ) external](#preinteraction)
- [isValidSignature(orderHash, signature) external](#isvalidsignature)

### Errors list
- [UnathorizedMaker() ](#unathorizedmaker)

### Functions
### constructor

```solidity
constructor(address _immutableOwner, address _maker) public
```

### preInteraction

```solidity
function preInteraction(struct IOrderMixin.Order order, bytes, bytes32, address, uint256 makingAmount, uint256, uint256, bytes) external
```
See {IPreInteraction-preInteraction}.

### isValidSignature

```solidity
function isValidSignature(bytes32 orderHash, bytes signature) external view returns (bytes4)
```
Checks if orderHash signature was signed with real order maker.

### Errors
### UnathorizedMaker

```solidity
error UnathorizedMaker()
```

