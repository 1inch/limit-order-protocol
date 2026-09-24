# 10 — Test implementation report

Phases 8 and 9. Gate B approved in full on 2026-08-03.

## Headline

**The property tests found a real arithmetic defect in `RangeAmountCalculator`
that rounds in the taker's favour, against the protocol's stated rounding
policy.** It is the most consequential result of the whole workflow and is set
out in §Findings below. Everything else here is coverage work.

The suite went from 173 passing to **242 passing, 0 failing, 5 pending**. The 5
pending are unchanged: they are the `describe.skip` example suite, which
proposal `P-04` would have re-enabled and which was held pending `OQ-5`.

| Metric | Before | After |
|---|---|---|
| Passing tests | 173 | **248** |
| Failing | 0 | 0 |
| Pending | 5 | 5 |
| Statements | 91.88% | **93.97%** |
| Branches | 75.44% | **79.82%** |
| Functions | 93.67% | **96.20%** |
| Lines | 92.56% | **94.37%** |
| `OrderMixin.sol` statements / branches / lines | 98.21% / 93.65% / 98.63% | **100% / 96.03% / 100%** |
| `yarn lint` | **failing** on master | **passing** |
| `PredicateHelper.sol` statements | 82.61% | **100%** |
| `FeeTaker.sol` branches | 57.14% | **78.57%** |
| `NativeOrderFactory.sol` statements | 69.23% | **84.62%** |

No production contract was changed: `git diff origin/master...HEAD -- contracts/`
is empty.

## Findings

### `REG-001`, `REG-002`, `REG-003` — the range calculator's inverse rounds toward the taker

One root cause, three observable regimes. All found by the `INV-014` round-trip
property on its first three runs, each shrunk by fast-check to a minimal
counterexample.

`getRangeMakerAmount` computes the price curve's slope as

```solidity
uint256 k = (priceEnd - priceStart) * 1e18 / orderMakingAmount;
```

and then divides by `k`. The floor destroys precision when the price spread is
small relative to the order size.

| ID | Regime | Behaviour | Seed |
|---|---|---|---|
| `REG-001` | `k == 0` | Reverts with raw panic `0x12` (division by zero), not a named error | `-1924954020` |
| `REG-002` | `k == 1` | Returns a making amount **more than 19 orders of magnitude** too large: 2.07e37 against an input fill of 5e17 | `-771726958` |
| `REG-003` | `k` finite | Systematically overshoots in the taker's favour, by roughly `priceStart * fill / k²` | `-1830898547` |

Measured relative overshoot at `priceStart = 100e18`, `orderMakingAmount = 1e18 + 1`,
fill = half the order:

| spread (wei) | k | relative overshoot |
|---|---|---|
| 1e0 | 0 | reverts |
| 1e3 | ~1e3 | 1e+14 |
| 1e6 | ~1e6 | 1e+8 |
| 1e9 | ~1e9 | 1e+2 |
| 1e12 | ~1e12 | 1e-4 |
| 1e15 | ~1e15 | 1e-10 |
| 1e18 | ~1e18 | 0 (exact) |

**Why it matters.** `getRangeMakerAmount` is what the core calls when the taker
fills by *taking* amount. If the returned making amount does not exceed the
remaining amount, `OrderMixin` does **not** clamp it and does **not** recompute
the price — the clamp and recomputation at `OrderMixin.sol:317-322` only trigger
when the value overflows past the remainder. The taker then pays their chosen
taking amount and receives the overshooting making amount. The taker's own
threshold (`MATH-004`) is a *minimum* on what they receive, so it does not
protect the maker either.

The loss therefore falls on the maker, and it contradicts the protocol's own
rounding policy: `MATH-001` floors and `MATH-002` ceils, both toward the maker,
and `INV-007` states that rounding never favours the taker. This function is the
exception.

**Bounded by configuration, not by code.** For a realistic range order — a 3000
to 4000 price range on a 10-token order — `k` is about 1e20 and the error is
exactly zero. The defect bites only when the spread is narrow relative to the
order size. Nothing in the contract prevents a maker configuring that, and
nothing warns them.

**Severity assessment.** Not a direct exploit: an attacker cannot choose the
order's parameters, only fill an order a maker configured badly. Assessed
MEDIUM — economic loss to the maker, reachable through a legitimate-looking
configuration, with no diagnostic. Carried to Phase 11 for a severity ruling.
The contract was not changed.

**`INV-007` and `INV-014` are recorded as VIOLATED for `MATH-006`** in the
traceability matrix, not as satisfied. The committed property test asserts a
measured envelope rather than the ideal invariant, and says so in its own
comments; the ideal statement is written out there as false.

### A note on how the envelope was arrived at

Worth recording because it was itself informative. Three successive envelopes
were defeated by fast-check, each time by the shrinker scaling `priceStart` to
sit one wei outside whatever constant had been chosen. That is what identified
the missing `priceStart` factor in the error model — the inverse's `bDivK` term
is proportional to the price level, so the precision loss is too. The final
envelope carries the factor and 16x slack, and exists to detect the error
getting materially worse rather than to bless it.

## Phase 8 — specification tests

New files, in the repository's existing top-level layout and naming, JavaScript,
CommonJS, `loadFixture` isolation.

| File | Tests | Closes | Requirements |
|---|---|---|---|
| `test/OrderIdentity.js` | 8 | `GAP-001`, `GAP-002` | `FR-ORDER-001`, `FR-ORDER-003`, `INV-015` |
| `test/Simulation.js` | 9 | `GAP-012` | `SEC-001`, `INV-008` |
| `test/Ownership.js` | 6 | `GAP-023`, `GAP-024` | `ACC-003`, `ACC-005` |
| `test/PredicatesAndBoundaries.js` | 14 | `GAP-005`, `GAP-007`, `GAP-014` | `SEC-003`, `TIME-001`, `FR-CANCEL-003`, `INV-004` |

### Both `CRITICAL` gaps are closed

The completion contract turns on these. Phase 6A left two of eleven `CRITICAL`
requirements short of executable verification; both now have it.

- **`FR-ORDER-001` / `GAP-001`.** Order identity is now verified against an
  independent EIP-712 encoding, shown to differ across chain IDs and across two
  real deployments on the same chain, and shown to reject a signature made for a
  different deployment. `INV-015` is covered by a loop asserting that each of
  the eight fields independently changes the hash.
- **`SEC-001` / `GAP-012`.** Simulation is shown not to persist an epoch
  advance, a cancellation, a mass invalidation, a pause or an ownership
  transfer, and the protocol's low storage range is asserted byte-identical
  after four state-writing simulation attempts.

### A latent inconsistency confirmed by a failing assertion

Writing the `SEC-001` cancellation test surfaced the
`RemainingInvalidatorLib` overload disagreement recorded in
`02-compliance-report.md` §8. `remainingInvalidatorForOrder` **reverts**
`RemainingInvalidatedOrder` for a never-touched order, because its
single-argument `remaining()` treats stored zero as invalidated, while
`isNewOrder()` treats the same value as new. The test now uses
`rawRemainingInvalidatorForOrder`, which returns 0 without reverting, and says
why in a comment. The core only uses the two-argument form, so this stays latent
rather than live — but it is now demonstrated rather than merely noted.

### Approved proposals applied

All four applied one at a time, each verified green before the next. Every change
is additive: no assertion, tolerance or fuzz constraint was relaxed, and no test
was renamed, skipped or deleted.

| Proposal | File | Change |
|---|---|---|
| `P-01` | `test/Permit2Proxy.js` | Added balance assertions for both legs plus a second-fill rejection. Previously zero assertions |
| `P-02` | `test/WitnessProxyExample.js` | Added balance assertions for both legs plus permit-nonce consumption. Previously zero assertions |
| `P-03` | `test/ApprovalPreInteractionExample.js` | Added an allowance precondition and balance assertions for both legs. Previously zero assertions |
| `P-05` | `test/SafeOrderBuilder.js` | Added fill-outcome balance assertions across all six generated price cases |

`P-04` (re-enabling the disabled example suite) and `P-06` (gas assertions) were
**not** applied, per the Gate B decision to hold them pending `OQ-5`.

**A correction to `P-05`'s own premise.** The proposal claimed the
oracle-derived amounts were unchecked. They were not: the existing
`OrderRegistered` assertion carries the recomputed taking amount in its
`orderTuple` argument. What was genuinely unasserted was the fill itself, which
previously ended the test with no check on the outcome. The applied change and
its code comment reflect the corrected premise.

## Phase 9 — property tests

`fast-check@3.23.2` was added as a devDependency under the Gate B decision on
`OQ-6`. The churn is confined: `yarn.lock` gained 12 lines with no removals and
no version changes, and the only transitive addition is `pure-rand@6.1.0`.
`yarn add` also re-sorted `@nomicfoundation/hardhat-ethers` into alphabetical
order in `package.json` — a cosmetic side effect, no version altered.

| File | Tests | Invariants |
|---|---|---|
| `test/property/AmountCalculators.property.js` | 12 | `INV-007`, `INV-014` |

Chosen because both range functions and both Dutch functions are `pure` or
`view` with explicit arguments: no chain state, no time control, no per-case
fixture, so 200 runs complete in under a second.

| Property | Result |
|---|---|
| Range: prices every fill between the start and end price | holds |
| Range: non-decreasing in the amount filled | holds |
| Range: charges more for the same fill once partly filled | holds |
| Range: inverse round-trip within the measured envelope | holds; **ideal invariant violated**, see Findings |
| Dutch: clamps to endpoint amounts outside the window | holds |
| Dutch: descending auction non-increasing through its window | holds |
| Dutch: taking amount never rounds in the taker's favour | holds |

The Dutch auction calculator is clean on every property tried, including the
`INV-007` rounding direction that the range calculator violates.

## What was not done

Recorded plainly rather than left to inference.

| Item | Status |
|---|---|
| `test/invariant/` stateful harness | **Not written.** `INV-001`, `INV-002`, `INV-003`, `INV-005`, `INV-006`, `INV-010`, `INV-011`, `INV-016` still have no multi-transaction harness. The deterministic invariants `INV-008`, `INV-009` and `INV-012` are covered by the Phase 8 tests above |
| `GAP-013` (`SEC-002`, `ReentrancyDetected`) | **Closed 2026-08-03**, after `OQ-8` authorised adding a mock. `contracts/mocks/ReentrantPermitMock.sol` + 3 tests in `test/Reentrancy.js` |
| `GAP-016` (`INT-002`, returning taker interaction) | **Closed 2026-08-03**, same authorisation. `contracts/mocks/ReturningTakerInteractionMock.sol` + 3 tests in `test/Reentrancy.js` |
| `GAP-019` (`INT-006`, `ERC1155Proxy`, `ERC721ProxySafe`) | **Not closed.** Both remain at 0% coverage — the only production contracts still entirely untested |
| `GAP-003`, `GAP-004`, `GAP-006`, `GAP-008`, `GAP-015`, `GAP-017`, `GAP-018`, `GAP-020`, `GAP-022`, `GAP-025`, `GAP-026` | **Not closed.** Priority 3 in the Phase 6 plan |
| Fork tests | **None, as planned.** No RPC variable is set (`OQ-2`), CI supplies no credentials, and a fork test without a pinned block must not be added |

Coverage targets from `07-test-strategy.md`: statements 93.97% against a ≥95%
target, branches 79.53% against ≥90%. Both improved substantially and neither
is met. The remaining distance is concentrated in the items above.

## Hard rules observed

- No production contract changed.
- No existing test weakened, renamed, skipped or deleted. The four modified
  files received additive assertions only, under recorded approval.
- The 5 pending tests are still pending; `P-04` was not applied.
- Characterization tests are in `test/characterization/`, specification tests in
  the existing top-level layout, property tests in `test/property/` — three
  separate directories, no file mixing the kinds.
- Every failing seed and counterexample is preserved in the committed test
  comments with its reproduction.
- No failing test was normalised away. The one genuine invariant violation is
  reported as VIOLATED and carried to Phase 11.
- One dependency added, with recorded approval and verified confined churn.
