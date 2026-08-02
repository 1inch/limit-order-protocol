# Solidity Protocol Reconstruction Orchestrator v5

A project-level Agent Skill for reconstructing, documenting, and testing existing Solidity protocols. It auto-detects and preserves:

- Hardhat 2
- Hardhat 3
- Foundry
- existing Hardhat + Foundry hybrid repositories
- JavaScript, TypeScript, Solidity tests, CommonJS, ESM, and mixed layouts

It never migrates a framework, never converts a language or module system, and never changes production contracts.

## Framework routing

| Repository | Testing skill |
| ---------- | ------------------------------------------------------------------- |
| Hardhat 2  | `web3-testing` + local HH2 compatibility policy                     |
| Hardhat 3  | official `hardhat` skill, plus detected official toolbox companion  |
| Foundry    | `foundry-solidity`                                                  |
| Hybrid     | both applicable specialists with a single-authority coverage matrix |

## Installation

This skill is agent-agnostic. Install it into the skills directory your agent reads:

```text
.agents/skills/solidity-protocol-reconstruction-orchestrator/
```

Cursor, Codex, Gemini CLI, and several other clients read `.agents/skills/` directly. Use `.cursor/skills/` or `.claude/skills/` only if your client requires it, and keep exactly one copy: a duplicate installation makes `check-dependencies.sh` warn, because a stale copy can otherwise win path resolution silently.

`skill-dependencies.json` is the single source of truth for the specialist dependency graph, the per-mode required sets, and the package version. The scripts read it; nothing is hardcoded. `python3` is the only external requirement.

## Detect project stack

```bash
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/detect-project-stack.sh
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/detect-project-stack.sh --format env
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/detect-project-stack.sh --format json
```

Reports the framework profile, `DETECTION_EVIDENCE`, `AMBIGUITY_REASON`, host language, module system, and the stack preservation baseline (Foundry paths, remappings, forge-std, FFI, `fs_permissions`, RPC aliases, fuzz and invariant settings, package manager, compiler settings).

Exits 0 even when the profile is `unknown`; read `AMBIGUITY_REASON`. Prefer `--format json` for parsing. `FOUNDRY_VERSION` is empty when `forge` is not installed, which is not evidence against a Foundry repository. `SOLC_SOURCE=manual-inspection-required` means the Solidity settings live in an executable Hardhat config and must be read by hand.

## Check dependencies

```bash
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/check-dependencies.sh full
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/check-dependencies.sh resume
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/check-dependencies.sh analyze --framework hardhat3 --with-optional
```

Modes: `check`, `analyze`, `implement-tests`, `security-review`, `full`, `resume`.

| Exit | Meaning |
| ---- | ------- |
| 0 | every requested skill resolved |
| 1 | at least one requested skill is missing |
| 2 | usage error |
| 3 | framework profile could not be resolved |
| 4 | `python3` missing or manifest unreadable |

It reports every install root a skill was found in, warns on duplicates, and flags skills the orchestrator must never activate.

## Install dependencies

Preview the commands (nothing is executed):

```bash
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/install-dependencies.sh
```

Apply them:

```bash
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/install-dependencies.sh --apply
```

Select a profile, or install every framework specialist:

```bash
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/install-dependencies.sh --framework foundry --apply
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/install-dependencies.sh --all-frameworks --apply
```

Optional architecture and ADR skills:

```bash
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/install-dependencies.sh --apply --with-optional
```

After `--apply` the script re-runs `check-dependencies.sh` and reports the result.

### `--agent`

`npx skills add` installs into the directory belonging to the agent you name, and that mapping has changed between CLI versions. The script therefore derives the target from the directory the orchestrator itself is installed under, so the specialists land beside it:

| Orchestrator location | Derived `--agent` |
| --------------------- | ----------------- |
| `.agents/skills/` | `universal` |
| `.cursor/skills/` | `cursor` |
| `.claude/skills/` | `claude-code` |

Override with `--agent <name>[,<name>]`, `--agent '*'` for every agent, or `--agent auto` to let the CLI auto-detect. `--yes` is passed through for non-interactive use.

### Restoring from a lockfile

If the repository already has a `skills-lock.json` pinning this exact set, restore it directly instead of resolving sources again:

```bash
npx skills experimental_install
```

## Validate the package

Run after editing this skill:

```bash
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/validate-package.sh
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/validate-package.sh --fix
```

It checks that all required files exist, that the frontmatter is intact, that the version in `skill-dependencies.json` matches `SKILL.md`, `README.md`, and `CHANGELOG.md`, that every manifest skill is documented and every requested skill is in the manifest, that every artifact named in `SKILL.md` is defined in `references/artifacts.md` and has a template where one is expected, that every reference is linked from `SKILL.md`, that `SKILL.md` stays under 500 lines, and that the scripts parse and are executable. It does not modify the tree; `--fix` only sets the executable bit.

## Output

The workflow writes to `docs/protocol-reconstruction/`:

| Path | Phase |
| ---- | ----- |
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

Templates for `STATUS.md`, the traceability matrix, the test audit, divergence decisions, and requirement entries are in `assets/`. The agent proposes these files; it does not commit them.

## Invocation

```text
/solidity-protocol-reconstruction-orchestrator analyze
/solidity-protocol-reconstruction-orchestrator full --with-optional
/solidity-protocol-reconstruction-orchestrator implement-tests --framework foundry
/solidity-protocol-reconstruction-orchestrator resume
```

| Mode | Phases | Gates |
| ---- | ------ | ----- |
| `check` | none | none |
| `analyze` | 0, 1, 2, 3, 4, 5, 6A, 6 | A, B |
| `implement-tests` | 7, 8, 9 | requires Gate B |
| `security-review` | 11 | C |
| `full` | 0-11 | A, B, C |
| `resume` | from `STATUS.md` | as recorded |

The skill sets `disable-model-invocation: true`, so it runs only when invoked explicitly.

`--framework` is normally unnecessary. Use it only when auto-detection is ambiguous, and record the reason.
