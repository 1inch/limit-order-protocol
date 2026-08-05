# AGENTS.md

## Cursor Cloud specific instructions

This repo is the **1inch Limit Order Protocol** — EVM Solidity smart contracts built with
Hardhat. There is no long-running server or web app; "running the application" means
compiling contracts, running the test suite, and optionally spinning up a local Hardhat
blockchain to deploy/fill orders. The package manager is **yarn** (see `yarn.lock`).
Standard commands live in `package.json` `scripts` and the `Makefile`; prefer those.

Common commands:
- Compile: `yarn hardhat compile`
- Lint (ESLint + solhint): `yarn lint`
- Tests (full, reliable run): `yarn test:ci`
- Local blockchain: `yarn hardhat node`, then run scripts with `--network localhost`
- Coverage: `yarn coverage`

Non-obvious gotchas (durable):
- Both `yarn test` and `yarn test:ci` run green. They differ in one respect: `yarn test`
  passes `--parallel`, which disables `hardhat-tracer` (and the gas reporter), so the
  opcode-count assertions inside the two tracer-based `wip` tests in
  `test/LimitOrderProtocol.js` are skipped there. `yarn test:ci` is non-parallel, is what CI
  runs, and is the run that actually exercises those assertions — use it when changing
  contract code that could shift opcode counts.
- The `Network '<name>' not registered` lines printed during `compile`/`run` are expected
  when no RPC/`.env` config is present. They are harmless for local development and testing.
- Node: CI uses Node 20; Node 22 also works for compile/test/run in this environment.
