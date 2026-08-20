# Economic requirements

Phase 2. Four entries, all covering `FeeTaker` and the fee overlay on amount
getters.

## Read this first

Every requirement in this file was reverse-engineered from the implementation.
No specification of intended fee behaviour exists in `description.md`,
`README.md`, `native-swap.md` or any NatSpec — Phase 1 established that the
string "fee" does not appear in `description.md` at all.

They exist under `DIV-010`, decided `ACCEPTED_CURRENT_BEHAVIOUR` by `camoseed`
on 2026-08-03 with the instruction to "reverse-engineer fee intent from the code
and mark those requirements low-confidence".

The consequence is worth being blunt about. **Verifying these requirements
cannot detect a fee bug.** They were read off the code they will be used to
check, so a test that passes proves only that the code still does what it did on
2026-08-03. They pin behaviour against future regression; they say nothing about
whether the behaviour is right. Every entry therefore carries confidence `LOW`,
and Phase 8 writes no normative fee test claiming to verify intent — fee
coverage lands in Phase 7 as characterization, citing `DIV-010`.

`OQ-3` in `STATUS.md` stays open as the standing request for a real fee
specification. Answering it would let all four be rewritten at higher confidence.

All entries: Status `DRAFT`, Approval `pending` until Gate B.

---

## `ECON-001` — Fees are taken from the taking amount and split between integrator and protocol

| Field | Content |
|---|---|
| ID | `ECON-001` |
| Criticality | `HIGH` |
| Criticality rationale | Fee arithmetic decides how much of the taker's payment reaches the maker; an error misroutes real value on every fee-bearing fill. |
| Source | `FeeTaker.sol` 112-162, 173-182 — code only, no specification (`DIV-010`) |
| Approval | pending |
| Status | `DRAFT` |

### Statement

On a fee-bearing fill, the integrator's fee and the protocol's fee are computed
from the taking amount, paid to their respective recipients, and the remainder
goes to the order's receiver.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Taker pays; integrator and protocol receive; maker or custom receiver takes the remainder |
| Assets | The taker asset, or ETH when the order unwraps WETH |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | The order's receiver is the `FeeTaker` contract, which is holding the taking amount when the post-interaction runs |
| Postconditions | With `d = 100000 + integratorFee + resolverFee`: the integrator receives `floor(floor(takingAmount × integratorFee / d) × integratorShare / 100)`; the protocol receives `floor(takingAmount × resolverFee / d)` plus the integrator pool's remainder; the receiver gets the taking amount less both. If any fee is non-zero while the receiver is not `FeeTaker`, it reverts `InconsistentFee` |
| Invariants preserved | pending Phase 6 — the three payouts sum to exactly the taking amount |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given zero integrator and resolver fees, when the fill settles, then the receiver gets the entire taking amount and no transfer is made to either fee recipient.
2. Given non-zero fees, when the fill settles, then the sum of the three payouts equals the taking amount exactly, with no dust retained.
3. Given a non-zero fee and an order whose receiver is not `FeeTaker`, when the post-interaction runs, then it reverts `InconsistentFee`.
4. Given an integrator share of 100, when computed, then the protocol receives only the resolver portion.
5. Given an integrator share of 0, when computed, then the whole integrator pool goes to the protocol recipient.
6. Given a WETH order with unwrap set, when it settles, then all three payouts are made in native ETH.
7. Given a recipient that rejects ETH on an unwrapping order, when it settles, then it reverts `EthTransferFailed` and nothing is paid.

### Verification

| Field | Content |
|---|---|
| Verification method | Characterization tests (Phase 7), not specification tests — see the note at the top of this file. Criterion 2 additionally as a Phase 6 invariant |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A — `test/FeeTaker.js` (318 lines) is substantial and may already pin much of this |
| Tests | pending Phase 7 |

### Risk

| Field | Content |
|---|---|
| Security impact | Fee arithmetic that over-charges silently diverts the maker's proceeds; the `InconsistentFee` guard is what stops fees being charged when `FeeTaker` is not actually holding the funds |
| Economic impact | Per fill, the fee amount; in aggregate, the entire fee stream |
| Confidence | `LOW` |
| Confidence rationale | Derived entirely from the implementation under `DIV-010`. Would rise to `HIGH` given one page stating the intended fee model, the intended rounding direction, and who is meant to absorb the remainder |

### Notes

Criterion 2 is the most valuable of these because it is checkable without knowing
the intended model: whatever the fee split is meant to be, the payouts must
conserve the taking amount. The subtraction at `FeeTaker.sol` 144 and 152 sits
inside an `unchecked` block with no guard that fees do not exceed the taking
amount, so criterion 2 is also the test that would catch a fee configuration
producing an underflow.

---

## `ECON-002` — Quoted amounts are adjusted so the fee is borne on top of the maker's price

| Field | Content |
|---|---|
| ID | `ECON-002` |
| Criticality | `HIGH` |
| Criticality rationale | The overlay changes the price the taker sees; a wrong direction silently moves the fee's incidence between maker and taker. |
| Source | `AmountGetterWithFee.sol` 24-62 — code only (`DIV-010`) |
| Approval | pending |
| Status | `DRAFT` |

### Statement

When an order prices through the fee-aware getter, the making amount quoted is
reduced and the taking amount quoted is increased, both by the total fee rate,
so the maker receives their unfeed price and the taker pays the fee.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Taker requests a quote; maker's price is the base |
| Assets | Both |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | The order's amount-getter field points at a fee-aware getter |
| Postconditions | Making amount is `floor(base × 100000 / (100000 + integratorFee + resolverFee))`; taking amount is `ceil(base × (100000 + integratorFee + resolverFee) / 100000)` |
| Invariants preserved | pending Phase 6 — rounding never favours the taker |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given zero fees, when quoted in either direction, then the result equals the base calculation exactly.
2. Given a non-zero fee, when a making amount is quoted, then it is strictly less than the base making amount.
3. Given a non-zero fee, when a taking amount is quoted, then it is strictly greater than or equal to the base taking amount.
4. Given any fee, when both directions are quoted and compared, then the making direction rounds down and the taking direction rounds up.
5. Given fee parameters and a quote, when the fill settles through `ECON-001`, then the fee actually taken is consistent with the fee implied by the quote.

### Verification

| Field | Content |
|---|---|
| Verification method | Characterization tests plus a property test for criterion 4 |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 7 |

### Risk

| Field | Content |
|---|---|
| Security impact | Rounding in the taker's favour leaks value from the maker on every quote |
| Economic impact | One unit per quote, systematic |
| Confidence | `LOW` |
| Confidence rationale | As `ECON-001`. The rounding directions are unambiguous in code and consistent with the core protocol's policy, which is mild independent corroboration but not a specification |

### Notes

Criterion 5 is the cross-check between the quoting path and the settlement path,
and it is the one place where these two reverse-engineered requirements can
contradict each other. If they do, that is a real finding despite the low
confidence, because internal inconsistency needs no external specification to
detect. Note also that the getter path applies no whitelist or access-token gate
while the settlement path does — an asymmetry worth a scenario.

---

## `ECON-003` — Fee-bearing settlement requires the taker to be whitelisted or hold the access token

| Field | Content |
|---|---|
| ID | `ECON-003` |
| Criticality | `MEDIUM` |
| Criticality rationale | Gates who may settle through the fee path; failure blocks a fill rather than misdirecting funds. |
| Source | `FeeTaker.sol` 173-182; `AmountGetterWithFee.sol` 105-118 — code only (`DIV-010`) |
| Approval | pending |
| Status | `DRAFT` |

### Statement

A taker settling a fee-bearing order must either appear in the order's whitelist
or hold a non-zero balance of the access token.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Taker is checked; maker supplies the whitelist; access token is an external dependency |
| Assets | None moved by the check |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | The post-interaction is computing fees |
| Postconditions | Proceeds when whitelisted, or when the access-token balance is non-zero; otherwise reverts `OnlyWhitelistOrAccessToken`. Whitelist entries are matched on the low 80 bits of the address |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a whitelisted taker with no access token, when settling, then it succeeds.
2. Given a non-whitelisted taker holding one unit of the access token, when settling, then it succeeds.
3. Given a taker who is neither, when settling, then it reverts `OnlyWhitelistOrAccessToken`.
4. Given an empty whitelist and a taker holding the access token, when settling, then it succeeds.
5. Given two addresses agreeing in their low 80 bits, when either settles, then both are treated as whitelisted.
6. Given a quote requested through the getter path by a non-whitelisted taker, when quoted, then no revert occurs — the gate applies only at settlement.

### Verification

| Field | Content |
|---|---|
| Verification method | Characterization tests over the matrix |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 7 |

### Risk

| Field | Content |
|---|---|
| Security impact | The 80-bit whitelist comparison has the same truncation property as `ACC-002`; and the access-token check is a live external call to a token that could revert or misreport |
| Economic impact | Access to fee-bearing settlement, not funds directly |
| Confidence | `LOW` |
| Confidence rationale | As `ECON-001`. The intent behind having two alternative gates is not recoverable from the code |

### Notes

Criterion 6 records the getter/settlement asymmetry noted under `ECON-002`, and
is behaviour rather than a judgement about whether the asymmetry is desirable.
The whitelist loop has no bound on its entry count and no length validation
against the supplied bytes, so a large count is a gas-exhaustion vector; that
belongs in Phase 11 rather than here.

---

## `ECON-004` — A whitelisted taker pays a reduced resolver fee

| Field | Content |
|---|---|
| ID | `ECON-004` |
| Criticality | `MEDIUM` |
| Criticality rationale | Changes the fee actually charged, but within a range the maker configured. |
| Source | `AmountGetterWithFee.sol` 74-91 — code only (`DIV-010`) |
| Approval | pending |
| Status | `DRAFT` |

### Statement

When the taker is whitelisted, the resolver fee is scaled down by the order's
whitelist discount factor before any fee is computed.

### Actors and assets

| Field | Content |
|---|---|
| Actors | Maker sets the discount; whitelisted takers benefit |
| Assets | Taker asset, via a smaller fee |
| Entry points | pending Phase 4 |

### Conditions

| Field | Content |
|---|---|
| Preconditions | The taker matched the whitelist |
| Postconditions | Resolver fee becomes `floor(resolverFee × discountNumerator / 100)`; a numerator above 100 reverts `InvalidWhitelistDiscountNumerator`; an integrator share above 100 reverts `InvalidIntegratorShare` |
| Invariants preserved | pending Phase 6 |
| State machine | pending Phase 3 |

### Acceptance criteria

1. Given a discount numerator of 100, when a whitelisted taker settles, then the resolver fee is unchanged.
2. Given a numerator of 50, when a whitelisted taker settles, then the resolver fee is halved, rounded down.
3. Given a numerator of 0, when a whitelisted taker settles, then no resolver fee is charged.
4. Given a numerator above 100, when parsed, then it reverts `InvalidWhitelistDiscountNumerator`.
5. Given a non-whitelisted taker, when settling, then no discount applies and the full resolver fee is charged.
6. Given an integrator share above 100, when parsed, then it reverts `InvalidIntegratorShare`.

### Verification

| Field | Content |
|---|---|
| Verification method | Characterization tests at 0, 50, 100 and 101 |
| Owning harness | Hardhat |
| Scenarios | pending Phase 5 |
| Existing coverage | pending Phase 6A |
| Tests | pending Phase 7 |

### Risk

| Field | Content |
|---|---|
| Security impact | The discount is bounded above at 100, so it can only reduce the fee, never inflate it — criterion 4 is what enforces that |
| Economic impact | Up to the whole resolver fee |
| Confidence | `LOW` |
| Confidence rationale | As `ECON-001`. Note the two validation bounds are real evidence of intent, since someone deliberately capped both at 100 |

### Notes

The integrator fee and resolver fee themselves are read as 16-bit values but
stored in `uint256` with no upper bound check, so a fee rate above 65535 is
impossible by construction while a rate up to 65535 against a 100000 base — that
is, up to roughly 65% — is permitted. Whether that ceiling is intentional cannot
be determined from the code and is part of `OQ-3`.
