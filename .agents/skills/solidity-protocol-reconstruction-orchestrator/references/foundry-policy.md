# Foundry preservation and testing policy

Load `foundry-solidity` first. This file constrains it for brownfield reconstruction.

## Preserve

- exact Foundry/Forge version where pinned or recorded;
- `foundry.toml` profiles and inline test configuration;
- source/test/script/out/cache paths;
- remappings, `lib/`, git submodules, and forge-std version;
- compiler, optimizer, via-IR, EVM, FFI, filesystem permissions, RPC aliases, sender, and fork configuration;
- existing test base contracts, helpers, naming, and CI commands.

## Native test layers

- deterministic unit/integration tests in `.t.sol`;
- fuzz tests with constrained inputs following repository conventions;
- invariant/stateful tests using handlers, ghost variables, actor modeling, target contracts/selectors/senders, and explicit failure replay;
- fork tests pinned to network and exact block;
- regression tests preserving counterexamples and issue IDs.

Prefer `bound` or existing constraints over excessive discarded inputs. Do not mock internal protocol behavior merely to raise coverage.

## Profiles

`FOUNDRY_PROFILE` selects a block from `foundry.toml`, and profiles routinely
differ in optimizer settings, fuzz runs, and `viaIR`.

- Run the profile CI runs. Read the workflow files; do not assume `default`.
- Record which profile produced every result you report. A fuzz run under a
  10-run local profile is not evidence about a 100000-run CI profile.
- Never add, rename, or edit a profile. If a measurement needs different
  settings, pass the flag on the command line for that one run and record it.

## Coverage

`forge coverage` is a gap signal only, and it is the most fragile command in the
Foundry toolchain.

- Under `via_ir = true`, coverage frequently fails to compile or reports
  misleading results. `forge coverage --ir-minimum` is the usual workaround, but
  it lowers optimization, so line mapping and reported hits differ from a normal
  build. Always record that the flag was used.
- Coverage counts execution, not verification. A line executed by a fuzz run with
  no assertion is covered and unverified.
- `--no-match-coverage` and `--match-path` change the denominator; report the
  exact command.
- Do not add coverage configuration or exclusions to improve a number.

## Gas snapshots

- `.gas-snapshot` is a committed baseline. Never regenerate it, never commit a
  changed one, and never run `forge snapshot` without `--check` unless the user
  asked for a new baseline.
- `forge snapshot --check` is the correct read-only comparison. A diff on a
  workflow that does not touch production contracts means a test changed
  something it should not have.
- Adding tests changes which snapshot entries exist. Report new entries as a
  proposal; do not write them into the file.

## Fuzz and invariant configuration

The knobs live in `[fuzz]` and `[invariant]`, per profile:

- `runs` — fuzz inputs per test, or invariant sequences per test.
- `depth` — calls per invariant sequence. Low depth cannot reach deep states; a
  passing invariant at depth 15 says little about a protocol whose interesting
  states need dozens of calls.
- `fail_on_revert` — with `true`, any reverting handler call fails the run, which
  forces precise handlers but makes the suite brittle. With `false`, reverts are
  silently discarded, so an invariant can "pass" while almost every call reverted.
  Always record the setting and the call/revert counts from the run.
- `shrink_run_limit`, `seed`, and the failure persistence directory determine
  reproducibility. Preserve `cache/fuzz` and `cache/invariant` failure entries and
  never delete a persisted counterexample.

Do not raise or lower these values in `foundry.toml`. Override on the command
line for a specific investigation and record the command.

## `vm.assume` versus `bound`

- `bound(x, min, max)` maps an input into range. It never discards, so every run
  does useful work. Prefer it for numeric ranges.
- `vm.assume(cond)` discards the run when the condition fails. Correct for sparse
  predicates such as `addr != address(0)` or "not one of these three addresses",
  where mapping has no natural meaning.
- Never use `vm.assume` for a range: rejecting most of the input space silently
  reduces effective runs and the test appears to pass.
- Watch the rejection counter. A test discarding most inputs is not testing what
  its name claims.
- Never widen a bound or add an assumption to make a failing fuzz test pass. A
  narrowed input space is a change to the property, and it needs the same
  approval as weakening an invariant.

## Prohibited

- adding Hardhat or migrating to it;
- updating Foundry, forge-std, remappings, submodules, or dependencies;
- changing production contracts, compiler settings, profiles, permissions, or FFI;
- weakening invariants, increasing tolerances, or discarding failing seeds to obtain green tests;
- regenerating `.gas-snapshot`, deleting persisted fuzz or invariant failures, or editing coverage exclusions.
