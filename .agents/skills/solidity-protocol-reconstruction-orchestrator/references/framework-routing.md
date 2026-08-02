# Framework detection and routing

## Profiles

### `hardhat2`

Evidence normally includes `package.json` with Hardhat major 2 and a Hardhat config. Activate:

- `web3-testing`
- `hardhat2-policy.md`

Treat generic or stale examples as non-authoritative. The installed repository versions and existing tests win.

### `hardhat3`

Evidence normally includes `package.json` with Hardhat major 3. Activate:

- official `hardhat` from `NomicFoundation/hardhat-skills`
- `hardhat3-policy.md`
- optionally `hardhat-toolbox-viem` when that package is present
- optionally `hardhat-toolbox-mocha-ethers` when that package is present

Hardhat 3 supports Solidity tests and TypeScript tests; preserve the repository's current allocation. Do not migrate tests between layers without a documented reason.

### `foundry`

Evidence normally includes `foundry.toml`, Forge scripts/configuration, or an established Forge test layout. Activate:

- `foundry-solidity`
- `foundry-policy.md`

Preserve profiles, remappings, libraries/submodules, FFI/filesystem permissions, fork aliases, and test naming.

### Hybrid profiles

A repository is hybrid only when there is strong configuration/tooling evidence for both frameworks. A `.t.sol` file alone does not prove Foundry because Hardhat 3 also runs Solidity tests.

Activate both framework specialists and `hybrid-policy.md`. Determine ownership from existing commands, directories, CI, and test imports. Examples:

- Hardhat JavaScript/TypeScript integration tests plus Foundry Solidity fuzz/invariant tests.
- Hardhat deployment/verification plus Foundry unit tests.

Do not collapse or migrate either side.

## Detection evidence priority

1. installed/declared framework versions and explicit config files;
2. package scripts, CI commands, and repository documentation;
3. test imports and helper libraries;
4. directory/file conventions;
5. executable availability only as weak environment evidence.

## Ambiguity rules

- `foundry.toml` alone does not make a repository hybrid. A Hardhat repository
  often carries one purely for remappings. Hybrid requires `foundry.toml` plus at
  least one corroborating signal: forge in package scripts, forge in CI,
  vendored `forge-std`, or `.t.sol` under a Foundry-configured test path.
- Hardhat 3 plus `.t.sol` without `foundry.toml` is Hardhat 3, not hybrid.
- `forge-std` imports can occur in Hardhat 3 Solidity tests; they are not sufficient alone.
- A Hardhat config with no resolvable Hardhat version is stale tooling. Where
  Foundry evidence is corroborated, the profile is `foundry` and the stale config
  is reported as ambiguity, not as a reason to return `unknown`.
- Forge signals without `foundry.toml` are reported as ambiguity; confirm before
  treating the repository as Foundry.
- `forge` not being installed says nothing about the repository. `FOUNDRY_VERSION`
  is simply empty.
- An explicit `--framework` override is allowed but must be written to
  `STATUS.md` with rationale.

## Detector output

`scripts/detect-project-stack.sh` supports `--format markdown|env|json` and exits
0 even when the profile is `unknown`.

Two fields carry the reasoning:

- `DETECTION_EVIDENCE` — the signals that were found, semicolon separated.
- `AMBIGUITY_REASON` — every reason the result may be wrong. Empty means none.

When the profile is `unknown`, or `AMBIGUITY_REASON` is non-empty and material,
stop before test implementation and report both fields verbatim. Do not guess.

Prefer `--format json` when parsing. `--format env` is shell-quoted with `%q` and
is intended for `eval` only by callers that control the input.

## Preservation baseline

The detector also emits the stack facts the preservation rules depend on:
Foundry source/test/script paths, remappings source and count, `forge-std`
version, FFI, `fs_permissions`, RPC aliases and the environment variables they
reference, fuzz and invariant settings, package manager, module system, and the
Foundry compiler settings.

`SOLC_SOURCE` states where the Solidity compiler settings came from. The value
`manual-inspection-required` means a Hardhat config holds them and they cannot be
read statically, because the config is executable. Read the config and record
them by hand; do not report Hardhat compiler settings as detected.
