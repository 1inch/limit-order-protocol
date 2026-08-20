# Contracts, inheritance, storage and deployment

Phase 3.

## Inheritance

```
LimitOrderProtocol
├── EIP712("1inch Limit Order Protocol", "4")   OpenZeppelin
├── Ownable                                     OpenZeppelin
├── Pausable                                    OpenZeppelin
└── OrderMixin                        (abstract)
    ├── IOrderMixin                             interface
    ├── EIP712                                  OpenZeppelin, shared with above
    ├── PredicateHelper
    ├── SeriesEpochManager
    ├── Pausable                                shared with above
    ├── OnlyWethReceiver                        @1inch/solidity-utils
    └── PermitAndCall                           @1inch/solidity-utils
```

`EIP712` and `Pausable` each appear on both branches; C3 linearisation collapses
them to one instance, so there is one domain separator and one paused flag. The
deployable contract is `LimitOrderProtocol`; `OrderMixin` is abstract and holds
all the logic.

Libraries are `using`-attached rather than inherited and add no storage:
`OrderLib`, `ExtensionLib`, `MakerTraitsLib`, `TakerTraitsLib`,
`BitInvalidatorLib`, `RemainingInvalidatorLib`, `AddressLib`, `SafeERC20`.

Extension contracts are independent deployments, not part of this hierarchy.
They are reached by address from the extension blob and implement one of
`IAmountGetter`, `IPreInteraction`, `IPostInteraction` or `ITakerInteraction`.

## Storage

The protocol's entire persistent state:

```40:41:contracts/OrderMixin.sol
    mapping(address maker => BitInvalidatorLib.Data data) private _bitInvalidator;
    mapping(address maker => mapping(bytes32 orderHash => RemainingInvalidator remaining)) private _remainingInvalidator;
```

Plus, from inherited contracts: `Ownable`'s owner slot, `Pausable`'s boolean,
`EIP712`'s cached domain fields (immutable in recent OpenZeppelin, so mostly not
storage), and `SeriesEpochManager`'s single mapping:

```21:21:contracts/helpers/SeriesEpochManager.sol
    mapping(uint256 seriesId => uint256 epoch) private _epochs;
```

`_WETH` is immutable, not storage.

Three properties of this layout matter:

**Every mapping is keyed by maker first.** No taker, no global counter, no
shared accumulator. Two makers can never collide, which is why cancellation
needs no access-control check and why `TIME-002` criterion 5 holds. It also
means there is no global state a griefer can exhaust or corrupt.

**There is no balance state.** The protocol never records that it holds
anything, because it never does. Assets pass through within a single call.

**`SeriesEpochManager` packs its key rather than nesting.** The key is
`uint160(maker) | (series << 160)`, a flat mapping. `SeriesNonceManager`, the
standalone helper, uses a genuinely nested `mapping(series => mapping(maker =>
nonce))` instead. The two contracts look parallel and are structured
differently; only the first is inherited by `OrderMixin`.

### Invalidator encodings

The two invalidators trade off differently and this is the core of the storage
design.

| | Bit invalidator | Remaining invalidator |
|---|---|---|
| Used when | Partial or multiple fills disallowed | Both allowed |
| Key | maker → slot (`nonce >> 8`) | maker → order hash |
| Value | 256 single-bit flags | Complement of the remaining amount |
| Cost | One slot per 256 orders | One slot per order |
| Granularity | Consumed or not | Exact remainder |
| Reuse | Never; a set bit is permanent | Decreases to zero |

The remaining invalidator stores `~remaining` rather than `remaining`. That is
what allows stored zero to mean "untouched" and stored `type(uint256).max` to
mean "exhausted", distinguishing an order that has never been seen from one that
has been fully consumed, without a second flag. A naive encoding storing
`remaining` directly could not tell "no record" from "zero left".

## Delegatecall

Exactly one, and it is the reason `SEC-001` is `CRITICAL`:

```71:75:contracts/OrderMixin.sol
    function simulate(address target, bytes calldata data) external {
        // solhint-disable-line avoid-low-level-calls
        (bool success, bytes memory result) = target.delegatecall(data);
        revert SimulationResults(success, result);
    }
```

Unrestricted, arbitrary target, executed in the protocol's own storage context.
The unconditional `revert` on the following line is the entire safety argument.
There is no branch between the delegatecall and the revert, so no execution path
reaches the end of the function. Any future edit that introduces one would give
an attacker arbitrary writes to both invalidator mappings.

No other contract in the protocol uses `delegatecall`. The contracts named
"Proxy" — `Permit2Proxy`, `Permit2WitnessProxy`, `ERC721Proxy`, `ERC721ProxySafe`,
`ERC1155Proxy` — forward *token transfers*; none is a delegatecall proxy and none
implements upgradeability.

## Upgradeability

There is none, and this is a deliberate and consequential design choice.

No proxy, no implementation slot, no initializer, no `__gap`, no
`reinitializer`, no storage-layout constraints to preserve. Every contract is
immutable after deployment. The upgrade path is: deploy a new instance, and
migrate off-chain order flow to its address.

Two consequences for later phases. There are no `UPG-*` requirements, recorded
as a deliberate exclusion in `requirements/README.md`. And a bug in a deployed
contract cannot be patched — the only mitigations available are pausing (owner)
and cancellation (makers), which is why both matter more here than they would in
an upgradeable system.

`NativeOrderFactory` deploys `NativeOrderImpl` instances, which is a
factory/instance relationship rather than a proxy/implementation one. The
deployed clones are not upgradeable either; the address derivation is what
matters there, and it is out of scope for this pass.

## Deployment topology

One `LimitOrderProtocol` per chain, constructor-bound to that chain's WETH.
`deployments/` records 16 chains. The address
`0x111111125421ca6dc452d289314280a0f8842a65` is shared across most EVM chains via
deterministic deployment; zkSync Era differs at
`0x6fd4383cb451173d5f9304f041c7bcbf27d561ff`, which is expected given its
different `CREATE2` derivation.

Extensions deploy independently and are referenced by address inside extension
blobs, so the set of usable extensions is open-ended: anyone can deploy one and
any maker can reference it. There is no registry and no allowlist. The
`deployments/` directory records the canonical 1inch-operated ones —
`FeeTaker`, `SeriesNonceManager`, `OrderRegistrator`, `SafeOrderBuilder`,
`CallsSimulator`, `NativeOrderFactory` — but nothing in the protocol privileges
them.

Domain separation is by chain ID and contract address inside the EIP-712 domain,
so a signature for one chain's deployment is invalid on every other. That is
`FR-ORDER-001` criteria 2 and 3.

## Complexity and fragility clustering

Where the density of assumptions is highest, to guide Phase 6 and Phase 11.

| Cluster | Why |
|---|---|
| `OrderMixin._fill`, lines 263-441 | 178 lines, at least 14 branch points, three external callbacks, two token transfers, an ETH path, and the invalidator write. Everything interesting happens here |
| Extension offset arithmetic | `OffsetsLib.get` bounds-checks `end` but not `begin > end`; `ExtensionLib.customData` bypasses `_get` entirely; `DynamicField.CustomData` at index 8 would shift by 256. Three separate small irregularities in one mechanism |
| The ETH branch, lines 386-405 | Two raw `call`s to arbitrary addresses after the maker's leg has settled, plus wrap/unwrap routing |
| `FeeTaker._postInteraction` | 40 lines entirely inside `unchecked`, with a subtraction that is not guarded against fees exceeding the taking amount |
| Amount-getter dispatch | Two layers with different emptiness tests: `OrderLib` uses `length == 0`, `AmountGetterBase` uses `>= 20`. A 1-19 byte field behaves differently depending on which sees it |
| First-fill detection | `remainingMakingAmount == order.makingAmount` is the test for "first fill", which is also true of a partially filled order whose fills happened to sum to zero — impossible given `FR-FILL-004`, but the coupling is implicit |
