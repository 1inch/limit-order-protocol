# 06 — Existing test-suite audit

Phase 6A, under
[`references/test-audit-policy.md`](../.agents/skills/solidity-protocol-reconstruction-orchestrator/references/test-audit-policy.md).

**No existing test was modified, renamed, skipped or deleted.** Every
improvement below is a proposal for Phase 8, after Gate B.

## Headline

The suite is genuinely good where it matters and has three specific soft spots.
173 tests pass, none fail, and the core contracts are at or near full statement
coverage — `LimitOrderProtocol.sol` and `OrderLib.sol` are at 100% on all four
metrics and `OrderMixin.sol` at 98.21%. That is a well-tested core.

The soft spots are: three test files that assert nothing at all, a permanently
disabled example suite of 283 lines, and an absence of any property, invariant
or fork testing. Branch coverage at 75.44% against statement coverage at 91.88%
is the number that best summarises the gap — the happy paths are exercised
thoroughly and the alternative branches much less so.

## 1. Test inventory

All Mocha over Hardhat, JavaScript, CommonJS. No Forge, no `node:test`. Single
framework, so no hybrid ownership question arises.

| File | Layer | Contracts touched | Style | Tests | Assertions |
|---|---|---|---|---|---|
| `LimitOrderProtocol.js` | unit + integration | `OrderMixin`, `OrderLib`, traits and invalidator libs, `SeriesEpochManager`, `NativeOrder*` | `loadFixture` | 99 | 162 |
| `Interactions.js` | integration | `OrderMixin`, `OrderIdInvalidator`, mocks | `loadFixture` | 7 | 30 |
| `FeeTaker.js` | integration | `FeeTaker`, `AmountGetterWithFee` | `loadFixture` | 7 | 16 |
| `RangeLimitOrders.js` | integration | `RangeAmountCalculator` via fills | `loadFixture` | 4 | 8 |
| `ChainLinkExample.js` | integration | `ChainlinkCalculator`, `AggregatorMock` | `loadFixture` | 7 | 13 |
| `DutchAuctionCalculator.js` | unit | `DutchAuctionCalculator` | `loadFixture` | 6 | 12 |
| `MeasureGas.js` | gas | `OrderMixin` | `loadFixture` | 6 | **0** |
| `SafeOrderBuilder.js` | integration | `SafeOrderBuilder`, `OrderRegistrator`, Gnosis Safe | `loadFixture` | 6 | 1 |
| `RangeAmountCalculator.js` | unit | `RangeAmountCalculator` | `loadFixture` | 8 | 10 |
| `PriorityFeeLimiter.js` | unit | `PriorityFeeLimiter` | `loadFixture` | 6 | 3 |
| `WitnessProxyExample.js` | integration | `Permit2WitnessProxy` | `loadFixture` | 1 | **0** |
| `Permit2Proxy.js` | integration | `Permit2Proxy` | `loadFixture` | 1 | **0** |
| `Extensions.js` | unit | `ExtensionLib` via `ExtensionMock` | `loadFixture` | 3 | 3 |
| `OrderRegistrator.js` | unit | `OrderRegistrator` | `loadFixture` | 3 | 3 |
| `MakerContract.js` | integration | `OrderMixin`, `MakerContract` | `loadFixture` | 1 | 4 |
| `SeriesEpochManager.js` | unit | `SeriesEpochManager` | `loadFixture` | 6 | 7 |
| `ApprovalPreInteractionExample.js` | integration | `ApprovalPreInteraction` | `loadFixture` | 1 | **0** |
| `Eip712.js` | unit | `OrderLib` hashing | `loadFixture` | 1 | 1 |
| `examples/LimitOrderProtocol-example.js` | example | various | `loadFixture` | 5 | 11 (never run) |

Totals: 19 files, 178 declared tests, roughly 274 assertions. Layers present:
unit, integration, gas. **Absent: fork, fuzz, invariant, deployment, upgrade.**

Helpers: `orderUtils.js` (327 lines) builds and signs orders and is the
published surface shipped in the npm package; `fixtures.js`, `utils.js`,
`eip712.js`, `nonce.js`.

## 2. Baseline run

| Field | Value |
|---|---|
| Command | `yarn test:ci` (`hardhat test`, serial — the CI command) |
| Commit | `837c8f823d39ab388daacb07b7adeaadec3dbf2b` |
| Exit code | 0 |
| Passing | 173 |
| Failing | **0** |
| Pending | 5 |
| Duration | 3.98s |

No failures, so nothing to attach. Run twice with identical results.

### Skipped tests

| Location | Mechanism | Effect |
|---|---|---|
| `test/examples/LimitOrderProtocol-example.js:8` | `describe.skip` | **All 5 tests permanently disabled.** 283 lines, 11 assertions, never executed. These are the 5 "pending" |
| `test/PriorityFeeLimiter.js:13` | `this.skip()` when `__SOLIDITY_COVERAGE_RUNNING` | 6 tests skipped under coverage only |
| `test/MeasureGas.js:10` | same | 6 tests skipped under coverage only |
| `test/LimitOrderProtocol.js:1168` | same | one block skipped under coverage only |
| `test/LimitOrderProtocol.js:262,289` | inverse condition | two assertions applied only when *not* under coverage |

The `describe.skip` is the significant one. The other four are legitimate
accommodations for solidity-coverage's inability to handle base-fee manipulation
and exact gas, but they mean **the coverage numbers understate reality for
`PriorityFeeLimiter`**, which reports 0% while having six passing tests in a
normal run. Reading that 0% as "untested" would be wrong.

### Flakiness signals

| Signal | Present? | Detail |
|---|---|---|
| `block.timestamp` dependence | Yes, controlled | Dutch auction and expiry tests use `hardhat-network-helpers` time control, which is deterministic |
| Unpinned fork tests | **No fork tests exist** | Nothing to pin |
| Order dependence / shared state | No | Every file uses `loadFixture`, which snapshots and restores |
| Unseeded randomness | No | All inputs are literals |
| Live network calls | No | All networks unregistered; nothing reaches an RPC |
| `--parallel` hazards | See below | |

**Parallel hazard.** `yarn test` runs `hardhat test --parallel`; CI runs
`yarn test:ci`, which is serial. The default local command and the command that
gates merges are therefore different. Both were exercised here and both pass, but
a test that only fails under one of them would be caught by whichever the
developer did not run. Worth recording rather than assuming equivalence.

## 3. Coverage baseline

| Field | Value |
|---|---|
| Command | `yarn coverage` (`hardhat coverage`, solidity-coverage 0.8.13) |
| Exit code | 0 |
| Duration | 16.4s |
| Caveat applied | Instrumented bytecode; 13 tests self-skip under coverage, as above |

**Overall: 91.88% statements, 75.44% branches, 93.67% functions, 92.56% lines.**

### Core

| Contract | Stmts | Branch | Funcs | Lines | Uncovered |
|---|---|---|---|---|---|
| `LimitOrderProtocol.sol` | 100 | 100 | 100 | 100 | — |
| `OrderLib.sol` | 100 | 100 | 100 | 100 | — |
| `OrderMixin.sol` | 98.21 | 93.65 | 100 | 98.63 | lines 107, 108 |

`OrderMixin` lines 107-108 are the **success path of `bitsInvalidateForOrder`**
(`EP-007`). The revert branch at line 106 is covered by "can simulate the failure
of bitsInvalidateForOrder"; the path that actually performs the mass invalidation
and emits `BitInvalidatorUpdated` is never executed. The tests named
"cancel own order with massInvalidate" reach `massInvalidate` through
`cancelOrder`, not through this entry point.

### Libraries — uniformly strong

`MakerTraitsLib`, `TakerTraitsLib`, `BitInvalidatorLib`,
`RemainingInvalidatorLib`, `OffsetsLib` and `Errors` are all at 100% across all
four metrics. `ExtensionLib` 94.12/75, `AmountCalculatorLib` 83.33/75 with
line 26 uncovered — that is the non-`unchecked` branch of `getTakingAmount`,
reachable only with operands above 2^128.

### Extensions — where the gaps are

| Contract | Stmts | Branch | Note |
|---|---|---|---|
| `DutchAuctionCalculator.sol` | 100 | 100 | Fully covered |
| `RangeAmountCalculator.sol` | 100 | 100 | Fully covered |
| `AmountGetterWithFee.sol` | 100 | 75 | |
| `FeeTaker.sol` | 93.55 | 57.14 | Branch coverage is the concern; lines 98, 155, 159, 195 uncovered — `rescueFunds`, the `InconsistentFee` revert, the nested post-interaction, and `EthTransferFailed` |
| `ChainlinkCalculator.sol` | 95.83 | 56.25 | Lines 76, 94, 96 uncovered — the inverse-price path and both decimals-scale branches |
| `AmountGetterBase.sol` | 75 | 50 | Lines 54, 72 uncovered — both external-getter delegation paths |
| `NativeOrderFactory.sol` | 69.23 | 57.14 | Lowest non-zero. Lines 70-74 uncovered — `rescueFunds` |
| `NativeOrderImpl.sol` | 89.47 | 64.29 | |
| `ERC1155Proxy.sol` | **0** | **0** | No test exercises it |
| `ERC721ProxySafe.sol` | **0** | **0** | No test exercises it |
| `PrioirityFeeLimiter.sol` | **0** | **0** | Artefact of the coverage skip; 6 tests pass normally |
| `EIP712Alien.sol` | 75 | 50 | Lines 71, 103 uncovered |
| `PredicateHelper.sol` | 82.61 | 75 | Lines 40, 41, 48, 49 uncovered — `not` and `eq` are never exercised |

Two genuinely untested production contracts: `ERC1155Proxy` and
`ERC721ProxySafe`. And two predicate primitives, `not` and `eq`, that the
protocol documents and no test calls.

## 4. Gas baseline

`hardhat-gas-reporter` is enabled in `hardhat.config.js` and runs on every test.
Recorded so Phases 7-9 can show added tests did not change production gas.

| Function | Min | Max | Avg | Calls |
|---|---|---|---|---|
| `fillOrder` | 80699 | 120605 | 100323 | 124 |
| `fillOrderArgs` | 77579 | 194160 | 123888 | 186 |
| `fillContractOrder` | 79452 | 150875 | 134173 | 9 |
| `fillContractOrderArgs` | 70263 | 104050 | 92788 | 21 |
| `cancelOrder` | 45316 | 46450 | 45837 | 10 |
| `cancelOrders` | — | — | 70275 | 1 |
| `increaseEpoch` | 45916 | 45928 | 45925 | 4 |
| `pause` / `unpause` | — | — | 27873 / 27520 | 2 / 1 |
| `permitAndCall` | 104466 | 135100 | 121898 | 20 |

Deployment: `LimitOrderProtocol` 5,286,226 gas, 17.6% of the block limit;
`FeeTaker` 1,287,520; `NativeOrderFactory` 1,675,356.

Gas is reported, not asserted. `MeasureGas.js` prints values and asserts nothing,
so no test fails on a gas regression.

## 5. Quality findings

Each is a finding with a location. None is fixed here.

### `GAP-Q01` — Three test files assert nothing at all

`test/Permit2Proxy.js`, `test/WitnessProxyExample.js` and
`test/ApprovalPreInteractionExample.js` contain **zero** assertions of any kind —
no `expect`, no `assert`, no `.to.`. Each ends with an unawaited-outcome call:

```85:85:test/Permit2Proxy.js
        await swap.fillOrderArgs(order, r, vs, order.makingAmount, takerTraits.traits, takerTraits.args);
```

That is the final line of the test. It asserts only that the transaction did not
revert. Balances, events and resulting state are never checked. These three files
are the sole coverage of `Permit2Proxy`, `Permit2WitnessProxy` and
`ApprovalPreInteraction`, all three of which report high line coverage as a
result — a precise illustration of why the policy calls coverage a gap signal
rather than proof.

### `GAP-Q02` — The example suite is permanently disabled

`test/examples/LimitOrderProtocol-example.js:8` is `describe.skip`. 283 lines
and 11 assertions have never run in CI. They are the documented usage examples,
so they are also the most likely place for documentation drift to be caught.

### `GAP-Q03` — Gas measurements assert nothing

`test/MeasureGas.js` has 6 tests and 0 assertions; it prints gas to the console.
A gas regression cannot fail the build. Legitimate as an observability tool,
recorded because the file reads as a test suite and is not one.

### `GAP-Q04` — `SafeOrderBuilder` has one assertion across six tests

Six generated price-change cases share a single event assertion at line 109. The
oracle-derived amounts the builder computes are not checked, which is the actual
behaviour under test.

### `GAP-Q05` — Local and CI test commands differ

`yarn test` is parallel, `yarn test:ci` is serial. See §2.

### Heuristics checked and not triggered

Shared mutable state: not present, `loadFixture` throughout. Unpinned fork:
no fork tests. Over-mocking: mocks stand in for external dependencies
(`TokenMock`, `AggregatorMock`, `WrappedTokenMock`) or exist to drive callbacks
(`InteractionMock`, `RecursiveMatcher`), which is legitimate; no mock stands in
for a protocol contract under test. Assertion on the wrong subject: not observed.
Duplicate cross-framework coverage: single framework.

## 6. Gap matrix

One row per requirement. Verdicts follow the policy.

| Requirement | Verdict | Evidence | Gap |
|---|---|---|---|
| `FR-ORDER-001` | `PARTIAL` | `Eip712.js` "domain separator", 1 assertion | `GAP-001` — no cross-chain or cross-deployment divergence test |
| `FR-ORDER-002` | `COVERED` | `LimitOrderProtocol.js` Predicate block: three invalid-extension tests, all asserting the specific error | — |
| `FR-ORDER-003` | `UNCOVERED` | No test sets a zero receiver and asserts the maker is paid | `GAP-002` |
| `FR-FILL-001` | `COVERED` | "should swap fully based on signature", "transferFrom", balance assertions throughout | — |
| `FR-FILL-002` | `PARTIAL` | `Interactions.js` exercises callbacks but does not assert their ordering relative to transfers | `GAP-003` |
| `FR-FILL-003` | `COVERED` | "disallow multiple fills", partial-fill tests | — |
| `FR-FILL-004` | `COVERED` | "should fail when amount is zero", "should fail on floor maker amount = 0" | — |
| `FR-FILL-005` | `PARTIAL` | TakerTraits target test exists; no test supplies an over-long declared length | `GAP-004` |
| `FR-CANCEL-001` | `COVERED` | Order Cancelation block, 14 tests including "should cancel any hash" | — |
| `FR-CANCEL-002` | `COVERED` | "should cancel several orders by hash" plus the mismatch revert | — |
| `FR-CANCEL-003` | `PARTIAL` | Only the failure path is tested; `OrderMixin.sol:107-108` uncovered | `GAP-005` |
| `MATH-001` | `COVERED` | "should floor maker amount" | — |
| `MATH-002` | `COVERED` | "should ceil taker amount" | — |
| `MATH-003` | `COVERED` | Four threshold tests including "should fill without checks with threshold == 0" | — |
| `MATH-004` | `COVERED` | Same block, both directions | — |
| `MATH-005` | `COVERED` | `DutchAuctionCalculator.js`, 0%/50%/100% both directions, 100% branch coverage | — |
| `MATH-006` | `PARTIAL` | `RangeAmountCalculator.js` 100% coverage, but no forward/inverse round-trip test | `GAP-006` |
| `TIME-001` | `PARTIAL` | Expiration block covers before and after; the **exact boundary second is not tested** | `GAP-007` |
| `TIME-002` | `COVERED` | "should not advance by 256", plus 0, 1, arbitrary | — |
| `TIME-003` | `PARTIAL` | `ChainLinkExample.js` exercises pricing; **no staleness test**, branch coverage 56.25% | `GAP-008` |
| `STATE-001` | `COVERED` | Cancellation and fill tests across all trait combinations | — |
| `STATE-002` | `COVERED` | Remaining invalidator block, 4 tests covering new, partial, filled, cancelled | — |
| `STATE-003` | `COVERED` | "should not fill cancelled order, massInvalidate", "disallow multiple fills" | — |
| `STATE-004` | `COVERED` | Epoch tests including "epoch change should not affect other addresses" | — |
| `ACC-001` | `COVERED` | "should not swap with bad signature", `MakerContract.js` contract-signature path | — |
| `ACC-002` | `COVERED` | Private Orders block, both directions | — |
| `ACC-003` | `COVERED` | Pause block: "pause and unpause can only be called by owner" | — |
| `ACC-004` | `PARTIAL` | `FeeTaker.js` exercises the happy path; **no test calls `postInteraction` directly from a non-protocol address** | `GAP-009` |
| `ACC-005` | `UNCOVERED` | `FeeTaker.sol:98` uncovered — `rescueFunds` is never called | `GAP-010` |
| `OPS-001` | `PARTIAL` | "Paused contract should not work" covers the block; **no test asserts cancellation still works while paused** | `GAP-011` |
| `SEC-001` | `PARTIAL` | "can simulate the failure of bitsInvalidateForOrder" uses `simulate`; **no test asserts that a state write inside a simulation does not persist** | `GAP-012` |
| `SEC-002` | `UNCOVERED` | No test triggers `ReentrancyDetected` | `GAP-013` |
| `SEC-003` | `PARTIAL` | Predicate block covers `and`, `or`, `arbitraryStaticCall`; **`not` and `eq` are never called**, and no test uses a state-writing predicate target | `GAP-014` |
| `SEC-004` | `COVERED` | "Fails with unexpected takerAssetSuffix" and "makerAssetSuffix", both Permit2 paths | — |
| `SEC-005` | `COVERED` | ETH fill block, 7 tests including both unwrap paths and both ETH-rejection cases | — |
| `INT-001` | `PARTIAL` | Callbacks are exercised; no test asserts the received argument values | `GAP-015` |
| `INT-002` | `UNCOVERED` | No test supplies a returning taker interaction | `GAP-016` |
| `INT-003` | `PARTIAL` | Getters exercised via Dutch/Range; `AmountGetterBase.sol:54,72` uncovered — the delegation branches | `GAP-017` |
| `INT-004` | `COVERED` | "skips order permit flag" plus the surrounding permit matrix | — |
| `INT-005` | `PARTIAL` | `and`/`or` pass and fail cases exist; no malformed-offsets test | `GAP-018` |
| `INT-006` | `PARTIAL` | `ERC721Proxy` covered by "ERC721Proxy should work"; **`ERC1155Proxy` and `ERC721ProxySafe` at 0%** | `GAP-019` |
| `INT-007` | `UNCOVERED` | No round-trip consistency test for any getter pair | `GAP-020` |
| `ECON-001` | `CHARACTERIZATION_ONLY` | `FeeTaker.js`, 7 tests, 16 assertions. Cites `DIV-010`: pins behaviour, cannot establish correctness | — |
| `ECON-002` | `CHARACTERIZATION_ONLY` | Same. Cites `DIV-010` | — |
| `ECON-003` | `PARTIAL` + `CHARACTERIZATION_ONLY` | "should charge fee when out of whitelist" exists; the `OnlyWhitelistOrAccessToken` revert is not asserted. Cites `DIV-010` | `GAP-021` |
| `ECON-004` | `CHARACTERIZATION_ONLY` | Discount exercised via whitelist tests. Cites `DIV-010` | — |

### Entry-point coverage

| Entry point | Verdict | Gap |
|---|---|---|
| `EP-001`-`EP-004` (four fill functions) | `COVERED` | — |
| `EP-005`, `EP-006` (cancel, batch cancel) | `COVERED` | — |
| `EP-007` (`bitsInvalidateForOrder`) | `PARTIAL` — failure path only | `GAP-005` |
| `EP-008`, `EP-009` (epoch) | `COVERED` | — |
| `EP-010` (`simulate`) | `PARTIAL` | `GAP-012` |
| `EP-011` (`registerOrder`) | `COVERED` | — |
| `EP-012`, `EP-013` (`SeriesNonceManager`) | `PARTIAL` — "advance nonce" only | `GAP-022` |
| `EP-014` (`create`) | `COVERED` | — |
| `EP-015`, `EP-016` (pause/unpause) | `COVERED` | — |
| `EP-017`, `EP-018` (`rescueFunds` ×2) | `UNCOVERED` | `GAP-010`, `GAP-023` |
| `EP-019` (ownership transfer ×3) | `UNCOVERED` | `GAP-024` |
| `EP-020`, `EP-021` (native order withdraw, resolver cancel) | `COVERED` | — |
| `EP-022` (`buildAndSignOrder`) | `WEAK_ASSERTION` | `GAP-025` |
| `EP-023`, `EP-024`, `EP-025` (protocol-only callbacks) | `PARTIAL` — happy path only, no unauthorised-caller test | `GAP-009` |
| `EP-026` (five selector proxies) | `PARTIAL` — two of five at 0% coverage, two with zero assertions | `GAP-019` |
| `EP-027`, `EP-028` | `PARTIAL` | `GAP-026` |

### Summary

| Verdict | Count |
|---|---|
| `COVERED` | 23 |
| `PARTIAL` | 22 |
| `UNCOVERED` | 7 |
| `WEAK_ASSERTION` | 1 |
| `CHARACTERIZATION_ONLY` | 4 |

26 `GAP-*` identifiers allocated. Every `CHARACTERIZATION_ONLY` row cites
`DIV-010`, as the policy requires.

### Critical requirements without full coverage

The completion contract turns on these. Of the 11 `CRITICAL` requirements:

| Requirement | Verdict |
|---|---|
| `FR-ORDER-001` | `PARTIAL` — `GAP-001` |
| `FR-ORDER-002` | `COVERED` |
| `FR-FILL-001` | `COVERED` |
| `FR-CANCEL-001` | `COVERED` |
| `MATH-003`, `MATH-004` | `COVERED` |
| `STATE-001`, `STATE-002`, `STATE-003` | `COVERED` |
| `ACC-001` | `COVERED` |
| `SEC-001` | `PARTIAL` — `GAP-012` |

Nine of eleven are covered. Two need work in Phase 8: cross-chain hash
divergence, and the proof that simulation cannot persist state.

## 7. Proposals for existing tests

Recorded only. Applying any of these is Phase 8 work, one at a time, after
Gate B approves them.

| # | File | Weakness | Proposal | Risk | Needs own approval? |
|---|---|---|---|---|---|
| `P-01` | `test/Permit2Proxy.js:85` | Test ends on a bare call with no assertion | Assert the NFT moved to the taker, the DAI reached the maker, and `OrderFilled` was emitted with the expected remaining amount | Low — additive, fixture-isolated | No |
| `P-02` | `test/WitnessProxyExample.js` | Zero assertions | As `P-01` for the witness path | Low | No |
| `P-03` | `test/ApprovalPreInteractionExample.js` | Zero assertions | Assert the approval was granted and the subsequent fill settled | Low | No |
| `P-04` | `test/examples/LimitOrderProtocol-example.js:8` | `describe.skip` disables 5 tests | Establish why they are skipped, then either re-enable or delete. A permanently skipped suite is worse than no suite because it looks like coverage | **Medium** — they may be skipped for a real reason not recorded anywhere | **Yes** |
| `P-05` | `test/SafeOrderBuilder.js` | One assertion across six generated cases | Assert the computed making and taking amounts per case, not only the event | Low | No |
| `P-06` | `test/MeasureGas.js` | No assertions | Leave as-is, or add loose upper-bound assertions to catch gross regressions. Tightening risks a brittle suite | Low, but changes intent | **Yes** |

`P-04` is the one to raise explicitly at Gate B. Nothing in the repository
records why the example suite is disabled, and it is exactly the kind of
decision that needs a human who knows the history.
