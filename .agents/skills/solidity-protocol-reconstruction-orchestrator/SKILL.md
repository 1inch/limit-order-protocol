---
name: solidity-protocol-reconstruction-orchestrator
description: "Orchestrates a gated brownfield reconstruction workflow for an existing Solidity protocol. Auto-detects Hardhat 2, Hardhat 3, Foundry, or hybrid repositories; preserves JavaScript/TypeScript and CommonJS/ESM conventions; delegates each phase to installed specialist Agent Skills; and produces traceable requirements, architecture, BDD examples, characterization tests, framework-native deterministic tests, invariants, and a security-readiness review. Optionally publishes arc42+C4 and records new ADRs."
compatibility: Cursor or another Agent Skills client with filesystem access and support for loading multiple installed skills. Supports Solidity repositories using Hardhat 2, Hardhat 3, Foundry, or an existing hybrid of those frameworks.
metadata:
  version: "4.0.0"
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
- `analyze` — baseline, compliance, requirements, architecture, privileges, BDD examples, invariants, and test plan.
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

## Mandatory startup protocol

Before repository work:

1. Read [references/dependencies.md](references/dependencies.md) and [references/framework-routing.md](references/framework-routing.md).
2. Run `scripts/detect-project-stack.sh --format env` or perform equivalent inspection.
3. Resolve one framework profile:
   - `hardhat2`
   - `hardhat3`
   - `foundry`
   - `hybrid-hardhat2-foundry`
   - `hybrid-hardhat3-foundry`
   - `unknown`
4. If detection returns `unknown` or material ambiguity, stop before test implementation and report the evidence. Do not guess.
5. Run `scripts/check-dependencies.sh <mode>` with the detected/overridden framework and optional flags.
6. Locate dependencies by YAML frontmatter `name`; activate them natively or read their `SKILL.md` into context.
7. Record each activated skill and resolved path in `docs/protocol-reconstruction/STATUS.md`.
8. Never claim to have used a missing skill. Show its exact installation command and stop that phase.

Printing `/skill-name` does not activate a skill.

### Instruction precedence

1. explicit user instruction;
2. review gates and framework-preservation policies in this orchestrator;
3. active specialist methodology;
4. generic agent preferences.

Reject any specialist suggestion that migrates frameworks, changes language/module conventions, upgrades dependencies, or alters production contracts unless the user explicitly starts a separate migration/remediation task.

## Framework routing

Load [references/framework-routing.md](references/framework-routing.md), then activate:

| Detected profile | Mandatory testing specialist | Mandatory local policy |
|---|---|---|
| Hardhat 2 | `web3-testing` | `references/hardhat2-policy.md` |
| Hardhat 3 | official `hardhat` | `references/hardhat3-policy.md` |
| Foundry | `foundry-solidity` | `references/foundry-policy.md` |
| HH2 + Foundry | both HH2 and Foundry specialists | both policies + `references/hybrid-policy.md` |
| HH3 + Foundry | both HH3 and Foundry specialists | both policies + `references/hybrid-policy.md` |

For Hardhat 3, conditionally load an official companion when the detected package exists:

- `hardhat-toolbox-viem`
- `hardhat-toolbox-mocha-ethers`

Do not install or select a companion merely because it is preferred; follow the repository.

## Stack preservation

Detect and record:

- framework profile and evidence;
- Hardhat major/version and config file;
- Foundry config/profile/remappings and Forge version when available;
- JavaScript, TypeScript, Solidity-test, or mixed test layout;
- CommonJS or ESM where Node host code exists;
- ethers/viem and plugin/toolbox versions;
- `forge-std`, fixtures, cheatcodes, deployment helpers, scripts, and test conventions;
- compiler, optimizer, `viaIR`, EVM version, FFI, filesystem permissions, and fork settings.

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

Work from repository root. Store outputs under:

```text
docs/protocol-reconstruction/
```

Maintain `STATUS.md` with phase status, framework profile, specialist paths, baseline commit, stack versions, inputs/outputs, commands/failures, assumptions, open questions, approvals, optional skills, and next permitted phase. Never infer approval from silence.

# Phase orchestration

## Phase 0 — Baseline and repository inventory

**Specialist:** none.

Inventory git state, documentation, contracts, configs, package/submodule/lock files, compilers, frameworks, test directories, scripts, deployment systems, proxies, coverage/fork tools, and existing commands. Run existing commands only; record failures without fixing them.

Write:

```text
docs/protocol-reconstruction/00-baseline.md
docs/protocol-reconstruction/01-repository-inventory.md
```

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

Do not create canonical requirements from unresolved material divergences.

## Phase 2 — Canonical requirements

**Mandatory specialist:** `reverse-engineer`

Use stable IDs: `FR-*`, `SEC-*`, `ACC-*`, `ECON-*`, `MATH-*`, `TIME-*`, `STATE-*`, `UPG-*`, `OPS-*`, `INT-*`, `NFR-*`. Include source, approval, actors, assets, pre/postconditions, acceptance criteria, related state/functions/invariants, verification method, security impact, and confidence.

Write under `requirements/`.

## Phase 3 — Protocol architecture and trust model

**Mandatory specialist:** `audit-context-building`

Document on-chain/off-chain boundaries, contract/inheritance/deployment/proxy/delegatecall/storage relationships, roles and trust, asset/liability/accounting model, critical flows, external calls, states and transitions, formulas/units/rounding, governance/upgrades/emergency operations, and unenforceable assumptions.

Write under `architecture/`.

## Phase 3A — Optional architecture publication

**Optional specialist:** `arc42-c4`

Only after the protocol-specific architecture exists and only when requested. Use C4 selectively; never replace asset, math, state, privilege, or invariant documents.

## Phase 4 — Entry points and privilege model

**Mandatory specialist:** `entry-point-analyzer`

Map every state-changing external entry point, callback, hook, receiver, initializer, upgrade function, and contract-only call with effective authorization, reads/writes, assets, external calls, events, reachable states, requirements/invariants, and required tests. Trace checks; do not trust modifier names.

## Phase 5 — Behaviour specifications

**Mandatory specialist:** `bdd-practices`

Apply Specification by Example and Example Mapping. Cover user, role-failure, governance, upgrade, pause/emergency, oracle/token/callback/integration, timing/order, boundary, and error flows. Assign `SCN-*` IDs and link requirements/invariants. Gherkin is living documentation; do not add Cucumber unless approved.

## Phase 6 — Invariant catalogue and framework-aware test plan

**Mandatory specialist:** `property-based-testing`

Define `INV-*` properties for conservation, solvency, accounting, authorization, state safety, monotonicity, bounded losses, rounding, replay/idempotency, emergency/governance/upgrades, and integration assumptions.

For each property specify expression, scope, assumptions, exceptions, observables, actions, adversarial sequences, deterministic examples, framework-native implementation location, shrinking/replay strategy, and required seed/corpus persistence.

Framework mapping:

- Hardhat 2: use existing compatible facilities; request approval before adding a property tool or Foundry sidecar.
- Hardhat 3: prefer existing Solidity fuzz/invariant tests or repository-native TypeScript strategy according to official Hardhat skill and current layout.
- Foundry: prefer Forge fuzz/invariant tests, handlers, ghost variables, targets/selectors, and persisted failures according to `foundry-solidity`.
- Hybrid: assign each property to one authoritative harness; avoid duplicate fuzz engines without rationale.

Write `07-test-strategy.md` and `08-traceability-matrix.md`.

### Review Gate B

Require explicit approval of requirements, architecture/trust/asset/math/state models, privilege matrix, BDD examples, invariants, framework allocation, test strategy, and traceability. No normative test exists before approval.

## Phase 7 — Characterization tests

**Mandatory specialist:** `working-with-legacy-code`

Use the selected framework specialist and policy to implement characterization tests in the repository's native framework/language. Cover initialization, upgrades, permissions, success/reverts, events, accounting, rounding, boundaries, emergency modes, callbacks/tokens, block/time dependencies, and ordering flows. Mark conflicts as characterization and cite divergence decisions.

## Phase 8 — Framework-native deterministic specification tests

**Mandatory specialists:** framework-routed specialist(s) from the routing table.

Activate the specialist together with its local policy. Implement approved BDD/specification, unit, integration, access, state-transition, accounting, external-integration, pinned fork, and regression tests in the existing framework.

Every normative test references `SCN-*` and/or requirement IDs plus related `INV-*`, `FLOW-*`, `STATE-*`, or `REG-*`. Assert state, assets, events, and reverts. Report implementation gaps; do not alter production contracts.

## Phase 9 — Stateful property and invariant tests

**Mandatory specialists:** `property-based-testing` plus framework-routed specialist(s).

Implement the smallest viable native harness. Never add another framework merely for convenience. Any new tool requires approval. Never weaken an invariant. Preserve failing seeds, counterexamples, action sequences, fork state, and reproduction commands.

## Phase 10 — Optional ADR capture

**Optional capability:** `adr-writing`; recommended skill `documentation-and-adrs`.

Only when requested and a new material decision is made. Never fabricate historical rationale. Follow existing ADR conventions or propose one for approval.

## Phase 11 — Security-readiness review

**Mandatory specialist:** `secure-workflow-guide`

Perform a non-destructive gate covering static checks, storage/upgrades, authorization, documented properties, external calls/reentrancy, ordering/MEV, oracle/economic/math/rounding, framework configuration, deployment, and requirement-code-test gaps. Findings cite requirements/invariants/scenarios and required regressions. This is not a substitute for an independent audit.

# Completion contract

Complete only when:

- framework detection and specialist routing are recorded and justified;
- all required specialists were loaded;
- optional specialists ran only when requested/applicable;
- framework, language, module, compiler, and dependency baselines were preserved;
- divergences are decided or explicitly open;
- requirements, architecture, privileges, scenarios, assets, states, and invariants are traceable;
- each critical requirement has executable verification;
- characterization and normative tests are separated;
- each invariant has one authoritative harness in hybrid repos;
- fork tests are pinned and fuzz failures reproducible;
- failing normative tests are reported, not normalized;
- no historical rationale was fabricated;
- `STATUS.md` accurately records work, failures, approvals, and next actions.
