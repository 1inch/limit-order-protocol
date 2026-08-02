# Changelog

## 5.0.0

### Added

- Phase 6A, an audit of the test suite that already exists, with
  `references/test-audit-policy.md`: inventory, baseline run, coverage and gas
  baselines, quality heuristics, and a gap matrix keyed by requirement, entry
  point, and invariant. It runs before Phase 6 so its gaps drive the test
  strategy. Existing tests are never modified, skipped, or deleted.
- Gate C before Phase 11, so `security-review` has a recorded approval to check.
- `references/artifacts.md`, defining every output file, its phase, its
  template, and git hygiene.
- `references/id-registry.md`, defining every identifier namespace. `FLOW-*` and
  `REG-*` were required by Phase 8 but never defined; `EP-*` and `DIV-*` were
  used implicitly. State-machine states are now `SM-*`, resolving the collision
  with the `STATE-*` requirement prefix.
- `references/bdd-policy.md`, replacing the external `bdd-practices`
  dependency.
- Templates under `assets/` for `STATUS.md`, the traceability matrix, the
  existing-test audit, divergence decisions, and requirement entries.
- A resume algorithm, a mode-to-phase table, test placement conventions per
  framework, and fork-test credential handling.
- Requirement criticality, so the completion contract's "each critical
  requirement has executable verification" is checkable.
- `--format json` for the detector, and `scripts/lib/manifest.py`.
- A bash 3.2 portability lint in `validate-package.sh`, driven by
  `scripts/lib/bash32-lint.tsv`. macOS ships bash 3.2.57 as `/bin/bash`, and
  `bash -n` on a newer bash cannot catch bash 4+ constructs. A `require_bash`
  guard sits beside `require_python3`.
- `disable-model-invocation: true` and `argument-hint` in the frontmatter; the
  description now states when to invoke the skill.

### Changed

- `skill-dependencies.json` replaces `skill-dependencies.yaml` and is the single
  source of truth for the dependency graph, the per-mode required sets, and the
  package version. The graph was previously encoded in five places and had
  drifted between them. Sources are normalized to `owner/repo`.
- The detector classifies a corroborated Foundry repository as `foundry` even
  when a stale Hardhat config remains, instead of returning `unknown`; emits
  `DETECTION_EVIDENCE` and `AMBIGUITY_REASON`; requires `foundry.toml` plus a
  corroborating forge signal before reporting hybrid; resolves the module system
  definitively; reads Foundry paths from `foundry.toml`; and emits the stack
  preservation baseline.
- `check-dependencies.sh` accepts `resume`, reads required sets from the
  manifest, reports duplicate installations, and includes the framework
  specialist in `security-review`.
- `install-dependencies.sh` no longer passes `--agent` at all by default. It
  previously hardcoded `--agent cursor`, which installed specialists into
  `.cursor/skills/` while the orchestrator lived in `.agents/skills/`. The CLI's
  agent-to-path mapping changes between versions, so the flag is now omitted and
  the CLI auto-detects; `--agent` and `--yes` are exposed as pass-throughs and
  the preview prints the orchestrator's install root to check against.
- `validate-package.sh` reads the version from the manifest, cross-checks the
  manifest against the documentation and the scripts, asserts artifact
  templates, and no longer mutates the tree during validation.
- The Hardhat 2, Hardhat 3, Foundry, and hybrid policies gained positive
  guidance alongside their prohibitions.

### Removed

- `bdd-practices` as a mandatory dependency. It came from a crawler-built
  aggregator rather than an authoritative publisher, its body was not in
  English, and it was the only base dependency absent from `skills-lock.json`.
  Removing it from the manifest does not remove any installed copy from disk.
- `skill-dependencies.yaml`.

### Fixed

- `check-dependencies.sh resume` exited 2 with `Unknown argument: resume` while
  `SKILL.md` instructed the agent to run it.
- `install-dependencies.sh` installed specialists into `.cursor/skills/` while
  the orchestrator lived in `.agents/skills/`, which produced a stale duplicate.
- Duplicate skill installations resolved silently to whichever root was scanned
  first, so `STATUS.md` could record the wrong path.
- The detector's `JS_TEST_FILES` counted only `.js`, dropping `.cjs` and `.mjs`,
  while the markdown table printed the sum. Both counts were also misnamed, as
  they included `scripts/`, `deploy/`, `tasks/`, and `ignition/`.
- The `.t.sol` score check looked only at `test/` while the file count looked at
  `test/` and `tests/`.
- `MODULE_SYSTEM` reported `commonjs-or-project-defined`, which the Hardhat 2
  policy depends on being definite.
- `SKILL.md` listed `unknown` as a profile to resolve to, while both scripts
  exit 3 on it.
- `README.md` told the reader to install into `.cursor/skills/` while every
  command example used `.agents/skills/`.
- bash 3.2 compatibility, so the scripts run on stock macOS. The detector had a
  heredoc directly inside a command substitution, which bash 3.2 cannot parse:
  it failed the whole file with `unexpected EOF while looking for matching`
  pointing at an unrelated line 500 lines away, which in turn made every
  `check-dependencies.sh` mode exit 3. `mapfile` in the detector and in
  `check-dependencies.sh`, and `declare -A` in `validate-package.sh`, are bash 4
  only; the associative array degraded into an arithmetic error and then
  reported `ok`, a false pass on the artifact-template check. Also dropped
  `find -print -quit` and bare `mktemp`, neither of which is portable to BSD
  userland.

## 4.0.0

- Added automatic Hardhat 2, Hardhat 3, Foundry, and hybrid framework routing.
- Added official Hardhat 3 `hardhat` skill and conditional toolbox companion routing.
- Added `foundry-solidity` specialist and Foundry-native fuzz/invariant/fork policy.
- Added framework, Hardhat 3, Foundry, and hybrid policy references.
- Expanded stack detector with framework evidence and machine-readable output.
- Updated dependency install/check scripts for auto-detection, explicit override, and all-framework installation.
- Preserved JavaScript, TypeScript, Solidity tests, CommonJS, ESM, and mixed layouts.

## 3.0.0

- Added mandatory BDD and optional arc42/ADR stages.
- Added JavaScript and TypeScript preservation.
