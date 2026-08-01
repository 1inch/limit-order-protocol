# Hardhat 3 preservation and testing policy

Load the official `hardhat` Agent Skill first. This file constrains it for brownfield reconstruction.

## Preserve

- exact Hardhat 3 and plugin versions;
- declarative config and existing plugin list;
- ESM/module and TypeScript conventions actually used;
- selected connection/toolbox APIs (`viem`, `ethers`, or custom);
- current split between Solidity and TypeScript tests;
- compiler profiles, build profiles, network types, hooks, Ignition/deployment tooling, and coverage configuration.

## Test routing

- Solidity tests: use the repository's `.t.sol` conventions, supported cheatcodes, fuzz/invariant facilities, and existing helpers.
- TypeScript tests: use the repository's configured test runner, toolbox companion, `network.create()` pattern, helpers, and current assertion style.
- Use the official companion skill only when its package is detected.
- Compile/build and typecheck using existing scripts before claiming success.

## Prohibited

- migrating from/to Hardhat 2 or Foundry;
- introducing a toolbox or changing viem ↔ ethers;
- converting JavaScript/TypeScript/Solidity test layers for stylistic preference;
- copying Hardhat 2 APIs or plugins into Hardhat 3;
- changing config, build profiles, dependencies, or production contracts without explicit scope.

Pin fork tests to exact block and network. Preserve failing reproduction commands and seeds.
