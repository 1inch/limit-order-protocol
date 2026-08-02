---
name: solidity-protocol-reconstruction-orchestrator
description: "Use when asked to reconstruct, document, audit-prep, or retro-test an existing Solidity protocol whose documentation is incomplete, stale, or unverified: reverse-engineer requirements and architecture from the code, audit the existing test suite, and add characterization, specification, and invariant tests without changing the contracts. Trigger terms: reconstruct protocol, reverse-engineer contracts, undocumented protocol, brownfield Solidity, spec-to-code compliance, requirements from code, entry point and privilege map, existing test audit, coverage gap matrix, characterization tests, invariant catalogue, traceability matrix, audit readiness. Auto-detects and preserves Hardhat 2, Hardhat 3, Foundry, or hybrid repositories, JavaScript/TypeScript, and CommonJS/ESM. Invoke explicitly; it is a gated multi-phase workflow, not a quick answer."
argument-hint: "[check|analyze|implement-tests|security-review|full|resume] [--framework auto|hardhat2|hardhat3|foundry|hybrid-hardhat2-foundry|hybrid-hardhat3-foundry] [--with-arc42] [--with-adrs] [--with-optional]"
disable-model-invocation: true
compatibility: Cursor or another Agent Skills client with filesystem access and support for loading multiple installed skills. Supports Solidity repositories using Hardhat 2, Hardhat 3, Foundry, or an existing hybrid of those frameworks.
metadata:
  version: "5.0.0"
  type: orchestrator
  workflow: brownfield-solidity-protocol-reconstruction
---

# Solidity Protocol Reconstruction Orchestrator

Coordinate specialist skills across a gated reconstruction, documentation, and testing workflow. This is an **orchestrator**: never imitate a missing specialist dependency.

Treat:

- protocol and user documentation as **intended behaviour**;
- Solidity code and reproducible runtime results as **observed behaviour**;
- human-approved divergence decisions as the only authority that reconciles them.

## Invocation

First argument:

- `check` — detect stack and verify dependencies; no repository analysis.
- `analyze` — baseline, compliance, requirements, architecture, privileges, BDD examples, existing-test audit, invariants, and test plan.
- `implement-tests` — characterization, framework-native deterministic tests, and property/invariant tests; requires approved analysis.
- `security-review` — non-destructive audit-readiness gate; requires approved documentation and tests.
- `full` — run all phases, stopping at mandatory review gates.
- `resume` — continue from `docs/protocol-reconstruction/STATUS.md`.

Default: `analyze`.

Optional flags:

- `--framework auto|hardhat2|hardhat3|foundry|hybrid-hardhat2-foundry|hybrid-hardhat3-foundry` — default `auto`; an override must be recorded and justified.
- `--with-arc42` — publish the approved architecture through `arc42-c4`.
- `--with-adrs` — use ADR capability only for new material decisions made during this workflow.
- `--with-optional` — both optional capabilities.

Examples:

```text
/solidity-protocol-reconstruction-orchestrator analyze
/solidity-protocol-reconstruction-orchestrator full --with-optional
/solidity-protocol-reconstruction-orchestrator implement-tests --framework foundry
```

## Mode to phase

| Mode | Phases | Gates | Precondition |
|---|---|---|---|
| `check` | none | none | none |
| `analyze` | 0, 1, 2, 3, 4, 5, 6A, 6 | A, B | none |
| `implement-tests` | 7, 8, 9 | — | Gate B approved |
| `security-review` | 11 | C | Gate C recorded in `STATUS.md` |
| `full` | 0-11 | A, B, C | none |
| `resume` | from `STATUS.md` | as recorded | `STATUS.md` exists |

Phase 3A (arc42) and Phase 10 (ADRs) are optional in every mode and run only when their flag is passed. `analyze` stops at Gate B; `full` stops at each gate and waits.

## Mandatory startup protocol

Before repository work:

1. Read [references/dependencies.md](references/dependencies.md) and [references/framework-routing.md](references/framework-routing.md).
2. Run `scripts/detect-project-stack.sh --format json` (or `--format env`, or perform equivalent inspection).
3. Resolve one supported framework profile: `hardhat2`, `hardhat3`, `foundry`, `hybrid-hardhat2-foundry`, or `hybrid-hardhat3-foundry`. `unknown` is not a profile; it means detection failed.
4. If the profile is `unknown`, or `AMBIGUITY_REASON` is non-empty and material, stop before test implementation. Report `DETECTION_EVIDENCE` and `AMBIGUITY_REASON` verbatim and ask for `--framework`. Do not guess.
5. Run `scripts/check-dependencies.sh <mode>` with the detected or overridden framework and the optional flags. Exit codes: `0` all resolved, `1` a skill is missing, `2` usage error, `3` framework unresolved, `4` `python3` missing or manifest unreadable.
6. Locate dependencies by YAML frontmatter `name`; activate them natively or read their `SKILL.md` into context. If the check reported duplicate installations, resolve which copy is authoritative before continuing.
7. Record each activated skill and resolved path in `docs/protocol-reconstruction/STATUS.md`.
8. Never claim to have used a missing skill. Show its exact installation command and stop that phase.

Printing `/skill-name` does not activate a skill.

### Instruction precedence

1. explicit user instruction;
2. review gates and framework-preservation policies in this orchestrator;
3. active specialist methodology;
4. generic agent preferences.

Reject any specialist suggestion that migrates frameworks, changes language/module conventions, upgrades dependencies, or alters production contracts unless the user explicitly starts a separate migration/remediation task. Never activate `migrate-hardhat2-to-hardhat3` or `migrate-foundry-to-hardhat`; both ship beside the official `hardhat` skill and are forbidden here.

## Framework routing

Load [references/framework-routing.md](references/framework-routing.md), then activate:

| Detected profile | Mandatory testing specialist | Mandatory local policy |
|---|---|---|
| Hardhat 2 | `web3-testing` | [references/hardhat2-policy.md](references/hardhat2-policy.md) |
| Hardhat 3 | official `hardhat` | [references/hardhat3-policy.md](references/hardhat3-policy.md) |
| Foundry | `foundry-solidity` | [references/foundry-policy.md](references/foundry-policy.md) |
| HH2 + Foundry | both HH2 and Foundry specialists | both policies + [references/hybrid-policy.md](references/hybrid-policy.md) |
| HH3 + Foundry | both HH3 and Foundry specialists | both policies + [references/hybrid-policy.md](references/hybrid-policy.md) |

For Hardhat 3, conditionally load an official companion when the detected package exists:

- `hardhat-toolbox-viem`
- `hardhat-toolbox-mocha-ethers`

Do not install or select a companion merely because it is preferred; follow the repository.

## Stack preservation

Detect and record:

- framework profile, evidence, and ambiguity;
- Hardhat major/version and config file;
- Foundry config/profile/remappings and Forge version when available;
- JavaScript, TypeScript, Solidity-test, or mixed test layout;
- CommonJS or ESM where Node host code exists, plus per-file `.cjs`/`.mjs` overrides;
- ethers/viem and plugin/toolbox versions;
- `forge-std`, fixtures, cheatcodes, deployment helpers, scripts, and test conventions;
- compiler, optimizer, `viaIR`, EVM version, FFI, filesystem permissions, and fork settings.

`scripts/detect-project-stack.sh` emits all of these except Hardhat compiler settings, which live in an executable config. When it reports `SOLC_SOURCE=manual-inspection-required`, read the config and record the settings by hand.

Preserve them exactly:

- never migrate Hardhat 2 ↔ Hardhat 3 ↔ Foundry;
- never convert JavaScript ↔ TypeScript or CommonJS ↔ ESM;
- never force JavaScript/TypeScript tests into a Foundry suite or Solidity tests into a Node suite;
- in a hybrid repository, preserve each framework's existing ownership and avoid duplicate normative coverage unless the duplication has a stated purpose;
- do not update Hardhat, Foundry, forge-std, ethers, viem, OpenZeppelin, Solidity, plugins, package manager, submodules, or lockfiles;
- do not change compiler or storage-layout-affecting settings;
- do not install dependencies without approval;
- pin every fork test to chain ID and exact block number;
- keep production contracts unchanged in `analyze`, `implement-tests`, and `security-review`.

## Workflow state

Work from repository root. Store outputs under `docs/protocol-reconstruction/`. See [references/artifacts.md](references/artifacts.md) for the full artifact map, the templates, and git hygiene.

| Artifact | Phase |
|---|---|
| `STATUS.md` | every phase |
| `00-baseline.md`, `01-repository-inventory.md` | 0 |
| `02-compliance-report.md` | 1 |
| `03-divergence-decisions.md` | Gate A |
| `requirements/` | 2 |
| `architecture/` | 3 |
| `04-entry-points-and-privileges.md` | 4 |
| `05-behaviour-scenarios.md` | 5 |
| `06-existing-test-audit.md` | 6A |
| `07-test-strategy.md`, `08-traceability-matrix.md` | 6 |
| `09-characterization-report.md` | 7 |
| `10-test-implementation-report.md` | 8, 9 |
| `11-security-readiness.md` | 11 |

Maintain `STATUS.md` from [assets/STATUS.template.md](assets/STATUS.template.md): phase status, framework profile, specialist paths, baseline commit, stack versions, inputs/outputs, commands/failures, assumptions, open questions, approvals with who and when, optional skills, and next permitted phase. Never infer approval from silence.

All identifiers come from [references/id-registry.md](references/id-registry.md). Do not invent a prefix.

### Resume

`resume` continues an interrupted run. It reads `STATUS.md` and nothing else for state.

1. Read `STATUS.md`. If it does not exist, `resume` is impossible: say so and offer `analyze`.
2. Re-run detection. Compare framework profile, host language, module system, and dependency versions with the recorded stack. On any difference, stop and report the drift.
3. Compare git `HEAD` with the recorded baseline commit. If production contracts changed since, stop: the completed analysis may be stale. List the changed files and ask whether to re-baseline.
4. Run `scripts/check-dependencies.sh resume`. Re-activate every specialist listed as activated, at the recorded path.
5. Read the artifacts of every phase marked `complete`. Do not redo them.
6. Treat a phase marked `in progress` as untrusted: verify its artifact against that phase's outputs and finish only the incomplete part.
7. Select the next phase: the first that is not `complete` or `skipped`. Never step over a gate whose approval row is empty, even when later phases already have artifacts.
8. Append to `STATUS.md`. Never rewrite a recorded approval, failure, or decision.

# Phase orchestration

## Phase 0 — Baseline and repository inventory

**Specialist:** none.

Inventory git state, documentation, contracts, configs, package/submodule/lock files, compilers, frameworks, test directories, scripts, deployment systems, proxies, coverage/fork tools, and existing commands. Run existing commands only; record failures without fixing them. In a hybrid repository, run the shared-compiler-divergence check and the CI job mapping from [references/hybrid-policy.md](references/hybrid-policy.md).

Write `00-baseline.md` and `01-repository-inventory.md`.

## Phase 1 — Specification-to-code compliance

**Mandatory specialist:** `spec-to-code-compliance`

Create evidence-backed Spec IR, Code IR, alignment matrix, divergence report, undocumented paths, and open questions. Normalize alignment to:

```text
FULL_MATCH
PARTIAL_MATCH
MISMATCH
MISSING_IN_CODE
CODE_STRONGER_THAN_SPEC
CODE_WEAKER_THAN_SPEC
UNDOCUMENTED_CODE_PATH
AMBIGUOUS
```

Write `02-compliance-report.md`.

### Review Gate A

Require classification of every material divergence:

```text
CODE_BUG
DOCUMENTATION_BUG
ACCEPTED_CURRENT_BEHAVIOUR
SECURITY_RISK
OPEN_QUESTION
OUT_OF_SCOPE
```

Record each as `DIV-*` in `03-divergence-decisions.md` using [assets/divergence-decisions.template.md](assets/divergence-decisions.template.md). Do not create canonical requirements from unresolved material divergences.

## Phase 2 — Canonical requirements

**Mandatory specialist:** `reverse-engineer`

Use stable IDs: `FR-*`, `SEC-*`, `ACC-*`, `ECON-*`, `MATH-*`, `TIME-*`, `STATE-*`, `UPG-*`, `OPS-*`, `INT-*`, `NFR-*`. For each requirement record source, approval, actors, assets, pre/postconditions, acceptance criteria, related state/functions/invariants, verification method, security impact, confidence, and **criticality** (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`). Criticality is what the completion contract checks; confidence is not a substitute for it.

Write under `requirements/` using [assets/requirement.template.md](assets/requirement.template.md).

## Phase 3 — Protocol architecture and trust model

**Mandatory specialist:** `audit-context-building`

Document on-chain/off-chain boundaries, contract/inheritance/deployment/proxy/delegatecall/storage relationships, roles and trust, asset/liability/accounting model, critical flows (`FLOW-*`), external calls, states and transitions (`SM-*`), formulas/units/rounding, governance/upgrades/emergency operations, and unenforceable assumptions.

Write under `architecture/`.

## Phase 3A — Optional architecture publication

**Optional specialist:** `arc42-c4`

Only after the protocol-specific architecture exists and only when requested. Use C4 selectively; never replace asset, math, state, privilege, or invariant documents.

## Phase 4 — Entry points and privilege model

**Mandatory specialist:** `entry-point-analyzer`

Map every state-changing external entry point, callback, hook, receiver, initializer, upgrade function, and contract-only call as `EP-*`, with effective authorization, reads/writes, assets, external calls, events, reachable states, requirements/invariants, and required tests. Trace checks; do not trust modifier names.

Write `04-entry-points-and-privileges.md`.

## Phase 5 — Behaviour specifications

**Local policy:** [references/bdd-policy.md](references/bdd-policy.md)

Apply Specification by Example and Example Mapping. Cover user, role-failure, governance, upgrade, pause/emergency, oracle/token/callback/integration, timing/order, boundary, and error flows. Assign `SCN-*` IDs and link requirements, `EP-*`, and invariants. Gherkin is living documentation; do not add Cucumber unless approved.

Write `05-behaviour-scenarios.md`.

## Phase 6A — Existing test-suite audit

**Local policy:** [references/test-audit-policy.md](references/test-audit-policy.md)

Runs before Phase 6, because its gap matrix is the input to the test strategy.

Inventory every existing test, run the repository's own test commands to establish a baseline, capture coverage and gas baselines where already configured, apply the quality heuristics, and produce a gap matrix keyed by requirement, `EP-*`, and `INV-*` with verdicts `COVERED`, `PARTIAL`, `UNCOVERED`, `WEAK_ASSERTION`, or `CHARACTERIZATION_ONLY`.

Never modify, skip, or delete an existing test. A failing existing test is a finding. Improvements are recorded as proposals and implemented only after approval, in Phase 8.

Write `06-existing-test-audit.md` using [assets/existing-test-audit.template.md](assets/existing-test-audit.template.md).

## Phase 6 — Invariant catalogue and framework-aware test plan

**Mandatory specialist:** `property-based-testing`

Define `INV-*` properties for conservation, solvency, accounting, authorization, state safety, monotonicity, bounded losses, rounding, replay/idempotency, emergency/governance/upgrades, and integration assumptions.

For each property specify expression, scope, assumptions, exceptions, observables, actions, adversarial sequences, deterministic examples, framework-native implementation location, shrinking/replay strategy, and required seed/corpus persistence.

Framework mapping:

- Hardhat 2: use existing compatible facilities; request approval before adding a property tool or Foundry sidecar.
- Hardhat 3: prefer existing Solidity fuzz/invariant tests or repository-native TypeScript strategy according to the official Hardhat skill and current layout.
- Foundry: prefer Forge fuzz/invariant tests, handlers, ghost variables, targets/selectors, and persisted failures according to `foundry-solidity`.
- Hybrid: assign each property to one authoritative harness; avoid duplicate fuzz engines without rationale.

Plan from the Phase 6A gap matrix: `UNCOVERED` and `PARTIAL` drive new tests, `WEAK_ASSERTION` drives assertion proposals, `CHARACTERIZATION_ONLY` must cite a `DIV-*` decision.

Write `07-test-strategy.md` and `08-traceability-matrix.md`, the latter from [assets/traceability-matrix.template.md](assets/traceability-matrix.template.md).

### Review Gate B

Require explicit approval of requirements, architecture/trust/asset/math/state models, privilege matrix, BDD examples, existing-test audit and gap matrix, invariants, framework allocation, test strategy, and traceability. No normative test exists before approval.

## Phase 7 — Characterization tests

**Mandatory specialist:** `working-with-legacy-code`

Use the selected framework specialist and policy to implement characterization tests in the repository's native framework and language. Cover initialization, upgrades, permissions, success/reverts, events, accounting, rounding, boundaries, emergency modes, callbacks/tokens, block/time dependencies, and ordering flows. Mark conflicts as characterization and cite divergence decisions.

Write `09-characterization-report.md`.

## Phase 8 — Framework-native deterministic specification tests

**Mandatory specialists:** framework-routed specialist(s) from the routing table.

Activate the specialist together with its local policy. Implement approved BDD/specification, unit, integration, access, state-transition, accounting, external-integration, pinned fork, and regression tests in the existing framework. Apply approved Phase 6A proposals here, one at a time.

Every normative test references `SCN-*` and/or requirement IDs plus related `INV-*`, `FLOW-*`, `SM-*`, or `REG-*`. Assert state, assets, events, and reverts. Report implementation gaps; do not alter production contracts.

## Phase 9 — Stateful property and invariant tests

**Mandatory specialists:** `property-based-testing` plus framework-routed specialist(s).

Implement the smallest viable native harness. Never add another framework merely for convenience. Any new tool requires approval. Never weaken an invariant. Preserve failing seeds, counterexamples, action sequences, fork state, and reproduction commands.

Write `10-test-implementation-report.md` covering Phases 8 and 9.

## Phase 10 — Optional ADR capture

**Optional capability:** `adr-writing`; recommended skill `documentation-and-adrs`.

Only when requested and a new material decision is made. Never fabricate historical rationale. Follow existing ADR conventions or propose one for approval.

### Review Gate C

Before Phase 11, require explicit approval that documentation and tests are complete enough for a security review: Gate B artifacts are current, Phases 7-9 are complete or their gaps are accepted, the traceability matrix has no unexplained `PLANNED` rows, and failing tests are acknowledged. Record the approval in `STATUS.md`. `security-review` run on its own must verify this record exists; if it does not, stop and ask.

## Phase 11 — Security-readiness review

**Mandatory specialist:** `secure-workflow-guide`

Perform a non-destructive gate covering static checks, storage/upgrades, authorization, documented properties, external calls/reentrancy, ordering/MEV, oracle/economic/math/rounding, framework configuration, deployment, and requirement-code-test gaps. Findings cite requirements/invariants/scenarios and required regressions. This is not a substitute for an independent audit.

Write `11-security-readiness.md`.

# Test placement

Keep characterization tests separate from specification tests. Separate files, and separate directories where the repository has directories. Follow an existing convention if one exists; otherwise:

| Profile | Characterization | Specification | Invariant / fuzz | Fork |
|---|---|---|---|---|
| Hardhat 2 | `test/characterization/<Contract>.characterization.js` | existing layout and naming | existing layout | `test/fork/` |
| Hardhat 3 (Node tests) | `test/characterization/<Contract>.characterization.ts` | existing layout and naming | existing layout | `test/fork/` |
| Hardhat 3 (Solidity tests) | `<test-path>/characterization/<Contract>Characterization.t.sol` | `<test-path>/` | `<test-path>/invariant/` | `<test-path>/fork/` |
| Foundry | `<test-path>/characterization/<Contract>Characterization.t.sol` | `<test-path>/unit/`, `<test-path>/integration/` | `<test-path>/invariant/`, handlers in `<test-path>/invariant/handlers/` | `<test-path>/fork/` |

`<test-path>` is the Foundry-configured `test` directory, reported by the detector as `FOUNDRY_TEST_PATH`. Never mix the two kinds in one file, and never convert a characterization test into a specification test by renaming it: promotion requires a requirement, a scenario, and an approval.

# Fork tests

- Read the required environment variable names from the repository: `FOUNDRY_RPC_ALIASES` and `RPC_ENV_VARS` in the detector output, `[rpc_endpoints]` in `foundry.toml`, `process.env` reads in the Hardhat config, and `.env.example`. Record the exact names in `STATUS.md`.
- When a required variable is absent, skip the fork test and report it as skipped. Never fall back to chain head, never substitute a public endpoint, never hardcode a URL or key, and never claim coverage from a test that did not run.
- Every fork test pins chain ID and an exact block number. A test without a pinned block is not reproducible and must not be added.
- Record the block number and the reason it was chosen. Reuse the repository's existing pinned blocks where they suit.
- Never commit an RPC URL, API key, or `.env` content.
- Where CI cannot supply the credential, record the resulting coverage gap in the CI job mapping rather than weakening the test.

# Completion contract

Complete only when:

- framework detection and specialist routing are recorded and justified;
- all required specialists were loaded;
- optional specialists ran only when requested/applicable;
- framework, language, module, compiler, and dependency baselines were preserved;
- divergences are decided or explicitly open;
- requirements, architecture, privileges, scenarios, assets, states, and invariants are traceable;
- the existing test suite was audited and every gap has a verdict;
- each `CRITICAL` requirement has executable verification, or an accepted entry in the unverifiable list;
- characterization and normative tests are separated;
- each invariant has one authoritative harness in hybrid repos;
- fork tests are pinned and fuzz failures reproducible;
- failing normative tests are reported, not normalized;
- no existing test was modified, skipped, or deleted without recorded approval;
- no historical rationale was fabricated;
- `STATUS.md` accurately records work, failures, approvals, and next actions.
