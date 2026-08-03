
## DelegatedMaker

A shared order maker that gives ERC-20 makers a one-transaction, no-signature, no-escrow flow.

_A user sends a single {createOrder} transaction and signs nothing: the contract records the user
as the order's owner — the presign read by {isValidSignature} at fill time — and registers the order,
anchoring any announcement-based auction in the same block. Funds never move at creation. The order
names this contract as its maker, so at fill time the protocol calls {preInteraction} immediately
before the maker-asset transfer, and the contract pulls exactly the filled amount from the owner's
wallet through their standing allowance. Custody time is zero; proceeds go straight to the owner,
because {createOrder} requires the order's receiver to be the owner.

The token path has two allowances: the owner's allowance to this contract feeds the just-in-time pull,
and this contract's own allowance to the protocol — granted once per token by the permissionless
{approveRouter} — lets the protocol move the pulled funds to the taker. The latter is safe to leave
unbounded since the protocol only transfers within valid fills of orders this contract has presigned.

The contract concentrates standing allowances, the same trust shape as the protocol itself; it holds
no balances between transactions and has no owner powers over user funds. Contract wallets can use it
the same way EOAs do, though a Safe keeps cleaner provenance staying its own maker via SignAndAnnounce.

Pinning the receiver to the creating wallet rules out fee-collecting settlement: {FeeTaker} only takes
fees when the order's receiver is the fee taker itself, and it pays the maker's share to the order's
maker — this contract, which cannot withdraw — unless the fee data carries a custom receiver. Rather
than parse a fee layout it does not own, this contract keeps proceeds flowing straight to the wallet
that funded them, so its orders price through the auction directly and take no integrator, protocol
or resolver fee. Makers who need those keep custody of their own order, by signature or ERC-1271._

### Functions list
- [constructor(limitOrderProtocol, orderRegistrator) public](#constructor)
- [createOrder(order, extension) external](#createorder)
- [cancelOrder(order) external](#cancelorder)
- [approveRouter(token) external](#approverouter)
- [isValidSignature(hash, ) external](#isvalidsignature)
- [preInteraction(order, , orderHash, , makingAmount, , , ) external](#preinteraction)

### Events list
- [DelegatedOrderCreated(orderHash, owner) ](#delegatedordercreated)
- [DelegatedOrderCancelled(orderHash) ](#delegatedordercancelled)

### Errors list
- [OnlyLimitOrderProtocol() ](#onlylimitorderprotocol)
- [InvalidMaker() ](#invalidmaker)
- [InvalidReceiver() ](#invalidreceiver)
- [InvalidMakerTraits() ](#invalidmakertraits)
- [InvalidPreInteractionTarget() ](#invalidpreinteractiontarget)
- [OrderAlreadyRegistered() ](#orderalreadyregistered)
- [AccessDenied() ](#accessdenied)

### Functions
### constructor

```solidity
constructor(contract IOrderMixin limitOrderProtocol, contract IOrderRegistrator orderRegistrator) public
```

### createOrder

```solidity
function createOrder(struct IOrderMixin.Order order, bytes extension) external
```
Creates, presigns and announces an order on behalf of the caller — the only per-order
transaction, with nothing signed off-chain.

_The order must name this contract as maker and the caller as receiver, must use the
remaining invalidator (partial and multiple fills allowed — the bit-invalidator nonce space would
be shared across users), and must route its pre-interaction to this contract (an absent
pre-interaction target defaults to the order's maker, which is this contract). The duplicate check
reads the registrator rather than local state: a cancelled order deletes its local approval, but
its protocol-level invalidation is permanent, so re-creating it would only produce a dead order._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | The order to create; its maker is this contract, its funds are the caller's. |
| extension | bytes | The extension data associated with the order. |

### cancelOrder

```solidity
function cancelOrder(struct IOrderMixin.Order order) external
```
Cancels an order previously created by the caller.

_Deletes the presign and invalidates the order at the protocol as its maker. Both matter: the
protocol validates ERC-1271 only on the first fill, so deleting the presign alone would not stop
further partial fills of an already-started order — the protocol-level invalidation kills those,
and the per-fill owner check in {preInteraction} backs that up._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | The order to cancel. |

### approveRouter

```solidity
function approveRouter(contract IERC20 token) external
```
Grants the limit order protocol an unlimited allowance for a token this contract makes with.

_Permissionless and required once per maker asset: the protocol transfers the pulled funds out
of this contract with `transferFrom`, which needs this allowance. Unbounded is safe here because
the protocol only transfers within valid fills of presigned orders._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | contract IERC20 | The token to approve. |

### isValidSignature

```solidity
function isValidSignature(bytes32 hash, bytes) external view returns (bytes4)
```
See {IERC1271-isValidSignature}. The presign: a hash is signed while its order is approved.

_The signature bytes are ignored — authorization was given on-chain in {createOrder} — so fills
pass an empty signature._

### preInteraction

```solidity
function preInteraction(struct IOrderMixin.Order order, bytes, bytes32 orderHash, address, uint256 makingAmount, uint256, uint256, bytes) external
```
See {IPreInteraction-preInteraction}. Pulls exactly the filled amount from the order's
owner immediately before the protocol moves the maker asset to the taker.

_Checked on every fill, not just the first: a cancelled order has no owner on record and
cannot pull, whatever state the fill reached the protocol in._

### Events
### DelegatedOrderCreated

```solidity
event DelegatedOrderCreated(bytes32 orderHash, address owner)
```
Emitted when an order is created and presigned on behalf of an owner.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| orderHash | bytes32 | The hash of the created order. |
| owner | address | The wallet whose funds the order draws on. |

### DelegatedOrderCancelled

```solidity
event DelegatedOrderCancelled(bytes32 orderHash)
```
Emitted when an owner cancels their order.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| orderHash | bytes32 | The hash of the cancelled order. |

### Errors
### OnlyLimitOrderProtocol

```solidity
error OnlyLimitOrderProtocol()
```

_The function may only be called by the limit order protocol._

### InvalidMaker

```solidity
error InvalidMaker()
```

_The order's maker must be this contract._

### InvalidReceiver

```solidity
error InvalidReceiver()
```

_The order's receiver must be the creating owner, so proceeds bypass the shared contract._

### InvalidMakerTraits

```solidity
error InvalidMakerTraits()
```

_Orders must use the per-order remaining invalidator and the pre-interaction hook._

### InvalidPreInteractionTarget

```solidity
error InvalidPreInteractionTarget()
```

_The order's pre-interaction must target this contract, or the pull never happens._

### OrderAlreadyRegistered

```solidity
error OrderAlreadyRegistered()
```

_The order was registered before; a cancelled order cannot be revived either._

### AccessDenied

```solidity
error AccessDenied()
```

_Only the recorded owner of the order may act on it._

