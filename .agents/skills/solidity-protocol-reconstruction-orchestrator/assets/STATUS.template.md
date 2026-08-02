# Protocol reconstruction status

Single source of workflow state. `resume` reads this file and nothing else.
Update it at the end of every phase and after every approval. Never delete a
row; supersede it.

## Run

| Field | Value |
|---|---|
| Mode | `analyze` \| `implement-tests` \| `security-review` \| `full` |
| Skill version | 5.0.0 |
| Started | YYYY-MM-DD |
| Last updated | YYYY-MM-DD |
| Next permitted phase | e.g. `Phase 6A`, or `blocked: Gate B` |

## Stack

| Field | Value | Source |
|---|---|---|
| Framework profile | | detector \| `--framework` override |
| Override rationale | not overridden | |
| Detection evidence | | `DETECTION_EVIDENCE` |
| Ambiguity | none | `AMBIGUITY_REASON` |
| Host language | | |
| Module system | | `MODULE_SYSTEM_SOURCE` |
| Hardhat version / config | | |
| Foundry config / profile | | |
| forge-std version | | |
| ethers / viem version | | |
| Package manager / lockfile | | |
| Solidity compiler settings | | `SOLC_SOURCE`; if `manual-inspection-required`, record the values read from the config |
| Remappings | | source and count |
| FFI / fs_permissions | | |
| RPC aliases / env vars | | |

## Baseline

| Field | Value |
|---|---|
| Baseline commit | full SHA |
| Branch | |
| Working tree clean at start | yes \| no, with detail |
| Contracts changed during this workflow | must be none |

## Specialists

| Skill | Required by | Resolved path | Activated |
|---|---|---|---|
| | | | yes \| no, with reason |

Record every skill actually activated, with the path
`scripts/check-dependencies.sh` resolved. If a duplicate installation was
reported, record which copy was used and why. Never list a skill that was not
activated.

Optional capabilities:

| Capability | Requested | Used | Notes |
|---|---|---|---|
| `arc42-c4` | no | no | |
| ADR capture | no | no | |

## Phase status

| Phase | Artifact | Status | Completed | Notes |
|---|---|---|---|---|
| 0 Baseline | `00-baseline.md`, `01-repository-inventory.md` | not started | | |
| 1 Compliance | `02-compliance-report.md` | not started | | |
| Gate A | `03-divergence-decisions.md` | not started | | |
| 2 Requirements | `requirements/` | not started | | |
| 3 Architecture | `architecture/` | not started | | |
| 3A arc42 (optional) | `architecture/` | skipped | | |
| 4 Entry points | `04-entry-points-and-privileges.md` | not started | | |
| 5 Scenarios | `05-behaviour-scenarios.md` | not started | | |
| 6A Test audit | `06-existing-test-audit.md` | not started | | |
| 6 Strategy | `07-test-strategy.md`, `08-traceability-matrix.md` | not started | | |
| Gate B | — | not started | | |
| 7 Characterization | `09-characterization-report.md` | not started | | |
| 8 Specification tests | `10-test-implementation-report.md` | not started | | |
| 9 Property tests | `10-test-implementation-report.md` | not started | | |
| 10 ADRs (optional) | repository ADR location | skipped | | |
| Gate C | — | not started | | |
| 11 Security readiness | `11-security-readiness.md` | not started | | |

Status is one of: `not started`, `in progress`, `blocked`, `complete`,
`skipped`. `blocked` requires a reason and what would unblock it.

## Approvals

Approval is an explicit statement by a human, recorded here. Never infer
approval from silence, from a lack of objection, or from the user asking to
continue.

| Gate | Scope approved | Approved by | Date | Verbatim statement | Conditions |
|---|---|---|---|---|---|
| Gate A | divergence decisions in `03-divergence-decisions.md` | | | | |
| Gate B | requirements, architecture, privileges, scenarios, invariants, test strategy, traceability | | | | |
| Gate C | documentation and tests are complete enough for security review | | | | |

A conditional approval lists its conditions and is not complete until each is
recorded as met. If the reviewer approved part of the scope, list exactly which
part; the rest stays unapproved.

## Commands run

| Command | Phase | Exit | Duration | Result |
|---|---|---|---|---|

Every command executed against the repository, including failures. Record
failures without fixing them.

## Assumptions

| ID | Assumption | Basis | Risk if wrong |
|---|---|---|---|

## Open questions

| ID | Question | Blocks | Asked | Answer |
|---|---|---|---|---|

## Deviations

Anything done differently from this skill's policies, with the instruction that
authorized it.

| What | Why | Authorized by |
|---|---|---|
