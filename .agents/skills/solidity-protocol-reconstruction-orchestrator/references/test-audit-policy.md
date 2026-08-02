# Existing test-suite audit policy

Phase 6A assesses the test suite that already exists, before Phase 6 plans new
tests and long before Phases 7-9 write any. Its output,
`06-existing-test-audit.md`, tells the test strategy what is already covered,
what is covered weakly, and what is not covered at all.

## Hard rules

- Never modify, rename, skip, or delete an existing passing test. Record a
  proposal instead; the reviewer decides.
- Never change an existing test to make it pass, and never relax an assertion,
  a tolerance, or a fuzz constraint.
- Never regenerate or edit `.gas-snapshot`, coverage baselines, or committed
  fixtures.
- A failing existing test is a finding, not a task. Record the failure, its
  command, and its output. Do not fix it inside this workflow.
- Run only commands the repository already defines. Do not add scripts,
  dependencies, plugins, or reporters to make measurement easier.

## 1. Test inventory

One row per test file:

| Field | Content |
|---|---|
| File | path relative to repository root |
| Framework | Mocha/Hardhat, `node:test`, Forge Solidity, other |
| Layer | unit, integration, fork, fuzz, invariant, deployment, upgrade, gas |
| Contracts touched | production contracts exercised, not mocks |
| Style | fixture-based, `beforeEach` deployment, shared state, snapshot |
| Approx. assertions | count of meaningful assertions, not statements |

Record the totals per framework and per layer. In a hybrid repository, record
which framework currently owns each contract, because Phase 6 must not duplicate
ownership.

## 2. Baseline run

Run the repository's own commands, unchanged:

- the declared test command (`package.json` scripts, `Makefile`, `justfile`, CI
  workflow);
- each framework's command separately in a hybrid repository.

Record for each: exact command, exit code, pass/fail/skipped counts, wall-clock
duration, and the git commit it ran against. Attach the failing output verbatim.

Flakiness signals to look for and record:

- tests that depend on `block.timestamp`, `Date.now()`, or real time;
- unpinned fork tests, which change behaviour with chain head;
- tests whose result depends on execution order or on a sibling's state;
- unseeded randomness in fixtures or inputs;
- network calls to a live RPC endpoint or an external API;
- `--parallel` interactions (see below).

Where a failure is plausibly flaky, re-run that command once and record both
results. Do not re-run repeatedly to obtain a green result.

## 3. Coverage baseline

Coverage is a gap signal, never proof of correctness. High line coverage with
weak assertions is worse than low coverage, because it hides the gap.

| Profile | Command | Caveats |
|---|---|---|
| Hardhat 2 | `npx hardhat coverage` (`solidity-coverage`) | instruments the bytecode; gas, optimizer, and `viaIR` behaviour differ from a normal run. Tests that assert gas or rely on exact revert bubbling can fail only under coverage. |
| Hardhat 3 | the repository's configured coverage command | coverage support differs by version and runner; if none is configured, record "not configured" rather than adding one. |
| Foundry | `forge coverage` | under `viaIR` it may need `--ir-minimum`, which changes optimization and can shift results; see `foundry-policy.md`. |

Only run coverage if the repository already configures it. Record the command,
the summary numbers, and the caveat that applied. Report per-contract coverage
for production contracts; ignore mocks and test helpers.

If coverage cannot run, record why. An unavailable baseline is a valid result.

## 4. Gas baseline

Only where already configured:

- Foundry: `forge snapshot --check` against the committed `.gas-snapshot`, or
  `forge test --gas-report`. Never write a new snapshot.
- Hardhat: `hardhat-gas-reporter` output when the plugin is installed and
  enabled.

Record the baseline so Phases 7-9 can show that added tests did not change
production gas. Gas numbers are not assertions unless the repository already
treats them as such.

## 5. Quality heuristics

Flag each of these where present; each is a finding with a file and line:

- **Smoke test without assertions.** Calls a function and asserts nothing, or
  asserts only that the transaction did not revert.
- **Missing revert assertion.** A negative path that does not assert the specific
  custom error or revert reason, or uses a bare `reverted` where the contract
  defines a custom error.
- **Missing event assertion.** State-changing paths that emit events the tests
  never check, including the argument values.
- **Missing state assertion.** Asserts a return value or an event but never reads
  the resulting storage, balance, or accounting state.
- **Shared mutable state.** Tests that depend on a contract deployed once for the
  whole file and mutated by earlier tests; ordering-dependent and hostile to
  parallel and `.only` runs.
- **Unpinned fork.** A fork test without a fixed block number, or falling back to
  chain head when an RPC variable is unset.
- **Over-mocking.** Mocks that stand in for the protocol's own contracts, so the
  test exercises the mock's behaviour rather than the protocol's. Mocking a
  genuinely external dependency is legitimate; record it as an `INT-*`
  assumption instead.
- **Assertion on the wrong subject.** Asserting a mock's call count where the
  requirement is about resulting state.
- **Duplicate coverage across frameworks** in a hybrid repository, with no stated
  reason.
- **`--parallel` hazards.** When the repository runs tests in parallel, flag
  shared fixtures or snapshots crossing worker boundaries, tests relying on
  global mutable module state, `.only`/root hooks that do not apply per worker,
  and any file whose result changes between serial and parallel runs. Record
  both commands where the repository defines a serial variant; do not change
  the default.

## 6. Gap matrix

The deliverable. One row per requirement, entry point, and invariant, keyed by
`FR-*`/`SEC-*`/..., `EP-*`, and `INV-*`. Assign one verdict:

| Verdict | Meaning |
|---|---|
| `COVERED` | An existing test exercises it and asserts the resulting state, assets, events, and reverts. |
| `PARTIAL` | Exercised on some paths only: happy path but not failure, one role but not others, one branch of a boundary. |
| `UNCOVERED` | No existing test exercises it. |
| `WEAK_ASSERTION` | Exercised, but the assertions do not distinguish correct behaviour from incorrect. |
| `CHARACTERIZATION_ONLY` | Pins current behaviour without establishing that the behaviour is correct, including tests that encode a known divergence. |

Each row cites the test files that justify the verdict, and each non-`COVERED`
row gets a `GAP-*` ID. Rows are inputs to Phase 6: `UNCOVERED` and `PARTIAL`
drive new specification tests, `WEAK_ASSERTION` drives assertion strengthening
proposals, and `CHARACTERIZATION_ONLY` rows must reference a `DIV-*` decision or
become an open question.

Requirements whose verdict cannot be determined are `UNCOVERED` with a note. Do
not guess in favour of coverage.

## 7. Proposals

Improvements to existing tests are recorded in a separate section of
`06-existing-test-audit.md`, never applied in this phase:

- which file and test;
- the weakness, quoting the assertion;
- the proposed assertion or restructuring;
- the risk of the change, especially for shared fixtures;
- whether it needs its own reviewer approval.

Applying an approved proposal is a Phase 8 activity, and only after Gate B.
