# Core protocol requirements

Phase 2. Order identity, the fill pipeline, cancellation, arithmetic, time and
invalidation state. 24 entries.

All entries: Status `DRAFT`, Approval `pending` until Gate B.

---

## `FR-ORDER-001` — An order's identity is the EIP-712 hash of its eight fields under the protocol domain

| Field | Content |
|---|---|
| ID | `FR-ORDER-001` |
| Criticality | `CRITICAL` |
| Criticality rationale | The hash is what the maker signs and what every invalidation record is keyed by; a collision or a domain error lets one signature authorise a different trade. |
| Source | `description.md` 53-64; `OrderLib.sol` 34-66; Phase 1 alignment rows 1-2 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

An order is identified by the EIP-712 typed-data hash of its eight fields, bound
to the protocol's own domain, so that the same field values on a different chain
or a different deployment produce a different identity.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker signs; taker submits; protocol computes |
| Assets | None moved by hashing; the hash gates every movement |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | The order struct is supplied as calldata in the declared field order |
| Postconditions | The returned hash equals the EIP-712 digest for domain `("1inch Limit Order Protocol", "4", chainId, address(this))`; hashing never writes state |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given two orders differing only in `salt`, when both are hashed, then the hashes differ.
2. Given one order, when hashed on chain ID 1 and chain ID 137, then the hashes differ.
3. Given one order, when hashed by two deployments at different addresses on the same chain, then the hashes differ.
4. Given an order, when `hashOrder` is called twice, then the result is identical and no state changed.

### Verification

| Field | Content |
|---|---|
| Verification method | Deterministic unit test plus a differential test against an independent EIP-712 implementation |
| Owning harness | Hardhat (only harness; `hardhat2` profile) |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A — `test/Eip712.js` (16 lines) is the likely site |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Cross-chain or cross-deployment signature replay; an attacker fills an order the maker never authorised on that chain |
| Economic impact | Unbounded: the full making amount of every affected order |
| Confidence | `HIGH` |
| Confidence rationale | Documented struct, documented hashing, code agrees, independently checkable against the EIP-712 standard |

### Notes

The struct is hashed by copying 256 bytes of calldata after the typehash
(`OrderLib.sol` 57-64) rather than by `abi.encode`. This is equivalent only
because all eight fields are 32-byte value types. Adding a dynamic field would
silently break it — worth an invariant in Phase 6.

---

## `FR-ORDER-002` — An extension is bound to its order by the low 160 bits of the salt

| Field | Content |
|---|---|
| ID | `FR-ORDER-002` |
| Criticality | `CRITICAL` |
| Criticality rationale | The extension carries predicates, amount getters, permits and interaction targets; substituting one alters price and execution while keeping the maker's signature valid. |
| Source | `description.md` 70, 142-144; `OrderLib.sol` 175-184; Phase 1 alignment row 2 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

An order either declares an extension and is filled only with the exact
extension the maker committed to, or declares none and is filled only with no
extension at all.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker commits at signing; taker supplies at fill; protocol validates |
| Assets | Indirectly all assets in the fill, since the extension can change amounts |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | Order and candidate extension bytes are supplied |
| Postconditions | Valid only when: `HAS_EXTENSION` set, extension non-empty, and low 160 bits of `keccak256(extension)` equal low 160 bits of `salt`; or `HAS_EXTENSION` clear and extension empty. Every other combination rejects with a specific selector |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given `HAS_EXTENSION` set and a matching extension, when filled, then the fill proceeds.
2. Given `HAS_EXTENSION` set and empty extension bytes, when filled, then it reverts `MissingOrderExtension`.
3. Given `HAS_EXTENSION` set and an extension whose hash differs in the low 160 bits, when filled, then it reverts `InvalidExtensionHash`.
4. Given `HAS_EXTENSION` clear and any non-empty extension, when filled, then it reverts `UnexpectedOrderExtension`.
5. Given two extensions agreeing in the low 160 bits of their hash but differing above, when either is supplied, then both are accepted — this is the accepted 160-bit collision bound, not a defect.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests for all four branches; property test over random extensions for criterion 5's boundary |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A — `test/Extensions.js` |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Extension substitution: an attacker swaps in a permissive predicate or a hostile amount getter under the maker's signature |
| Economic impact | Unbounded per affected order |
| Confidence | `HIGH` |
| Confidence rationale | Documented and implemented identically; the 160-bit truncation is explicit in both |

### Notes

Truncation to 160 bits is deliberate: the high 96 bits of the salt are the
maker's own salt. Collision resistance is therefore 80 bits under a birthday
attack, not 128. Worth stating as an accepted assumption in Phase 3's trust
model rather than leaving implicit.

---

## `FR-ORDER-003` — A zero receiver means the maker

| Field | Content |
|---|---|
| ID | `FR-ORDER-003` |
| Criticality | `HIGH` |
| Criticality rationale | Misreading this sends the taker's payment to address zero, burning it; the fallback is what prevents that. |
| Source | `OrderLib.sol` 95-98; `DIV-006` (`DOCUMENTATION_BUG`, `camoseed`, 2026-08-03) |
| Approval | pending |
| Status | `DRAFT` |

### Statement

When an order names no receiver, the taker's assets go to the maker.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker; protocol resolves at fill time |
| Assets | The taking asset, full taking amount |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | A fill reaches the taker→maker transfer |
| Postconditions | Recipient is `order.receiver` when non-zero, otherwise `order.maker`. Never address zero |
| Invariants preserved | pending Phase 6 — candidate: the taking asset never goes to address zero |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given `receiver` is the zero address, when the order fills, then the maker's balance increases by the taking amount.
2. Given `receiver` is a third party, when the order fills, then that third party receives the taking amount and the maker receives nothing.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit test, both branches, asserting balances |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Without the fallback, funds are burnt rather than stolen |
| Economic impact | Full taking amount of any order left with a zero receiver |
| Confidence | `HIGH` |
| Confidence rationale | Unambiguous three-line implementation; the only gap was documentation, now decided |

### Notes

Documentation fix proposed under `DIV-006`. Requirement states actual behaviour.

---

## `FR-FILL-001` — A fill exchanges the two assets atomically

| Field | Content |
|---|---|
| ID | `FR-FILL-001` |
| Criticality | `CRITICAL` |
| Criticality rationale | A fill that moves one leg without the other is a direct theft from whichever party moved first. |
| Source | `description.md` 706-714, 832-885; `OrderMixin.sol` 263-441 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

A successful fill moves the making amount from the maker to the taker's target
and the taking amount from the taker to the order's receiver in one
transaction; if any part fails, none of it happens.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Taker initiates; maker is passive; optional interaction targets participate |
| Assets | Maker asset (making amount), taker asset (taking amount), optionally ETH/WETH |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | Signature valid, order not expired, not invalidated, predicate true, sender allowed, not paused, amounts non-zero |
| Postconditions | Both transfers succeeded, the invalidator was updated before either transfer, and `OrderFilled` was emitted with the remaining amount. On any failure the transaction reverts and no balance changed |
| Invariants preserved | pending Phase 6 — candidates: no value creation, conservation across the pair |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a valid order and a solvent taker, when filled, then maker balance decreases by the making amount and the target increases by the same, and taker decreases by the taking amount while the receiver increases by the same.
2. Given the maker's allowance is insufficient, when filled, then it reverts `TransferFromMakerToTakerFailed` and no balance changed.
3. Given the taker's allowance is insufficient, when filled, then it reverts `TransferFromTakerToMakerFailed` and no balance changed, including the maker's, despite the maker leg executing first.
4. Given a post-interaction that reverts, when filled, then the whole fill reverts and both transfers are rolled back.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests plus a stateful invariant harness asserting conservation |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A — `test/LimitOrderProtocol.js` |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Non-atomicity is direct theft from the party whose leg settled |
| Economic impact | Unbounded |
| Confidence | `HIGH` |
| Confidence rationale | Documented flow, implemented flow, and EVM revert semantics all agree |

### Notes

Criterion 3 is the interesting one: the maker's tokens move at line 363-371 and
the taker's at line 411-419, so atomicity here rests entirely on the revert, not
on ordering.

---

## `FR-FILL-002` — The fill executes its seven steps in the specified order

| Field | Content |
|---|---|
| ID | `FR-FILL-002` |
| Criticality | `HIGH` |
| Criticality rationale | Interaction callbacks are given a specific position relative to the transfers; reordering changes what an integrator can observe and do, and is a reentrancy surface. |
| Source | `description.md` 706-714; `OrderMixin.sol` 273-440; Phase 1 alignment row 28 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

A fill validates the order, calls the maker's pre-interaction, transfers maker
to taker, calls the taker's interaction, transfers taker to maker, calls the
maker's post-interaction, and emits the fill event, in that order.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Protocol orchestrates; maker's and taker's chosen contracts are called |
| Assets | Both legs |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | Validation passed; the relevant interaction flags are set |
| Postconditions | Observed call order matches the statement; `OrderFilled` is last |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given an order with pre-, taker- and post-interactions all pointed at a recording mock, when filled, then the mock records exactly the order: pre, taker, post.
2. Given a pre-interaction that inspects balances, when it runs, then neither leg has settled yet.
3. Given a taker interaction that inspects balances, when it runs, then the maker leg has settled and the taker leg has not.
4. Given a post-interaction that inspects balances, when it runs, then both legs have settled.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit test with an ordering-recorder mock; `contracts/mocks/InteractionMock.sol` already exists |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A — `test/Interactions.js` (492 lines) |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Out-of-order callbacks let an interaction observe or act on a state the protocol did not intend to expose |
| Economic impact | Bounded by what the callback can do, which is unbounded in general |
| Confidence | `HIGH` |
| Confidence rationale | Documented step list matches the implementation line by line |

### Notes

The invalidator write happens at lines 338-342, before the pre-interaction. That
ordering is what makes reentrant refills fail, and it is not in the documented
seven steps — Phase 3 should model it explicitly.

---

## `FR-FILL-003` — Partial fills happen only when the maker allowed them

| Field | Content |
|---|---|
| ID | `FR-FILL-003` |
| Criticality | `HIGH` |
| Criticality rationale | A maker who disallowed partial fills is relying on all-or-nothing execution; a partial fill leaves them with an unwanted residual position. |
| Source | `description.md` 88-89, 874; `OrderMixin.sol` 334; `MakerTraitsLib.sol` 112-114 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

When the maker disallowed partial fills, a fill must consume the entire making
amount or fail.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker constrains; taker attempts |
| Assets | Maker asset |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | `NO_PARTIAL_FILLS` set on the order |
| Postconditions | The computed making amount equals `order.makingAmount`, or the call reverted `PartialFillNotAllowed` |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given `NO_PARTIAL_FILLS` set and a fill for less than the full making amount, when submitted, then it reverts `PartialFillNotAllowed`.
2. Given `NO_PARTIAL_FILLS` set and a fill for exactly the making amount, when submitted, then it succeeds.
3. Given partial fills allowed and a fill for half, when submitted, then it succeeds and the remaining amount is half.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests; boundary fuzz around `makingAmount ± 1` |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Unwanted residual exposure for the maker |
| Economic impact | Bounded by the order size |
| Confidence | `HIGH` |
| Confidence rationale | Documented flag, documented behaviour, one-line enforcement |

### Notes

Note the flag is stored inverted: bit 255 set means partial fills are *not*
allowed. Tests must exercise the inversion, not just the accessor.

---

## `FR-FILL-004` — A fill computing a zero amount on either side is rejected

| Field | Content |
|---|---|
| ID | `FR-FILL-004` |
| Criticality | `HIGH` |
| Criticality rationale | A zero-amount fill would consume invalidator state and emit a fill event without moving value, and on a bit-invalidator order that permanently burns the nonce. |
| Source | `description.md` 874; `OrderMixin.sol` 335 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

A fill in which either computed amount is zero must be rejected.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Taker |
| Assets | Both |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | Amounts have been computed, before any transfer |
| Postconditions | Reverts `SwapWithZeroAmount` if either is zero; no invalidator write occurred |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a requested amount that rounds the counter-amount to zero, when filled, then it reverts `SwapWithZeroAmount`.
2. Given such a rejected attempt on a bit-invalidator order, when it reverts, then the nonce remains usable.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit test using an extreme price ratio to force a zero via flooring |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Griefing: burning a maker's nonces at no cost to the attacker beyond gas |
| Economic impact | Denial of service rather than direct loss |
| Confidence | `HIGH` |
| Confidence rationale | Documented and enforced |

### Notes

The check is `makingAmount * takingAmount == 0` inside `unchecked`
(`OrderMixin.sol` 335). The product can overflow to zero for carefully chosen
non-zero operands. Reaching that needs values around 2^128, far above any real
token supply, but it is a genuine edge the property test should probe rather
than assume away.

---

## `FR-FILL-005` — The taker chooses how the fill amount is interpreted and where assets go

| Field | Content |
|---|---|
| ID | `FR-FILL-005` |
| Criticality | `MEDIUM` |
| Criticality rationale | Misparsing `args` sends the maker's assets to the wrong address, but only an address the taker themselves encoded. |
| Source | `description.md` 836-895; `OrderMixin.sol` 451-481; `TakerTraitsLib.sol` 40-60 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

The taker declares, in the taker traits, whether the supplied amount is a making
or taking amount, and whether the args carry a target, an extension and an
interaction, each with its declared length.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Taker |
| Assets | Maker asset routing |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | An `Args` entry point was used |
| Postconditions | Target is the first 20 args bytes when `ARGS_HAS_TARGET` is set, otherwise `msg.sender`; extension and interaction are sliced at the declared lengths, in that order |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given `ARGS_HAS_TARGET` clear, when filled, then the maker asset goes to `msg.sender`.
2. Given `ARGS_HAS_TARGET` set with a 20-byte target prefix, when filled, then the maker asset goes to that target.
3. Given declared extension and interaction lengths, when parsed, then the slices match exactly and no bytes are shared between them.
4. Given a declared length exceeding the args, when filled, then it reverts rather than reading adjacent calldata.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests for each flag combination; fuzz over declared lengths for criterion 4 |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Calldata confusion; the taker can only misdirect their own fill, but a length overflow reading past args would be more serious |
| Economic impact | Bounded by the fill |
| Confidence | `HIGH` |
| Confidence rationale | Documented packing matches the parser exactly |

### Notes

Criterion 4 is the one worth real effort. `_parseArgs` slices with Solidity
calldata slice syntax, which bounds-checks, but the 24-bit length fields allow
values up to 16.7 MB and the interaction slice is taken from the already-advanced
`args`. Fuzz it.

---

## `FR-CANCEL-001` — A maker can cancel an order directly

| Field | Content |
|---|---|
| ID | `FR-CANCEL-001` |
| Criticality | `CRITICAL` |
| Criticality rationale | Cancellation is the maker's only unilateral exit from a signed commitment; if it can fail or be blocked, the maker is locked into a stale price. |
| Source | `description.md` 927-934; `OrderMixin.sol` 80-88 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

A maker can render one of their own orders permanently unfillable, and only
their own.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker only |
| Assets | None moved |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | Caller is the maker of the order |
| Postconditions | For a bit-invalidator order, the nonce bit for `msg.sender` is set and `BitInvalidatorUpdated` is emitted. Otherwise the remaining invalidator for `(msg.sender, orderHash)` is set to fully-filled and `OrderCancelled` is emitted. Subsequent fills revert |
| Invariants preserved | pending Phase 6 — cancellation is irreversible |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given an unfilled order, when the maker cancels and a taker then attempts a fill, then the fill reverts.
2. Given a partially filled order, when the maker cancels, then the remainder is unfillable.
3. Given a non-maker calling cancel with another maker's order hash, when they do, then the victim's order remains fillable — the write landed in the caller's own slot.
4. Given a cancelled order, when the maker attempts to un-cancel by any means, then no such path exists.
5. Given the protocol is paused, when the maker cancels, then the cancellation still succeeds.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests; criterion 4 by review plus an invariant |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | If a third party could cancel, it is censorship; if the maker could not, it is forced execution at a stale price |
| Economic impact | For a stale order, the full making amount at an adverse price |
| Confidence | `HIGH` |
| Confidence rationale | Documented; the `msg.sender` keying makes third-party cancellation structurally impossible rather than merely checked |

### Notes

Criterion 3 deserves care: `cancelOrder` takes an arbitrary `orderHash` and does
not verify the caller is the maker. It does not need to, because the mapping is
keyed by `msg.sender`. Test the property, not the absent check. Criterion 5
follows from `cancelOrder` lacking `whenNotPaused`, tied to `OPS-001`.

---

## `FR-CANCEL-002` — A maker can cancel many orders in one transaction

| Field | Content |
|---|---|
| ID | `FR-CANCEL-002` |
| Criticality | `MEDIUM` |
| Criticality rationale | Convenience over the single-cancel path, with the same effect and the same authority. |
| Source | `OrderMixin.sol` 93-100; `DIV-008` (`DOCUMENTATION_BUG`, `camoseed`, 2026-08-03) |
| Approval | pending |
| Status | `DRAFT` |

### Statement

A maker can cancel a batch of their orders in one call, with the same effect as
cancelling each individually.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker |
| Assets | None |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | The traits array and hash array have equal length |
| Postconditions | Every listed order is cancelled; unequal lengths revert `MismatchArraysLengths` before any write |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given three orders and matching arrays, when cancelled as a batch, then all three become unfillable.
2. Given arrays of different lengths, when submitted, then it reverts `MismatchArraysLengths` and no order is cancelled.
3. Given a batch, when compared with three individual cancels, then the resulting state is identical.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests, including a state-equivalence comparison for criterion 3 |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Minimal; same authority as the single path |
| Economic impact | None beyond gas |
| Confidence | `HIGH` |
| Confidence rationale | Nine-line loop delegating to the single-cancel path |

### Notes

The loop is `unchecked` with `i < length`, which is safe. Documentation fix
proposed under `DIV-008`.

---

## `FR-CANCEL-003` — A maker can invalidate many nonces in one slot at once

| Field | Content |
|---|---|
| ID | `FR-CANCEL-003` |
| Criticality | `HIGH` |
| Criticality rationale | A wrong mask irreversibly burns up to 256 of the maker's own nonces, and there is no way back. |
| Source | `OrderMixin.sol` 105-109; `BitInvalidatorLib.sol` 56-61; `DIV-008` |
| Approval | pending |
| Status | `DRAFT` |

### Statement

A maker using bit-invalidator orders can invalidate an arbitrary set of nonces
within one 256-nonce slot in a single call.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker |
| Assets | None |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | The supplied traits select the bit invalidator |
| Postconditions | The slot becomes its prior value OR the nonce bit OR the additional mask; `BitInvalidatorUpdated` is emitted with the new value. Traits not selecting the bit invalidator revert `OrderIsNotSuitableForMassInvalidation` |
| Invariants preserved | pending Phase 6 — the slot value is monotonically non-decreasing under OR |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a mask with three bits set, when invalidated, then all three nonces plus the traits nonce become unusable.
2. Given traits that select the remaining invalidator, when submitted, then it reverts `OrderIsNotSuitableForMassInvalidation`.
3. Given an already-set bit included in the mask, when submitted, then it succeeds — unlike a fill, mass invalidation is idempotent and does not revert.
4. Given any mask, when applied, then no previously set bit becomes unset.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests plus a property test asserting monotonicity for criterion 4 |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Self-inflicted only; a maker cannot touch another maker's slots |
| Economic impact | Loss of use of up to 256 nonces |
| Confidence | `HIGH` |
| Confidence rationale | Small, explicit implementation |

### Notes

Contrast with `checkAndInvalidate`, which reverts on an already-set bit
(`BitInvalidatorLib.sol` 44). `massInvalidate` deliberately does not. Criterion 3
pins that difference.

---

## `MATH-001` — The making amount rounds down

| Field | Content |
|---|---|
| ID | `MATH-001` |
| Criticality | `HIGH` |
| Criticality rationale | Rounding direction decides who receives the sub-unit remainder on every partial fill; the wrong direction leaks value from the maker on every fill. |
| Source | `AmountCalculatorLib.sol` 8-16; `description.md` 156; Phase 1 alignment rows 22-23 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

When the taker specifies a taking amount, the making amount owed by the maker is
computed at the order's rate and rounded down.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Taker requests; protocol computes |
| Assets | Maker asset |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | No making-amount getter in the extension |
| Postconditions | Result is `floor(requestedTakingAmount * order.makingAmount / order.takingAmount)` |
| Invariants preserved | pending Phase 6 — rounding never favours the taker |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given making 3 and taking 2, when the taker requests taking 1, then the making amount is 1, not 2.
2. Given amounts dividing exactly, when computed, then the result is exact with no adjustment.
3. Given any inputs, when computed, then `result * order.takingAmount <= requested * order.makingAmount`.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests plus a property test for criterion 3 across the input space |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Systematic value leakage, one unit per fill, amplified by fill count |
| Economic impact | Small per fill, unbounded in aggregate under a griefing pattern of many dust fills |
| Confidence | `HIGH` |
| Confidence rationale | Explicit NatSpec "Floored maker amount" and matching arithmetic |

### Notes

The implementation has two arithmetically identical branches, one `unchecked`
for operands below 2^128. Both must be exercised; the fast path is the one that
runs in practice.

---

## `MATH-002` — The taking amount rounds up

| Field | Content |
|---|---|
| ID | `MATH-002` |
| Criticality | `HIGH` |
| Criticality rationale | Mirror of `MATH-001`; together they guarantee rounding always favours the maker. |
| Source | `AmountCalculatorLib.sol` 19-27 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

When the taker specifies a making amount, the taking amount they owe is computed
at the order's rate and rounded up.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Taker requests; protocol computes |
| Assets | Taker asset |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | No taking-amount getter in the extension |
| Postconditions | Result is `ceil(requestedMakingAmount * order.takingAmount / order.makingAmount)` |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given making 2 and taking 3, when the taker requests making 1, then the taking amount is 2, not 1.
2. Given amounts dividing exactly, when computed, then no extra unit is added.
3. Given any inputs, when computed, then `result * order.makingAmount >= requested * order.takingAmount`.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests plus property test |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A — `test/RangeAmountCalculator.js` covers adjacent ground |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | As `MATH-001`, in the taker's favour if inverted |
| Economic impact | One unit per fill |
| Confidence | `HIGH` |
| Confidence rationale | NatSpec "Ceiled taker amount"; the `+ denominator - 1` idiom is unambiguous |

### Notes

`MATH-001` and `MATH-002` together are the protocol's rounding policy and should
become a single invariant in Phase 6: the maker is never worse off from rounding.

---

## `MATH-003` — A taker's threshold caps what they pay

| Field | Content |
|---|---|
| ID | `MATH-003` |
| Criticality | `CRITICAL` |
| Criticality rationale | The threshold is the taker's only slippage protection against a maker-controlled amount getter; without it a hostile getter can charge an arbitrary amount. |
| Source | `description.md` 912; `OrderMixin.sol` 304-312 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

When filling by making amount, the taking amount charged must not exceed the
taker's stated threshold, pro-rated to the amount actually filled.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Taker sets the bound |
| Assets | Taker asset |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | `MAKER_AMOUNT_FLAG` set and threshold non-zero |
| Postconditions | If the full requested amount filled, `takingAmount <= threshold`; if partially filled, `takingAmount * amount <= threshold * makingAmount`. Otherwise reverts `TakingAmountTooHigh` |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a threshold one unit below the computed taking amount, when filled, then it reverts `TakingAmountTooHigh`.
2. Given a threshold exactly equal, when filled, then it succeeds — the bound is inclusive.
3. Given a zero threshold, when filled, then no check is applied at any price.
4. Given a partial fill, when checked, then the cross-multiplied form is used and no division rounding weakens the bound.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests at the boundary; property test over partial fills for criterion 4 |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Without an effective threshold a malicious amount getter drains the taker up to their allowance |
| Economic impact | Up to the taker's full allowance on the taker asset |
| Confidence | `HIGH` |
| Confidence rationale | Formula documented with explicit inequalities; implementation matches including the gas-optimised equality branch |

### Notes

Criterion 3 is a real footgun and should be documented as such: zero means "no
protection", not "zero cost". Both branches of the `amount == makingAmount`
optimisation must be tested; they are supposed to be equivalent.

---

## `MATH-004` — A taker's threshold floors what they receive

| Field | Content |
|---|---|
| ID | `MATH-004` |
| Criticality | `CRITICAL` |
| Criticality rationale | Mirror of `MATH-003` for the other fill direction, with the same exposure. |
| Source | `description.md` 912; `OrderMixin.sol` 324-332 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

When filling by taking amount, the making amount received must be at least the
taker's stated threshold, pro-rated to the amount actually filled.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Taker sets the bound |
| Assets | Maker asset |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | `MAKER_AMOUNT_FLAG` clear and threshold non-zero |
| Postconditions | If fully filled, `makingAmount >= threshold`; if partially, `makingAmount * amount >= threshold * takingAmount`. Otherwise reverts `MakingAmountTooLow` |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a threshold one unit above the computed making amount, when filled, then it reverts `MakingAmountTooLow`.
2. Given a threshold exactly equal, when filled, then it succeeds.
3. Given a zero threshold, when filled, then no check is applied.
4. Given the making amount was clamped to the remaining amount, when the threshold is checked, then it is checked against the clamped value.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests; criterion 4 specifically against a partially filled order |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Taker receives arbitrarily little for their payment |
| Economic impact | Up to the taker's full payment |
| Confidence | `HIGH` |
| Confidence rationale | Documented and implemented symmetrically with `MATH-003` |

### Notes

Criterion 4 covers the clamping path at lines 317-322, where an over-large
computed making amount is reduced to the remaining amount and the taking amount
is recomputed, possibly reverting `TakingAmountExceeded`. That recomputation
happens before the threshold check, so the order matters.

---

## `MATH-005` — A Dutch auction interpolates linearly between two prices and clamps outside its window

| Field | Content |
|---|---|
| ID | `MATH-005` |
| Criticality | `HIGH` |
| Criticality rationale | The auction price determines the exchange rate; an error moves value between maker and taker on every fill through this getter. |
| Source | `DutchAuctionCalculator.sol` 15-58; `description.md` 157 (names the mechanism only) |
| Approval | pending |
| Status | `DRAFT` |

### Statement

A Dutch-auction order prices linearly in time between a start price at the start
time and an end price at the end time, holding the start price before the window
and the end price after it.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker configures; taker fills at the prevailing price |
| Assets | Both |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | Start and end times packed into one word; end time strictly after start time |
| Postconditions | The effective taking amount is the time-weighted average of the endpoints, floored; the effective time is clamped into the window |
| Invariants preserved | pending Phase 6 — monotonic in time |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a timestamp before the start, when priced, then the price equals the start price exactly.
2. Given a timestamp after the end, when priced, then the price equals the end price exactly.
3. Given the exact midpoint, when priced, then the price is the mean of the endpoints, floored.
4. Given equal start and end times, when priced, then the call reverts on division by zero rather than returning a nonsense price.
5. Given two timestamps with the later one further through a descending auction, when both are priced, then the later price is not higher.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests at the four boundaries; property test for monotonicity |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A — `test/DutchAuctionCalculator.js` (168 lines) |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | A mispriced auction transfers value to whichever side the error favours; timestamp dependence gives miners a small manipulation window |
| Economic impact | Bounded by the spread between start and end price |
| Confidence | `MEDIUM` |
| Confidence rationale | The formula is unambiguous but intent is single-source: `description.md` names Dutch auctions without specifying the curve. Would rise to `HIGH` with one sentence of specification |

### Notes

The code does not require the start price to exceed the end price, so the same
contract prices an ascending auction. Whether that is intended is genuinely
unclear from the code, and criterion 5 is written for the descending case only.
Criterion 4 documents a revert, not a graceful degradation — that is current
behaviour, not necessarily desired behaviour.

---

## `MATH-006` — A range order prices along a linear curve against volume already filled

| Field | Content |
|---|---|
| ID | `MATH-006` |
| Criticality | `HIGH` |
| Criticality rationale | As `MATH-005`: the curve sets the rate, and the inverse computation involves a square root where an error is easy to make and hard to see. |
| Source | `RangeAmountCalculator.sol` 28-104; `description.md` 158 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

A range order prices along a straight line from a start price to an end price as
a function of how much of the order has already been filled, and the two
directions of the computation must agree.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker configures the range; taker fills |
| Assets | Both |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | End price strictly greater than start price, else `IncorrectRange`; order making amount non-zero |
| Postconditions | The taker amount is the trapezoidal area under the price line across the filled interval, floored; the maker amount is its inverse via integer square root |
| Invariants preserved | pending Phase 6 — round-trip consistency within a bounded error |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given end price not greater than start price, when priced, then it reverts `IncorrectRange`.
2. Given an unfilled order and a full-size fill, when priced, then the taker amount equals the mean of the endpoints times the size, floored.
3. Given a partially filled order, when priced, then the price reflects the already-filled volume and is higher than for an unfilled order.
4. Given a taker amount produced by the forward direction, when passed to the inverse direction, then the making amount returned is within one unit of the original.
5. Given a fill sequence of two halves versus one whole, when compared, then the total taker amount differs by at most the accumulated flooring error.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests plus a round-trip property test for criteria 4 and 5 |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A — `test/RangeAmountCalculator.js`, `test/RangeLimitOrders.js` |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | An inverse that overshoots gives the taker more maker asset than the curve allows |
| Economic impact | Bounded by the price range per fill, unbounded across many fills if the round trip is biased |
| Confidence | `MEDIUM` |
| Confidence rationale | Arithmetic is explicit but the intended continuous model is not written down anywhere, so "correct" is judged against a model reconstructed from the code. A one-paragraph specification of the curve would raise this to `HIGH` |

### Notes

The inverse subtracts `bDivK` and `alreadyFilledMakingAmount` from an integer
square root with no `unchecked`, so an undershoot reverts rather than wrapping.
That is the safe failure mode, but it means a rounding bias shows up as a
mysterious revert rather than a wrong number. Criterion 4 is the one most likely
to find a real defect.

---

## `TIME-001` — An order is fillable up to and including its expiration second

| Field | Content |
|---|---|
| ID | `TIME-001` |
| Criticality | `HIGH` |
| Criticality rationale | Expiry is a maker's automatic protection against a stale price; an off-by-one at the boundary is exactly where a fill would be contested. |
| Source | `description.md` 103, 920; `MakerTraitsLib.sol` 83-86; Phase 1 alignment row 16 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

An order with an expiration remains fillable while the block timestamp is at or
before that expiration, and a zero expiration means the order never expires.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker sets; protocol enforces at fill |
| Assets | Both |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | The order carries a 40-bit expiration field |
| Postconditions | Fill reverts `OrderExpired` only when the expiration is non-zero and strictly less than the block timestamp |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given expiration `T` and block timestamp `T - 1`, when filled, then it succeeds.
2. Given expiration `T` and block timestamp exactly `T`, when filled, then it succeeds — the boundary is inclusive.
3. Given expiration `T` and block timestamp `T + 1`, when filled, then it reverts `OrderExpired`.
4. Given expiration zero and a far-future timestamp, when filled, then it succeeds.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests using timestamp manipulation at all three boundary points |
| Owning harness | Hardhat, with `@nomicfoundation/hardhat-network-helpers` time control |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | A one-second window either way; miners have limited timestamp latitude, so the exposure is small but real |
| Economic impact | One fill at a just-stale price |
| Confidence | `HIGH` |
| Confidence rationale | The comparison is a single unambiguous expression and the documented wording "cannot be filled after" agrees with it |

### Notes

Criterion 2 is the whole point of this requirement. The 40-bit field saturates in
the year 36812, which is not a practical concern but bounds the domain for
property tests.

---

## `TIME-002` — An epoch advances by between 1 and 255 at a time

| Field | Content |
|---|---|
| ID | `TIME-002` |
| Criticality | `MEDIUM` |
| Criticality rationale | Bounds a maker's own mass-cancellation step; exceeding it reverts rather than doing anything dangerous. |
| Source | `SeriesEpochManager.sol` 29-42; `DIV-012` (`DOCUMENTATION_BUG`, `camoseed`, 2026-08-03) |
| Approval | pending |
| Status | `DRAFT` |

### Statement

A maker advances their epoch for a series by a strictly positive amount no
greater than 255, which invalidates every order of that series bound to an
earlier epoch.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker only, for their own `(maker, series)` |
| Assets | None moved |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | Caller advances their own series |
| Postconditions | The stored epoch increases by the amount and `EpochIncreased` is emitted; zero or more than 255 reverts `AdvanceEpochFailed` |
| Invariants preserved | pending Phase 6 — an epoch never decreases |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given an advance of 255, when submitted, then it succeeds.
2. Given an advance of 256, when submitted, then it reverts `AdvanceEpochFailed`.
3. Given an advance of 0, when submitted, then it reverts `AdvanceEpochFailed`.
4. Given `increaseEpoch`, when called, then the epoch rises by exactly 1.
5. Given two makers using the same series number, when one advances, then the other's epoch is unchanged.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests at 0, 1, 255, 256; a two-maker isolation test for criterion 5 |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A — `test/SeriesEpochManager.js` (55 lines) |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Cross-maker interference if the key packing were wrong; criterion 5 tests exactly that |
| Economic impact | Mass invalidation of one maker's orders |
| Confidence | `HIGH` |
| Confidence rationale | Explicit guard; the documented 256 was decided a documentation bug at Gate A |

### Notes

The addition is `unchecked`, so a maker who advanced 2^256/255 times would wrap.
Unreachable in practice; note it and move on. The key is
`uint160(maker) | (series << 160)`, which is why criterion 5 holds.

---

## `TIME-003` — A Chainlink price older than four hours is rejected

| Field | Content |
|---|---|
| ID | `TIME-003` |
| Criticality | `HIGH` |
| Criticality rationale | A stale oracle price is the standard route to draining an oracle-priced order. |
| Source | `ChainlinkCalculator.sol` 20, 74, 89, 102 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

An order priced from a Chainlink feed must not fill on an answer older than four
hours, and where two feeds are used both must be fresh.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker configures the feed; taker fills; oracle is an external trust dependency |
| Assets | Both |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | The extension names one or two aggregators |
| Postconditions | Reverts `StaleOraclePrice` when `updatedAt + 4 hours < block.timestamp` for any consulted feed; a negative answer reverts through the safe cast |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given an answer updated 3 hours 59 minutes ago, when filled, then it succeeds.
2. Given an answer updated 4 hours and 1 second ago, when filled, then it reverts `StaleOraclePrice`.
3. Given exactly 4 hours, when filled, then it succeeds — the boundary is inclusive.
4. Given a two-feed order where the second feed is stale and the first is fresh, when filled, then it reverts.
5. Given a negative oracle answer, when filled, then it reverts rather than wrapping to a huge positive.
6. Given a zero oracle answer on a path that divides by it, when filled, then it reverts.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests against `contracts/mocks/AggregatorMock.sol` at each boundary |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A — `test/ChainLinkExample.js` (305 lines) |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Filling at a stale price is a direct transfer to the informed party |
| Economic impact | The full order size at an arbitrarily wrong price |
| Confidence | `MEDIUM` |
| Confidence rationale | The TTL is explicit in code but stated nowhere as intent, and four hours is shorter than some feeds' heartbeat. Whether four hours is right for every deployed feed is unresolved and is a real question, not a documentation nicety |

### Notes

There is no check that the answer is positive beyond the safe cast, no round
completeness check, and no min/max bound. Criteria 5 and 6 pin what the code
does today, which is to revert; they do not assert that reverting is the ideal
response. Carry the four-hour question into Phase 11.

---

## `STATE-001` — Which invalidator an order uses is fixed by its traits

| Field | Content |
|---|---|
| ID | `STATE-001` |
| Criticality | `CRITICAL` |
| Criticality rationale | The two invalidators are separate storage; an order evaluated under the wrong one could be filled twice. |
| Source | `description.md` 932; `MakerTraitsLib.sol` 151-153; `OrderMixin.sol` 338-342, 490-497 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

An order that forbids partial fills or forbids multiple fills is tracked by the
bit invalidator; every other order is tracked by the remaining-amount
invalidator, and the choice is the same at every point in the order's life.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Protocol |
| Assets | None directly; governs double-spend protection |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | Traits are fixed at signing and covered by the signature |
| Postconditions | Fill, cancel and the remaining-amount view all select the same invalidator for a given order |
| Invariants preserved | pending Phase 6 — an order is never recorded in both invalidators |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given an order with partial fills disallowed, when filled, then the bit invalidator changes and the remaining invalidator does not.
2. Given an order allowing partial and multiple fills, when filled, then the remaining invalidator changes and the bit invalidator does not.
3. Given an order allowing partial but not multiple fills, when filled, then the bit invalidator is used.
4. Given any order, when cancelled and then a fill is attempted, then the fill consults the same invalidator the cancel wrote to.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests over all four trait combinations, asserting both storage locations each time |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | A mismatch between the cancel path and the fill path means a cancelled order stays fillable |
| Economic impact | Full making amount, repeatedly |
| Confidence | `HIGH` |
| Confidence rationale | Single predicate used consistently at every site |

### Notes

Criterion 3 covers the asymmetry in `!allowPartialFills || !allowMultipleFills`:
either flag alone forces the bit invalidator. `description.md` line 929 warns
that passing the wrong traits to `cancelOrder` silently does nothing, which is
the practical consequence and belongs in a scenario.

---

## `STATE-002` — The remaining amount only ever decreases

| Field | Content |
|---|---|
| ID | `STATE-002` |
| Criticality | `CRITICAL` |
| Criticality rationale | If the remaining amount could rise, an order could be filled for more than the maker signed for. |
| Source | `RemainingInvalidatorLib.sol` 24-79; `OrderMixin.sol` 341, 490-497 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

For an order tracked by remaining amount, the amount left to fill starts at the
order's making amount, decreases by exactly the amount filled on each fill, and
never increases.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Protocol maintains; taker consumes |
| Assets | Maker asset |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | Order uses the remaining invalidator |
| Postconditions | After a fill of `m`, remaining becomes `previous - m`; at zero the order is exhausted and further fills revert `InvalidatedOrder` |
| Invariants preserved | pending Phase 6 — monotonic non-increase; sum of fills never exceeds the making amount |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a fresh order, when the remaining amount is read, then it equals the making amount.
2. Given a fill of 30% then 30%, when read, then the remaining amount is 40% of the making amount.
3. Given fills totalling the making amount, when another fill is attempted, then it reverts `InvalidatedOrder`.
4. Given any sequence of fills, when summed, then the total never exceeds the making amount.
5. Given a cancelled order, when the remaining amount is read, then it is zero.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests plus a stateful property test over random fill sequences for criterion 4 |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Over-fill drains the maker beyond their signed commitment |
| Economic impact | Unbounded above the order size |
| Confidence | `HIGH` |
| Confidence rationale | The complement encoding makes the states distinguishable without ambiguity, and the clamp at line 301 caps each fill at the remainder |

### Notes

The encoding stores `~remaining`, so stored zero means untouched and stored
`type(uint256).max` means exhausted. The single-argument `remaining()` reverts on
stored zero while `isNewOrder()` treats it as new — a genuine inconsistency
flagged in the compliance report's ambiguity table. The core only uses the
two-argument form, so it is latent rather than live, and criterion 1 pins the
form that is actually used.

---

## `STATE-003` — A bit-invalidator nonce can be consumed once

| Field | Content |
|---|---|
| ID | `STATE-003` |
| Criticality | `CRITICAL` |
| Criticality rationale | This is the entire double-spend protection for orders that disallow partial or multiple fills. |
| Source | `BitInvalidatorLib.sol` 29-61; `description.md` 933-934 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

Each `(maker, nonce)` pair for a bit-invalidator order can be used for exactly
one fill, after which any further fill of that nonce fails.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker owns the nonce space; taker consumes |
| Assets | Maker asset |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | Order selects the bit invalidator |
| Postconditions | The bit at `nonce & 0xff` in slot `nonce >> 8` transitions from 0 to 1; a second attempt reverts `BitInvalidatedOrder` |
| Invariants preserved | pending Phase 6 — bits never clear |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a fresh nonce, when filled, then it succeeds and the bit is set.
2. Given the same nonce again, when filled, then it reverts `BitInvalidatedOrder`.
3. Given two orders with adjacent nonces in the same slot, when both fill, then both succeed independently.
4. Given two makers using the same nonce, when both fill, then both succeed — nonce spaces are per maker.
5. Given any fill or invalidation, when the slot is read afterwards, then no previously set bit has been cleared.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests plus a property test over nonce sequences for criterion 5 |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Nonce reuse is a replay: the same signed order fills repeatedly |
| Economic impact | Unbounded, limited only by the maker's balance and allowance |
| Confidence | `HIGH` |
| Confidence rationale | Check-then-set in one function with an explicit revert |

### Notes

Criteria 3 and 4 test the slot and key decomposition, which is where a packing
error would hide. Criterion 4 matters because the mapping is inside a struct
keyed by maker in `OrderMixin`, not by nonce alone.

---

## `STATE-004` — An epoch-checked order fills only at the maker's current epoch

| Field | Content |
|---|---|
| ID | `STATE-004` |
| Criticality | `HIGH` |
| Criticality rationale | Epoch checking is the mass-cancellation mechanism; if it failed open, a maker's bulk cancel would silently not work. |
| Source | `description.md` 936-947; `OrderMixin.sol` 286-288; `SeriesEpochManager.sol` 46-48 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

An order that opts into epoch checking fills only while the maker's current
epoch for that series equals the epoch in the order, and such an order may not
also use the bit invalidator.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker controls the epoch; protocol checks at fill |
| Assets | Both |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | `NEED_CHECK_EPOCH_MANAGER` set |
| Postconditions | Reverts `EpochManagerAndBitInvalidatorsAreIncompatible` if the order also selects the bit invalidator; otherwise reverts `WrongSeriesNonce` unless the stored epoch equals the order's |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a matching epoch, when filled, then it succeeds.
2. Given the maker has since advanced the epoch, when filled, then it reverts `WrongSeriesNonce`.
3. Given epoch checking together with partial fills disallowed, when filled, then it reverts `EpochManagerAndBitInvalidatorsAreIncompatible`.
4. Given two series for one maker, when one is advanced, then orders in the other series still fill.
5. Given a post-interaction that advances the epoch, when a first order fills, then a second order at the next epoch becomes fillable and the first is not refillable.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests; criterion 5 uses an interaction mock and mirrors the documented sequencing example |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A — `test/SeriesEpochManager.js` |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Failing open means mass cancellation does not cancel |
| Economic impact | Every order in an affected series |
| Confidence | `HIGH` |
| Confidence rationale | Documented in detail, including the incompatibility and the chained-epoch pattern, and implemented as documented |

### Notes

Criterion 5 encodes the documented sequencing trick at `description.md` line 947
and is the most valuable test here: it exercises epoch state, post-interactions
and invalidation together.
