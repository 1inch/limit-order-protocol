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
- **Use `yarn test:ci`, not `yarn test`, for a full green run.** `yarn test` passes
  `--parallel`, which disables `hardhat-tracer` (and the gas reporter). Two tracer-based
  `wip` tests in `test/LimitOrderProtocol.js` (`should swap fully/half based on signature`)
  then fail with `Cannot read properties of undefined (reading 'top')`. They pass under the
  non-parallel `yarn test:ci`, which is what CI runs.
- The `Network '<name>' not registered` lines printed during `compile`/`run` are expected
  when no RPC/`.env` config is present. They are harmless for local development and testing.
- `yarn lint` currently fails on a pre-existing issue on `master`:
  `deploy/deploy-Permit2Proxy.js` uses `getNamedAccounts` without importing it from `hre`
  (`no-undef`). This is a repo code issue, not an environment problem; the lint tooling
  itself works.
- Node: CI uses Node 20; Node 22 also works for compile/test/run in this environment.
