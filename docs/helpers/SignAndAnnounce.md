
## SignAndAnnounce

Lets a Safe authorize a limit order and announce it in a single co-signed execution.

_The Safe delegatecalls {signAndAnnounce}, which marks the order digest in the Safe's own
`signedMessages` mapping — the Safe's ERC-1271 presign, read later by empty-signature fills — and
registers the order with the {OrderRegistrator}. The registrator authenticates by `msg.sender`,
which under delegatecall is the Safe itself, i.e. the order's maker, so the announcement anchor is
written in the same transaction and nothing is signed off-chain beyond the Safe execution itself.

This is the {SafeOrderBuilder} pattern minus the oracle logic. As a Safe delegatecall target the
contract deliberately writes `signedMessages` and nothing else, holds no other storage, and has no
upgradeability._

### Functions list
- [constructor(limitOrderProtocol, orderRegistrator) public](#constructor)
- [signAndAnnounce(order, extension) external](#signandannounce)

### Functions
### constructor

```solidity
constructor(contract IOrderMixin limitOrderProtocol, contract IOrderRegistrator orderRegistrator) public
```

### signAndAnnounce

```solidity
function signAndAnnounce(struct IOrderMixin.Order order, bytes extension) external
```
Marks the order digest as signed by the calling Safe and announces the order.

_Must be delegatecalled by the Safe that is the order's maker._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | The order to authorize and announce. |
| extension | bytes | The extension data associated with the order. |

