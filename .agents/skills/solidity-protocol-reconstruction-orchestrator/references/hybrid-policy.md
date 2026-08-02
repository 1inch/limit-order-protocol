# Hybrid Hardhat + Foundry policy

A hybrid repository keeps both frameworks. Do not choose a winner or migrate one into the other.

## Ownership matrix

Before test implementation, create a matrix of:

- existing test directory/file pattern;
- framework command and CI job;
- test category currently owned;
- helpers/fixtures and dependencies;
- proposed new coverage and rationale.

Use the current architecture as the default. A common, but not mandatory, split is:

- Hardhat: JavaScript/TypeScript orchestration, integration, deployment, plugin-dependent, and operational flows.
- Foundry: Solidity unit, fuzz, invariant, gas, and low-level fork tests.

## Single-authority rule

Each requirement and invariant has one authoritative executable harness. Cross-framework duplicate tests are allowed only for intentionally different concerns, such as:

- a Foundry mathematical property plus a Hardhat end-to-end integration scenario;
- compatibility validation against separate deployment stacks;
- a critical regression independently reproduced by both tools.

Document why duplication exists. Do not maintain two equivalent fuzz/invariant harnesses by default.

## Shared contracts

Preserve compiler compatibility and shared source layout. Do not edit configs merely to make both tools use identical defaults. Record any current differences in optimizer, EVM, remappings, preprocessing, or generated sources because they may produce semantically different builds.

## Shared-compiler-divergence check

Both toolchains compile the same sources with independent settings. When those
settings differ, the two suites test different bytecode, and a test passing
under one framework says nothing about the other. Run this check in Phase 0 and
record the result in `00-baseline.md`.

Compare, per setting:

| Setting | Hardhat | Foundry |
|---|---|---|
| solc version and per-file overrides | `solidity` in the config (executable; read it) | `solc` / `solc_version`, `auto_detect_solc` |
| optimizer enabled and `runs` | `settings.optimizer` | `optimizer`, `optimizer_runs` |
| `viaIR` | `settings.viaIR` | `via_ir` |
| EVM version | `settings.evmVersion` | `evm_version` |
| metadata and bytecode hash | `settings.metadata` | `bytecode_hash`, `cbor_metadata` |
| library links | config or deploy scripts | `libraries` |
| remappings | plugin or `node_modules` resolution | `remappings.txt` or `remappings` |
| source path | `paths.sources` | `src` |

`scripts/detect-project-stack.sh` reports the Foundry side. It reports
`SOLC_SOURCE=manual-inspection-required` for the Hardhat side because those
settings only exist after the config executes: read the config, or print the
resolved values with the repository's own command.

For each difference record whether it changes semantics:

- optimizer runs and `viaIR` change gas and can change revert behaviour at the
  stack and code-size limits;
- EVM version changes available opcodes and can change gas;
- solc version changes overflow, ABI decoding, and custom error behaviour;
- metadata settings change deployed bytecode and address prediction under
  `CREATE2`.

Any semantic difference goes into the ownership matrix: a property must be
verified under the settings that ship. If gas or size assertions exist, they are
only valid under the build that produces them. Do not reconcile the configs;
report the divergence.

## CI job mapping

Ownership on disk is not ownership in practice. What CI runs is what is
enforced. Map, from the workflow files:

| Column | Content |
|---|---|
| Job / workflow | file and job name |
| Command | exact command, including profile and flags |
| Framework | Hardhat or Foundry |
| Scope | paths, tags, or match patterns |
| Blocking | required check or advisory |
| Triggers | push, pull request, schedule, manual |

Then flag:

- test directories no CI job runs;
- a framework that runs only on a schedule or manually, so its failures do not
  block a merge;
- fuzz or invariant runs configured with far fewer runs in CI than locally, or
  the reverse;
- coverage or gas jobs that are advisory while presented as gates;
- a `FOUNDRY_PROFILE` in CI that differs from the local default;
- fork jobs that are skipped when a secret is absent, which silently removes
  coverage on forks and outside contributors' branches.

New tests belong in a job that already runs. A test added to a directory no CI
job executes is not coverage. If the correct job does not exist, say so in the
implementation report and propose it; do not edit CI as part of this workflow.
