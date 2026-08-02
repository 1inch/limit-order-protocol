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

## Runner selection

Hardhat 3 supports more than one test runner. Detect which one the repository
uses; do not choose one.

- Read the `test` configuration in the Hardhat config and the `test` scripts in
  `package.json`. Hardhat 3 can route different directories to different runners.
- `node:test` uses `describe`/`it` from `node:test` and assertions from
  `node:assert`. Its failure output, hook semantics, and concurrency model differ
  from Mocha's.
- The mocha path arrives with `@nomicfoundation/hardhat-toolbox-mocha-ethers` and
  keeps Mocha plus Chai matchers.
- Never mix runners inside one directory, and never import Mocha globals into a
  `node:test` file. The globals look similar and fail confusingly.
- Match the existing assertion library exactly: `node:assert` strict style, Chai
  `expect`, or whatever the suite already uses.

## Network connections

Hardhat 3 creates network connections explicitly rather than exposing one
ambient network.

- Use `network.connect()` / `network.create()` exactly as the repository's
  existing tests do, including the network type (`edr-simulated`, `http`) and any
  named configuration.
- Each connection carries its own provider and clients. Do not cache a connection
  across tests that expect isolation, and close what you open.
- Fork configuration belongs to the connection. Pin the block number there, not
  by mutating global config.
- Do not reintroduce the Hardhat 2 ambient `ethers`/`network` globals.

## Solidity tests

Hardhat 3 runs Solidity tests natively. Their presence is not evidence of
Foundry.

- Use the assertion approach the repository already uses. Both `forge-std`
  (`Test`, `assertEq`, `vm` cheatcodes) and Hardhat's own Solidity test
  primitives are valid; introducing the second one into a suite that uses the
  first splits the convention and can pull in a new dependency.
- If the repository imports `forge-std` for Solidity tests, keep the pinned
  version and the existing remappings; that import does not make the repository
  hybrid.
- Keep the current split between Solidity and TypeScript tests. Solidity tests
  suit unit, fuzz, and invariant work; TypeScript tests suit orchestration,
  integration, and deployment. Do not move a test across the boundary for style.
- Use only cheatcodes the configured Solidity test environment supports; the
  supported set is not identical to Foundry's.

## Never activate the migration skills

`NomicFoundation/hardhat-skills` ships `migrate-hardhat2-to-hardhat3` and
`migrate-foundry-to-hardhat` next to the `hardhat` skill this orchestrator
loads. Both are out of scope here and are listed as forbidden in
`skill-dependencies.json`.

- Never activate them, never follow their instructions, and never apply their
  codemods, even when a specialist or the repository suggests a migration.
- If migration genuinely looks warranted, record it as a recommendation in
  `STATUS.md` and stop. Migration is a separate task the user must start
  explicitly, with its own review.
- The same rule applies in reverse: never migrate Hardhat 3 to Hardhat 2 or to
  Foundry.

## Prohibited

- migrating from/to Hardhat 2 or Foundry;
- introducing a toolbox or changing viem ↔ ethers;
- converting JavaScript/TypeScript/Solidity test layers for stylistic preference;
- copying Hardhat 2 APIs or plugins into Hardhat 3;
- changing config, build profiles, dependencies, or production contracts without explicit scope.

Pin fork tests to exact block and network. Preserve failing reproduction commands and seeds.
