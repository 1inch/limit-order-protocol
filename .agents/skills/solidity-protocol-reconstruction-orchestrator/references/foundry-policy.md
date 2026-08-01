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

## Prohibited

- adding Hardhat or migrating to it;
- updating Foundry, forge-std, remappings, submodules, or dependencies;
- changing production contracts, compiler settings, profiles, permissions, or FFI;
- weakening invariants, increasing tolerances, or discarding failing seeds to obtain green tests.
