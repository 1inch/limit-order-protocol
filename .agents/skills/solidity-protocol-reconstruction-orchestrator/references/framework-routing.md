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

- `foundry.toml` plus Hardhat package/config generally means hybrid.
- Hardhat 3 plus `.t.sol` without `foundry.toml` is normally Hardhat 3, not hybrid.
- `forge-std` imports can occur in Hardhat 3 Solidity tests; they are not sufficient alone.
- a stale config not referenced by scripts/CI may be dead tooling; report rather than guess.
- an explicit `--framework` override is allowed but must be written to `STATUS.md` with rationale.
