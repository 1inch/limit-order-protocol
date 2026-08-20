# Divergence decisions

Gate A. Every material divergence found in Phase 1 gets one `DIV-*` entry and
one human decision. No canonical requirement may be derived from an undecided
divergence.

## Summary

| Field | Value |
|---|---|
| Divergences found | 15 |
| Material | 13 |
| Decided | 15 |
| Open | 0 |
| Gate A approved | yes — `camoseed`, 2026-08-03 |

All fifteen were decided in one review, including the two assessed non-material
(`DIV-007`, `DIV-011`), so no entry is left implicit.

### Verbatim decisions

Recorded exactly as stated by the reviewer at the Gate A review on 2026-08-03.

| Scope | Reviewer's statement |
|---|---|
| `DIV-002`, `DIV-003`, `DIV-006`, `DIV-008`, `DIV-009`, `DIV-011`, `DIV-012`, `DIV-013`, `DIV-014`, `DIV-015` | "Yes, all ten are DOCUMENTATION_BUG" |
| `DIV-001` | "DOCUMENTATION_BUG — removed feature, propose deleting both passages" |
| `DIV-004` | "ACCEPTED_CURRENT_BEHAVIOUR — intended design; document it and derive OPS-*/ACC-* requirements" |
| `DIV-010` | "ACCEPTED_CURRENT_BEHAVIOUR — reverse-engineer fee intent from the code and mark those requirements low-confidence" |
| `DIV-005`, `DIV-007` | "ACCEPTED_CURRENT_BEHAVIOUR — document both; make \"simulate can never persist state\" an invariant in Phase 6" |

No decision was conditional. No divergence was classified `CODE_BUG`,
`SECURITY_RISK`, `OPEN_QUESTION` or `OUT_OF_SCOPE`, so Phase 8 writes no
specification test that is expected to fail, and nothing from Gate A is carried
forward as a security finding on the reviewer's instruction alone.

## Register

Proposed decisions are the analyst's recommendation only and carry no authority.

| ID | Alignment | Subject | Documentation says | Code does | Material | Decision | Decided by | Date |
|---|---|---|---|---|---|---|---|---|
| `DIV-001` | `MISSING_IN_CODE` | Taker-interaction return value and `NO_IMPROVE_RATE` flag | `takerInteraction` returns `uint256 offeredTakingAmount`, which improves the maker's rate unless `NO_IMPROVE_RATE` is set | Callback returns nothing; identifiers exist nowhere in the codebase | yes | `DOCUMENTATION_BUG` | `camoseed` | 2026-08-03 |
| `DIV-002` | `MISMATCH` | All three callback signatures | 7 parameters, no `extension` | 8 parameters, `bytes calldata extension` second | yes | `DOCUMENTATION_BUG` | `camoseed` | 2026-08-03 |
| `DIV-003` | `MISMATCH` | `TakerTraits` bit 253 | "Unused" | `_SKIP_ORDER_PERMIT_FLAG`, skips the maker permit and gates the reentrancy check | yes | `DOCUMENTATION_BUG` | `camoseed` | 2026-08-03 |
| `DIV-004` | `UNDOCUMENTED_CODE_PATH` | Owner and pause | No owner, admin or pause mentioned anywhere | `Ownable` + `Pausable`; owner can halt every fill; cancellation stays open | yes | `ACCEPTED_CURRENT_BEHAVIOUR` | `camoseed` | 2026-08-03 |
| `DIV-005` | `UNDOCUMENTED_CODE_PATH` | `simulate` | Not mentioned | `delegatecall` to an arbitrary target, always reverts with the result | yes | `ACCEPTED_CURRENT_BEHAVIOUR` | `camoseed` | 2026-08-03 |
| `DIV-006` | `UNDOCUMENTED_CODE_PATH` | Zero receiver | Receiver is where taker assets go | Zero receiver falls back to the maker | yes | `DOCUMENTATION_BUG` | `camoseed` | 2026-08-03 |
| `DIV-007` | `CODE_STRONGER_THAN_SPEC` | Maker-permit reentrancy guard | Reentrancy not mentioned | Reverts `ReentrancyDetected` on reentrant fill of a remaining-invalidator order | no | `ACCEPTED_CURRENT_BEHAVIOUR` | `camoseed` | 2026-08-03 |
| `DIV-008` | `UNDOCUMENTED_CODE_PATH` | `cancelOrders`, `bitsInvalidateForOrder` | Only `cancelOrder` documented | Batch cancel and masked mass invalidation also exposed | yes | `DOCUMENTATION_BUG` | `camoseed` | 2026-08-03 |
| `DIV-009` | `UNDOCUMENTED_CODE_PATH` | ETH `msg.value` protocol | One line on wrapping/unwrapping | Full protocol: minimum, excess refund by raw call, unwrap routing, non-WETH rejection | yes | `DOCUMENTATION_BUG` | `camoseed` | 2026-08-03 |
| `DIV-010` | `UNDOCUMENTED_CODE_PATH` | Extension catalogue, `FeeTaker` above all | 3 amount getters + 1 proxy example | 17 extensions; `FeeTaker` takes fees, is deployed on 14 chains, and "fee" never appears in the spec | yes | `ACCEPTED_CURRENT_BEHAVIOUR` — intent reverse-engineered from code, requirements marked low-confidence | `camoseed` | 2026-08-03 |
| `DIV-011` | `PARTIAL_MATCH` | Threshold bit range | "0-184" | Mask covers bits 0-183; size 184 is correct | no | `DOCUMENTATION_BUG` | `camoseed` | 2026-08-03 |
| `DIV-012` | `PARTIAL_MATCH` | `advanceEpoch` maximum | "up to 256 units" (line 945), "up to 255" (line 940) | `amount > 255` reverts | yes | `DOCUMENTATION_BUG` | `camoseed` | 2026-08-03 |
| `DIV-013` | `MISMATCH` | RFQ orders | `README.md`: deprecated in v4 | `LimitOrderProtocol` NatSpec still documents RFQ as an order type, and it is published to `docs/` | yes | `DOCUMENTATION_BUG` | `camoseed` | 2026-08-03 |
| `DIV-014` | `PARTIAL_MATCH` | Amount-getter calling convention | `selector(args, requestedAmount, remainingMakingAmount, orderHash)` | Also passes `order`, `extension`, `msg.sender`, in a different order | yes | `DOCUMENTATION_BUG` | `camoseed` | 2026-08-03 |
| `DIV-015` | `PARTIAL_MATCH` | Predicate offsets terminator | 8-operand limit, packed `uint32` offsets | Zero 32-bit chunk terminates the loop; no monotonicity or bounds check on offsets | yes | `DOCUMENTATION_BUG` | `camoseed` | 2026-08-03 |

Alignment values: `FULL_MATCH`, `PARTIAL_MATCH`, `MISMATCH`, `MISSING_IN_CODE`,
`CODE_STRONGER_THAN_SPEC`, `CODE_WEAKER_THAN_SPEC`, `UNDOCUMENTED_CODE_PATH`,
`AMBIGUOUS`.

Decision values: `CODE_BUG`, `DOCUMENTATION_BUG`, `ACCEPTED_CURRENT_BEHAVIOUR`,
`SECURITY_RISK`, `OPEN_QUESTION`, `OUT_OF_SCOPE`.

## Detail

Full evidence, quotes and exploitability reasoning for each entry are in
[`02-compliance-report.md`](02-compliance-report.md) §6. The three that most
need a human rather than an analyst are set out below.

### `DIV-004` — Owner can pause all fills

| Field | Content |
|---|---|
| Alignment | `UNDOCUMENTED_CODE_PATH` |
| Documentation source | `description.md`, whole document: no occurrence of owner, admin, guardian, pause or emergency. The cancellation section (lines 914-948) presents expiry, predicate, hash/nonce and epoch as the complete set of ways an order stops being fillable |
| Code source | `LimitOrderProtocol.sol` lines 31-35 (`Ownable`, `Pausable`), lines 49-58 (`pause`/`unpause`, `onlyOwner`); `OrderMixin.sol` line 272 (`whenNotPaused` on `_fill`) |
| Observed behaviour | Not executed. Static reading only; no test was run in Phase 1 |
| Security impact | Centralisation. A signed, unexpired, unfilled, predicate-satisfying order is not guaranteed fillable, contrary to what the specification implies. Cancellation paths are deliberately not paused, so makers retain the ability to cancel while fills are frozen |
| Decision | `ACCEPTED_CURRENT_BEHAVIOUR` |
| Decided by | `camoseed` |
| Date | 2026-08-03 |
| Rationale | "ACCEPTED_CURRENT_BEHAVIOUR — intended design; document it and derive OPS-*/ACC-* requirements" |
| Consequences | Phase 2 produces `OPS-*` requirements for the pause lifecycle and `ACC-*` requirements for the owner role, both stating actual behaviour and citing this decision. Phase 6 gets an invariant that cancellation remains available while paused. Phase 7 pins the pause behaviour with a characterization test citing `DIV-004`. A documentation fix is proposed, not applied |

### `DIV-010` — `FeeTaker` and the undocumented extension catalogue

| Field | Content |
|---|---|
| Alignment | `UNDOCUMENTED_CODE_PATH` |
| Documentation source | `description.md` lines 155-158 names `AmountCalculator`, `DutchAuctionCalculator`, `RangeAmountCalculator`; lines 244-259 show `ERC721Proxy` as an example. A case-insensitive search for "fee" across `description.md` returns no matches |
| Code source | `contracts/extensions/` contains 17 contracts. `FeeTaker.sol` is 198 lines, `is IPostInteraction, AmountGetterWithFee, Ownable`, and is present in `deployments/` for 14 chains |
| Observed behaviour | Not executed |
| Security impact | Not assessable from documentation, which is the finding. Fee logic changes the amounts participants receive, and there is no statement of intended behaviour to check the implementation against |
| Decision | `ACCEPTED_CURRENT_BEHAVIOUR`, with intent reverse-engineered from code |
| Decided by | `camoseed` |
| Date | 2026-08-03 |
| Rationale | "ACCEPTED_CURRENT_BEHAVIOUR — reverse-engineer fee intent from the code and mark those requirements low-confidence" |
| Consequences | Phase 2 produces `ECON-*` requirements for `FeeTaker` derived from the implementation rather than from a specification. Every such requirement carries confidence `LOW` and cites this decision, because its source is the code it will be used to verify — it cannot detect a fee bug, only pin current behaviour. Phase 7 pins fee behaviour with characterization tests citing `DIV-010`; Phase 8 writes no normative fee test that claims to verify intent. `OQ-3` in `STATUS.md` stays open as the standing request for a real fee specification |

### `DIV-001` — Documented rate-improvement mechanism does not exist

| Field | Content |
|---|---|
| Alignment | `MISSING_IN_CODE` |
| Documentation source | `description.md` line 752 (`) external returns(uint256 offeredTakingAmount);`) and line 767 (the `NO_IMPROVE_RATE` paragraph, quoted in full in the compliance report) |
| Code source | `ITakerInteraction.sol` lines 24-33 declares `external;` with no return; `OrderMixin.sol` lines 380-382 discards any return data. Repository-wide search for `NO_IMPROVE_RATE`, `improveRate`, `offeredTakingAmount` matches only the two `description.md` lines |
| Observed behaviour | Not executed. The absence is established by search, not by execution |
| Security impact | No manipulable code path. Economic misunderstanding: a maker may price orders believing takers can offer a better rate that the protocol will honour |
| Decision | `DOCUMENTATION_BUG` |
| Decided by | `camoseed` |
| Date | 2026-08-03 |
| Rationale | "DOCUMENTATION_BUG — removed feature, propose deleting both passages" |
| Consequences | No requirement is created for rate improvement. `description.md` line 752 and line 767 are proposed for deletion in the documentation-fix list; the fix is not applied in this workflow. An `INT-*` requirement states the actual `takerInteraction` contract (no return value) and cites this decision |

## Open divergences blocking Gate B

None. All fifteen divergences were decided on 2026-08-03, so Phase 2 is
unblocked in full.

| ID | Blocks | Status |
|---|---|---|
| — | — | no divergence is open |

## Documentation fixes proposed, not applied

Consequence of the twelve `DOCUMENTATION_BUG` decisions. This workflow does not
edit protocol documentation; the list is handed over for a separate change.

| Target | Fix |
|---|---|
| `description.md` 722-765 | Add `bytes calldata extension` as the second parameter of all three callback signatures and to the parameter table (`DIV-002`) |
| `description.md` 752, 767 | Delete the `offeredTakingAmount` return and the `NO_IMPROVE_RATE` paragraph (`DIV-001`) |
| `description.md` 907 | Bit 253 is `SKIP_ORDER_PERMIT`, not unused (`DIV-003`) |
| `description.md` 72 | State that a zero receiver means the maker (`DIV-006`) |
| `description.md` 927-934 | Document `cancelOrders` and `bitsInvalidateForOrder` (`DIV-008`) |
| `description.md` 36, §Filling | Document the `msg.value` protocol: minimum, excess refund, unwrap routing, non-WETH rejection (`DIV-009`) |
| `description.md` 912 | Threshold occupies bits 0-183; size 184 is already correct (`DIV-011`) |
| `description.md` 940, 945 | Resolve the 255/256 contradiction in favour of 255 (`DIV-012`) |
| `LimitOrderProtocol.sol` 12-29 NatSpec | Remove the RFQ order type and its feature list; re-run `yarn docify` (`DIV-013`) |
| `description.md` 366-370 | Correct the amount-getter call to the real argument list and order (`DIV-014`) |
| `description.md` 459-461 | Document the zero-offset terminator and the absence of monotonicity/bounds checks (`DIV-015`) |
| `docs/` | Stale `extensions/ETHOrders.md` and six contracts with no generated page; re-run `yarn docify` |
| `TakerTraitsLib.sol` 19 | Code comment repeats the 0-184 off-by-one (`DIV-011`) |
| `MakerTraitsLib.sol` 170, 179 | Style only: add the parentheses used by the other eleven flag readers, so the next reviewer does not re-derive the rejected precedence finding (report §9) |
