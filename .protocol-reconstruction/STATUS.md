# Protocol reconstruction status

Single source of workflow state. `resume` reads this file and nothing else.
Update it at the end of every phase and after every approval. Never delete a
row; supersede it.

## Run

| Field | Value |
|---|---|
| Mode | `analyze --with-optional` |
| Skill version | 5.0.0 |
| Started | 2026-08-03 |
| Last updated | 2026-08-03 |
| Next permitted phase | `blocked: Gate B` — all `analyze` phases complete; Phases 7-11 require Gate B approval |

## Stack

| Field | Value | Source |
|---|---|---|
| Framework profile | `hardhat2` | detector |
| Override rationale | not overridden | |
| Detection evidence | hardhat 2.23.0 resolved from node_modules; hardhat config hardhat.config.js; package.json scripts invoke hardhat | `DETECTION_EVIDENCE` |
| Ambiguity | none | `AMBIGUITY_REASON` was empty |
| Host language | JavaScript (30 host files, 24 test files, 0 TypeScript, 0 Solidity test files) | detector |
| Module system | CommonJS | `package.json` has no `"type"` field, so Node treats `.js` as CommonJS; no `.cjs`/`.mjs` overrides |
| Hardhat version / config | 2.23.0 / `hardhat.config.js` (inherits project default module system) | detector, `HARDHAT_VERSION_SOURCE=node_modules` |
| Foundry config / profile | none — no `foundry.toml`, `FOUNDRY_SCORE=0` | detector |
| forge-std version | not applicable | |
| ethers / viem version | ethers 6.13.4 / viem not installed | detector |
| Package manager / lockfile | yarn / `yarn.lock` | detector |
| Solidity compiler settings | version `0.8.30`; optimizer enabled, `runs: 1_000_000`; `viaIR: true`; `evmVersion: networks[getNetwork()]?.hardfork \|\| 'cancun'` | `SOLC_SOURCE=manual-inspection-required`; values read by hand from `hardhat.config.js` lines 22-32 |
| Remappings | none, count 0 | `REMAPPINGS_SOURCE=none` |
| FFI / fs_permissions | not applicable (no Foundry) | |
| RPC aliases / env vars | detector reported none. Networks are registered at runtime by `@1inch/solidity-utils/hardhat-setup` `Networks.registerAll()`, driven by environment variables absent from this machine. `dotenv` loads `.env`, which is gitignored via `.env*`. No `.env.example` exists, so the exact variable names are an open question (OQ-2). | `hardhat.config.js` lines 9-15 |

Environment note, recorded because it is weak evidence that was correctly
discounted: `forge 1.5.1-stable` is on this machine's PATH. The repository has no
Foundry configuration, so per the routing rules this is environment evidence only
and the profile remains `hardhat2`.

## Baseline

| Field | Value |
|---|---|
| Baseline commit | `837c8f823d39ab388daacb07b7adeaadec3dbf2b` |
| Branch | `cursor/full-reconstruction` |
| Working tree clean at start | yes — `git status --porcelain` returned 0 entries |
| Contracts changed during this workflow | none |

`git diff origin/master...HEAD -- contracts/ test/ deploy/ hardhat.config.js package.json` is empty: all production
code, tests, deployment scripts and build configuration on this branch are
byte-identical to `origin/master`. The 85 files this branch adds (14,117
insertions, 0 deletions) are entirely `.agents/skills/**` and `skills-lock.json`.

## Specialists

| Skill | Required by | Resolved path | Activated |
|---|---|---|---|
| `spec-to-code-compliance` | Phase 1 | `.agents/skills/spec-to-code-compliance/SKILL.md` | yes — activated and applied in Phase 1 |
| `reverse-engineer` | Phase 2 | `.agents/skills/reverse-engineer/SKILL.md` | yes — activated and applied in Phase 2, in `prd` mode adapted to the orchestrator's requirement template and output location |
| `audit-context-building` | Phase 3 | `.agents/skills/audit-context-building/SKILL.md` | yes — activated for Phase 3 |
| `entry-point-analyzer` | Phase 4 | `.agents/skills/entry-point-analyzer/SKILL.md` | yes — Phase 4, manual mode (Slither absent) |
| `property-based-testing` | Phase 6 | `.agents/skills/property-based-testing/SKILL.md` | yes — Phase 6 |
| `web3-testing` | Phases 6A, 8 (hardhat2 routing) | `.agents/skills/web3-testing/SKILL.md` | yes — consulted for Phase 6A alongside `hardhat2-policy.md`, which takes precedence |
| `working-with-legacy-code` | Phase 7 | `.agents/skills/working-with-legacy-code/SKILL.md` | no — outside `analyze` |
| `secure-workflow-guide` | Phase 11 | `.agents/skills/secure-workflow-guide/SKILL.md` | no — outside `analyze` |

All paths are relative to the repository root. `check-dependencies.sh` reported
no duplicate installations, so no copy-resolution decision was needed. Neither
forbidden migration skill (`migrate-hardhat2-to-hardhat3`,
`migrate-foundry-to-hardhat`) is present on disk.

Optional capabilities:

| Capability | Requested | Used | Notes |
|---|---|---|---|
| `arc42-c4` | yes | **yes** | Phase 3A complete: `architecture/arc42.md`, 12 sections, 4 C4 PlantUML diagrams |
| ADR capture | yes | no | Phase 10 is outside `analyze`. No new material decision has been made during this workflow, so there is nothing to record. Section 9 of `arc42.md` lists 8 recovered decisions and states explicitly that none is a historical record |

## Phase status

| Phase | Artifact | Status | Completed | Notes |
|---|---|---|---|---|
| 0 Baseline | `00-baseline.md`, `01-repository-inventory.md` | complete | 2026-08-03 | Build baseline clean; no test run in this phase, deferred to 6A |
| 1 Compliance | `02-compliance-report.md` | complete | 2026-08-03 | 61 alignment rows, 15 divergences (13 material). One candidate finding investigated and rejected, see report §9 |
| Gate A | `03-divergence-decisions.md` | complete | 2026-08-03 | All 15 decided: 12 `DOCUMENTATION_BUG`, 4 `ACCEPTED_CURRENT_BEHAVIOUR` (`DIV-004`, `DIV-005`, `DIV-007`, `DIV-010`). No `CODE_BUG`, no `SECURITY_RISK`, none left open |
| 2 Requirements | `requirements/` | complete | 2026-08-03 | 46 requirements across 3 files. 11 `CRITICAL`. Confidence 33 `HIGH` / 9 `MEDIUM` / 4 `LOW`. `reverse-engineer`'s 80%-Verified gate is **not met** (72%), because `description.md` specifies the core and nothing about the extensions — recorded in `requirements/README.md`. 11 peripheral contracts have no requirements |
| 3 Architecture | `architecture/` | complete | 2026-08-03 | 4 documents: trust/actors, contracts/storage, flows+`SM-*`, assets/math/assumptions. 10 `FLOW-*`, 9 `SM-*`, 13 unenforceable assumptions `A1`-`A13` |
| 3A arc42 (optional) | `architecture/arc42.md` | complete | 2026-08-03 | All 12 arc42 sections with 4 C4 PlantUML diagrams. Links to the protocol-specific documents rather than replacing them, per the Phase 3A rule |
| 4 Entry points | `04-entry-points-and-privileges.md` | complete | 2026-08-03 | 28 `EP-*`. Slither unavailable, manual analysis per skill fallback. 3 independent `Ownable` instances found |
| 5 Scenarios | `05-behaviour-scenarios.md` | complete | 2026-08-03 | 42 `SCN-*`. Self-assessment records 3 unmet coverage areas, including 5 of 19 custom errors unasserted |
| 6A Test audit | `06-existing-test-audit.md` | complete | 2026-08-03 | Baseline 173 pass / 0 fail / 5 pending. Coverage 91.88% stmt, 75.44% branch. 26 `GAP-*` + 5 quality findings + 6 proposals |
| 6 Strategy | `07-test-strategy.md`, `08-traceability-matrix.md` | complete | 2026-08-03 | 16 `INV-*`. 13 are `BLOCKED` on the property-tooling decision. 23 requirements `IMPLEMENTED`, 23 `PLANNED` |
| Gate B | — | **awaiting approval** | | `analyze` ends here. Nothing in Phases 7-11 may start until this is approved |
| 7 Characterization | `09-characterization-report.md` | not started | | Outside `analyze` |
| 8 Specification tests | `10-test-implementation-report.md` | not started | | Outside `analyze` |
| 9 Property tests | `10-test-implementation-report.md` | not started | | Outside `analyze` |
| 10 ADRs (optional) | repository ADR location | not started | | Outside `analyze` |
| Gate C | — | not started | | Outside `analyze` |
| 11 Security readiness | `11-security-readiness.md` | not started | | Outside `analyze` |

Status is one of: `not started`, `in progress`, `blocked`, `complete`,
`skipped`. `blocked` requires a reason and what would unblock it.

## Approvals

Approval is an explicit statement by a human, recorded here. Never infer
approval from silence, from a lack of objection, or from the user asking to
continue.

| Gate | Scope approved | Approved by | Date | Verbatim statement | Conditions |
|---|---|---|---|---|---|
| Gate A | all 15 divergences in `03-divergence-decisions.md` | `camoseed` | 2026-08-03 | See the verbatim decision table in `03-divergence-decisions.md` §Summary; five statements covering all 15 IDs | none — no decision was conditional |
| Gate B | requirements, architecture, privileges, scenarios, invariants, test strategy, traceability | | | | |
| Gate C | documentation and tests are complete enough for security review | | | | |

A conditional approval lists its conditions and is not complete until each is
recorded as met. If the reviewer approved part of the scope, list exactly which
part; the rest stays unapproved.

## Commands run

| Command | Phase | Exit | Duration | Result |
|---|---|---|---|---|
| `scripts/detect-project-stack.sh --format json` | startup | 0 | 0.4s | Profile `hardhat2`, no ambiguity |
| `scripts/check-dependencies.sh check` | startup | 0 | 1.0s | 8/8 skills resolved |
| `scripts/check-dependencies.sh analyze --with-optional` | startup | 0 | 1.0s | 8/8 resolved including `arc42-c4` and `documentation-and-adrs` |
| `git status --porcelain=v1` | 0 | 0 | <1s | Clean, 0 entries |
| `git diff --stat origin/master...HEAD -- contracts/ test/ deploy/ hardhat.config.js package.json` | 0 | 0 | <1s | Empty — production code identical to `origin/master` |
| `yarn hardhat compile` | 0 | 0 | 1.5s | `Nothing to compile`; artifacts already current. Two non-fatal warning classes recorded in `00-baseline.md` |
| `node` + repo `solc` 0.8.30, three-variant precedence probe compiled from strings | 1 | 0 | 0.3s | Disproved a claimed operator-precedence bug in `MakerTraitsLib`. `a & FLAG != 0` is byte-identical to `(a & FLAG) != 0`; `a & (FLAG != 0)` does not type-check. Scratch script deleted; no repository file was added or modified |
| `yarn test:ci` | 6A | 0 | 3.98s | **173 passing, 0 failing, 5 pending.** Run twice, identical. 5 pending are `describe.skip` at `test/examples/LimitOrderProtocol-example.js:8` |
| `yarn coverage` | 6A | 0 | 16.4s | 91.88% stmt, 75.44% branch, 93.67% func, 92.56% lines. 13 tests self-skip under coverage, so `PrioirityFeeLimiter` reports 0% despite 6 passing tests in a normal run |
| `which slither` | 4 | 1 | <1s | Not installed. Entry-point analysis done manually per the skill's fallback; a tool-assisted cross-check has not been performed |

Every command executed against the repository, including failures. Record
failures without fixing them.

## Assumptions

| ID | Assumption | Basis | Risk if wrong |
|---|---|---|---|
| ASM-1 | `description.md` is the authoritative protocol specification for v4 | `README.md` line 24 points to it as "the latest general overview and documentation" | Compliance findings would be measured against a non-authoritative document, invalidating Phase 1 |
| ASM-2 | `docs/*.md` are generated output of `solidity-docgen`, not hand-written specification | `hardhat.config.js` sets `docgen.outputDir: 'docs'`; content matches NatSpec | Treating generated docs as intent would make every divergence circular, since they are derived from the code |
| ASM-3 | The compiled artifacts present in `artifacts/` correspond to the baseline commit | `yarn hardhat compile` reported `Nothing to compile` against a clean tree | A stale artifact cache would make any bytecode-derived observation unreliable |
| ASM-4 | `evmVersion` resolves to `cancun` in the analysis environment | No network env vars are set, so `networks[getNetwork()]?.hardfork` is undefined and the `\|\| 'cancun'` fallback applies | Observations that depend on EVM version (gas, opcode availability) would not match a deployment built under a different hardfork |

## Open questions

| ID | Question | Blocks | Asked | Answer |
|---|---|---|---|---|
| OQ-1 | Should the audited tag `4.3.2` or the current `master` (`package.json` version 4.3.4) be treated as the subject of this reconstruction? `README.md` warns master is unaudited and may be broken. | Scope of every phase | 2026-08-03 | |
| OQ-2 | Which environment variables must be set for `Networks.registerAll()` to register networks, and are any fork tests expected to run? No `.env.example` is committed. | Phase 6A fork-test baseline | 2026-08-03 | |
| OQ-3 | Is there any specification of `FeeTaker`'s intended fee behaviour outside this repository? It is deployed on 14 chains and "fee" does not appear in `description.md`. See `DIV-010`. | All `ECON-*` requirements; `FeeTaker` coverage in Phases 4, 5, 6 | 2026-08-03 | |
| OQ-4 | Who holds the owner key on each deployment, and is pausing an intended operational control? See `DIV-004`. Widened in Phase 4: there are **three** independent `Ownable` instances — `LimitOrderProtocol`, `FeeTaker`, `NativeOrderFactory` — and nothing in the code links them. | `OPS-*`, owner-related `ACC-*`, and Phase 11 | 2026-08-03 | Partially answered: `DIV-004` accepted the mechanism as intended. Key holders still unknown |
| OQ-5 | Why is `test/examples/LimitOrderProtocol-example.js` permanently disabled with `describe.skip`? 283 lines, 11 assertions, never run in CI. Nothing in the repository records a reason. | Proposal `P-04` in `06-existing-test-audit.md` | 2026-08-03 | |
| OQ-6 | Which property-testing approach is authorised? No tool is installed, and the Hardhat 2 policy forbids adding one without approval. See `07-test-strategy.md`. | **Phase 9 entirely**; 13 of 16 `INV-*` are `BLOCKED` | 2026-08-03 | |

## Deviations

Anything done differently from this skill's policies, with the instruction that
authorized it.

| What | Why | Authorized by |
|---|---|---|
| Artifacts written to `.protocol-reconstruction/` instead of the skill's default `docs/protocol-reconstruction/` | `docs/` is the `solidity-docgen` `outputDir` and holds 38 committed generated files; mixing hand-written workflow output into a generated, committed tree risks collision and confusion. `references/artifacts.md` anticipates this case. Filenames within the directory are unchanged. | User, 2026-08-03, selected "Outside docs/, e.g. `.protocol-reconstruction/` at the repo root, keeping generated and hand-written docs separate" |
