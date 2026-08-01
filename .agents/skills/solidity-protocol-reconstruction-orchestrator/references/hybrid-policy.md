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
