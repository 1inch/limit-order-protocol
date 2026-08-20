# Trust model, actors and privileges

Phase 3. Who can do what, what the protocol trusts, and where the boundaries sit.

## On-chain / off-chain boundary

The boundary is unusually far to the off-chain side, and this is the single most
important structural fact about the protocol.

| Concern | Where it lives |
|---|---|
| Order creation, pricing, signing | Off-chain, entirely. The maker signs an EIP-712 digest |
| Order storage and distribution | Off-chain. There is no on-chain order book |
| Order discovery and matching | Off-chain. Takers find orders by means the protocol knows nothing about |
| Extension construction and encoding | Off-chain, committed to by the salt |
| Signature verification | On-chain, first fill only |
| Condition evaluation (predicates) | On-chain, at fill time |
| Price computation | On-chain when a getter is used, otherwise implicit in the signed amounts |
| Asset movement | On-chain |
| Consumption record | On-chain, the only persistent state |

An order that has been signed but never filled has **no on-chain existence
whatsoever**. It cannot be enumerated, counted or invalidated as an object; it
can only be pre-emptively neutralised by writing to the invalidator slot it
would have used, or by letting it expire. `OrderRegistrator` exists to broadcast
an order via an event for off-chain indexers, and even that stores nothing.

## Actors

| Actor | Trusted? | Authenticated by | Can |
|---|---|---|---|
| Maker | Not by the protocol | EIP-712 signature or ERC-1271 | Authorise a trade, set every order parameter, choose arbitrary extension code, cancel, advance epochs |
| Taker | Not at all | Being `msg.sender` | Fill any order they can satisfy, choose fill direction, target, threshold, taker interaction |
| Owner | Trusted for availability only | `Ownable` | Pause and unpause fills. Nothing else |
| Maker's interaction contracts | Not by the protocol; trusted by the maker | Named in the extension | Execute arbitrary code inside the fill, before and after transfers |
| Taker's interaction contract | Not by the protocol; trusted by the taker | Named in `args` | Execute arbitrary code between the two transfers |
| Amount getter | Not by the protocol; trusted by the maker | Named in the extension | Determine the exchange rate for the fill |
| Predicate targets | Not by the protocol | Named in the extension | Only read state — enforced by `staticcall` |
| Token contracts | Not by the protocol | Named in the order | Anything a token can do, including reentering |
| Chainlink aggregators | Trusted for correctness; bounded for freshness | Named in the extension | Set the price of an oracle-priced order |
| `FeeTaker` owner | Trusted | `Ownable` | Rescue any balance held by `FeeTaker` |
| Deployer | Trusted at deployment only | — | Fix immutables: WETH, protocol address, access token, initial owner |

The recurring pattern is worth naming: **the protocol trusts nobody, and each
counterparty independently trusts the components they themselves nominated.** A
maker who names a hostile amount getter harms only themselves and the takers who
choose to fill that order; the taker's threshold is what bounds the second half
of that.

## Trust boundaries

Four boundaries, listed inner to outer.

**B1 — Signature boundary.** Everything the maker committed to is inside; the
`args` supplied by the taker at fill time are outside. The extension crosses this
boundary only because its hash is inside the salt (`FR-ORDER-002`). This is the
boundary that matters most, and the 160-bit truncation of the extension hash is
its weakest point: an 80-bit birthday bound rather than a 128-bit one.

**B2 — Caller boundary.** `msg.sender` is checked against the allowed-sender
field, comparing only the low 80 bits (`ACC-002`). Note this is compared against
the immediate caller, not the transaction origin, so a taker can freely route
through their own contract but cannot lend their permission to another address.

**B3 — Callback boundary.** Three points inside `_fill` hand control to code the
protocol did not choose, at defined moments relative to the transfers. The
protocol's protection here is not preventing the callbacks from acting but
having written the invalidator **before** the first of them runs.

**B4 — Governance boundary.** The owner sits outside all order-level logic and
can only stop fills. There is no admin path that touches an individual order, a
balance, or a signature.

## Privilege map

Every state-changing capability in the core, with its effective authorisation as
traced from the code rather than inferred from a modifier name.

| Capability | Effective authorisation | Traced from |
|---|---|---|
| Fill an order | Valid maker signature on first fill; thereafter the invalidator record alone. Plus allowed-sender, expiry, epoch, predicate, and not paused | `OrderMixin.sol` 172-186, 232-236, 284-297 |
| Cancel an order | Implicit: the write is keyed by `msg.sender`, so a caller can only ever cancel their own | `OrderMixin.sol` 80-88 |
| Cancel a batch | Same | `OrderMixin.sol` 93-100 |
| Mass-invalidate nonces | Same, plus the order must use the bit invalidator | `OrderMixin.sol` 105-109 |
| Advance an epoch | Implicit: keyed by `msg.sender`, bounded 1-255 | `SeriesEpochManager.sol` 34-42 |
| Pause / unpause | `onlyOwner` | `LimitOrderProtocol.sol` 49-58 |
| Simulate | Unrestricted, but always reverts | `OrderMixin.sol` 71-75 |
| `FeeTaker` post-interaction | `onlyLimitOrderProtocol` | `FeeTaker.sol` 53-56 |
| `FeeTaker` rescue | `onlyOwner` | `FeeTaker.sol` 97-99 |

Two observations about this table. First, most authorisation here is
**structural rather than checked**: there is no `require(msg.sender == maker)` in
`cancelOrder`, because the mapping key makes the check unnecessary. Any review
that greps for access-control modifiers will conclude these functions are
unprotected, and will be wrong. Second, the only explicit role in the entire
core protocol is `owner`, and it cannot move a single token.

## What the owner can and cannot do

Recorded precisely because `DIV-004` established that the specification says
nothing about this.

Can: prevent all four fill entry points from executing, for any duration, at
will; and release that state at a moment of their choosing.

Cannot: cancel, alter, or create an order; move any token; change any fee;
change any immutable; recover anything from the protocol; prevent a maker from
cancelling; prevent a maker from advancing an epoch; or affect any view function.

The asymmetry in the second list is the substance of `OPS-001`. A maker is never
trapped by a pause: they can always exit their commitments. Combined with the
fact that pausing cannot be selective — it is all fills or none — the capability
is a blunt availability control rather than a mechanism for extracting value
from any particular order.

The residual concern is timing rather than authority. An owner who pauses and
unpauses around a market move changes *when* orders become fillable, which has
value in itself. That is a governance property, not a code defect, and belongs
in Phase 11's discussion rather than here.

## Untrusted input paths

Ranked by how far the input reaches into the protocol.

1. **Extension bytes.** Committed to by hash, but the *content* is arbitrary and
   the offsets word drives calldata slicing. Reaches `OffsetsLib` arithmetic and
   every downstream consumer.
2. **`args` bytes.** Not covered by any signature. Length fields are 24-bit and
   drive slicing directly (`OrderMixin.sol` 451-481).
3. **`takerTraits`.** Fully taker-controlled, sets fill direction, threshold,
   permit skipping and args layout.
4. **`amount`.** Taker-controlled, clamped to the remaining amount on the making
   side but the starting point for all arithmetic.
5. **Signature bytes.** Reach `ecrecover` or an arbitrary contract's
   `isValidSignature`.
6. **`msg.value`.** Drives the ETH branch and a raw refund call.
7. **Token return data.** Interpreted by hand-written assembly at
   `OrderMixin.sol` 509-523.

## Implicit role expectations

Things the protocol behaves as if were true, without checking them.

- That a maker who sets `NEED_CHECK_EPOCH_MANAGER` understands it is
  incompatible with the bit invalidator. The protocol reverts rather than
  guessing, but only at fill time — the maker learns their order was unfillable
  when someone tries.
- That the taker sets a non-zero threshold. Zero disables slippage protection
  entirely and is indistinguishable from a deliberate choice.
- That a maker's two amount getters agree (`INT-007`). Unenforceable.
- That the `FeeTaker` owner and the protocol owner are operationally related.
  Nothing links them; they are independent `Ownable` instances.
