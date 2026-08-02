# Existing test-suite audit

Phase 6A. Assesses the suite that already exists. Follow
[test-audit-policy.md](../references/test-audit-policy.md).

No existing test is modified, skipped, or deleted in this phase.

## Summary

| Field | Value |
|---|---|
| Commit audited | full SHA |
| Frameworks present | |
| Test files | |
| Tests executed | pass / fail / skipped |
| Baseline duration | |
| Coverage baseline | percentage, or `not configured` |
| Gas baseline | `.gas-snapshot`, gas reporter, or `not configured` |
| Requirements `COVERED` | n of m |
| Gaps raised | |

Three sentences on the suite's overall character and its most serious weakness.

## 1. Inventory

| File | Framework | Layer | Contracts touched | Style | Assertions |
|---|---|---|---|---|---|

Totals by framework and layer:

| Framework | Unit | Integration | Fork | Fuzz | Invariant | Deployment | Gas |
|---|---|---|---|---|---|---|---|

## 2. Baseline run

| Command | Exit | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|

Failing tests, verbatim output:

```text
```

Flakiness signals:

| File | Signal | Evidence |
|---|---|---|

## 3. Coverage baseline

| Field | Value |
|---|---|
| Command | |
| Caveat applied | e.g. `--ir-minimum`, instrumentation alters gas semantics |
| Overall | |

| Contract | Lines | Branches | Functions | Note |
|---|---|---|---|---|

Coverage measures execution, not verification. Read the branch column and
cross-check against the quality findings below.

## 4. Gas baseline

| Field | Value |
|---|---|
| Command | |
| Result | |
| Snapshot file | untouched |

## 5. Quality findings

| ID | File:line | Heuristic | Evidence | Severity |
|---|---|---|---|---|
| `GAP-001` | | smoke test without assertions | quote the test body | |

Heuristics: smoke test without assertions, missing revert assertion, missing
event assertion, missing state assertion, shared mutable state, unpinned fork,
over-mocking, assertion on the wrong subject, duplicate cross-framework
coverage, `--parallel` hazard.

## 6. Gap matrix

| Key | Type | Description | Verdict | Evidence | Gap |
|---|---|---|---|---|---|
| `FR-001` | requirement | | `PARTIAL` | `test/Fill.js:42` | `GAP-011` |
| `EP-003` | entry point | | `UNCOVERED` | none | `GAP-012` |
| `INV-002` | invariant | | `WEAK_ASSERTION` | `test/Inv.t.sol:18` | `GAP-013` |

Verdicts: `COVERED`, `PARTIAL`, `UNCOVERED`, `WEAK_ASSERTION`,
`CHARACTERIZATION_ONLY`. Undeterminable is `UNCOVERED` with a note.

Counts:

| Verdict | Requirements | Entry points | Invariants |
|---|---|---|---|

## 7. Proposals

Not applied in this phase. Each needs its own approval and is implemented, if
approved, in Phase 8.

| ID | File / test | Weakness | Proposed change | Risk | Approved |
|---|---|---|---|---|---|
