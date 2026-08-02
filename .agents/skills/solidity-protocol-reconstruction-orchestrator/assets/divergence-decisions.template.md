# Divergence decisions

Gate A. Every material divergence found in Phase 1 gets one `DIV-*` entry and
one human decision. No canonical requirement may be derived from an undecided
divergence.

## Summary

| Field | Value |
|---|---|
| Divergences found | |
| Material | |
| Decided | |
| Open | |
| Gate A approved | no |

## Register

| ID | Alignment | Subject | Documentation says | Code does | Material | Decision | Decided by | Date |
|---|---|---|---|---|---|---|---|---|
| `DIV-001` | `MISMATCH` | | | | yes | `CODE_BUG` | | |

Alignment values: `FULL_MATCH`, `PARTIAL_MATCH`, `MISMATCH`, `MISSING_IN_CODE`,
`CODE_STRONGER_THAN_SPEC`, `CODE_WEAKER_THAN_SPEC`, `UNDOCUMENTED_CODE_PATH`,
`AMBIGUOUS`.

Decision values: `CODE_BUG`, `DOCUMENTATION_BUG`, `ACCEPTED_CURRENT_BEHAVIOUR`,
`SECURITY_RISK`, `OPEN_QUESTION`, `OUT_OF_SCOPE`.

## Detail

Repeat for each material divergence.

### `DIV-001` — short title

| Field | Content |
|---|---|
| Alignment | |
| Documentation source | file, section, and quote |
| Code source | file, line, and quote |
| Observed behaviour | what a reproducible run shows, with the command |
| Security impact | |
| Decision | |
| Decided by | name |
| Date | |
| Rationale | the reviewer's reason, in their words; never invented |
| Consequences | requirements created or suppressed, tests required, `REG-*` IDs |

Consequences by decision:

- `CODE_BUG` — the requirement states the intended behaviour. A specification
  test is written for it and is expected to fail against current code. Never
  change the contract in this workflow.
- `DOCUMENTATION_BUG` — the requirement states the actual behaviour and cites
  this decision. Propose the documentation fix; do not apply it silently.
- `ACCEPTED_CURRENT_BEHAVIOUR` — the requirement states the actual behaviour. A
  characterization test pins it and cites this decision.
- `SECURITY_RISK` — carries into `11-security-readiness.md` as a finding with a
  required regression test. Requires explicit reviewer acknowledgement.
- `OPEN_QUESTION` — no requirement is derived. Blocks Gate B for anything that
  depends on it. Tracked in `STATUS.md`.
- `OUT_OF_SCOPE` — recorded with the reason and excluded from the traceability
  matrix.

## Open divergences blocking Gate B

| ID | Blocks | Needed to resolve |
|---|---|---|
