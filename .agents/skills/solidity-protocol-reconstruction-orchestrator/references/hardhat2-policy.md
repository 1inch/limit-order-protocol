# Hardhat 2 and host-language compatibility policy

Apply this policy whenever a specialist suggests commands, code, tests, fixtures, or dependencies.

## Detect before acting

Read and preserve:

- `package.json` and lockfile;
- `hardhat.config.js`, `.cjs`, `.mjs`, or `.ts`;
- JavaScript versus TypeScript host language;
- CommonJS versus ESM module mode;
- `tsconfig.json` only when present;
- exact Hardhat and plugin versions;
- ethers v5/v6;
- TypeChain only when installed;
- Solidity compiler versions, overrides, optimizer, `viaIR`, `evmVersion`, and metadata;
- fixtures, deployment framework, fork setup, coverage, and test conventions.

Run `scripts/detect-project-stack.sh` as a baseline aid, but verify its conclusions against repository files.

## Forbidden implicit changes

Do not implicitly:

- migrate to Hardhat 3;
- change ethers major version;
- convert JavaScript to TypeScript or TypeScript to JavaScript;
- change CommonJS/ESM mode;
- add TypeScript, `ts-node`, `@types/*`, or TypeChain to JavaScript repositories;
- remove typing from TypeScript repositories;
- update OpenZeppelin, proxy packages, Solidity, or compiler settings;
- replace Mocha/Chai or current fixtures;
- replace deployment tooling;
- adopt Foundry as a replacement for Hardhat;
- copy package versions from generic examples.

Foundry, Echidna, Medusa, or other tools may be added only as explicitly approved complementary harnesses.

## JavaScript rules

- Use `.js`, `.cjs`, or `.mjs` according to existing conventions.
- Preserve `require`/`module.exports` in CommonJS repositories.
- Preserve `import`/`export` only in repositories already configured for ESM.
- Do not emit interfaces, generics, casts, type imports, annotations, or TypeChain types.
- Do not assume `tsconfig.json` exists.
- Optional JSDoc or `// @ts-check` requires explicit approval.

## TypeScript rules

- Use existing `.ts` conventions, compiler settings, path aliases, and type-generation setup.
- Preserve ethers/TypeChain versions and generated type import patterns.
- Do not introduce stricter compiler flags or migrate module settings as part of testing.
- Avoid `any` only where consistent with the repository; do not redesign typing during reconstruction.

## Mixed repositories

Some repositories use JavaScript config/deployment scripts and TypeScript tests, or the reverse. In this case:

1. classify each subsystem separately;
2. follow the nearest established convention for each new file;
3. do not normalize the repository to one language;
4. document the decision in the baseline and `STATUS.md`.

## Hardhat 2 testing rules

- Use APIs supported by installed versions.
- Prefer existing scripts and fixture patterns.
- Isolate state with supported snapshots/fixtures.
- Avoid shared mutable state.
- Assert state, assets, events, custom errors/reverts, and permissions.
- Pin fork chain ID and exact block number.
- Never rely on `latest` chain state in CI.
- Keep characterization tests separate from approved specification tests.
- Treat coverage as a gap signal, not proof of correctness.
- Do not add Cucumber merely because BDD scenarios exist; Mocha tests can implement those scenarios directly.
