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

## Positive guidance

The routed `web3-testing` specialist is generic Hardhat and Foundry material.
This section is the concrete Hardhat 2 guidance for this workflow. Use only what
the repository already has installed; nothing below authorizes a new dependency.

### State isolation with `loadFixture`

When `@nomicfoundation/hardhat-network-helpers` is installed, `loadFixture` is
the default isolation mechanism. It snapshots after the first run and reverts to
that snapshot for every later test, which is both faster and stricter than
redeploying in `beforeEach`.

```js
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

async function deployProtocolFixture () {
    const [owner, maker, taker] = await ethers.getSigners();
    const token = await ethers.deployContract('MockERC20', ['T', 'T']);
    const protocol = await ethers.deployContract('Protocol', [await token.getAddress()]);
    return { owner, maker, taker, token, protocol };
}

it('SCN-014 reverts when filling an expired order', async function () {
    const { protocol, taker } = await loadFixture(deployProtocolFixture);
    // ...
});
```

Rules for fixtures:

- A fixture must be a pure function of its inputs: no closure over mutable outer
  state, no reliance on a previous test having run.
- Return every handle the test needs. Do not reach for module-level variables.
- Never call `loadFixture` outside a test body (not in `describe`, not in
  `before`); the snapshot is taken relative to the current chain state.
- Compose fixtures by calling one from another rather than by mutating a shared
  base.
- Match the repository's existing style. If the suite uses `beforeEach`
  deployment consistently, adding fixtures to some files only creates two
  conventions; propose the change instead.

### Time and block control

With `hardhat-network-helpers`, use `time.increase`, `time.increaseTo`,
`time.latest`, `time.setNextBlockTimestamp`, and `mine`. Prefer
`setNextBlockTimestamp` over `increase` when the assertion depends on an exact
timestamp, because `increase` mines a block and leaves the next one implicit.
Read the current timestamp from the chain; never from `Date.now()`.

For sequences that must land in one block, use `network.provider.send` with
`evm_setAutomine` false and re-enable it afterwards, and restore automine in a
`finally` so a failure does not leak the setting into the next test.

### Revert assertions

With `@nomicfoundation/hardhat-chai-matchers` installed:

```js
await expect(protocol.connect(taker).fill(order))
    .to.be.revertedWithCustomError(protocol, 'OrderExpired')
    .withArgs(order.hash, deadline);
```

- Assert the custom error, not a bare `reverted`.
- Use `withArgs` whenever the error carries arguments; an error name alone does
  not distinguish which check failed.
- `revertedWithCustomError` needs the contract that *defines* the error. When the
  error is defined in a library or an inherited contract, pass the artifact that
  declares it, otherwise the matcher cannot decode it.
- Use `revertedWithPanic` for arithmetic and array panics rather than matching
  the raw panic string.
- `revertedWith` is for string `require` reasons only, which modern contracts
  rarely use.
- Assert reverts through the same call path the user takes. A revert asserted on
  a `staticCall` may not reproduce a revert that only happens during state
  writes.

### Event and state assertions

```js
await expect(tx).to.emit(protocol, 'OrderFilled').withArgs(orderHash, taker.address, amount);
await expect(tx).to.changeTokenBalances(token, [maker, taker], [-amount, amount]);
await expect(tx).to.changeEtherBalances([taker], [-value]);
```

- Always pair `emit` with `withArgs`. An event assertion without arguments passes
  for the wrong order, the wrong amount, and the wrong caller.
- Use `anyValue` from `hardhat-chai-matchers/withArgs` only for genuinely
  unpredictable values, and assert the rest.
- Assert asset movement with the balance matchers rather than by reading
  balances before and after, which misses intermediate transfers.
- Every event assertion needs a companion state assertion. Events are a claim;
  storage is the fact.
- Assert the absence of effects on revert paths: no balance change, no state
  change, no event.

### Deployment fixtures with `hardhat-deploy`

When the repository uses `hardhat-deploy`, its deployment scripts are the
authoritative wiring. Use `deployments.createFixture` or
`deployments.fixture([tag])` so tests exercise the same deployment path as
production, instead of hand-deploying a divergent configuration in the test.

- Use the repository's existing tags; do not add tags to make a test easier.
- `deployments.fixture` with no argument runs everything, which is slow and
  couples tests to unrelated deployments. Scope it to the tags you need.
- If the deployment script and the test disagree about constructor arguments,
  that is a finding, not something to paper over in the test.

### `--parallel`

Mocha's parallel mode runs each test *file* in a separate worker process.

- State is isolated per worker, so fixtures and snapshots do not cross files, but
  anything shared through module scope, a temp file, a fixed port, or a fixed
  fork block cache can collide.
- Root-level hooks do not apply across workers, and `.only` does not work in
  parallel mode.
- Ordering between files is not deterministic. A test that passes only in serial
  order is order-dependent and must be recorded as such.
- Reported durations and gas reporter totals differ between modes.
- Record both the parallel and serial commands in the baseline when the
  repository defines both, and diagnose failures serially before concluding
  anything. Never change the default mode to make a new test pass.

### `solidity-coverage` caveats

- Coverage instrumentation rewrites the contracts, which changes gas, can exceed
  the contract size limit, and disables or perturbs optimizer and `viaIR`
  behaviour. Tests asserting gas or code size can fail only under coverage.
- Instrumented reverts can lose custom error data, so `revertedWithCustomError`
  assertions sometimes behave differently under coverage.
- `.solcover.js` in the repository is part of the baseline: do not edit its
  `skipFiles`, `configureYulOptimizer`, or `mocha` settings to raise a number.
- Coverage of a modifier or a library does not imply coverage of the branch
  through the calling contract. Read per-branch, not per-line.
