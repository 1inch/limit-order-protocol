
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
and this contract's own allowance to the protocol lets the protocol move the pulled funds to the
taker. The latter is self-provisioned: {preInteraction} tops it up to the maximum whenever it runs
short, which is once per token for tokens that leave infinite allowances undecremented and
automatically again for tokens that spend them down. Unbounded is safe here because the protocol
only transfers within valid fills of orders this contract has presigned.

The contract concentrates standing allowances, the same trust shape as the protocol itself; it holds
no balances between transactions and has no owner powers over user funds. Contract wallets can use it
the same way EOAs do, though a Safe keeps cleaner provenance staying its own maker — one MultiSend
batch marking the digest through SignMessageLib and calling {OrderRegistrator-registerOrder}.

A non-creator receiver is accepted in exactly one shape: fee collection. {FeeTaker}-layout settlement
contracts only take fees when the order's receiver is the fee contract itself, and they pay the
maker's share to the order's maker — this contract, which cannot withdraw — unless their fee data
carries a custom receiver. So a fee-collecting order is allowed when the order's own bytes route the
proceeds home: the post-interaction must target the receiver (which is {FeeTaker}'s own distribution
condition) and must carry the custom-receiver flag naming the creator. That guarantees a conforming
fee contract forwards the net to the wallet that funded the order; the fee contract itself is the
creator's choice and trust, and naming a hostile one harms only the creator, whose funds alone back
the order._

### Functions list
- [constructor(limitOrderProtocol, orderRegistrator) public](#constructor)
- [createOrder(order, extension) external](#createorder)
- [createOrderWithPermit(order, extension, permit) external](#createorderwithpermit)
- [cancelOrder(order) external](#cancelorder)
- [isValidSignature(hash, ) external](#isvalidsignature)
- [preInteraction(order, , orderHash, , makingAmount, , , ) external](#preinteraction)

### Events list
- [DelegatedOrderCreated(orderHash, owner) ](#delegatedordercreated)
- [DelegatedOrderCancelled(orderHash) ](#delegatedordercancelled)

### Errors list
- [OnlyLimitOrderProtocol() ](#onlylimitorderprotocol)
- [InvalidMaker() ](#invalidmaker)
- [InvalidReceiver() ](#invalidreceiver)
- [InvalidFeeReceiver() ](#invalidfeereceiver)
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

_The order must name this contract as maker, must use the remaining invalidator (partial and
multiple fills allowed — the bit-invalidator nonce space would be shared across users), and must
route its pre-interaction to this contract (an absent pre-interaction target defaults to the
order's maker, which is this contract). The receiver is the caller, or a fee contract in the
verified fee-collection shape (see {_createOrder}). The duplicate check reads the registrator
rather than local state: a cancelled order deletes its local approval, but its protocol-level
invalidation is permanent, so re-creating it would only produce a dead order._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | The order to create; its maker is this contract, its funds are the caller's. |
| extension | bytes | The extension data associated with the order. |

### createOrderWithPermit

```solidity
function createOrderWithPermit(struct IOrderMixin.Order order, bytes extension, bytes permit) external
```
{createOrder}, with the maker-asset allowance folded into the same transaction for
EIP-2612 tokens — the first order needs no separate approval.

_The permit's owner is pinned to the caller and its spender is this contract, so a foreign
permit cannot be attached to a foreign order. Permit failure is swallowed deliberately, the same
way the protocol treats maker permits: a front-run permit has already granted the allowance, and
a wrong one leaves the order created and anchored but unfillable until an allowance exists — a
later approval revives it, and nothing needs refunding because nothing moved._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | The order to create; its maker is this contract, its funds are the caller's. |
| extension | bytes | The extension data associated with the order. |
| permit | bytes | The EIP-2612 permit for the order's maker asset, spender being this contract. |

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
cannot pull, whatever state the fill reached the protocol in. The protocol's own allowance for
the maker asset is topped up here when it runs short, so a token's first fill provisions it and
nothing else has to._

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

### InvalidFeeReceiver

```solidity
error InvalidFeeReceiver()
```

_A non-creator receiver is only allowed when the post-interaction targets that receiver and
its fee data names the creator as the custom receiver — the verified fee-collection shape._

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

