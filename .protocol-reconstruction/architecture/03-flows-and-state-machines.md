# Flows and state machines

Phase 3. `FLOW-*` and `SM-*` identifiers, allocated from the id-registry.

## State machine: order lifecycle

An order's on-chain state is derived, not stored as a status field. It is a
function of the invalidator record plus time plus the maker's epoch. That
indirection is why the machine below has both stored and derived states.

| ID | State | How it is recognised | Stored? |
|---|---|---|---|
| `SM-001` | Signed, unseen | No invalidator record: stored remaining is 0, or the nonce bit is clear | Yes, by absence |
| `SM-002` | Partially filled | Stored remaining is neither 0 nor `type(uint256).max` | Yes |
| `SM-003` | Fully consumed | Stored remaining is `type(uint256).max`, or the nonce bit is set | Yes |
| `SM-004` | Cancelled | Indistinguishable on-chain from `SM-003` | Yes, same encoding |
| `SM-005` | Expired | Derived: expiration non-zero and below the block timestamp | No |
| `SM-006` | Epoch-invalidated | Derived: the maker's epoch for the series no longer matches | No |
| `SM-007` | Condition-blocked | Derived: the predicate evaluates other than 1 | No |

The four derived states are not durable. `SM-006` and `SM-007` are **reversible**:
a maker cannot lower an epoch, but a predicate can start evaluating true again,
so an order blocked by a condition can become fillable later without anyone
acting on it. `SM-005` is irreversible in practice since timestamps advance.

`SM-003` and `SM-004` are worth dwelling on: cancellation writes exactly the same
value a complete fill writes. On-chain there is no way to distinguish an order
that was filled to completion from one the maker cancelled — only the emitted
event differs (`OrderFilled` versus `OrderCancelled`). Any indexer that needs the
distinction must read events, not state.

### Transitions

| From | To | Trigger | Guard |
|---|---|---|---|
| `SM-001` | `SM-002` | Fill for less than the full amount | Partial and multiple fills allowed |
| `SM-001` | `SM-003` | Fill for the full amount, or any fill of a bit-invalidator order | — |
| `SM-002` | `SM-002` | Further partial fill | Remainder not exhausted |
| `SM-002` | `SM-003` | Fill consuming the remainder | — |
| `SM-001`, `SM-002` | `SM-004` | `cancelOrder`, `cancelOrders`, `bitsInvalidateForOrder` | Caller is the maker, structurally |
| `SM-001`, `SM-002` | `SM-005` | Time passing | Expiration set |
| `SM-001`, `SM-002` | `SM-006` | Maker advances the epoch | Order opted into epoch checking |
| `SM-001`, `SM-002` | `SM-007` | External state changes | Order carries a predicate |
| `SM-007` | `SM-001`/`SM-002` | External state changes back | Predicate true again |
| `SM-003`, `SM-004` | — | Terminal. No transition out exists | — |

## State machine: protocol operational state

| ID | State | Effect |
|---|---|---|
| `SM-010` | Active | All entry points available |
| `SM-011` | Paused | The four fill entry points revert; cancellation, epoch advance and all views unaffected |

Transitions both ways, `onlyOwner`, no timelock and no delay. `SM-011` is not
terminal and has no automatic exit.

## Flows

### `FLOW-001` — Basic fill by an EOA maker

The reference path; every other flow is a variation.

1. Off-chain: maker builds the order, signs the EIP-712 digest, publishes by any means.
2. Taker calls `fillOrder` with the order, `r`, `vs`, an amount and taker traits.
3. Protocol computes the order hash and reads the invalidator to get the remaining amount.
4. First fill only: recover the signer and compare with the maker; reject a zero maker.
5. Validate extension consistency, allowed sender, expiry, epoch, predicate.
6. Compute both amounts in the taker's chosen direction; apply the threshold.
7. Reject a partial fill if disallowed; reject zero amounts.
8. **Write the invalidator.**
9. Optional maker pre-interaction.
10. Transfer maker asset to the target.
11. Optional taker interaction.
12. Transfer taker asset to the receiver.
13. Optional maker post-interaction.
14. Emit `OrderFilled`.

Step 8's position is the load-bearing detail: state is committed before any
callback runs, so a reentrant fill attempt in steps 9, 11 or 13 sees the updated
record and fails. This is the checks-effects-interactions pattern applied to the
invalidator, and it is why `SEC-002`'s extra guard is needed only for the maker
permit — which happens at step 4, *before* step 8.

Requirements exercised: `FR-ORDER-001`, `FR-ORDER-002`, `FR-FILL-001`,
`FR-FILL-002`, `ACC-001`, `ACC-002`, `MATH-001`-`004`, `TIME-001`, `STATE-001`-`003`.

### `FLOW-002` — Fill of a contract-signed order

As `FLOW-001`, except step 4 calls `isValidSignature` on the maker contract
instead of recovering. That is an external call to an untrusted contract at the
earliest point in the flow, before any validation. The maker contract can revert,
consume gas, or re-enter — and at this point the invalidator has not been
written, which is why `SEC-002`'s reentrancy check sits in this region.

Requirements: as `FLOW-001` plus `ACC-001` criteria 4-5.

### `FLOW-003` — Partial fill sequence

Repeated `FLOW-001` against one order. Each fill reduces the stored remainder
(`STATE-002`). Rounding is applied per fill, so the sum of taking amounts across
N partial fills can exceed the single-fill amount by up to N-1 units, always in
the maker's favour. Requires both partial and multiple fills allowed, therefore
always the remaining invalidator.

Requirements: `FR-FILL-003`, `STATE-002`, `MATH-001`, `MATH-002`.

### `FLOW-004` — Fill with a full extension

`FLOW-001` where the extension carries a predicate, both amount getters, a maker
permit, and pre- and post-interaction targets. Adds, in order: extension hash
validation, permit execution with its reentrancy guard, predicate evaluation by
nested `staticcall`, amount computation delegated to an external getter, and two
callbacks to maker-nominated contracts.

This is the flow with the largest untrusted surface: up to six distinct external
contracts, five of them chosen by the maker, all invoked inside one transaction.

Requirements: `FR-ORDER-002`, `INT-001`, `INT-003`, `INT-005`, `SEC-002`, `SEC-003`.

### `FLOW-005` — Fill paying with native ETH

Diverges at step 12. ETH is accepted only when the taker asset is WETH. Value
below the taking amount reverts; excess is refunded by raw `call` to
`msg.sender`; the receiver is paid raw ETH if the maker set unwrap, otherwise
WETH is deposited and transferred. Non-zero value with a non-WETH taker asset
reverts.

Two raw calls to potentially hostile addresses occur here, both after the maker's
asset has already moved.

Requirements: `SEC-005`.

### `FLOW-006` — Fee-bearing fill

`FLOW-001` where the order names `FeeTaker` as its receiver and sets a
post-interaction to it. The taking amount lands on `FeeTaker` at step 12 rather
than with the maker; at step 13 `FeeTaker` decodes fee parameters from its
extra data, checks the taker against a whitelist or access-token balance,
computes the integrator and protocol fees, pays both, and forwards the remainder
to the real receiver.

The protocol itself knows nothing about fees. The entire mechanism is built from
"receiver is a contract" plus "post-interaction". `FeeTaker` holds the taking
amount only between steps 12 and 13, within one transaction.

Requirements: `ECON-001`-`004`, `ACC-004`, `ACC-005`.

### `FLOW-007` — Direct cancellation

Maker calls `cancelOrder` with the order's traits and hash. The traits select the
invalidator; the hash matters only for the remaining-invalidator branch. Writes
are keyed by `msg.sender`. Available while paused.

The documented hazard is real and worth restating: passing traits that select the
wrong invalidator writes to the wrong place and the order stays fillable, with no
error. The call succeeds either way.

Requirements: `FR-CANCEL-001`, `STATE-001`, `OPS-001`.

### `FLOW-008` — Mass cancellation by epoch

Maker calls `increaseEpoch` or `advanceEpoch` for a series. Every order of that
maker and series that opted into epoch checking becomes unfillable at once, with
one storage write regardless of order count. Orders are not touched
individually and no per-order event is emitted.

The chained variant is the interesting one: a maker sets a post-interaction that
advances the epoch, so filling order N makes order N+1 valid. That turns a set of
orders into a sequence.

Requirements: `TIME-002`, `STATE-004`.

### `FLOW-009` — Pause and unpause

Owner calls `pause`; all four fill entry points revert until `unpause`. Makers
retain cancellation and epoch advance throughout.

Requirements: `ACC-003`, `OPS-001`.

### `FLOW-010` — Simulation

Any caller invokes `simulate` with a target and calldata, normally through
`eth_call`. The protocol delegatecalls the target and then unconditionally
reverts with the outcome packed into a `SimulationResults` error. The caller
decodes the revert data to learn what would have happened.

The flow has no success path by construction.

Requirements: `SEC-001`.

## Cross-flow state coupling

| State | Written by | Read by |
|---|---|---|
| `_bitInvalidator` | `FLOW-001` step 8, `FLOW-007`, `FLOW-008` mass path | `FLOW-001` step 3 |
| `_remainingInvalidator` | `FLOW-001` step 8, `FLOW-007` | `FLOW-001` steps 3 and 4, `SEC-002`'s guard |
| `_epochs` | `FLOW-008` | `FLOW-001` step 5 |
| `_paused` | `FLOW-009` | `FLOW-001` step 5 |
| Token balances and allowances | External | `FLOW-001` steps 10 and 12 |

`_remainingInvalidator` is read at two distinct points in one fill — once for the
remaining amount and again inside the permit reentrancy guard. That double read
is what makes `SEC-002` work, and it is the only place in the protocol where the
same slot is consulted twice in a single flow for two different purposes.
