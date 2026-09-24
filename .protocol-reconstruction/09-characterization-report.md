# 09 — Characterization report

Phase 7, with the `working-with-legacy-code` specialist and the Hardhat 2
policy. Gate B approved in full on 2026-08-03.

## What characterization means here

These tests pin current behaviour without establishing that it is correct. They
exist where no independent statement of intent is available, so a passing test
proves only that the code still does what it did at commit `837c8f82`.

They are kept in `test/characterization/`, in separate files from specification
tests, per the placement rules for a Hardhat 2 repository. **A characterization
test is never promoted to a specification test by renaming it**: promotion needs
a requirement, a scenario and an approval.

## Files added

| File | Tests | Cites |
|---|---|---|
| `test/characterization/FeeTaker.characterization.js` | 9 | `DIV-010` |
| `test/characterization/OrderMixin.characterization.js` | 11 | `DIV-004`, `DIV-005` |

20 tests, all passing.

## `FeeTaker` — under `DIV-010`

`DIV-010` was decided `ACCEPTED_CURRENT_BEHAVIOUR` with the instruction to
reverse-engineer fee intent from the code and mark the requirements
low-confidence. No fee specification exists: the string "fee" does not appear in
`description.md`.

| Test | Pins | Requirement |
|---|---|---|
| pays out exactly what the taker sent, retaining nothing | The three payouts sum to the taker's outflow and `FeeTaker` keeps nothing | `ECON-001`, `INV-010` |
| settles for a non-whitelisted taker holding the access token | The access token is a genuine alternative to the whitelist | `ECON-003` |
| reverts `OnlyWhitelistOrAccessToken` without either | Closes `GAP-021`, previously unasserted | `ECON-003` |
| reverts `InconsistentFee` when the order does not pay `FeeTaker` | Fees are only collectable when `FeeTaker` holds the funds | `ECON-001` |
| a zero whitelist discount removes the resolver fee | Discount arithmetic at its lower bound | `ECON-004` |
| rejects a discount numerator above 100 | The validation bound | `ECON-004` |
| rejects an integrator share above 100 | The validation bound | `ECON-004` |
| rejects a direct `postInteraction` from a non-protocol address | Closes `GAP-009` | `ACC-004` |
| only the owner can rescue a stranded balance | Closes `GAP-010` | `ACC-005` |

The conservation test is the only one here that is meaningful without knowing
the intended fee model: whatever the split is supposed to be, the payouts must
account for every unit the taker sent. It is also the test that would catch a
fee configuration driving the `unchecked` subtraction at `FeeTaker.sol:144`
below zero.

## `OrderMixin` pause and simulate — under `DIV-004` and `DIV-005`

| Test | Pins | Requirement |
|---|---|---|
| blocks the EOA fill entry points while paused | `whenNotPaused` on `_fill` | `OPS-001`, `ACC-003` |
| **verifies the signature before the pause check on the contract-order path** | Validation ordering — see below | `OPS-001` |
| leaves cancellation available while paused | Closes `GAP-011` | `OPS-001` |
| leaves epoch advance available while paused | Closes `GAP-011` | `OPS-001` |
| an order cancelled while paused stays unfillable after unpausing | The pause does not defer writes | `OPS-001` |
| resumes normal filling after unpausing | Pause is not terminal | `ACC-003` |
| rejects pause and unpause from a non-owner | | `ACC-003` |
| renouncing ownership makes the protocol permanently unpausable | An irreversible operational state | `ACC-003` |
| reverts `SimulationResults` reporting a successful inner call | Payload shape, success case | `SEC-001` |
| reverts `SimulationResults` reporting a failed inner call | Payload shape, failure case | `SEC-001` |
| is callable by any address and still reverts | `simulate` is unrestricted | `SEC-001` |

### A correction found by writing these tests

The second test in that table exists because the first version of it failed.

I had written a single test asserting that **all four** fill entry points revert
`EnforcedPause` while paused, which is what `SCN-041` says. Two of them do. The
two contract-order entry points reverted `BadSignature` instead.

The reason is a validation-ordering fact I had assumed away: `whenNotPaused`
sits on `_fill`, which runs *after* signature verification. On the
contract-order path an invalid signature is therefore reported even while the
protocol is paused.

Two consequences, both now recorded rather than left implicit:

- A caller cannot use the revert reason to distinguish "paused" from "bad
  signature" on the contract-order path.
- `SCN-041` as written in Phase 5 is correct only for a signature that would
  otherwise be accepted. The scenario is not wrong, but it is narrower than its
  wording suggests.

This is the characterization method working as intended: the test disagreed with
my model of the code, and the code was right.

## Hard rules observed

- No existing test was modified, renamed, skipped or deleted in this phase.
- No production contract was changed. `git diff origin/master...HEAD -- contracts/`
  is empty.
- No dependency was added in this phase.
- Characterization and specification tests are in separate directories and
  separate files.
- Every test cites the `DIV-*` decision that authorises it, in the `describe`
  title and in a file-header comment.

## What is deliberately not characterized

`ECON-002`, the fee overlay on quoted amounts, has no dedicated characterization
test. The existing `test/FeeTaker.js` already exercises the overlay through real
fills and asserts the resulting balances, so a characterization test would
duplicate it without adding a distinct observation. The requirement's
verification is recorded against those existing tests in the traceability
matrix rather than against a new file.
