
## OrderRegistrator

Announces orders on-chain and records when each one was first announced.

_Registration is authenticated by the transaction itself: only the order's maker may call
{registerOrder}, so no signature is taken and none is checked. The emitted order therefore always
originates from its maker, but carries no fill authorization — that lives wherever each flow keeps it
(presign state for contract makers such as {DelegatedMaker} and Safes, the off-chain orderbook for
EOA fill signatures). Neither the broadcast nor the clock can be delegated to a relayer.

The recorded announcement is what {FusionAnchoredAuction} anchors an auction to, so it is written
once and never moved: a repeated registration of the same order keeps the original announcement and
only re-emits {OrderRegistered}. The announcement is keyed by order hash alone, which already
commits to the maker._

### Functions list
- [constructor(limitOrderProtocol) public](#constructor)
- [registerOrder(order, extension) external](#registerorder)

### Errors list
- [AccessDenied() ](#accessdenied)

### Functions
### constructor

```solidity
constructor(contract IOrderMixin limitOrderProtocol) public
```

### registerOrder

```solidity
function registerOrder(struct IOrderMixin.Order order, bytes extension) external
```
See {IOrderRegistrator-registerOrder}.

### Errors
### AccessDenied

```solidity
error AccessDenied()
```

