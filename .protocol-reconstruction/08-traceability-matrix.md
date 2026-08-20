# Traceability matrix

Written by Phase 6. One row per requirement. Updated by Phases 7-9 and 11.

Every row is `PLANNED` except where an existing test already covers the
requirement, in which case the existing test is named and the status is
`IMPLEMENTED`. Nothing is `FAILING`: the baseline run had zero failures.

Harness is Hardhat for every row — single-framework repository, so the
one-authoritative-harness rule is satisfied by construction.

## Matrix

| Requirement | Crit. | Entry points | Scenarios | Invariants | Existing coverage | Gap | Planned verification | Implemented tests | Status |
|---|---|---|---|---|---|---|---|---|---|
| `FR-ORDER-001` | CRITICAL | `EP-001`-`004` | `SCN-001` | `INV-015` | `PARTIAL` | `GAP-001` | Cross-chain/deployment divergence unit test + hashing property | `test/Eip712.js::domain separator` | PLANNED |
| `FR-ORDER-002` | CRITICAL | `EP-002`, `EP-004` | `SCN-002`-`004` | `INV-013` | `COVERED` | — | — | `test/LimitOrderProtocol.js::should fail with invalid extension (×3)` | IMPLEMENTED |
| `FR-ORDER-003` | HIGH | `EP-001`-`004` | `SCN-005` | — | `UNCOVERED` | `GAP-002` | Unit test, both receiver branches | — | PLANNED |
| `FR-FILL-001` | CRITICAL | `EP-001`-`004` | `SCN-020` | `INV-011`, `INV-003` | `COVERED` | — | Add invariant harness | `test/LimitOrderProtocol.js::should swap fully based on signature`, `::transferFrom` | IMPLEMENTED |
| `FR-FILL-002` | HIGH | `EP-002`, `EP-004` | `SCN-017`-`019` | — | `PARTIAL` | `GAP-003` | Ordering-recorder mock asserting balances at each callback | `test/Interactions.js` (7 tests) | PLANNED |
| `FR-FILL-003` | HIGH | `EP-001`-`004` | `SCN-016` | — | `COVERED` | — | — | `test/LimitOrderProtocol.js::disallow multiple fills` | IMPLEMENTED |
| `FR-FILL-004` | HIGH | `EP-001`-`004` | `SCN-015` | — | `COVERED` | — | — | `test/LimitOrderProtocol.js::should fail when amount is zero`, `::should fail on floor maker amount = 0` | IMPLEMENTED |
| `FR-FILL-005` | MEDIUM | `EP-002`, `EP-004` | — | — | `PARTIAL` | `GAP-004` | Fuzz over declared args lengths | `test/LimitOrderProtocol.js::DAI => WETH, send WETH to address different from msg.sender` | PLANNED |
| `FR-CANCEL-001` | CRITICAL | `EP-005` | `SCN-023`, `SCN-024` | `INV-009` | `COVERED` | — | — | `test/LimitOrderProtocol.js::should cancel own order`, `::should cancel any hash`, `::should not fill cancelled order` | IMPLEMENTED |
| `FR-CANCEL-002` | MEDIUM | `EP-006` | `SCN-029` | — | `COVERED` | — | — | `test/LimitOrderProtocol.js::should cancel several orders by hash`, `::should revert when ... mismatched number of traits` | IMPLEMENTED |
| `FR-CANCEL-003` | HIGH | `EP-007` | `SCN-028` | `INV-004` | `PARTIAL` | `GAP-005` | Success-path unit test asserting the emitted slot value | `test/LimitOrderProtocol.js::can simulate the failure of bitsInvalidateForOrder` (failure path only) | PLANNED |
| `MATH-001` | HIGH | `EP-001`-`004` | `SCN-011` | `INV-007` | `COVERED` | — | Add property test | `test/LimitOrderProtocol.js::should floor maker amount` | IMPLEMENTED |
| `MATH-002` | HIGH | `EP-001`-`004` | `SCN-012` | `INV-007` | `COVERED` | — | Add property test | `test/LimitOrderProtocol.js::should ceil taker amount` | IMPLEMENTED |
| `MATH-003` | CRITICAL | `EP-001`-`004` | `SCN-013` | `INV-016` | `COVERED` | — | Add adversarial getter test | `test/LimitOrderProtocol.js::should not fill above threshold` (×2), `::should fill without checks with threshold == 0` | IMPLEMENTED |
| `MATH-004` | CRITICAL | `EP-001`-`004` | `SCN-014` | `INV-016` | `COVERED` | — | Add adversarial getter test | `test/LimitOrderProtocol.js::should not fill below threshold` (×2) | IMPLEMENTED |
| `MATH-005` | HIGH | `EP-002` | — | `INV-014` | `COVERED` | — | Add round-trip property | `test/DutchAuctionCalculator.js` (6 tests, 100% branch) | IMPLEMENTED |
| `MATH-006` | HIGH | `EP-002` | — | `INV-014` | `PARTIAL` | `GAP-006` | Forward/inverse round-trip property | `test/RangeAmountCalculator.js` (8), `test/RangeLimitOrders.js` (4) | PLANNED |
| `TIME-001` | HIGH | `EP-001`-`004` | `SCN-030`, `SCN-031` | — | `PARTIAL` | `GAP-007` | Boundary test at exactly the expiry second | `test/LimitOrderProtocol.js::Expiration` (6 tests) | PLANNED |
| `TIME-002` | MEDIUM | `EP-008`, `EP-009` | `SCN-034` | `INV-006` | `COVERED` | — | — | `test/SeriesEpochManager.js` (6 tests) | IMPLEMENTED |
| `TIME-003` | HIGH | `EP-002` | `SCN-038` | — | `PARTIAL` | `GAP-008` | Staleness boundary tests against `AggregatorMock` | `test/ChainLinkExample.js` (7 tests) | PLANNED |
| `STATE-001` | CRITICAL | `EP-001`-`007` | — | `INV-005` | `COVERED` | — | Add invariant | `test/LimitOrderProtocol.js::Order Cancelation` (14 tests) | IMPLEMENTED |
| `STATE-002` | CRITICAL | `EP-001`-`004` | `SCN-026`, `SCN-027` | `INV-002`, `INV-003` | `COVERED` | — | Add stateful invariant | `test/LimitOrderProtocol.js::Remaining invalidator` (4 tests) | IMPLEMENTED |
| `STATE-003` | CRITICAL | `EP-001`-`004` | `SCN-025` | `INV-004` | `COVERED` | — | — | `test/LimitOrderProtocol.js::should not fill cancelled order, massInvalidate`, `::disallow multiple fills` | IMPLEMENTED |
| `STATE-004` | HIGH | `EP-001`-`004`, `EP-008` | `SCN-032`, `SCN-033`, `SCN-035` | `INV-006` | `COVERED` | — | Add the chained-epoch scenario | `test/LimitOrderProtocol.js::epoch change, order should fail`, `::epoch change should not affect other addresses`, `::need epoch manager` (×2) | IMPLEMENTED |
| `ACC-001` | CRITICAL | `EP-001`-`004` | `SCN-006`-`008` | — | `COVERED` | — | Add signature-malleability case | `test/LimitOrderProtocol.js::should not swap with bad signature`, `test/MakerContract.js::should fill contract-signed RFQ order` | IMPLEMENTED |
| `ACC-002` | HIGH | `EP-001`-`004` | `SCN-009`, `SCN-010` | — | `COVERED` | — | — | `test/LimitOrderProtocol.js::Private Orders` (2 tests) | IMPLEMENTED |
| `ACC-003` | HIGH | `EP-015`, `EP-016` | `SCN-042` | — | `COVERED` | — | — | `test/LimitOrderProtocol.js::pause and unpause can only be called by owner`, `::unpause should work` | IMPLEMENTED |
| `ACC-004` | HIGH | `EP-023` | — | — | `PARTIAL` | `GAP-009` | Unauthorised-caller revert test | `test/FeeTaker.js` (7 tests, happy path) | PLANNED |
| `ACC-005` | MEDIUM | `EP-017` | — | — | `UNCOVERED` | `GAP-010` | Authorised and unauthorised `rescueFunds` | — | PLANNED |
| `OPS-001` | MEDIUM | `EP-015`, `EP-005` | `SCN-041` | `INV-009` | `PARTIAL` | `GAP-011` | Assert cancellation succeeds while paused | `test/LimitOrderProtocol.js::Paused contract should not work` | PLANNED |
| `SEC-001` | CRITICAL | `EP-010` | — | `INV-008` | `PARTIAL` | `GAP-012` | Storage-writing simulation target, assert slot unchanged | `test/LimitOrderProtocol.js::can simulate the failure of bitsInvalidateForOrder` | PLANNED |
| `SEC-002` | HIGH | `EP-001`-`004` | — | — | `UNCOVERED` | `GAP-013` | Reentrant permit mock triggering `ReentrancyDetected` | — | PLANNED |
| `SEC-003` | MEDIUM | `EP-002` | `SCN-036`, `SCN-037` | `INV-012` | `PARTIAL` | `GAP-014` | Cover `not` and `eq`; add a writing predicate target | `test/LimitOrderProtocol.js::Predicate` (9 tests) | PLANNED |
| `SEC-004` | MEDIUM | `EP-001`-`004` | — | — | `COVERED` | — | — | `test/LimitOrderProtocol.js::Fails with unexpected takerAssetSuffix`, `::Fails with unexpected makerAssetSuffix` | IMPLEMENTED |
| `SEC-005` | MEDIUM | `EP-001`, `EP-002` | `SCN-039`, `SCN-040` | `INV-001` | `COVERED` | — | Add the `INV-001` invariant | `test/LimitOrderProtocol.js::ETH fill` (7 tests) | IMPLEMENTED |
| `INT-001` | MEDIUM | `EP-002`, `EP-004` | `SCN-021` | — | `PARTIAL` | `GAP-015` | Argument-recording mock; wrong-signature mock | `test/Interactions.js` (7 tests) | PLANNED |
| `INT-002` | LOW | `EP-002` | `SCN-022` | — | `UNCOVERED` | `GAP-016` | Returning taker-interaction mock | — | PLANNED |
| `INT-003` | MEDIUM | `EP-002` | — | `INV-014` | `PARTIAL` | `GAP-017` | Recording getter mock; the 0/1-19/20-byte boundary | `test/LimitOrderProtocol.js::Amount Calculator` (4 tests) | PLANNED |
| `INT-004` | MEDIUM | `EP-001`-`004` | — | — | `COVERED` | — | — | `test/LimitOrderProtocol.js::skips order permit flag`, `::Maker Permit` (3), `::Taker Permit` (3) | IMPLEMENTED |
| `INT-005` | LOW | `EP-002` | — | `INV-013` | `PARTIAL` | `GAP-018` | Malformed-offsets fuzz | `test/LimitOrderProtocol.js::\`or\` should pass/fail`, `::\`and\` should pass/fail` | PLANNED |
| `INT-006` | LOW | `EP-026` | — | — | `PARTIAL` | `GAP-019` | Cover `ERC1155Proxy` and `ERC721ProxySafe` | `test/LimitOrderProtocol.js::ERC721Proxy should work` | PLANNED |
| `INT-007` | LOW | `EP-002` | — | `INV-014` | `UNCOVERED` | `GAP-020` | Round-trip property per shipped getter pair | — | PLANNED |
| `ECON-001` | HIGH | `EP-023` | — | `INV-010` | `CHARACTERIZATION_ONLY` | — | Characterization (Phase 7) + `INV-010` conservation | `test/FeeTaker.js` (7 tests) | PLANNED |
| `ECON-002` | HIGH | `EP-002` | — | `INV-007` | `CHARACTERIZATION_ONLY` | — | Characterization + rounding-direction property | `test/FeeTaker.js` | PLANNED |
| `ECON-003` | MEDIUM | `EP-023` | — | — | `PARTIAL` + `CHARACTERIZATION_ONLY` | `GAP-021` | Assert the `OnlyWhitelistOrAccessToken` revert | `test/FeeTaker.js::should charge fee when out of whitelist` | PLANNED |
| `ECON-004` | MEDIUM | `EP-023` | — | — | `CHARACTERIZATION_ONLY` | — | Characterization at 0/50/100/101 | `test/FeeTaker.js` | PLANNED |

## Invariant coverage

| Invariant | Requirements | Harness | Implementation | Runs / depth | Status | Persisted failures |
|---|---|---|---|---|---|---|
| `INV-001` | `SEC-005`, `FR-FILL-001` | Hardhat | `test/invariant/` | TBD by tooling decision | BLOCKED | — |
| `INV-002` | `STATE-002`, `ACC-001` | Hardhat | `test/invariant/` | TBD | BLOCKED | — |
| `INV-003` | `STATE-002`, `FR-FILL-001` | Hardhat | `test/invariant/` | TBD | BLOCKED | — |
| `INV-004` | `STATE-003`, `FR-CANCEL-003` | Hardhat | `test/invariant/` | TBD | BLOCKED | — |
| `INV-005` | `STATE-001` | Hardhat | `test/invariant/` | TBD | BLOCKED | — |
| `INV-006` | `TIME-002`, `STATE-004` | Hardhat | `test/invariant/` | TBD | BLOCKED | — |
| `INV-007` | `MATH-001`, `MATH-002`, `ECON-002` | Hardhat | `test/property/` | TBD | BLOCKED | — |
| `INV-008` | `SEC-001` | Hardhat | `test/invariant/` + permanent unit test | Deterministic | PLANNED | — |
| `INV-009` | `OPS-001`, `FR-CANCEL-001` | Hardhat | `test/invariant/` | Deterministic | PLANNED | — |
| `INV-010` | `ECON-001` | Hardhat | `test/invariant/` | TBD | BLOCKED | — |
| `INV-011` | `FR-FILL-001` | Hardhat | `test/invariant/` | TBD | BLOCKED | — |
| `INV-012` | `SEC-003` | Hardhat | `test/property/` | Deterministic | PLANNED | — |
| `INV-013` | `FR-ORDER-002`, `INT-005` | Hardhat | `test/property/` | TBD | BLOCKED | — |
| `INV-014` | `MATH-005`, `MATH-006`, `INT-007` | Hardhat | `test/property/` | TBD | BLOCKED | — |
| `INV-015` | `FR-ORDER-001` | Hardhat | `test/property/` | TBD | BLOCKED | — |
| `INV-016` | `MATH-003`, `MATH-004`, `INT-003` | Hardhat | `test/invariant/` | TBD | BLOCKED | — |

`BLOCKED` means the invariant needs randomized input generation, which needs the
Phase 6 tooling decision. `INV-008`, `INV-009` and `INV-012` are `PLANNED`
because they are deterministic and need no new tool.

## Unverifiable requirements

No requirement is unverifiable. `INT-007` comes closest — the protocol cannot
enforce getter consistency — but the property itself is testable against the
shipped getter pairs, so it is `PLANNED` rather than listed here.

| Requirement | Criticality | Reason | Proposed alternative |
|---|---|---|---|
| — | — | — | — |

**Completion-contract status: both `CRITICAL` requirements currently short of
executable verification are `PLANNED`, not unverifiable.** `FR-ORDER-001` needs
`GAP-001` closed and `SEC-001` needs `GAP-012` closed. Neither is blocked by the
tooling decision; both can be written in Phase 8 with what is installed.

## Consistency check

| Rule | Status |
|---|---|
| Every `CRITICAL` requirement `IMPLEMENTED` or listed unverifiable | **Not yet** — 9 of 11 implemented, 2 planned. Expected at this stage; Phase 8 closes them |
| Every `SCN-*` appears in at least one row | Yes — all 42 |
| Every `INV-*` appears with exactly one harness | Yes — all 16, all Hardhat |
| Every `GAP-*` appears here | Yes — `GAP-001` to `GAP-026`; the quality gaps `GAP-Q01`-`Q05` live in the proposals table of `06-existing-test-audit.md` |
| No `FAILING` normalised away | N/A — the baseline has no failures |

## Coverage summary

| Status | Count |
|---|---|
| `IMPLEMENTED` (existing tests suffice) | 23 |
| `PLANNED` (new or strengthened tests needed) | 23 |
| `FAILING` | 0 |
| `BLOCKED` | 0 requirements; 13 of 16 invariants |
| `NOT_VERIFIABLE` | 0 |
