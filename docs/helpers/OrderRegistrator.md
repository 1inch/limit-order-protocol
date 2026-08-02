
## OrderRegistrator

Announces orders on-chain and records when each one was first announced.

_The recorded announcement is what {FusionAnchoredAuction} anchors an auction to, so it is written
once and never moved: a repeated registration of the same order keeps the original announcement and
only re-emits the event. Registration is permissionless — any caller holding a valid signature, or any
caller at all once a contract maker has marked the order digest, may announce an order and thereby
start the clock for an anchored auction.
The announcement is keyed by order hash alone, which already commits to the maker._

### Functions list
- [constructor(limitOrderProtocol) public](#constructor)
- [registerOrder(order, extension, signature) external](#registerorder)
- [announcedAt(orderHash) external](#announcedat)
- [announcedAtBlock(orderHash) external](#announcedatblock)

### Functions
### constructor

```solidity
constructor(contract IOrderMixin limitOrderProtocol) public
```

### registerOrder

```solidity
function registerOrder(struct IOrderMixin.Order order, bytes extension, bytes signature) external
```
See {IOrderRegistrator-registerOrder}.

### announcedAt

```solidity
function announcedAt(bytes32 orderHash) external view returns (uint256 timestamp)
```
See {IOrderRegistrator-announcedAt}.

### announcedAtBlock

```solidity
function announcedAtBlock(bytes32 orderHash) external view returns (uint256 blockNumber)
```
See {IOrderRegistrator-announcedAtBlock}.

