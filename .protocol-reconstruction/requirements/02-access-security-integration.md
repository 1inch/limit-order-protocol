# Access control, operations, security and integration requirements

Phase 2. 18 entries. All Status `DRAFT`, Approval `pending` until Gate B.

---

## `ACC-001` — Only the maker's own signature authorises a fill

| Field | Content |
|---|---|
| ID | `ACC-001` |
| Criticality | `CRITICAL` |
| Criticality rationale | The signature is the sole authorisation for moving the maker's tokens; any weakness is unrestricted theft from every maker with an allowance. |
| Source | `description.md` 871-873; `OrderMixin.sol` 172-186, 232-236 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

An order fills only when the maker has cryptographically authorised that exact
order hash, whether the maker is an externally owned account or a contract, and
the check is performed on the order's first fill.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker authorises; taker presents the signature |
| Assets | The maker's entire allowance on the maker asset |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | The order is being filled for the first time, detected by the remaining amount equalling the full making amount |
| Postconditions | EOA path: `ECDSA.recover(orderHash, r, vs)` equals the maker and the maker is not the zero address. Contract path: `ECDSA.isValidSignature` returns true. Otherwise reverts `BadSignature` |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a signature from an account other than the maker, when filled, then it reverts `BadSignature`.
2. Given a signature over a different order, when presented, then it reverts `BadSignature`.
3. Given a maker of the zero address, when filled, then it reverts `BadSignature` rather than passing on a failed recovery.
4. Given a valid contract signature under ERC-1271, when filled via the contract entry point, then it succeeds.
5. Given a contract that returns anything other than the ERC-1271 magic value, when filled, then it reverts `BadSignature`.
6. Given a partially filled order, when filled again, then no signature is re-verified and the fill proceeds on the invalidator state alone.
7. Given a malleable variant of a valid signature, when presented, then it is rejected.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests for every branch; criterion 7 against the compact `vs` encoding's malleability handling |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A — `test/LimitOrderProtocol.js`, `test/MakerContract.js` |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Forgery drains every maker who has granted an allowance |
| Economic impact | Unbounded |
| Confidence | `HIGH` |
| Confidence rationale | Documented, and delegated to audited `@1inch/solidity-utils` ECDSA helpers |

### Notes

Criterion 6 is the subtle one and deserves emphasis in Phase 5: signature
verification runs *only* on the first fill. Every later fill is authorised
purely by the remaining-amount record. That makes `STATE-002` load-bearing for
authorisation, not just for accounting. Criterion 3 pins the explicit zero-maker
guard at line 174, which exists because a failed `ecrecover` returns zero.

---

## `ACC-002` — A private order fills only for the address the maker named

| Field | Content |
|---|---|
| ID | `ACC-002` |
| Criticality | `HIGH` |
| Criticality rationale | Privacy of execution is a stated feature; a bypass exposes the maker to takers they deliberately excluded. |
| Source | `description.md` 102; `MakerTraitsLib.sol` 64-67; `OrderMixin.sol` 284 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

An order that names an allowed sender fills only when the caller's address
matches in its low 80 bits, and an order naming none fills for anyone.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker restricts; caller is checked |
| Assets | Both |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | The allowed-sender field is the low 80 bits of the traits |
| Postconditions | Passes when the field is zero, or when it equals the low 80 bits of `msg.sender`; otherwise reverts `PrivateOrder` |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given an allowed sender and a call from that address, when filled, then it succeeds.
2. Given an allowed sender and a call from anyone else, when filled, then it reverts `PrivateOrder`.
3. Given a zero allowed-sender field, when filled by an arbitrary address, then it succeeds.
4. Given two addresses agreeing in their low 80 bits, when either fills, then both are accepted — the accepted truncation bound.
5. Given a fill routed through an intermediary contract, when checked, then the intermediary's address is the one compared, not the transaction origin.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests; criterion 4 with two crafted addresses; criterion 5 through a forwarding mock |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Truncation to 80 bits means an attacker needs roughly 2^80 work to grind a colliding address, which is infeasible today but far weaker than a full address comparison |
| Economic impact | The order's full making amount |
| Confidence | `HIGH` |
| Confidence rationale | The truncation is documented explicitly as "the last 10 bytes of the allowed sender's address" and implemented as documented |

### Notes

Criterion 4 asserts current behaviour, not desired behaviour. The 80-bit bound
should be recorded in Phase 3's trust model as an accepted assumption with its
work factor stated, so that nobody later mistakes it for a full-address check.

---

## `ACC-003` — Only the owner can pause or unpause the protocol

| Field | Content |
|---|---|
| ID | `ACC-003` |
| Criticality | `HIGH` |
| Criticality rationale | Pausing halts all trading; if anyone could trigger it, it is a permanent denial of service on the whole protocol. |
| Source | `LimitOrderProtocol.sol` 31-58; `DIV-004` (`ACCEPTED_CURRENT_BEHAVIOUR`, `camoseed`, 2026-08-03) |
| Approval | pending |
| Status | `DRAFT` |

### Statement

The protocol has a single owner, and only that owner may pause or unpause
trading.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Owner, set to the deployer at construction and transferable |
| Assets | None moved; all in-flight trading is gated |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | Caller is `owner()` |
| Postconditions | Paused state toggles and the corresponding OpenZeppelin event is emitted; any other caller reverts `OwnableUnauthorizedAccount` |
| Invariants preserved | pending Phase 6 — exactly one owner at all times |
| State machine | pending Phase 3 — `SM-*` for paused / unpaused |
| |

### Acceptance criteria

1. Given a non-owner calling `pause`, when submitted, then it reverts `OwnableUnauthorizedAccount`.
2. Given the owner calling `pause`, when submitted, then the protocol becomes paused.
3. Given a paused protocol and the owner calling `unpause`, when submitted, then trading resumes and previously blocked orders fill normally.
4. Given ownership transferred, when the old owner calls `pause`, then it reverts.
5. Given ownership renounced, when anyone calls `pause`, then it reverts and the protocol can never be paused again.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests for each branch; criterion 5 documents an irreversible operational state |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A — expected to be uncovered |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Owner-key compromise halts the protocol; the owner cannot steal funds through this path, only deny service |
| Economic impact | No direct loss; complete loss of availability |
| Confidence | `HIGH` |
| Confidence rationale | Standard OpenZeppelin `Ownable` with two three-line functions |

### Notes

`OQ-4` in `STATUS.md` asks who holds the owner key per deployment and stays open;
it does not block this requirement, which is about the mechanism. Criterion 5 is
worth stating because renouncing is a plausible decentralisation step with an
irreversible consequence for emergency response.

---

## `ACC-004` — Only the limit order protocol can drive `FeeTaker`'s post-interaction

| Field | Content |
|---|---|
| ID | `ACC-004` |
| Criticality | `HIGH` |
| Criticality rationale | The post-interaction moves whatever balance `FeeTaker` holds; an open entry point would let anyone direct those funds. |
| Source | `FeeTaker.sol` 53-56, 79-90 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

`FeeTaker`'s post-interaction may be invoked only by the limit order protocol
address fixed at deployment.

### Actors and assets

| Field | Content |
|---|---|
| Actors | The protocol calls; integrator and protocol fee recipients receive |
| Assets | The taker asset held transiently by `FeeTaker`, or ETH |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | `msg.sender` equals the immutable protocol address |
| Postconditions | Proceeds, or reverts `OnlyLimitOrderProtocol` |
| Invariants preserved | pending Phase 6 — `FeeTaker` holds no balance between transactions |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a direct call from an arbitrary address, when submitted, then it reverts `OnlyLimitOrderProtocol`.
2. Given a call from the configured protocol, when submitted, then it proceeds.
3. Given `FeeTaker` holds a residual balance, when an arbitrary address attempts to trigger a payout, then no path exists other than the protocol call and owner rescue.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests; criterion 3 by entry-point enumeration in Phase 4 plus a test |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A — `test/FeeTaker.js` (318 lines) |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | An unguarded post-interaction lets an attacker specify recipients and drain any balance held |
| Economic impact | Whatever `FeeTaker` holds, normally one fill's fees |
| Confidence | `HIGH` |
| Confidence rationale | Single explicit modifier on the only external mutating entry point besides `rescueFunds` |

### Notes

The immutable is set with no zero-address check (`FeeTaker.sol` 65-69). A
misdeployment with a zero protocol address bricks the contract permanently.
Worth a deployment-time check in Phase 11 rather than a contract change here.

---

## `ACC-005` — Only `FeeTaker`'s owner can rescue stranded funds

| Field | Content |
|---|---|
| ID | `ACC-005` |
| Criticality | `MEDIUM` |
| Criticality rationale | A privileged withdrawal, but over a contract that should hold nothing between transactions. |
| Source | `FeeTaker.sol` 97-99 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

Only `FeeTaker`'s owner may withdraw tokens held by the contract.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Owner |
| Assets | Any token balance held by `FeeTaker` |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | Caller is the owner |
| Postconditions | The requested amount transfers to the owner; other callers revert `OwnableUnauthorizedAccount` |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a non-owner calling `rescueFunds`, when submitted, then it reverts.
2. Given the owner calling it with a stranded balance, when submitted, then the balance transfers to the owner.
3. Given a fill in progress, when it completes, then no balance remains for rescue in the normal case.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Owner can take any balance held; by design, but it is a trust assumption for anyone who mistakenly sends tokens |
| Economic impact | Bounded by the held balance |
| Confidence | `HIGH` |
| Confidence rationale | Two-line function with a standard modifier |

### Notes

Criterion 3 is really an invariant about `FeeTaker` being transient. If it ever
holds a balance across transactions, the trust assumption grows. Carry to
Phase 6.

---

## `OPS-001` — Pausing stops fills but never traps a maker

| Field | Content |
|---|---|
| ID | `OPS-001` |
| Criticality | `MEDIUM` |
| Criticality rationale | Bounded operational impact, but the asymmetry is the difference between a safety control and a hostage situation. |
| Source | `OrderMixin.sol` 272 versus 80-109; `DIV-004` |
| Approval | pending |
| Status | `DRAFT` |

### Statement

While the protocol is paused, no order can be filled, and every maker can still
cancel their orders and advance their epochs.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Owner pauses; makers and takers are affected differently |
| Assets | None moved while paused |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | The protocol is paused |
| Postconditions | All four fill entry points revert `EnforcedPause`; `cancelOrder`, `cancelOrders`, `bitsInvalidateForOrder`, `increaseEpoch` and `advanceEpoch` all still succeed |
| Invariants preserved | pending Phase 6 — cancellation availability is independent of pause state |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a paused protocol, when any of the four fill functions is called, then it reverts `EnforcedPause`.
2. Given a paused protocol, when a maker cancels an order, then it succeeds.
3. Given a paused protocol, when a maker advances an epoch, then it succeeds.
4. Given an order cancelled while paused, when the protocol is unpaused, then that order is still unfillable.
5. Given a paused protocol, when view functions are called, then they behave normally.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests covering all five; this is a small matrix and should be exhaustive |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A — expected uncovered |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | If cancellation were pausable, an owner could freeze makers into stale orders and release the pause at a chosen moment — a value-extracting capability rather than a safety control |
| Economic impact | Potentially large under that scenario; zero as currently implemented |
| Confidence | `HIGH` |
| Confidence rationale | The asymmetry is directly readable: `whenNotPaused` is on `_fill` alone. The behaviour is certain; only the *intent* is reverse-engineered, and Gate A accepted it |

### Notes

This is the requirement that turns `DIV-004` from a bare centralisation note into
something checkable. Criterion 2 is the one that matters most and is the natural
Phase 6 invariant.

---

## `SEC-001` — Simulation can never persist state

| Field | Content |
|---|---|
| ID | `SEC-001` |
| Criticality | `CRITICAL` |
| Criticality rationale | `simulate` delegatecalls arbitrary caller-supplied code in the protocol's own storage context; if any path let it return normally, an attacker would have full write access to protocol storage. |
| Source | `OrderMixin.sol` 71-75; `DIV-005` (`ACCEPTED_CURRENT_BEHAVIOUR`, `camoseed`, 2026-08-03) |
| Approval | pending |
| Status | `DRAFT` |

### Statement

The simulation entry point always reverts, so no state change it performs is
ever committed, regardless of the target or calldata supplied.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Any caller, normally off-chain via `eth_call` |
| Assets | All protocol storage is at risk if this fails |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | None; the function is unrestricted |
| Postconditions | The call always reverts with `SimulationResults(success, result)`; no storage slot differs afterwards |
| Invariants preserved | pending Phase 6 — this requirement *is* an invariant |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a target that writes storage, when simulated, then the transaction reverts and the written slot is unchanged afterwards.
2. Given a target that succeeds, when simulated, then the revert payload reports success true and the return data.
3. Given a target that reverts, when simulated, then the revert payload reports success false and the revert data.
4. Given a target that self-destructs or performs any other irreversible action, when simulated, then nothing persists.
5. Given a target that consumes all gas, when simulated, then the outer call still fails and nothing persists.
6. Given a target that writes to the invalidator mappings specifically, when simulated, then no order's fill status changes.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests with a storage-writing mock, asserting slot values after; plus an invariant in the stateful harness that `simulate` never appears in a successful transaction |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A — `contracts/mocks/CallsSimulator.sol` suggests some coverage exists |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Total compromise: arbitrary writes to the invalidator mappings would let an attacker mark orders unfilled and refill them, or forge fill state |
| Economic impact | Unbounded |
| Confidence | `HIGH` |
| Confidence rationale | The unconditional `revert` is on the line after the delegatecall with no intervening branch; the property is structural |

### Notes

Criterion 6 is deliberately specific rather than relying on criterion 1's generic
form, because the invalidator mappings are the slots whose corruption would be
most valuable. This requirement should be one of the first invariants written in
Phase 6 and should stay in the suite permanently — its whole value is catching a
future refactor that adds a return path.

---

## `SEC-002` — A reentrant fill during a maker permit is rejected

| Field | Content |
|---|---|
| ID | `SEC-002` |
| Criticality | `HIGH` |
| Criticality rationale | The maker permit is a call into maker-influenced code before the invalidator is written, which is the classic window for a reentrant double fill. |
| Source | `OrderMixin.sol` 175-185; `DIV-007` (`ACCEPTED_CURRENT_BEHAVIOUR`, `camoseed`, 2026-08-03) |
| Approval | pending |
| Status | `DRAFT` |

### Statement

If executing a maker's permit re-enters the protocol and begins filling the same
remaining-amount order, the reentrant attempt is rejected.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Taker triggers; the permit target is the untrusted party |
| Assets | Maker asset |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | Order uses the remaining invalidator, carries a maker permit, and the taker did not set `SKIP_ORDER_PERMIT` |
| Postconditions | After the permit executes, the order's invalidator record must still show a new order; otherwise reverts `ReentrancyDetected` |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a permit target that re-enters and fills the same order, when the outer fill continues, then it reverts `ReentrancyDetected`.
2. Given a benign permit, when the fill continues, then it succeeds.
3. Given a bit-invalidator order with a reentrant permit, when filled, then the bit invalidator's own single-use check rejects the duplicate, without needing this guard.
4. Given the taker set `SKIP_ORDER_PERMIT`, when filled, then the permit does not execute and no reentrancy is possible through it.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests using a reentrant token mock; `contracts/mocks/RecursiveMatcher.sol` is the likely basis |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Without the guard, one signature could fill twice before the invalidator is written |
| Economic impact | Up to double the maker's intended making amount |
| Confidence | `HIGH` |
| Confidence rationale | Explicit check with a code comment stating exactly the reasoning in criterion 3 |

### Notes

Criterion 3 is worth an explicit test even though it needs no new code, because
it pins *why* the guard is narrow. If someone later widens or removes the bit
invalidator's check, this test explains what depended on it.

---

## `SEC-003` — Predicates cannot change state

| Field | Content |
|---|---|
| ID | `SEC-003` |
| Criticality | `MEDIUM` |
| Criticality rationale | Predicates run before the invalidator write with arbitrary maker-chosen targets; a state-changing predicate would be a reentrancy surface, but it is structurally prevented. |
| Source | `description.md` 511; `PredicateHelper.sol` 76-87 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

Every predicate evaluation, at every nesting depth, is a static call, so no
predicate can modify state, and a predicate that attempts to do so causes the
fill to fail rather than succeed silently.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker supplies the predicate; protocol evaluates |
| Assets | None directly |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | The extension carries a non-empty predicate |
| Postconditions | Evaluation uses `staticcall` only; a call returning other than exactly 32 bytes counts as failure; the fill proceeds only when the top-level result is exactly 1 |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a predicate target that attempts a storage write, when evaluated, then the predicate fails and the fill reverts `PredicateIsNotTrue`.
2. Given a predicate returning 0, when evaluated, then the fill reverts `PredicateIsNotTrue`.
3. Given a predicate returning 1, when evaluated, then the fill proceeds.
4. Given a predicate returning 2, when evaluated, then the fill reverts — only exactly 1 is true.
5. Given a predicate returning fewer or more than 32 bytes, when evaluated, then it counts as failure.
6. Given nested `and`/`or` predicates, when evaluated, then every leaf is also a static call.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests using `contracts/mocks/ArbitraryPredicateMock.sol`; criterion 5 needs a mock returning a non-standard length |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | A mutating predicate would give the maker a callback before invalidation |
| Economic impact | Bounded by what such a callback could reach |
| Confidence | `HIGH` |
| Confidence rationale | Documented as staticcall-only and implemented with a single `staticcall` site used by every primitive |

### Notes

Criterion 4 is not pedantry: `res == 1` is stricter than truthiness, so a
predicate returning any other non-zero value fails closed. Criterion 5 pins the
`returndatasize() == 32` requirement, which is unusual and easy to lose in a
refactor.

---

## `SEC-004` — Permit2 transfers reject asset suffixes

| Field | Content |
|---|---|
| ID | `SEC-004` |
| Criticality | `MEDIUM` |
| Criticality rationale | The two mechanisms encode transfer arguments incompatibly; allowing both would produce a malformed transfer rather than the intended one. |
| Source | `description.md` 269; `OrderMixin.sol` 361-363, 409-411 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

An order cannot combine Permit2 transfers with a non-ERC20 proxy asset suffix on
the same side of the trade.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker sets the maker-side flag; taker sets the taker-side flag |
| Assets | Both |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | Permit2 selected on a side, and a non-empty asset suffix present for that side |
| Postconditions | Reverts `InvalidPermit2Transfer` before any transfer |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given the maker set Permit2 and the extension has a maker asset suffix, when filled, then it reverts `InvalidPermit2Transfer`.
2. Given the taker set Permit2 and the extension has a taker asset suffix, when filled, then it reverts `InvalidPermit2Transfer`.
3. Given Permit2 with no suffix on that side, when filled, then it succeeds.
4. Given a suffix with Permit2 unset, when filled, then the suffixed transfer path is used.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests for all four combinations |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A — `test/Permit2Proxy.js` (87 lines) |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Without the guard, the suffix would be silently dropped and a proxied ERC721 transfer would become a plain token transfer |
| Economic impact | Bounded by the order |
| Confidence | `HIGH` |
| Confidence rationale | Two explicit checks; the maker side is documented, the taker side was found in Phase 1 as code being stronger than the specification |

### Notes

`description.md` line 269 covers only the maker side. Criterion 2 is therefore
the newly documented half and should be called out in the documentation fix.

---

## `SEC-005` — Native ETH is accounted exactly and excess is returned

| Field | Content |
|---|---|
| ID | `SEC-005` |
| Criticality | `MEDIUM` |
| Criticality rationale | ETH cannot be pulled, so it must be pushed exactly; a mismatch either strands ETH in the protocol or lets a taker underpay. |
| Source | `OrderMixin.sol` 386-405; `DIV-009` (`DOCUMENTATION_BUG`, `camoseed`, 2026-08-03) |
| Approval | pending |
| Status | `DRAFT` |

### Statement

ETH may be sent only when the taker asset is WETH; the amount must cover the
taking amount; any excess returns to the caller; and no ETH is accepted
otherwise.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Taker sends ETH; receiver is paid in ETH or WETH per the maker's flag |
| Assets | Native ETH and WETH |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | A fill entry point was called with non-zero value |
| Postconditions | Reverts `InvalidMsgValue` when the taker asset is not WETH, or when the value is below the taking amount. Excess is returned to `msg.sender`, failing with `ETHTransferFailed` if it cannot be. The receiver is paid in raw ETH when the maker set unwrap, otherwise in WETH |
| Invariants preserved | pending Phase 6 — the protocol retains no ETH after a fill |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a non-WETH taker asset and non-zero value, when filled, then it reverts `InvalidMsgValue`.
2. Given value below the taking amount, when filled, then it reverts `InvalidMsgValue`.
3. Given value above the taking amount, when filled, then the difference returns to the caller and the protocol's ETH balance is unchanged from before the call.
4. Given the maker set unwrap WETH, when filled with ETH, then the receiver gets raw ETH.
5. Given the maker did not set unwrap, when filled with ETH, then the value is wrapped and the receiver gets WETH.
6. Given a caller that rejects ETH and an excess payment, when filled, then it reverts `ETHTransferFailed` rather than keeping the excess.
7. Given any successful fill, when it completes, then the protocol holds no residual ETH.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests for each branch plus a balance-conservation invariant for criterion 7 |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | The refund and the receiver payment are raw calls to arbitrary addresses made after the maker's leg has settled, which is a reentrancy surface worth modelling explicitly in Phase 3 |
| Economic impact | Bounded per fill by the overpayment; unbounded if the reentrancy surface proves exploitable |
| Confidence | `HIGH` |
| Confidence rationale | Every branch is explicit in code; only the documentation was missing, and Gate A decided it |

### Notes

Criterion 7 is the invariant that matters. Criterion 6 pins the deliberate choice
to fail rather than silently retain the excess.

---

## `INT-001` — Interaction callbacks receive the order extension

| Field | Content |
|---|---|
| ID | `INT-001` |
| Criticality | `MEDIUM` |
| Criticality rationale | An integrator implementing the wrong signature has a non-matching selector, so every fill through their contract reverts; the failure is loud but total. |
| Source | `IPreInteraction.sol` 19-28, `IPostInteraction.sol` 19-28, `ITakerInteraction.sol` 24-33; `DIV-002` (`DOCUMENTATION_BUG`, `camoseed`, 2026-08-03) |
| Approval | pending |
| Status | `DRAFT` |

### Statement

All three interaction callbacks receive the order, the extension bytes, the
order hash, the taker, the making amount, the taking amount, the remaining
making amount and the interaction's own extra data, in that order.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Protocol calls; integrator implements |
| Assets | None passed; the callback may move its own |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | The relevant interaction flag is set, or a taker interaction is supplied |
| Postconditions | The callback is invoked with exactly these eight arguments |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a callback that records its arguments, when invoked, then all eight match the fill's actual values.
2. Given a callback implementing the seven-argument shape from the old documentation, when a fill is attempted, then it reverts because the selector does not match.
3. Given an order with an extension, when a callback runs, then the extension bytes it receives equal the extension supplied at fill time.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests with an argument-recording mock; criterion 2 with a deliberately wrong-signature mock |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A — `test/Interactions.js` |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Fails closed; a denial of integration rather than a fund risk |
| Economic impact | Wasted gas and unfillable orders |
| Confidence | `HIGH` |
| Confidence rationale | Three interface declarations and three matching call sites |

### Notes

Criterion 2 exists to make the documentation defect visible as a test rather than
only as a note, which is the point of `DIV-002`.

---

## `INT-002` — The taker interaction returns nothing

| Field | Content |
|---|---|
| ID | `INT-002` |
| Criticality | `LOW` |
| Criticality rationale | No code path consumes a return value, so nothing can be manipulated through it; the exposure is misunderstanding, not risk. |
| Source | `ITakerInteraction.sol` 24-33; `OrderMixin.sol` 380-382; `DIV-001` (`DOCUMENTATION_BUG`, `camoseed`, 2026-08-03) |
| Approval | pending |
| Status | `DRAFT` |

### Statement

The taker interaction returns no value and cannot influence the amounts of the
fill in which it runs.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Taker's contract |
| Assets | None |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | A taker interaction was supplied |
| Postconditions | Amounts computed before the callback are the amounts settled after it |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a taker interaction that returns a large value, when the fill completes, then the settled taking amount is the pre-computed one and the return value is ignored.
2. Given a taker interaction, when the fill completes, then the amounts in the `OrderFilled` event match those computed before the callback.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit test with a mock returning data despite the void interface |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | None identified |
| Economic impact | A maker who believed in rate improvement may have priced orders on a false premise |
| Confidence | `HIGH` |
| Confidence rationale | Verified by repository-wide search: the identifiers appear only in `description.md` |

### Notes

This requirement exists to close `DIV-001` with something executable, so that if
rate improvement is ever implemented, this test fails and forces the requirement
to be revisited rather than silently contradicted.

---

## `INT-003` — Amount getters are called with the full fill context

| Field | Content |
|---|---|
| ID | `INT-003` |
| Criticality | `MEDIUM` |
| Criticality rationale | A getter that mis-decodes its arguments returns a wrong price, and the price is the trade. |
| Source | `OrderLib.sol` 123-131, 157-165; `IAmountGetter.sol` 23-31, 44-52; `DIV-014` (`DOCUMENTATION_BUG`, `camoseed`, 2026-08-03) |
| Approval | pending |
| Status | `DRAFT` |

### Statement

A custom amount getter is addressed by the first twenty bytes of its extension
field and receives the order, the extension, the order hash, the taker, the
requested amount, the remaining making amount and its own extra data.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker configures; protocol calls; getter returns a price |
| Assets | Both, via the returned amount |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | The relevant amount-getter field is at least twenty bytes |
| Postconditions | The named contract is called with those seven arguments and its `uint256` result is used as the amount |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a getter that records its arguments, when a fill computes an amount, then all seven match.
2. Given an empty amount-getter field, when computing, then the linear calculation is used instead.
3. Given a field shorter than twenty bytes, when computing, then the linear calculation is used and no call is made.
4. Given a getter that reverts, when computing, then the fill reverts.
5. Given a getter returning an amount that breaches the taker's threshold, when filled, then the threshold check rejects it.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests with a recording getter mock; criterion 5 links to `MATH-003`/`MATH-004` |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | A hostile getter can quote any price; the taker's threshold is the only defence, which is why criterion 5 belongs here |
| Economic impact | Up to the taker's allowance, absent a threshold |
| Confidence | `HIGH` |
| Confidence rationale | Interface and call sites agree; only the documentation was wrong |

### Notes

Criterion 3 pins the boundary at exactly twenty bytes. The base-layer check in
`OrderLib` is `data.length == 0` while `AmountGetterBase` uses `>= 20`; those are
different conditions and a field of one to nineteen bytes takes different paths
depending on which layer sees it. Worth an explicit test.

---

## `INT-004` — A taker can skip the maker's permit

| Field | Content |
|---|---|
| ID | `INT-004` |
| Criticality | `MEDIUM` |
| Criticality rationale | Skipping a needed permit makes the fill fail; skipping an already-used one saves gas. Both outcomes are the taker's own problem, but the flag also gates the reentrancy guard. |
| Source | `TakerTraitsLib.sol` 24, 85-87; `OrderMixin.sol` 175; `DIV-003` (`DOCUMENTATION_BUG`, `camoseed`, 2026-08-03) |
| Approval | pending |
| Status | `DRAFT` |

### Statement

A taker may decline to execute the maker's permit, in which case the permit is
not attempted and the fill relies on an existing allowance.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Taker chooses |
| Assets | Maker asset allowance |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | The order carries a maker permit in its extension |
| Postconditions | With the flag set, no permit call is made and `SEC-002`'s reentrancy check is not reached; with it clear, the permit executes if at least twenty bytes long |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given the flag set and no pre-existing allowance, when filled, then the transfer fails rather than the permit being executed.
2. Given the flag set and a sufficient pre-existing allowance, when filled, then it succeeds without consuming the permit.
3. Given the flag clear and a valid permit, when filled, then the permit executes and the fill succeeds.
4. Given a permit shorter than twenty bytes with the flag clear, when filled, then no permit call is attempted.
5. Given an order already filled once, when filled again, then no permit executes regardless of the flag, because permits run only on the first fill.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests over the flag/allowance matrix |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | A taker following the old documentation may set bit 253 as padding and silently skip the permit; fails closed |
| Economic impact | Wasted gas |
| Confidence | `HIGH` |
| Confidence rationale | One flag, one branch |

### Notes

Criterion 5 follows from the whole permit block sitting inside the first-fill
branch. That is easy to miss and is exactly the kind of thing that should be a
scenario rather than a comment.

---

## `INT-005` — Predicate operand lists are zero-terminated and bounded to eight

| Field | Content |
|---|---|
| ID | `INT-005` |
| Criticality | `LOW` |
| Criticality rationale | A malformed offsets word produces a failed predicate or a revert, both of which block the fill rather than allowing a bad one. |
| Source | `PredicateHelper.sol` 11-35; `description.md` 459-461, 501-503; `DIV-015` (`DOCUMENTATION_BUG`, `camoseed`, 2026-08-03) |
| Approval | pending |
| Status | `DRAFT` |

### Statement

An `and` or `or` predicate takes up to eight operands, packed as sequential
32-bit end offsets, and the list ends at the first zero offset.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker constructs |
| Assets | None |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | An `and`/`or` predicate is being evaluated |
| Postconditions | Operands are evaluated in order until a zero offset; `and` fails at the first false, `or` succeeds at the first true |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given eight operands, when evaluated, then all eight can be reached.
2. Given a zero offset in the third position, when evaluated, then operands beyond it are ignored rather than causing an error.
3. Given `and` with a false first operand, when evaluated, then later operands are not called.
4. Given `or` with a true first operand, when evaluated, then later operands are not called.
5. Given a non-monotonic offsets word, when evaluated, then the result is a failed predicate or a revert, never a spuriously true one.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests plus a fuzz over malformed offsets words for criterion 5 |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Criterion 5 is the one with security content: a malformed word must never evaluate true |
| Economic impact | A spuriously true predicate would allow a fill the maker's condition forbade |
| Confidence | `HIGH` |
| Confidence rationale | Short explicit loop; the short-circuit behaviour is directly readable |

### Notes

Criteria 3 and 4 pin short-circuiting, which is observable through call counts
on a mock and is a real gas property makers depend on.

---

## `INT-006` — Non-ERC20 assets transfer through a selector-matching proxy

| Field | Content |
|---|---|
| ID | `INT-006` |
| Criticality | `LOW` |
| Criticality rationale | A misbuilt proxy fails its own constructor check or its transfer reverts; the protocol is not exposed beyond a failed fill. |
| Source | `description.md` 223-320; `OrderMixin.sol` 509-523; `ERC721Proxy.sol` |
| Approval | pending |
| Status | `DRAFT` |

### Statement

An asset whose transfer interface is not ERC-20 is traded by naming a proxy as
the asset and appending the extra transfer arguments as a suffix, and the proxy's
transfer function must share the ERC-20 `transferFrom` selector.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker configures; protocol calls the proxy; proxy owns the real transfer |
| Assets | ERC-721, ERC-1155 or other non-standard tokens |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | The asset field names the proxy and the extension carries the matching suffix |
| Postconditions | The protocol calls `transferFrom(from, to, amount)` with the suffix appended; success requires either empty return data or a single true word |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given an ERC-721 order through the proxy, when filled, then the token transfers and the amount argument is ignored by the proxy.
2. Given a proxy whose function selector does not match, when deployed, then the constructor reverts.
3. Given a transfer returning false, when filled, then the fill reverts with the appropriate transfer error.
4. Given a transfer returning no data, when filled, then it is treated as success.
5. Given a partial fill against an ERC-721 order, when attempted, then the amount argument still does not affect which token moves.

### Verification

| Field | Content |
|---|---|
| Verification method | Unit tests against the existing proxy contracts |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A — expected thin; no test file names the ERC721/1155 proxies |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | Criterion 5 is the real one: the documented reason the proxy ignores `amount` is to prevent an unintended NFT sale through a partial fill |
| Economic impact | One NFT |
| Confidence | `HIGH` |
| Confidence rationale | Documented at length with a worked example, and the constructor selector check is self-enforcing |

### Notes

The return-data handling in criteria 3 and 4 comes from the assembly at
`OrderMixin.sol` 521, which accepts empty returndata or exactly one word equal to
1. That is the standard non-compliant-token accommodation and should be tested
directly.

---

## `INT-007` — The two amount-getter directions must agree

| Field | Content |
|---|---|
| ID | `INT-007` |
| Criticality | `LOW` |
| Criticality rationale | Disagreement is exploitable only within the spread the getter itself creates, and the taker's threshold bounds the damage. |
| Source | `description.md` 352; `OrderLib.sol` 111-166 |
| Approval | pending |
| Status | `DRAFT` |

### Statement

A maker's pair of amount getters must price consistently in both directions,
because the taker chooses which direction is used.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker supplies both getters; taker picks the direction |
| Assets | Both |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | The order supplies both a making- and a taking-amount getter |
| Postconditions | Round-tripping an amount through both getters returns the original within rounding error |
| Invariants preserved | pending Phase 6 — round-trip consistency |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a making amount, when converted to a taking amount and back, then the result is within one unit of the original.
2. Given the shipped Dutch auction getters at a fixed timestamp, when round-tripped, then criterion 1 holds.
3. Given the shipped range getters at a fixed fill level, when round-tripped, then criterion 1 holds.
4. Given deliberately inconsistent getters, when filled in the favourable direction, then the taker's threshold is what limits the loss.

### Verification

| Field | Content |
|---|---|
| Verification method | Property test round-tripping across the input space for each shipped getter pair |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 8 |

### Risk

| Field | Content |
|---|---|
| Security impact | An inconsistent pair lets the taker always choose the cheaper direction, extracting the difference from the maker on every fill |
| Economic impact | The spread, per fill, accumulating |
| Confidence | `HIGH` |
| Confidence rationale | The requirement on integrators is stated explicitly in the documentation; the protocol does not and cannot enforce it |

### Notes

This is an unenforceable assumption: the protocol calls whichever getter the
taker's direction selects and has no way to check the other. It belongs in
Phase 3's list of assumptions the code cannot enforce, and criterion 4 is the
honest statement of what actually bounds the damage.
