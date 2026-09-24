# 11 — Security-readiness review

Phase 11, with the `secure-workflow-guide` specialist. Gate C approved
2026-08-03.

**This is not a substitute for an independent audit.** It is a non-destructive
readiness gate: it assesses whether the documentation, requirements and tests
built in Phases 0-9 are complete and coherent enough that an audit would be
productive, and it flags what an auditor should look at first. No code was
changed by this phase.

Baseline `837c8f82`, production contracts unmodified.

## Scope limitation, stated first

**Step 1 of the Trail of Bits workflow — automated static analysis — was not
performed.** Slither is not installed and the decision was to proceed manually
rather than install it (`OQ-9` below). Everything here is manual review over
the Phase 1-9 artifacts.

This is a real gap in coverage, not a formality. Slither's 70+ detectors cover
classes of defect that manual review reliably misses, and the two findings this
workflow did produce were both found by tooling (property testing and the
linter), not by reading. **A Slither pass should be treated as required before
any audit engagement.**

## Readiness verdict

**Ready, with two conditions.**

The protocol is in good shape for an audit. The core is well specified and well
tested: 248 tests pass, `OrderMixin.sol` and `OrderLib.sol` are at 100%
statement coverage, all 11 `CRITICAL` requirements have executable
verification, and the trust model has no privileged actor that can move user
funds.

The two conditions:

1. Run Slither and triage its output. This review cannot substitute for it.
2. Resolve `SEC-F-001`, the range-calculator rounding defect. It is the one
   confirmed correctness bug found and it favours the taker over the maker.

## Findings

Severity is this review's assessment, not an auditor's ruling.

### `SEC-F-001` — `RangeAmountCalculator` inverse rounds in the taker's favour — MEDIUM

**Confirmed defect.** `getRangeMakerAmount` computes the curve slope as
`k = (priceEnd - priceStart) * 1e18 / orderMakingAmount` and divides by it. The
floor destroys precision when the spread is narrow relative to the order size,
and the resulting error returns *more* maker asset than the corresponding cost
justifies.

Three regimes, all reproducible: `k == 0` reverts with a raw panic `0x12`
(`REG-001`); `k == 1` overshoots by 19 orders of magnitude (`REG-002`); finite
`k` overshoots by roughly `priceStart * fill / k²` (`REG-003`).

Contradicts `INV-007`, and the policy `MATH-001` and `MATH-002` establish: every
other rounding in the protocol favours the maker.

The core does not contain it. `OrderMixin.sol:317-322` clamps and re-prices only
when the returned making amount *exceeds* the remainder; below that threshold
the value is used as-is. The taker's threshold (`MATH-004`) is a minimum on what
they receive and does not protect the maker.

Exactly zero for realistic configurations — a 3000-4000 range on a 10-token
order gives `k ≈ 1e20`. Unbounded as the spread narrows, with no guard and no
diagnostic.

**Required regression:** `REG-001`, `REG-002`, `REG-003` in
`test/property/AmountCalculators.property.js`, already committed and passing
against current behaviour. If the contract is fixed, `REG-003` must be inverted
to assert the invariant rather than the violation.

**Not exploitable by an attacker directly** — they cannot choose the order's
parameters, only fill an order a maker configured badly. See `OQ-7`.

### `SEC-F-002` — `deploy-Permit2Proxy.js` would have thrown at runtime — HIGH operational, now fixed

`module.exports = async ({ deployments })` omitted `getNamedAccounts`, which
line 24 then called. Every other deploy script destructures it. The script would
have failed with `ReferenceError` on any real deployment, and `yarn lint` — a
required CI job — was **already red on master** because of it.

Fixed during this workflow under explicit authorisation (`GAP-Q06`). `yarn lint`
now exits 0.

The process finding is the more interesting one: a required CI gate was failing
on the default branch and that had not been noticed. Worth checking why the job
is not blocking merges.

### `SEC-F-003` — Chainlink staleness bound is a single global constant — MEDIUM

`_ORACLE_TTL = 4 hours` (`ChainlinkCalculator.sol:20`) applies to every feed a
maker names. Chainlink heartbeats vary from 1 hour to 24 hours by feed and
chain. A feed with a 24-hour heartbeat is unusable; a fast feed's four-hour-old
price may already be badly stale.

Requirement `TIME-003` records this and rates its own confidence `MEDIUM`
precisely because four hours is stated nowhere as intent. Branch coverage on
this contract is 56.25% and the inverse-price path (line 76) and both
decimals-scale branches (94, 96) are untested — `GAP-008`.

**Required regression:** staleness boundary tests at 3h59m, exactly 4h, and
4h1s, per `SCN-038`. Not yet written.

### `SEC-F-004` — Oracle answers are bounded only by a safe cast — MEDIUM

No positivity check, no round-completeness check (`answeredInRound`), no
min/max bound. A negative answer reverts through `SafeCast`; a zero answer
reverts only on paths that divide by it. There is no protection against a feed
reporting a valid-but-wrong price, which is the usual oracle-manipulation shape.

`A3` in the architecture model records that feeds are trusted for correctness.
That is a legitimate design choice, but it should be an explicit, documented
one rather than an emergent property.

### `SEC-F-005` — `FeeTaker` unguarded subtraction and unbounded whitelist loop — LOW

`FeeTaker.sol:144` and `:152` compute
`takingAmount - integratorFeeAmount - protocolFeeAmount` inside an `unchecked`
block with no check that the fees do not exceed the taking amount. The current
formula makes that impossible — both are floored fractions of a denominator
that includes them — but the safety is a property of the arithmetic, not of a
check, and would not survive an independent change to either.

`INV-010`, now covered by a characterization test, asserts the payouts conserve
the taking amount exactly. That is the guard against this becoming live.

Separately, `_isWhitelistedGetterImpl` loops `size` times where `size` is a
caller-supplied byte, with no validation that `whitelistData` is long enough.
A gas-exhaustion vector bounded at 255 iterations; low impact.

### `SEC-F-006` — Deliberate truncations are sound but undocumented as risks — INFORMATIONAL

Two places compare truncated values, both documented in `description.md` as
design:

- allowed-sender and `FeeTaker`'s whitelist compare the low **80 bits** of an
  address (`ACC-002`, `ECON-003`). Bypass requires grinding a colliding
  address, about 2^80 work.
- the extension binding compares the low **160 bits** of the extension hash
  (`FR-ORDER-002`), giving an 80-bit birthday bound rather than 128.

Both are infeasible today. Recorded as accepted assumptions `A5` and `A6` so
they are not rediscovered as findings later. An auditor should confirm the work
factors are still acceptable for the protocol's time horizon.

### `SEC-F-007` — Non-standard tokens settle amounts the protocol never verifies — MEDIUM

The protocol computes amounts, calls `transferFrom`, and checks only the
boolean-or-empty return (`OrderMixin.sol:509-523`). It never verifies the
recipient's balance actually rose by the expected amount.

A fee-on-transfer or rebasing token therefore settles a different amount than
the one recorded in `OrderFilled` and used for the threshold check. Nothing
prevents such a token being named in an order.

`A2` records this as the broadest unenforceable assumption in the system. It is
conventional for this protocol class, but it is the assumption most likely to
surprise an integrator.

### `SEC-F-008` — `simulate` is an arbitrary `delegatecall` guarded by one line — INFORMATIONAL

`OrderMixin.sol:71-75` delegatecalls a caller-supplied target in the protocol's
own storage context. The unconditional `revert` on the following line is the
entire safety argument; there is no branch between them.

This is correct today and now has strong coverage: `SEC-001` and `INV-008` are
verified by nine tests in `test/Simulation.js`, including one asserting the
protocol's low storage range is byte-identical after four state-writing
simulation attempts.

Flagged as informational because the margin for error is a single statement. Any
future refactor that introduces a return path grants arbitrary writes to both
invalidator mappings. The tests exist specifically to catch that.

### `SEC-F-009` — Three independent owners, holders unverified — MEDIUM operational

`LimitOrderProtocol`, `FeeTaker` and `NativeOrderFactory` are three separate
`Ownable` instances with nothing in the code linking them, across 16 chains.

The protocol owner can pause all fills but cannot move funds or touch an
individual order, and cancellation deliberately stays available while paused
(`OPS-001`, now tested). That is a well-shaped safety control.

What is unverified is who holds each of the three keys on each chain, and
whether any is an EOA. `OQ-4` remains open. This is deployment configuration,
outside the code, and should be confirmed before an audit rather than during
one.

Note also that renouncing ownership is irreversible and would leave the protocol
permanently unpausable and `FeeTaker` balances permanently unrescuable — both
now pinned by tests.

### `SEC-F-010` — Ordering and MEV — INFORMATIONAL

Orders are distributed off-chain in the clear. Allowed-sender restricts
*execution*, not visibility, so a private order's contents are public to anyone
who receives it (`A11`).

The taker's threshold is the only slippage protection, and **a zero threshold
disables it entirely** rather than meaning "zero cost" (`MATH-003` criterion 3,
`MATH-004` criterion 3). That is a genuine footgun and should be called out in
integrator documentation.

There is no commit-reveal, no batching, and no ordering protection by design.
Appropriate for the protocol's model; worth stating so it is an accepted
property rather than an oversight.

### `SEC-F-011` — `OffsetsLib` bounds-checks one end only — LOW

`OffsetsLib.get` reverts when `end > concat.length` but does not check
`begin > end`. A malformed offsets word produces an underflowed length rather
than an explicit error. `A13` records it. `GAP-018` (malformed-offsets fuzzing)
is still open and would be the natural way to probe it.

### `SEC-F-012` — Two production contracts have never been executed — LOW

`ERC1155Proxy` and `ERC721ProxySafe` remain at **0%** coverage after all test
work (`GAP-019`). They hold token approvals and expose a function whose selector
is deliberately ground to match `IERC20.transferFrom`, guarded only by
`onlyImmutableOwner`. Untested code with that shape should not go into an audit
unexercised.

### `SEC-F-013` — Deployed code is past its last audit — INFORMATIONAL

`package.json` declares 4.3.4; the newest tag is 4.3.2, which `README.md` names
as the last audited version and explicitly warns that master "hasn't been
audited and may contain severe security issues". 187 files changed between the
two, including the Permit2 extension and the native-order rework.

## Step-by-step against the Trail of Bits workflow

| Step | Status |
|---|---|
| 1. Known security issues (Slither) | **Not performed** — not installed. Required before audit |
| 2. Special features | Upgradeability: not applicable, no proxy or initializer anywhere (Phase 0). ERC conformance: the protocol is not a token. Token integration: `SEC-F-007` is the relevant risk |
| 3. Visual inspection | Covered in prose by `architecture/02-contracts-and-storage.md` (inheritance and storage) and `04-entry-points-and-privileges.md` (28 entry points with effective authorisation, and the privilege matrix). No graphs generated — Slither absent |
| 4. Document security properties | **Done thoroughly.** 46 requirements, 16 invariants, 42 scenarios, 13 unenforceable assumptions. This is the strongest part of the package |
| 5. Manual review areas | Privacy `SEC-F-010`; front-running and MEV `SEC-F-010`; cryptography `SEC-F-006`; DeFi interactions `SEC-F-003`, `SEC-F-004`, `SEC-F-007` |

## Requirement-code-test gaps carried into the audit

| Gap | Effect |
|---|---|
| No stateful invariant harness | 8 invariants including `INV-001` (protocol retains no value), `INV-002` and `INV-003` (no over-fill) have no multi-transaction verification. The largest remaining gap |
| `GAP-019` | `ERC1155Proxy`, `ERC721ProxySafe` unexercised — `SEC-F-012` |
| `GAP-008` | Oracle staleness untested — `SEC-F-003` |
| `GAP-018` | Malformed predicate offsets unfuzzed — `SEC-F-011` |
| `GAP-003`, `GAP-004`, `GAP-015`, `GAP-017`, `GAP-020`, `GAP-022`, `GAP-025`, `GAP-026` | Priority-3 coverage, no specific security finding attached |
| `OQ-3` | No fee specification exists, so all four `ECON-*` requirements are reverse-engineered and cannot detect a fee bug |

## Open questions for the audit

| ID | Question |
|---|---|
| `OQ-3` | Is there a `FeeTaker` fee specification anywhere outside this repository? |
| `OQ-4` | Who holds each of the three owner keys, on each of the 16 chains? |
| `OQ-7` | Is `SEC-F-001` accepted, or should `RangeAmountCalculator` be fixed? |
| `OQ-9` | **New.** Should Slither be installed and Step 1 run before the audit? This review recommends yes |

## What this review did not do

No code was executed beyond the existing test and coverage commands. No exploit
was written. No fix was applied to any contract. No severity here is
authoritative. Static analysis was skipped entirely.
