# Traceability matrix

Written by Phase 6, updated by Phases 7-9 and 11. One row per requirement. A
requirement with no row is a defect in this matrix.

## Columns

| Column | Content |
|---|---|
| Requirement | `FR-*`, `SEC-*`, `ACC-*`, `ECON-*`, `MATH-*`, `TIME-*`, `STATE-*`, `UPG-*`, `OPS-*`, `INT-*`, `NFR-*` |
| Criticality | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` — from the requirement entry |
| Entry points | `EP-*` that can exercise it |
| Scenarios | `SCN-*` that specify it |
| Invariants | `INV-*` that protect it |
| Existing coverage | Phase 6A verdict: `COVERED`, `PARTIAL`, `UNCOVERED`, `WEAK_ASSERTION`, `CHARACTERIZATION_ONLY` |
| Gap | `GAP-*` when the verdict is not `COVERED` |
| Planned verification | test type and owning framework |
| Implemented tests | file plus test name, one per line |
| Harness | which framework owns it; exactly one in a hybrid repository |
| Status | `PLANNED`, `IMPLEMENTED`, `FAILING`, `BLOCKED`, `NOT_VERIFIABLE` |
| Evidence | command that runs it and its result |

## Matrix

| Requirement | Criticality | Entry points | Scenarios | Invariants | Existing coverage | Gap | Planned verification | Implemented tests | Harness | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `FR-001` | CRITICAL | `EP-003` | `SCN-004`, `SCN-005` | `INV-002` | `PARTIAL` | `GAP-011` | negative-path unit test | `test/Fill.js::SCN-005 reverts on expired order` | Hardhat | IMPLEMENTED | `yarn test` |

## Invariant coverage

`INV-*` rows, since an invariant may protect several requirements and needs one
authoritative harness.

| Invariant | Requirements | Harness | Implementation | Runs / depth | Status | Persisted failures |
|---|---|---|---|---|---|---|

## Unverifiable requirements

Requirements with no executable verification, and why. Every `CRITICAL`
requirement listed here blocks the completion contract.

| Requirement | Criticality | Reason | Proposed alternative |
|---|---|---|---|

## Consistency rules

- Every `CRITICAL` requirement has at least one `IMPLEMENTED` row with a passing
  command, or an entry in "Unverifiable requirements" with reviewer sign-off.
- Every `SCN-*` in `05-behaviour-scenarios.md` appears in at least one row.
- Every `INV-*` in `07-test-strategy.md` appears in the invariant table with
  exactly one harness.
- Every `GAP-*` in `06-existing-test-audit.md` appears here, either closed by an
  implemented test or carried forward with a status.
- A `FAILING` status is reported, never normalized by changing the test or the
  requirement.
