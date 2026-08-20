# 07 — Invariant catalogue and test strategy

Phase 6, with the `property-based-testing` specialist and the Hardhat 2 policy.

## Framework allocation

Single framework: **Hardhat 2 + Mocha + Chai, JavaScript, CommonJS**. Not a
hybrid repository, so every invariant has exactly one authoritative harness by
construction and no ownership question arises.

Preserved without exception: Hardhat 2.23.0, ethers 6.13.4, yarn, solc 0.8.30
with `viaIR` and 1,000,000 optimizer runs, `loadFixture` isolation, existing
directory and naming conventions. No dependency is added, updated or removed.

### The one thing that needs a decision

**No property-based or fuzzing tool is installed.** Verified against
`package.json`: no `fast-check`, no Foundry, no Echidna, no Medusa. The Hardhat 2
policy is explicit that adding one requires approval, and the orchestrator forbids
adopting Foundry as a sidecar without it.

Three options, carried to Gate B:

| Option | What it means | Cost |
|---|---|---|
| **A. Hand-rolled randomized loops** | Mocha tests that iterate seeded pseudo-random inputs using only installed packages. No new dependency | No shrinking, no corpus persistence, manual seed management. Weakest of the three, but changes nothing about the stack |
| **B. Add `fast-check`** | A real JS property runner with shrinking and seed replay, as a devDependency | One new devDependency. Integrates with Mocha. Cannot reach Solidity-level invariants directly |
| **C. Add a Foundry sidecar** | `forge` invariant tests alongside the Hardhat suite | Strongest for stateful contract invariants — handlers, ghost variables, persisted failures — but makes the repository hybrid, which is a large structural change |

Recommendation is **B**, with a specific caveat: it strengthens the pure-function
properties (`INV-007`, `INV-013`, `INV-014`) substantially, but stateful
multi-transaction invariants (`INV-002`, `INV-003`, `INV-004`) are what Foundry
is genuinely better at. If only one is chosen, several invariants below stay at
deterministic-example strength, and that is recorded per invariant rather than
hidden.

Until a decision is recorded, **Phase 9 cannot start**. Phases 7 and 8 are
unaffected and need nothing new.

## Invariant catalogue

Sixteen properties. Each names its expression, scope, assumptions, exceptions,
observables, actions, adversarial sequence, deterministic example, harness
location, and replay strategy.

---

### `INV-001` — The protocol never retains value

| Field | Content |
|---|---|
| Expression | For every token T and for ETH: `balanceOf(protocol)` after any transaction equals the value before it |
| Scope | `LimitOrderProtocol`, all entry points |
| Assumptions | Tokens are not rebasing (`A2`); no one donates directly mid-transaction |
| Exceptions | None. This is unconditional |
| Observables | Protocol balance of maker asset, taker asset, WETH, and native ETH |
| Actions | All four fill variants, ETH fills with overpayment, unwrap in both directions |
| Adversarial sequence | Overpay in ETH from a contract that rejects the refund; fill with unwrap where the receiver rejects ETH; reenter via a callback and check the balance mid-flight |
| Deterministic example | `SCN-039` |
| Harness | `test/invariant/` (new directory) |
| Replay | Seed printed on failure; failing sequences committed as regression tests |
| Protects | `SEC-005`, `FR-FILL-001` |

This is the sharpest invariant available given the protocol holds no custody, and
it is stronger than the usual DeFi solvency check.

---

### `INV-002` — Remaining amount never increases

| Field | Content |
|---|---|
| Expression | For any order O, `remaining(O)` after any transaction ≤ `remaining(O)` before |
| Scope | `_remainingInvalidator` |
| Assumptions | None |
| Exceptions | None |
| Observables | `remainingInvalidatorForOrder(maker, hash)` |
| Actions | Partial fill, full fill, cancel, mass-invalidate, reentrant fill |
| Adversarial sequence | Reenter from pre-interaction, taker interaction and post-interaction, each attempting a second fill of the same order |
| Deterministic example | `SCN-026` |
| Harness | `test/invariant/` |
| Replay | Action-sequence log on failure |
| Protects | `STATE-002`, `ACC-001` |

Stateful and multi-transaction. Under option A this is the weakest of the set;
under C it is the strongest argument for a Foundry sidecar.

---

### `INV-003` — Fills never exceed the signed amount

| Field | Content |
|---|---|
| Expression | For any order O, the sum of `makingAmount` across all successful fills ≤ `O.makingAmount` |
| Scope | Both invalidators |
| Assumptions | `A2` |
| Exceptions | None |
| Observables | Sum of `OrderFilled` deltas; maker's cumulative balance change |
| Actions | Arbitrary sequences of partial fills in both directions |
| Adversarial sequence | Alternate making-direction and taking-direction fills to exploit rounding; interleave with reentrancy |
| Deterministic example | `SCN-026`, `SCN-027` |
| Harness | `test/invariant/` |
| Replay | Full action sequence |
| Protects | `STATE-002`, `FR-FILL-001` |

The single most valuable invariant in the catalogue: violating it is direct theft
from the maker.

---

### `INV-004` — Invalidator bits are monotonic

| Field | Content |
|---|---|
| Expression | For any maker and slot, `newSlotValue & oldSlotValue == oldSlotValue` |
| Scope | `_bitInvalidator` |
| Assumptions | None |
| Exceptions | None |
| Observables | `bitInvalidatorForOrder(maker, slot)` |
| Actions | Fill, cancel, `bitsInvalidateForOrder` with arbitrary masks |
| Adversarial sequence | Mass-invalidate with mask `type(uint256).max`, then attempt any operation that might clear a bit |
| Deterministic example | `SCN-028` |
| Harness | `test/invariant/` |
| Replay | Seed |
| Protects | `STATE-003`, `FR-CANCEL-003` |

---

### `INV-005` — An order lives in exactly one invalidator

| Field | Content |
|---|---|
| Expression | For any order O, its traits select one invalidator, and the other's state for O is never written |
| Scope | Both mappings |
| Assumptions | Traits are covered by the signature and therefore immutable |
| Exceptions | None |
| Observables | Both invalidator views before and after |
| Actions | Fill and cancel across all four trait combinations |
| Adversarial sequence | Cancel with mismatched traits, then fill (the `A9` hazard) |
| Deterministic example | Requires a new scenario; noted as a gap |
| Harness | `test/invariant/` |
| Replay | Seed |
| Protects | `STATE-001` |

---

### `INV-006` — Epochs only advance

| Field | Content |
|---|---|
| Expression | For any maker and series, `epoch` after ≥ `epoch` before |
| Scope | `SeriesEpochManager` |
| Assumptions | No `uint256` wrap, which needs ~2^248 calls |
| Exceptions | Theoretical wrap in the `unchecked` block |
| Observables | `epoch(maker, series)` |
| Actions | `increaseEpoch`, `advanceEpoch` with 0-256 |
| Adversarial sequence | Advance by 255 repeatedly; attempt 0 and 256 |
| Deterministic example | `SCN-034` |
| Harness | `test/invariant/` |
| Replay | Seed |
| Protects | `TIME-002`, `STATE-004` |

---

### `INV-007` — Rounding never favours the taker

| Field | Content |
|---|---|
| Expression | `getMakingAmount(t) * orderTaking ≤ t * orderMaking` and `getTakingAmount(m) * orderMaking ≥ m * orderTaking` |
| Scope | `AmountCalculatorLib`, and the fee overlay |
| Assumptions | Non-zero denominators |
| Exceptions | Custom getters, which are not bound by this |
| Observables | Return values only; pure |
| Actions | Both functions across the input space |
| Adversarial sequence | Operands near 2^128 to cross the `unchecked` boundary; coprime ratios to maximise remainder |
| Deterministic example | `SCN-011`, `SCN-012` |
| Harness | `test/property/` (new directory), pure — no chain state needed |
| Replay | Counterexample printed and committed |
| Protects | `MATH-001`, `MATH-002`, `ECON-002` |

The best candidate for property testing in the whole codebase: pure, total,
cheap, with a clearly stated algebraic property.

---

### `INV-008` — Simulation never persists state

| Field | Content |
|---|---|
| Expression | For any target and calldata, protocol storage after a `simulate` call equals storage before |
| Scope | `EP-010` |
| Assumptions | None |
| Exceptions | None. Unconditional |
| Observables | Both invalidator mappings, paused flag, owner, and raw storage slots |
| Actions | `simulate` against targets that write storage, self-destruct, emit, consume gas, and revert |
| Adversarial sequence | Target crafted to write the invalidator slot for a specific order, then attempt to fill that order twice |
| Deterministic example | Needs a new scenario; `GAP-012` |
| Harness | `test/invariant/`, plus a permanent unit test |
| Replay | N/A — deterministic |
| Protects | `SEC-001` |

Belongs in the suite permanently. Its value is catching a future refactor that
introduces a return path.

---

### `INV-009` — Makers can always exit

| Field | Content |
|---|---|
| Expression | For any protocol state including paused, a maker's cancel and epoch-advance calls succeed |
| Scope | `EP-005`-`EP-009` versus `SM-011` |
| Assumptions | Caller has gas |
| Exceptions | None |
| Observables | Call success; resulting invalidator state |
| Actions | Pause, then every maker-side operation |
| Adversarial sequence | Pause, cancel, unpause, attempt to fill the cancelled order |
| Deterministic example | `SCN-041` |
| Harness | `test/invariant/` |
| Replay | N/A |
| Protects | `OPS-001`, `FR-CANCEL-001` |

The invariant that distinguishes a safety control from a hostage mechanism.

---

### `INV-010` — Fee payouts conserve the taking amount

| Field | Content |
|---|---|
| Expression | `integratorFeeAmount + protocolFeeAmount + receiverAmount == takingAmount`, exactly |
| Scope | `FeeTaker._postInteraction` |
| Assumptions | `FeeTaker` holds exactly the taking amount when it runs |
| Exceptions | None |
| Observables | Balances of all three recipients before and after |
| Actions | Fills across the fee-parameter space, both ERC-20 and ETH paths |
| Adversarial sequence | Fee rates at their maximum, integrator share at 0 and 100, taking amounts of 1 and `type(uint128).max`, to probe the `unchecked` subtraction |
| Deterministic example | `ECON-001` criterion 2 |
| Harness | `test/invariant/` |
| Replay | Parameter tuple printed |
| Protects | `ECON-001` |

Checkable without knowing the intended fee model, which is exactly why it is
worth having while `OQ-3` is open.

---

### `INV-011` — A fill conserves value across the pair

| Field | Content |
|---|---|
| Expression | Maker's maker-asset delta = `-makingAmount`; target's = `+makingAmount`; taker's taker-asset delta = `-takingAmount`; receiver's = `+takingAmount` less fees |
| Scope | `_fill` |
| Assumptions | `A2` — no fee-on-transfer or rebasing |
| Exceptions | Fee-bearing orders, where the receiver leg splits per `INV-010` |
| Observables | Four balances |
| Actions | All fill variants |
| Adversarial sequence | Fill with a fee-on-transfer token and record what actually happens — expected to violate this invariant, which is the point |
| Deterministic example | `SCN-020` |
| Harness | `test/invariant/` |
| Replay | Seed |
| Protects | `FR-FILL-001` |

The fee-on-transfer case is deliberately included. `A2` says the protocol assumes
such tokens are not used; this invariant demonstrates the consequence rather than
asserting the assumption holds.

---

### `INV-012` — Predicates cannot mutate

| Field | Content |
|---|---|
| Expression | Storage of every contract is unchanged by predicate evaluation |
| Scope | `PredicateHelper` |
| Assumptions | None; enforced by the EVM's static context |
| Exceptions | None |
| Observables | Target contract storage |
| Actions | Predicates targeting writing contracts, at every nesting depth |
| Adversarial sequence | `and`/`or` nesting a writing target three levels deep |
| Deterministic example | `SCN-037` |
| Harness | `test/property/` |
| Replay | N/A |
| Protects | `SEC-003` |

---

### `INV-013` — Extension encoding round-trips

| Field | Content |
|---|---|
| Expression | For a well-formed extension, each accessor returns exactly the bytes placed in that field |
| Scope | `ExtensionLib`, `OffsetsLib` |
| Assumptions | Offsets are monotonic and within bounds |
| Exceptions | Malformed offsets, which must fail rather than return wrong bytes |
| Observables | Returned slices |
| Actions | Build extensions with all 9 field combinations, empty and non-empty |
| Adversarial sequence | Non-monotonic offsets, `begin > end`, offsets at `type(uint32).max`, and the index-8 `customData` path |
| Deterministic example | `SCN-002`-`SCN-004` |
| Harness | `test/property/`, using the existing `ExtensionMock` |
| Replay | Extension bytes printed |
| Protects | `FR-ORDER-002`, `INT-005` |

A classic encode/decode round-trip, rated HIGH priority by the specialist's own
table.

---

### `INV-014` — Amount getters round-trip

| Field | Content |
|---|---|
| Expression | `getMakingAmount(getTakingAmount(m)) ≈ m` within one unit |
| Scope | Dutch auction and range getters |
| Assumptions | Fixed timestamp and fill level within one evaluation |
| Exceptions | Custom third-party getters |
| Observables | Return values |
| Actions | Round-trip across the amount space at several auction times and fill levels |
| Adversarial sequence | Extreme price ranges; fill levels at 0, 1 wei, and the full amount; the range calculator's square-root path near its underflow boundary |
| Deterministic example | `MATH-006` criterion 4 |
| Harness | `test/property/` |
| Replay | Input tuple |
| Protects | `MATH-005`, `MATH-006`, `INT-007` |

Most likely of any property here to find a real defect, because the range
calculator's inverse involves an integer square root and unguarded subtractions.

---

### `INV-015` — Order hashing is injective on its inputs

| Field | Content |
|---|---|
| Expression | Two orders differing in any field, or hashed under a different domain, produce different hashes |
| Scope | `OrderLib.hash` |
| Assumptions | keccak256 collision resistance |
| Exceptions | None |
| Observables | Hash output |
| Actions | Vary each of the 8 fields independently; vary chain ID and contract address |
| Adversarial sequence | Field values that might alias under the raw 256-byte calldata copy |
| Deterministic example | `SCN-001` |
| Harness | `test/property/` |
| Replay | Field tuple |
| Protects | `FR-ORDER-001` |

---

### `INV-016` — A non-zero threshold is always honoured

| Field | Content |
|---|---|
| Expression | When threshold > 0, every successful fill satisfies the taker's stated bound |
| Scope | `_fill` |
| Assumptions | None |
| Exceptions | Threshold of zero disables the check entirely |
| Observables | Settled amounts versus the threshold |
| Actions | Fills in both directions with a hostile amount getter |
| Adversarial sequence | A getter returning `type(uint256).max`, then 0, then a value one unit past the bound; partial fills where the cross-multiplied form differs from the equality shortcut |
| Deterministic example | `SCN-013`, `SCN-014` |
| Harness | `test/invariant/` |
| Replay | Seed |
| Protects | `MATH-003`, `MATH-004`, `INT-003` |

The taker's only defence against a maker-chosen getter, so it should be tested
adversarially rather than only at its boundary.

---

## Test plan, driven by the Phase 6A gap matrix

Phase 6A produced 26 gaps: 22 `PARTIAL`, 7 `UNCOVERED`, 1 `WEAK_ASSERTION`, 4
`CHARACTERIZATION_ONLY`.

### Phase 7 — characterization

Pins current behaviour where no independent statement of intent exists. Goes in
`test/characterization/<Contract>.characterization.js`, separate files and a
separate directory from specification tests, per the placement rules.

| Target | Why characterization rather than specification | Cites |
|---|---|---|
| `FeeTaker` fee split and payouts | `ECON-001`, `ECON-002` are reverse-engineered | `DIV-010` |
| Whitelist and access-token gating | `ECON-003` | `DIV-010` |
| Whitelist discount arithmetic | `ECON-004` | `DIV-010` |
| Pause behaviour and its asymmetry | Behaviour is certain, intent was reverse-engineered | `DIV-004` |
| `simulate` revert payload shape | Undocumented | `DIV-005` |

### Phase 8 — specification tests

New tests for `UNCOVERED` and `PARTIAL` rows, in the repository's existing layout
and naming, JavaScript, `loadFixture`, asserting state, assets, events and
specific custom errors.

Priority 1, the two `CRITICAL` requirements not fully covered:

| Gap | Test |
|---|---|
| `GAP-001` | Cross-chain and cross-deployment hash divergence (`FR-ORDER-001`, `SCN-001`) |
| `GAP-012` | A storage-writing simulation target, asserting the slot is unchanged (`SEC-001`, `INV-008`) |

Priority 2, uncovered requirements:

| Gap | Test |
|---|---|
| `GAP-002` | Zero receiver pays the maker (`SCN-005`) |
| `GAP-013` | Reentrant maker permit reverts `ReentrancyDetected` (`SEC-002`) |
| `GAP-016` | Returning taker interaction is ignored (`SCN-022`) |
| `GAP-020` | Getter round-trip consistency (`INV-014`) |
| `GAP-010`, `GAP-023` | `rescueFunds` on both contracts, authorised and unauthorised |
| `GAP-024` | Ownership transfer on all three `Ownable` contracts |

Priority 3, partial coverage and the five unasserted custom errors:

`GAP-003` callback ordering, `GAP-005` `bitsInvalidateForOrder` success path,
`GAP-007` the exact expiry boundary second, `GAP-008` oracle staleness at all
three boundaries, `GAP-009` unauthorised callers on the three protocol-only
callbacks, `GAP-011` cancellation while paused, `GAP-014` the `not` and `eq`
predicates plus a writing predicate target, `GAP-015` callback argument values,
`GAP-017` external getter delegation, `GAP-018` malformed predicate offsets,
`GAP-019` `ERC1155Proxy` and `ERC721ProxySafe`, `GAP-021` the
`OnlyWhitelistOrAccessToken` revert, `GAP-022` `SeriesNonceManager`.

Plus the errors no scenario asserts: `TakingAmountExceeded`,
`OrderIsNotSuitableForMassInvalidation`, `ReentrancyDetected`,
`InvalidPermit2Transfer`, `SimulationResults`.

Approved Phase 6A proposals (`P-01` through `P-06`) are applied here, one at a
time, and only those Gate B approves.

### Phase 9 — property and invariant tests

Blocked on the tooling decision above. New directories `test/property/` for pure
properties and `test/invariant/` for stateful ones, consistent with the
placement rules for a Hardhat 2 repository.

### Fork tests

**None are planned, and none can run here.** No fork test exists today; no RPC
environment variable is set, so `Networks.registerAll()` registers nothing
(`OQ-2`); and CI supplies no credentials. Any fork test added would have to pin
chain ID and an exact block number, and would be skipped and reported as skipped
rather than falling back to chain head.

Given the protocol's only external dependencies are tokens, WETH and Chainlink —
all of which are already covered by mocks — fork testing would add most value for
`TIME-003` against a real feed's heartbeat. That is a recommendation, not a plan.

## Coverage ambition

| Metric | Baseline | Target after Phase 9 |
|---|---|---|
| Statements | 91.88% | ≥ 95% |
| Branches | **75.44%** | ≥ 90% |
| `ERC1155Proxy`, `ERC721ProxySafe` | 0% | > 0% |
| Assertion-free test files | 3 | 0 |
| Requirements `COVERED` | 23 of 46 | ≥ 42 of 46 |
| `CRITICAL` requirements covered | 9 of 11 | 11 of 11 |

Branch coverage is the metric to watch. It is the one that most directly reflects
the untested-alternative-path problem this audit found.
