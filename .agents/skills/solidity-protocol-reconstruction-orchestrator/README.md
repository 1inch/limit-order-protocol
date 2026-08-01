# Solidity Protocol Reconstruction Orchestrator v4

A project-level Cursor Agent Skill for reconstructing and testing existing Solidity protocols. It auto-detects and preserves:

- Hardhat 2
- Hardhat 3
- Foundry
- existing Hardhat + Foundry hybrid repositories
- JavaScript, TypeScript, Solidity tests, CommonJS, ESM, and mixed layouts

## Framework routing


| Repository | Testing skill                                                       |
| ---------- | ------------------------------------------------------------------- |
| Hardhat 2  | `web3-testing` + local HH2 compatibility policy                     |
| Hardhat 3  | official `hardhat` skill, plus detected official toolbox companion  |
| Foundry    | `foundry-solidity`                                                  |
| Hybrid     | both applicable specialists with a single-authority coverage matrix |


The workflow never migrates between frameworks unless a separate migration task is explicitly requested.

## Installation

Copy the contained folder to:

```text
.cursor/skills/solidity-protocol-reconstruction-orchestrator/
```



## Detect project stack

```bash
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/detect-project-stack.sh
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/detect-project-stack.sh --format env
```



## Install dependencies

Auto-detect current repository and preview commands:

```bash
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/install-dependencies.sh
```

Install:

```bash
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/install-dependencies.sh --apply
```

Install for a specified profile or all framework specialists:

```bash
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/install-dependencies.sh --framework foundry --apply
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/install-dependencies.sh --all-frameworks --apply
```

Optional architecture and ADR skills:

```bash
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/install-dependencies.sh --apply --with-optional
```



## Check

```bash
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/check-dependencies.sh full
.agents/skills/solidity-protocol-reconstruction-orchestrator/scripts/check-dependencies.sh full --framework hardhat3 --with-optional
```



## Cursor invocation

```text
/solidity-protocol-reconstruction-orchestrator analyze
/solidity-protocol-reconstruction-orchestrator full --with-optional
/solidity-protocol-reconstruction-orchestrator implement-tests --framework foundry
```

`--framework` is normally unnecessary. Use it only when auto-detection is ambiguous and record the reason.