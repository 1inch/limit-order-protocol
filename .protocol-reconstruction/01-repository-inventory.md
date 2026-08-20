# 01 — Repository inventory

Phase 0. What exists, where. No behavioural analysis; that begins in Phase 1.

## Shape

| Area | Count | Size |
|---|---|---|
| Solidity files | 54 | — |
| Production contracts (non-mock) | 43 | 3,574 lines |
| Mocks | 11 | 614 lines |
| JavaScript test files | 19 specs + 5 helpers | 5,781 lines |
| Deployment scripts | 6 | — |
| Deployed chains | 16 | 104 deployment records |
| Generated doc pages | 38 | — |

Tests outweigh production code by roughly 1.6:1 by line count, which is a useful
prior for Phase 6A: the question there will be assertion strength and coverage
distribution rather than the existence of tests.

## Contracts

### Core

| File | Lines | Declaration |
|---|---|---|
| `contracts/OrderMixin.sol` | 524 | `abstract contract OrderMixin is IOrderMixin, EIP712, PredicateHelper, SeriesEpochManager, Pausable, OnlyWethReceiver, PermitAndCall` |
| `contracts/OrderLib.sol` | 185 | library-style order hashing, validation and amount calculation, applied to `IOrderMixin.Order` |
| `contracts/LimitOrderProtocol.sol` | 59 | `contract LimitOrderProtocol is ...` — the deployable entry point |
| `contracts/interfaces/IOrderMixin.sol` | 214 | the protocol's external surface, including the `Order` struct and error set |

`OrderMixin` is the centre of gravity: 15% of production lines, and the single
`_fill` function spans lines 263-441. Everything else either feeds it (traits
libraries, `OrderLib`) or hangs off its interaction hooks (extensions).

### Libraries

Bit-packed traits and invalidation are the protocol's dominant idiom:

| File | Lines | Role |
|---|---|---|
| `libraries/MakerTraitsLib.sol` | 181 | decodes the maker's packed `uint256` of flags, expiry, series, nonce/epoch, allowed sender |
| `libraries/ExtensionLib.sol` | 134 | offset-based slicing of the concatenated extension blob |
| `libraries/TakerTraitsLib.sol` | 107 | decodes the taker's packed `uint256` of flags, threshold, args lengths |
| `libraries/RemainingInvalidatorLib.sol` | 80 | per-order remaining-amount tracking for partially fillable orders |
| `libraries/BitInvalidatorLib.sol` | 62 | bitmap invalidation for non-partially-fillable orders |
| `libraries/OffsetsLib.sol` | 40 | extension field offset arithmetic |
| `libraries/AmountCalculatorLib.sol` | 28 | proportional amount maths |
| `libraries/Errors.sol` | 8 | shared error declarations |

### Extensions

| File | Lines | Declaration |
|---|---|---|
| `extensions/FeeTaker.sol` | 198 | `is IPostInteraction, AmountGetterWithFee, Ownable` |
| `extensions/NativeOrderImpl.sol` | 174 | `is IERC1271, EIP712Alien, OnlyWethReceiver` |
| `extensions/AmountGetterWithFee.sol` | 120 | `is AmountGetterBase` |
| `extensions/ChainlinkCalculator.sol` | 108 | `is IAmountGetter` |
| `extensions/RangeAmountCalculator.sol` | 105 | `is IAmountGetter` |
| `extensions/AmountGetterBase.sol` | 79 | `is IAmountGetter` |
| `extensions/NativeOrderFactory.sol` | 77 | `is Ownable, EIP712Alien` |
| `extensions/Permit2Proxy.sol` | 63 | `is ImmutableOwner` |
| `extensions/DutchAuctionCalculator.sol` | 59 | `is IAmountGetter` |
| `extensions/Permit2WitnessProxy.sol` | 52 | `is ImmutableOwner` |
| `extensions/OrderIdInvalidator.sol` | 52 | `is IPreInteraction` |
| `extensions/ApprovalPreInteraction.sol` | 49 | `is IPreInteraction, ImmutableOwner` |
| `extensions/ERC721ProxySafe.sol` | 28 | `is ImmutableOwner` |
| `extensions/ERC721Proxy.sol` | 28 | `is ImmutableOwner` |
| `extensions/ERC1155Proxy.sol` | 27 | `is ImmutableOwner` |
| `extensions/PrioirityFeeLimiter.sol` | 26 | `contract PriorityFeeLimiter` — note the filename typo, contract name is spelled correctly |
| `extensions/ImmutableOwner.sol` | 19 | shared owner base for the proxy extensions |

### Helpers, interfaces, utils

Helpers: `OrderRegistrator` (45), `PredicateHelper` (88), `SafeOrderBuilder` (85,
`is GnosisSafeStorage`), `SeriesEpochManager` (49), `SeriesNonceManager` (57).

Interfaces: `IOrderMixin` (214), `IAmountGetter` (53), `IPermit2TransferFrom`
(42), `IPermit2WitnessTransferFrom` (36), `ITakerInteraction` (34),
`IPreInteraction` (29), `IPostInteraction` (29), `IOrderRegistrator` (28),
`ICreate3Deployer` (8).

Utils: `EIP712Alien.sol` (105), an abstract contract used by the native-order
contracts to produce EIP-712 digests bound to a foreign domain.

### Mocks

`AggregatorMock`, `ArbitraryPredicateMock`, `CallsSimulator`,
`CompatibilityFallbackHandler`, `ExtensionMock`, `HashChecker`,
`InteractionMock`, `MakerContract`, `RecursiveMatcher`, `TakerContract`,
`WrappedTokenMock`. `RecursiveMatcher` and `InteractionMock` are the notable
ones: they exist to drive the callback and reentrancy paths through `_fill`.

Three further mocks are pulled in at compile time from dependencies via
`hardhat-dependency-compiler`: `TokenCustomDecimalsMock` and `TokenMock` from
`@1inch/solidity-utils`, and `GnosisSafeProxyFactory` from
`@gnosis.pm/safe-contracts`.

## Documentation

| Source | Lines | Nature |
|---|---|---|
| `description.md` | 947 | The protocol specification. Primary statement of intended behaviour (**ASM-1**) |
| `README.md` | 94 | Overview, version and audit status, deployment addresses, feature list |
| `native-swap.md` | 136 | Native (ETH) order design, covering the factory/implementation pair |
| `dev.md` | 21 | Developer note on the selector-bruteforce tool used to build the Permit2 proxies |
| `CONTRIBUTING.md` | 36 | Contribution process |
| `docs/**` | 38 files | `solidity-docgen` output, generated from NatSpec (**ASM-2**) |

`description.md` is organised as: overview, order creation and settings, the
salt/MakerTraits bit layouts, extensions and their offset encoding, non-ERC20
swaps, runtime exchange rate, predicates, interactions, filling and fill
settings, and cancellation.

### Generated documentation is stale

The `docs/` tree does not correspond to the current contract set. This is a
Phase 1 input rather than a finding in itself, but it is recorded here because
it bears on how much authority generated docs can carry.

A page exists with no contract behind it:

- `docs/extensions/ETHOrders.md` — there is no `contracts/extensions/ETHOrders.sol`.
  The native-order functionality now lives in `NativeOrderFactory` and
  `NativeOrderImpl`, described in `native-swap.md`.

Six production contracts have no generated page:

- `extensions/AmountGetterBase.sol`
- `extensions/AmountGetterWithFee.sol`
- `extensions/NativeOrderFactory.sol`
- `extensions/NativeOrderImpl.sol`
- `interfaces/IPermit2TransferFrom.sol`
- `utils/EIP712Alien.sol`

Taken together, `yarn docify` has not been re-run since the native-order rework
and the Permit2 changes landed.

## Tests

All 19 spec files are Mocha/Chai over Hardhat, JavaScript, CommonJS. There is no
characterization/specification separation and no invariant or fork directory.

| File | Lines |
|---|---|
| `test/LimitOrderProtocol.js` | 2,298 |
| `test/Interactions.js` | 492 |
| `test/FeeTaker.js` | 318 |
| `test/RangeLimitOrders.js` | 311 |
| `test/ChainLinkExample.js` | 305 |
| `test/examples/LimitOrderProtocol-example.js` | 283 |
| `test/DutchAuctionCalculator.js` | 168 |
| `test/MeasureGas.js` | 129 |
| `test/SafeOrderBuilder.js` | 119 |
| `test/RangeAmountCalculator.js` | 107 |
| `test/PriorityFeeLimiter.js` | 105 |
| `test/WitnessProxyExample.js` | 95 |
| `test/Permit2Proxy.js` | 87 |
| `test/Extensions.js` | 83 |
| `test/OrderRegistrator.js` | 76 |
| `test/MakerContract.js` | 73 |
| `test/SeriesEpochManager.js` | 55 |
| `test/ApprovalPreInteractionExample.js` | 49 |
| `test/Eip712.js` | 16 |

Helpers: `orderUtils.js` (327), `utils.js` (138), `fixtures.js` (73),
`eip712.js` (60), `nonce.js` (14). `orderUtils.js` is the order-construction and
signing surface and is published to consumers — `package.json` `files` ships
`contracts` and `test/helpers`, so these helpers are part of the package's public
API and changing them is a breaking change for downstream users.

Contracts with no test file bearing their name, to be confirmed against actual
coverage in Phase 6A rather than treated as fact now: the `NativeOrder*` pair,
`OrderIdInvalidator`, `ERC721Proxy`/`ERC721ProxySafe`/`ERC1155Proxy`,
`SeriesNonceManager`, and `AmountGetterBase`/`AmountGetterWithFee`.

## Build, lint and deployment tooling

Hardhat plugins loaded by `hardhat.config.js`: `hardhat-chai-matchers`,
`hardhat-verify`, `solidity-coverage`, `solidity-docgen`,
`hardhat-dependency-compiler`, `hardhat-deploy`, `hardhat-gas-reporter`,
`hardhat-tracer`, plus `dotenv`.

Network registration and Etherscan configuration are delegated to
`@1inch/solidity-utils/hardhat-setup`. `namedAccounts.deployer` is index 0.
`tracer.enableAllOpcodes` is on. `gasReporter` is enabled in USD.

`deployOpts` reads two environment variables, `OPS_LOP_HELPER_CONFIGS` (parsed as
JSON) and `OPS_DEPLOYMENT_METHOD`.

Linting: `.solhint.json` extends `solhint:recommended` with `compiler-version`
pinned to `^0.8.0`, `private-vars-leading-underscore` as an error, `no-global-import`
and `gas-custom-errors` off, and `func-visibility` ignoring constructors. Run at
`--max-warnings 0`. JavaScript uses `.eslintrc` with `eslint-config-standard`.

Deployment scripts under `deploy/`: `deploy.js`, `deploy-helpers.js`,
`deploy-fee-taker.js`, `deploy-native-order-factory.js`, `deploy-Permit2Proxy.js`,
`deploy-Permit2WitnessProxy.js`.

`deployments/` holds `hardhat-deploy` records for 16 chains: arbitrum, aurora,
avax, base, bsc, fantom, klaytn, kovan, linea, mainnet, matic, optimistic, sonic,
unichain, xdai, zksync. mainnet has the most records at 10; kovan retains a single
legacy record.

## Upgradeability

No proxy or upgrade machinery is present in the protocol contracts. There is no
initializer pattern, no UUPS or transparent proxy, no storage gap. `Permit2Proxy`,
`Permit2WitnessProxy`, `ERC721Proxy` and similar are named "proxy" in the sense of
forwarding token transfers, not in the sense of delegatecall-based upgradeability.

Two mechanisms nevertheless warrant attention in Phase 3, since both cross a
trust boundary:

- `OrderMixin.simulate` performs a `delegatecall` into an arbitrary target and
  always reverts with the result.
- `NativeOrderFactory` deploys `NativeOrderImpl` instances, giving a
  factory/implementation relationship whose address derivation matters.

Contracts are otherwise immutable once deployed; the upgrade path is a new
deployment plus migration, which is consistent with the per-chain deployment
records.
