# 02 — Specification-to-code compliance report

Phase 1, produced with the `spec-to-code-compliance` specialist. Every claim
cites a documentation quote and a file with line numbers. Where the
documentation is silent the item is classified `UNDOCUMENTED_CODE_PATH` rather
than inferred; where the code is unclear it is classified `AMBIGUOUS`.

Baseline commit `837c8f823d39ab388daacb07b7adeaadec3dbf2b`.

## 1. Executive summary

The protocol's bit-level encodings match their specification almost exactly. The
`MakerTraits` layout is correct in every one of its thirteen documented fields,
the `TakerTraits` length and flag fields match, the 160-bit salt/extension-hash
binding matches, the amount-calculation rounding matches, and the invalidator
and epoch-cancellation semantics match. This is a well-specified core.

The divergences are concentrated in three places rather than spread evenly:

1. **The interaction (callback) documentation is wrong in a way that breaks
   integrators.** Every callback signature in `description.md` omits the
   `extension` parameter that the interfaces actually declare, and the
   documentation describes a taker-interaction return value and a
   `NO_IMPROVE_RATE` flag that exist nowhere in the code.
2. **The trust model is undocumented.** `description.md` never mentions that the
   protocol is `Ownable` and `Pausable`, and that the owner can halt all fills.
   A reader of the specification would conclude the protocol is unstoppable.
3. **The extension catalogue is stale.** `description.md` names three amount
   getters and one proxy example. The repository ships seventeen extensions,
   including `FeeTaker`, which is deployed on fourteen chains and is not
   mentioned anywhere in the specification — the string "fee" does not occur in
   `description.md` at all.

Fifteen divergences are recorded, of which thirteen are assessed material. None
is a demonstrated fund-loss bug in the core fill path. The dominant risk is
integration risk from documentation that no longer describes the deployed
interfaces, plus an undocumented central privilege.

One candidate finding was investigated and **rejected**: see §9.

## 2. Documentation sources identified

| Source | Role | Authority |
|---|---|---|
| `description.md` (947 lines) | Protocol specification: order construction, traits layouts, extensions, predicates, interactions, filling, cancellation | Primary. `README.md` line 24 designates it the "latest general overview and documentation" (**ASM-1**) |
| `README.md` (94 lines) | Feature summary, audit/version status, deployments | Secondary, authoritative on version status |
| `native-swap.md` (136 lines) | Native/ETH order design | Authoritative for `NativeOrderFactory` / `NativeOrderImpl` only |
| `dev.md` (21 lines) | Selector-bruteforce tooling note | Developer note, not behavioural spec |
| Contract NatSpec | Per-function intent | Authoritative but code-adjacent; drift from `description.md` is itself a finding |
| `docs/**` (38 pages) | `solidity-docgen` output | Derived from NatSpec (**ASM-2**). Not independent evidence of intent |

## 3. Spec-IR summary

Extracted intent items by semantic type. The full per-item records are the
alignment rows in §5.

| Semantic type | Items | Principal sources |
|---|---|---|
| Data-structure definition | 3 | Order struct, MakerTraits layout, TakerTraits layout |
| Bit-field definition | 22 | `description.md` §Order settings, §Fill settings |
| Encoding rule | 5 | salt/extension hash, extension offsets, suffix, getter calldata, args packing |
| Flow / sequencing | 2 | 7-step fill sequence, cancellation paths |
| Formula | 3 | linear amount calculation, threshold checks (two directions) |
| Error condition | 9 | named reverts in cancellation and fill |
| Interface contract | 3 | pre/post/taker interaction signatures |
| Trust assumption | 2 | predicates are `staticcall`-only; allowed-sender privacy |

## 4. Code-IR summary

`OrderMixin` holds the entire fill pipeline. `_fill` (lines 263-441) executes, in
order: extension validity, allowed-sender, expiry, epoch-manager, predicate,
amount computation and threshold, partial-fill and zero-amount checks,
invalidator write, pre-interaction, maker→taker transfer, taker interaction,
taker→maker transfer, post-interaction, `OrderFilled`.

State is two mappings, both keyed by maker (`OrderMixin.sol` lines 40-41):
`_bitInvalidator` and `_remainingInvalidator`. Which one applies is decided by
`useBitInvalidator()`, defined as `!allowPartialFills || !allowMultipleFills`
(`MakerTraitsLib.sol` lines 151-153).

Authorization graph: `LimitOrderProtocol` is `Ownable` and `Pausable`
(lines 31-35); `owner` may call `pause()` / `unpause()` (lines 49-58). Nothing
else in the core is privileged. Per-order authorization is the allowed-sender
field and the maker's signature.

External-call surface inside `_fill`: three maker/taker interaction callbacks,
the two token transfers (optionally via `transferFrom` with an appended suffix,
`OrderMixin.sol` lines 509-523), optional Permit2 transfers, optional WETH
deposit/withdraw, and a raw `call` to refund excess ETH (line 391). Predicates
execute through `_staticcallForUint` (`PredicateHelper.sol` lines 76-87), which
is `staticcall` only and requires exactly 32 bytes of return data.

There is no proxy or initializer. `simulate` (lines 71-75) is the only
`delegatecall` and always reverts.

## 5. Alignment matrix

Confidence is the analyst's confidence in the mapping, not in the code.

| # | Spec item | Spec source | Code | Alignment | Conf. | DIV |
|---|---|---|---|---|---|---|
| 1 | Order struct, 8 fields in order | `description.md` 53-64 | `IOrderMixin.sol` 14-23 | `FULL_MATCH` | 1.0 | |
| 2 | Salt: high 96 bits salt, low 160 bits extension hash | `description.md` 70 | `OrderLib.sol` 178-179 compares `& type(uint160).max` | `FULL_MATCH` | 1.0 | |
| 3 | NO_PARTIAL_FILLS bit 255 | `description.md` 88 | `MakerTraitsLib.sol` 39 | `FULL_MATCH` | 1.0 | |
| 4 | ALLOW_MULTIPLE_FILLS bit 254 | `description.md` 89 | `MakerTraitsLib.sol` 40 | `FULL_MATCH` | 1.0 | |
| 5 | Bit 253 unused | `description.md` 90 | no constant at 253 | `FULL_MATCH` | 1.0 | |
| 6 | PRE_INTERACTION_CALL bit 252 | `description.md` 91 | `MakerTraitsLib.sol` 41 | `FULL_MATCH` | 1.0 | |
| 7 | POST_INTERACTION_CALL bit 251 | `description.md` 92 | `MakerTraitsLib.sol` 42 | `FULL_MATCH` | 1.0 | |
| 8 | NEED_CHECK_EPOCH_MANAGER bit 250 | `description.md` 93 | `MakerTraitsLib.sol` 43 | `FULL_MATCH` | 1.0 | |
| 9 | HAS_EXTENSION bit 249 | `description.md` 94 | `MakerTraitsLib.sol` 44 | `FULL_MATCH` | 1.0 | |
| 10 | USE_PERMIT2 bit 248 | `description.md` 95 | `MakerTraitsLib.sol` 45, read at 169-171 | `FULL_MATCH` | 1.0 | see §9 |
| 11 | UNWRAP_WETH bit 247 | `description.md` 96 | `MakerTraitsLib.sol` 46, read at 178-180 | `FULL_MATCH` | 1.0 | see §9 |
| 12 | ALLOWED_SENDER bits 0-79 | `description.md` 102 | `MakerTraitsLib.sol` 31, 64-67 | `FULL_MATCH` | 1.0 | |
| 13 | EXPIRATION bits 80-119 | `description.md` 103 | `MakerTraitsLib.sol` 32-33 | `FULL_MATCH` | 1.0 | |
| 14 | NONCE_OR_EPOCH bits 120-159 | `description.md` 104 | `MakerTraitsLib.sol` 34-35 | `FULL_MATCH` | 1.0 | |
| 15 | SERIES bits 160-199 | `description.md` 105 | `MakerTraitsLib.sol` 36-37 | `FULL_MATCH` | 1.0 | |
| 16 | "Order cannot be filled after the expiration deadline" | `description.md` 920 | `expiration != 0 && expiration < block.timestamp` (`MakerTraitsLib.sol` 85) | `FULL_MATCH` | 0.95 | boundary noted §7 |
| 17 | Extension offsets: 8 × uint32 end-offsets, field starts at previous end | `description.md` 180-196 | `OffsetsLib.sol` 28-38 | `FULL_MATCH` | 1.0 | |
| 18 | Extension field order (MakerAssetSuffix … PostInteractionData) | `description.md` 186-194 | `ExtensionLib.sol` 16-26 | `FULL_MATCH` | 1.0 | |
| 19 | CustomData after all extensions | `description.md` 196 | `ExtensionLib.sol` 106-112 | `FULL_MATCH` | 0.9 | |
| 20 | Amount getter calldata = 20-byte address + selector + args | `description.md` 356-358 | `OrderLib.sol` 123, 157 | `FULL_MATCH` | 1.0 | |
| 21 | Getter receives requestedAmount, remainingMakingAmount, orderHash | `description.md` 360-370 | `OrderLib.sol` 123-131, 157-165 | `PARTIAL_MATCH` — code also passes `order`, `extension`, `msg.sender` | 0.95 | `DIV-014` |
| 22 | Default calculator is proportional to initial rate | `description.md` 156 | `AmountCalculatorLib.sol` 9-27 | `FULL_MATCH` | 1.0 | |
| 23 | Making amount floors, taking amount ceils | implied by "AmountCalculator" + NatSpec | `AmountCalculatorLib.sol` 8, 19 | `FULL_MATCH` | 0.9 | |
| 24 | Predicates: eq/lt/gt/and/or/not/arbitraryStaticCall | `description.md` 454-509 | `PredicateHelper.sol` 11-74 | `FULL_MATCH` | 1.0 | |
| 25 | `and`/`or` limited to 8 operands | `description.md` 461, 503 | 256-bit offsets word / 32 bits, zero-terminated (`PredicateHelper.sol` 13, 27) | `PARTIAL_MATCH` — limit correct, zero-terminator semantics undocumented | 0.9 | `DIV-015` |
| 26 | Predicate uses `staticcall`, reverts on state change | `description.md` 511 | `PredicateHelper.sol` 81 | `FULL_MATCH` | 1.0 | |
| 27 | Predicate true means result == 1 | implied `description.md` 455 | `OrderMixin.sol` 122-123 | `FULL_MATCH` | 0.95 | |
| 28 | Fill sequence: validate, pre, maker→taker, taker interaction, taker→maker, post, event | `description.md` 706-714 | `OrderMixin.sol` 273-440 | `FULL_MATCH` | 1.0 | |
| 29 | Four fill entry points | `description.md` 840-843 | `OrderMixin.sol` 129, 142, 194, 206 | `FULL_MATCH` | 1.0 | |
| 30 | `preInteraction` signature | `description.md` 722-730 | `IPreInteraction.sol` 19-28 | `MISMATCH` — code has extra `extension` param | 1.0 | `DIV-002` |
| 31 | `postInteraction` signature | `description.md` 733-741 | `IPostInteraction.sol` 19-28 | `MISMATCH` — code has extra `extension` param | 1.0 | `DIV-002` |
| 32 | `takerInteraction` signature and return | `description.md` 744-752 | `ITakerInteraction.sol` 24-33 | `MISMATCH` — extra `extension` param, no return value | 1.0 | `DIV-001`, `DIV-002` |
| 33 | `offeredTakingAmount` improves the maker's rate unless `NO_IMPROVE_RATE` set | `description.md` 767 | absent from the entire codebase | `MISSING_IN_CODE` | 1.0 | `DIV-001` |
| 34 | Interaction calldata = 20-byte target + extra data | `description.md` 771-772 | `OrderMixin.sol` 346-351, 429-434 | `FULL_MATCH` | 1.0 | |
| 35 | MAKER_AMOUNT_FLAG bit 255 | `description.md` 905 | `TakerTraitsLib.sol` 22 | `FULL_MATCH` | 1.0 | |
| 36 | UNWRAP_WETH_FLAG bit 254 | `description.md` 906 | `TakerTraitsLib.sol` 23 | `FULL_MATCH` | 1.0 | |
| 37 | Taker bit 253 unused | `description.md` 907 | `_SKIP_ORDER_PERMIT_FLAG = 1 << 253` (`TakerTraitsLib.sol` 24), used at `OrderMixin.sol` 175 | `MISMATCH` | 1.0 | `DIV-003` |
| 38 | USE_PERMIT2_FLAG bit 252 | `description.md` 908 | `TakerTraitsLib.sol` 25 | `FULL_MATCH` | 1.0 | |
| 39 | ARGS_HAS_TARGET bit 251 | `description.md` 909 | `TakerTraitsLib.sol` 26 | `FULL_MATCH` | 1.0 | |
| 40 | ARGS_EXTENSION_LENGTH bits 224-247 | `description.md` 910 | `TakerTraitsLib.sol` 28-29 | `FULL_MATCH` | 1.0 | |
| 41 | ARGS_INTERACTION_LENGTH bits 200-223 | `description.md` 911 | `TakerTraitsLib.sol` 30-31 | `FULL_MATCH` | 1.0 | |
| 42 | THRESHOLD "0-184 bits", size 184 | `description.md` 912 | `_AMOUNT_MASK` sets bits 0-183 (`TakerTraitsLib.sol` 33) | `PARTIAL_MATCH` — size right, range notation off by one | 1.0 | `DIV-011` |
| 43 | Threshold formulas, both directions, zero skips | `description.md` 912 | `OrderMixin.sol` 304-312, 324-332 | `FULL_MATCH` | 1.0 | |
| 44 | args packing: target, extension, interaction | `description.md` 887-895 | `OrderMixin.sol` 451-481 | `FULL_MATCH` | 1.0 | |
| 45 | Fill reverts if calculated amounts are zero | `description.md` 874 | `OrderMixin.sol` 335 | `FULL_MATCH` | 1.0 | |
| 46 | Fill reverts if partial not allowed and amount ≠ making amount | `description.md` 874 | `OrderMixin.sol` 334 | `FULL_MATCH` | 1.0 | |
| 47 | BitInvalidator when partial or multiple fills disallowed | `description.md` 932 | `MakerTraitsLib.sol` 151-153 | `FULL_MATCH` | 1.0 | |
| 48 | Cancelled fill reverts `BitInvalidatedOrder` / `InvalidatedOrder` | `description.md` 934 | `BitInvalidatorLib.sol` 44; `OrderMixin.sol` 496 | `FULL_MATCH` | 1.0 | |
| 49 | Epoch cancellation requires partial+multiple fills, else `EpochManagerAndBitInvalidatorsAreIncompatible` | `description.md` 942 | `OrderMixin.sol` 286-288 | `FULL_MATCH` | 1.0 | |
| 50 | `increaseEpoch` +1, `advanceEpoch` up to 256 | `description.md` 945 | `SeriesEpochManager.sol` 29-42; guard is `amount == 0 \|\| amount > 255` | `PARTIAL_MATCH` — max is 255, not 256 | 0.95 | `DIV-012` |
| 51 | Expiry cancellation reverts `OrderExpired` | `description.md` 920 | `OrderMixin.sol` 285 | `FULL_MATCH` | 1.0 | |
| 52 | Predicate cancellation reverts `PredicateIsNotTrue` | `description.md` 921 | `OrderMixin.sol` 295 | `FULL_MATCH` | 1.0 | |
| 53 | Non-ERC20 proxy incompatible with USE_PERMIT2 | `description.md` 269 | `OrderMixin.sol` 362 (maker) **and** 410 (taker) | `CODE_STRONGER_THAN_SPEC` — spec notes maker side only | 0.9 | non-material |
| 54 | Receiver semantics | `description.md` 72 | zero receiver falls back to maker (`OrderLib.sol` 95-98) | `UNDOCUMENTED_CODE_PATH` | 1.0 | `DIV-006` |
| 55 | Owner / pause | absent from `description.md` | `LimitOrderProtocol.sol` 31-58; `OrderMixin.sol` 272 | `UNDOCUMENTED_CODE_PATH` | 1.0 | `DIV-004` |
| 56 | `simulate` delegatecall | absent | `OrderMixin.sol` 71-75 | `UNDOCUMENTED_CODE_PATH` | 1.0 | `DIV-005` |
| 57 | Reentrancy guard on maker-permit path | absent | `OrderMixin.sol` 180-183 | `CODE_STRONGER_THAN_SPEC` | 1.0 | `DIV-007` |
| 58 | `cancelOrders`, `bitsInvalidateForOrder` | absent (`cancelOrder` only, 927) | `OrderMixin.sol` 93-100, 105-109 | `UNDOCUMENTED_CODE_PATH` | 1.0 | `DIV-008` |
| 59 | ETH `msg.value` protocol and excess refund | partial (`description.md` 36) | `OrderMixin.sol` 386-405 | `UNDOCUMENTED_CODE_PATH` | 1.0 | `DIV-009` |
| 60 | Extension catalogue | 3 getters + 1 proxy (`description.md` 155-158) | 17 extension contracts | `UNDOCUMENTED_CODE_PATH` | 1.0 | `DIV-010` |
| 61 | RFQ orders deprecated in v4 | `README.md` 51 | `LimitOrderProtocol.sol` 12-29 NatSpec still documents RFQ as an order type | `MISMATCH` (spec-internal) | 1.0 | `DIV-013` |

## 6. Divergence findings

### `DIV-001` — CRITICAL for integrators: documented taker-interaction return value and `NO_IMPROVE_RATE` flag do not exist

**Alignment** `MISSING_IN_CODE`. **Severity** MEDIUM.

Documentation, `description.md` line 752 and line 767:

> `) external returns(uint256 offeredTakingAmount);`
>
> The `offeredTakingAmount` is also returned in the taker's interaction. This
> value can be used to improve the rate for the maker, provided that the
> `NO_IMPROVE_RATE` flag is not set in the order. If the returned value is less
> than the required `takingAmount`, the protocol ignores it and fills the order
> using the calculated `takingAmount`.

Code: `ITakerInteraction.takerInteraction` is declared `external;` with no return
value (`ITakerInteraction.sol` lines 24-33). `OrderMixin.sol` lines 380-382 calls
it and discards any return data. A repository-wide search for `NO_IMPROVE_RATE`,
`improveRate` and `offeredTakingAmount` matches only the two `description.md`
lines quoted above — the identifiers appear nowhere in `contracts/`, `test/` or
`deploy/`.

**Exploitability** None directly: no code path consumes the value, so nothing can
be manipulated through it. The risk is economic misunderstanding. A maker reading
the specification may believe takers can return a better rate and that the
protocol will honour it, and may price orders accordingly. No rate improvement
is possible.

**Recommendation** Decide whether this is a removed feature (delete both passages)
or an unimplemented one (implement, or move to a roadmap). Do not leave it.

### `DIV-002` — Every documented callback signature omits the `extension` parameter

**Alignment** `MISMATCH`. **Severity** MEDIUM, high nuisance value.

`description.md` lines 722-752 declares all three callbacks with seven
parameters, beginning `(IOrderMixin.Order calldata order, bytes32 orderHash, ...)`.

All three interfaces declare eight parameters with `bytes calldata extension`
second: `IPreInteraction.sol` lines 19-28, `IPostInteraction.sol` lines 19-28,
`ITakerInteraction.sol` lines 24-33. `OrderMixin` calls them accordingly at
lines 352-354, 380-382 and 435-437.

**Exploitability** An integrator implementing the documented signature deploys a
contract whose function selector does not match. The call reverts, and because
these callbacks are invoked inside `_fill`, the whole fill reverts. This fails
closed rather than open, so it is a denial-of-integration rather than a fund
risk. It costs the maker gas and makes orders unfillable.

**Recommendation** Correct all three signatures in `description.md`, including
the parameter table at lines 757-765 which also omits `extension`.

### `DIV-003` — `TakerTraits` bit 253 is documented as unused but controls permit execution

**Alignment** `MISMATCH`. **Severity** MEDIUM.

`description.md` line 907 lists bit 253 with an empty option name and the
description "Unused".

`TakerTraitsLib.sol` line 24 defines `_SKIP_ORDER_PERMIT_FLAG = 1 << 253`, read by
`skipMakerPermit` (lines 85-87) and consumed at `OrderMixin.sol` line 175: when
set, the maker's permit in the extension is not executed.

**Exploitability** A taker following the documentation would treat the bit as free
and might set it as padding, silently skipping the maker's permit. The fill then
reverts at the transfer step if the allowance was expected to come from that
permit. Again fails closed, but the specification actively misleads.

Note the flag also gates the reentrancy check at lines 180-183, so its semantics
are more load-bearing than "skip a permit".

**Recommendation** Document bit 253 as `SKIP_ORDER_PERMIT`.

### `DIV-004` — The owner can pause all fills; the specification never says so

**Alignment** `UNDOCUMENTED_CODE_PATH`. **Severity** HIGH — undocumented trust boundary.

`description.md` contains no mention of an owner, admin, guardian, pause or
emergency stop. Its cancellation section (lines 914-948) presents expiry,
predicate, hash/nonce and epoch as the ways an order stops being fillable.

`LimitOrderProtocol` is `Ownable` and `Pausable` (lines 31-35). `pause()` and
`unpause()` are `onlyOwner` (lines 49-58). `OrderMixin._fill` carries
`whenNotPaused()` (line 272). While paused, every fill entry point reverts.

Note the asymmetry, which is the part worth deciding on: `cancelOrder`,
`cancelOrders` and `bitsInvalidateForOrder` are **not** gated by `whenNotPaused`,
so makers can still cancel while paused. That is a sensible design, and it is
undocumented too.

**Exploitability** Not an exploit; a centralisation property. A reader of the
specification would conclude that a signed, unexpired, unfilled order is always
fillable, which is false. Anyone assessing counterparty risk needs this.

**Recommendation** Document the owner role, what pausing blocks and what it does
not, and who holds the owner key on each deployment.

### `DIV-005` — `simulate` performs a `delegatecall` to an arbitrary target

**Alignment** `UNDOCUMENTED_CODE_PATH`. **Severity** MEDIUM.

Not mentioned in `description.md`.

```71:75:contracts/OrderMixin.sol
    function simulate(address target, bytes calldata data) external {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory result) = target.delegatecall(data);
        revert SimulationResults(success, result);
    }
```

**Exploitability** The unconditional `revert` on line 74 is what makes this safe:
all state changes from the `delegatecall` are discarded, so an attacker cannot
persist a write. The function is a simulation helper meant to be called with
`eth_call`. The safety of the whole construct rests on that single `revert`
being unreachable-to-bypass, which makes it exactly the kind of thing that
belongs in the specification and in an invariant.

**Recommendation** Document it, and carry "`simulate` can never persist state" into
Phase 6 as an invariant.

### `DIV-006` — Zero receiver silently means the maker

**Alignment** `UNDOCUMENTED_CODE_PATH`. **Severity** LOW.

`description.md` line 72 describes `receiver` as "The receiver's address. The
taker assets will be transferred to this address", with no zero-value semantics.

```95:98:contracts/OrderLib.sol
    function getReceiver(IOrderMixin.Order calldata order) internal pure returns(address /*receiver*/) {
        address receiver = order.receiver.get();
        return receiver != address(0) ? receiver : order.maker.get();
    }
```

**Exploitability** None. Benign and conventional, but it is a behaviour a maker
must be able to rely on, so it should be specified rather than discovered.

### `DIV-007` — Reentrancy detection on the maker-permit path is undocumented

**Alignment** `CODE_STRONGER_THAN_SPEC`. **Severity** LOW.

`OrderMixin.sol` lines 180-183 rejects a reentrant fill of a remaining-invalidator
order during maker-permit execution, reverting `ReentrancyDetected`. The comment
explains bit-invalidator orders are not susceptible. `description.md` does not
mention reentrancy at all.

The code is stronger than the specification, which is the safe direction, but the
guarantee is undocumented and therefore untested against intent.

### `DIV-008` — Batch and mass invalidation entry points are undocumented

**Alignment** `UNDOCUMENTED_CODE_PATH`. **Severity** LOW.

`description.md` lines 927-934 documents `cancelOrder` only. The code also exposes
`cancelOrders` (lines 93-100) and `bitsInvalidateForOrder` (lines 105-109), the
latter taking an `additionalMask` that invalidates many nonces in one slot at once
and reverting `OrderIsNotSuitableForMassInvalidation` for non-bit-invalidator
orders.

### `DIV-009` — The ETH `msg.value` protocol is undocumented

**Alignment** `UNDOCUMENTED_CODE_PATH`. **Severity** MEDIUM.

`description.md` line 36 says only that the protocol can "Request that ETH/WETH be
wrapped/unwrapped either before or after the swap".

`OrderMixin.sol` lines 386-405 implements a specific and consequential protocol:
ETH is accepted only when `takerAsset` is WETH; `msg.value < takingAmount` reverts
`InvalidMsgValue`; excess above `takingAmount` is refunded to `msg.sender` by raw
`call` (line 391); when the maker set `unwrapWeth`, the taking amount is forwarded
as raw ETH to the receiver, otherwise deposited to WETH and transferred; and any
non-zero `msg.value` on a non-WETH taker asset reverts (line 405).

**Exploitability** The refund on line 391 and the receiver payment on line 398 are
raw calls to addresses that may be contracts, executed after the maker→taker
transfer. Reentrancy exposure here should be reasoned about explicitly in
Phase 3 rather than assumed. Documenting the intended protocol is a prerequisite
for asserting it is correct.

### `DIV-010` — The extension catalogue in the specification is four items; the repository ships seventeen

**Alignment** `UNDOCUMENTED_CODE_PATH`. **Severity** MEDIUM.

`description.md` lines 155-158 names `AmountCalculator`, `DutchAuctionCalculator`
and `RangeAmountCalculator`, and shows `ERC721Proxy` as a worked example.

`contracts/extensions/` contains seventeen contracts. Undocumented in
`description.md`: `FeeTaker`, `AmountGetterBase`, `AmountGetterWithFee`,
`ChainlinkCalculator`, `ApprovalPreInteraction`, `OrderIdInvalidator`,
`Permit2Proxy`, `Permit2WitnessProxy`, `PriorityFeeLimiter`, `ERC1155Proxy`,
`ERC721ProxySafe`, `ImmutableOwner`, `NativeOrderFactory`, `NativeOrderImpl`.
The helpers `OrderRegistrator`, `SafeOrderBuilder` and `SeriesNonceManager` are
likewise absent.

`FeeTaker` is the significant one. It is 198 lines, it is `Ownable`, it implements
`IPostInteraction` and it takes fees out of fills. It is deployed on fourteen
chains per `deployments/`. The string "fee", case-insensitive, does not appear
anywhere in `description.md`.

`NativeOrderFactory` and `NativeOrderImpl` are documented, but in `native-swap.md`
rather than in the specification.

**Recommendation** At minimum, specify `FeeTaker`'s fee model before Phase 2, since
Phase 2 must produce `ECON-*` requirements and there is currently no statement of
intent to derive them from. Flagged as a Gate A open question.

### `DIV-011` — Threshold bit range documented as 0-184, mask covers 0-183

**Alignment** `PARTIAL_MATCH`. **Severity** LOW.

`description.md` line 912 gives THRESHOLD as size 184, location "0-184".
`TakerTraitsLib.sol` line 33 defines a mask with 184 set bits, covering bits 0-183
inclusive. The size is right and the range notation is off by one. The same
off-by-one appears in the code's own comment at `TakerTraitsLib.sol` line 19.

Bits 184-199 are consequently readable by nothing: not the threshold mask, not
`argsInteractionLength` which starts at 200. Sixteen dead bits, harmless but worth
stating.

### `DIV-012` — `advanceEpoch` documented as "up to 256 units", code allows 255

**Alignment** `PARTIAL_MATCH`. **Severity** LOW.

`description.md` line 945: "The former increases the epoch by 1 unit, while the
latter can increase it by any amount up to 256 units." Line 940 separately says
the nonce "can be incremented up to 255 units".

`SeriesEpochManager.sol` line 35: `if (amount == 0 || amount > 255) revert AdvanceEpochFailed();`

The maximum is 255. `description.md` contradicts itself between lines 940 and 945,
and line 945 contradicts the code.

### `DIV-013` — `LimitOrderProtocol` NatSpec still documents RFQ orders as a supported type

**Alignment** `MISMATCH`, spec-internal. **Severity** LOW.

`README.md` line 51: "Separate RFQ order are deprecated in v4."

`LimitOrderProtocol.sol` lines 12-29 states the protocol "provides two different
order types - Regular Limit Order - RFQ Order" and lists RFQ features including
"Cancelation by order id" and "Partial Fill (only once)". No RFQ-specific code
path exists in `OrderMixin`.

Because this is NatSpec it is published verbatim into `docs/LimitOrderProtocol.md`,
so the contradiction reaches readers of the generated documentation.

### `DIV-014` — Amount getters receive more arguments than documented

**Alignment** `PARTIAL_MATCH`. **Severity** LOW.

`description.md` lines 366-370 states the final call is
`address.selector(<arguments from calldata>, requestedAmount, remainingMakingAmount, orderHash)`.

`OrderLib.sol` lines 123-131 calls
`IAmountGetter.getMakingAmount(order, extension, orderHash, msg.sender, requestedTakingAmount, remainingMakingAmount, data[20:])`.
The real call passes the full order, the extension and the taker address as well,
and in a different order. A getter written to the documented shape will not decode
correctly.

### `DIV-015` — Zero-offset terminator in `and`/`or` predicate packing is undocumented

**Alignment** `PARTIAL_MATCH`. **Severity** LOW.

`description.md` lines 459-461 documents packing offsets as `uint32` values in
order, and states an 8-operand limit.

```13:13:contracts/helpers/PredicateHelper.sol
        for (uint256 current; (current = uint32(offsets)) != 0; offsets >>= 32) {
```

The loop terminates on the first zero 32-bit chunk. The 8-operand limit follows
from 256/32 and matches. What is undocumented is that a zero end-offset acts as a
terminator, so no operand may have a zero end offset, and trailing operands after
a zero chunk are silently ignored rather than rejected. There is also no check
that offsets are monotonically increasing or bounded by `data.length`; a
non-monotonic offsets word produces a reverting or empty slice rather than an
explicit error.

## 7. Boundary conditions confirmed correct

Recorded because they are the kind of thing a reader assumes and should not have
to: expiry uses `expiration < block.timestamp`, so an order remains fillable
during the whole second equal to its expiration timestamp, and an expiration of
zero means no expiry (`MakerTraitsLib.sol` line 85). The making-amount path floors
and the taking-amount path ceils, both in the maker's favour
(`AmountCalculatorLib.sol` lines 9-27). `RemainingInvalidator` stores the bitwise
complement of the remaining amount, which lets stored zero mean "new order" and
`type(uint256).max` mean "fully filled" without an extra flag
(`RemainingInvalidatorLib.sol` lines 24-79).

## 8. Ambiguity hotspots

| Area | Ambiguity | Why it matters |
|---|---|---|
| `RemainingInvalidatorLib.remaining(invalidator)` | Single-argument overload reverts `RemainingInvalidatedOrder` when the stored value is 0, but `isNewOrder()` reports the same value as "new" (lines 24-42) | Two functions disagree on what stored-zero means. Callers must pick the right overload; the core uses the two-argument form |
| `OffsetsLib.get` | Checks `end > concat.length` but not `begin > end` (lines 34-37) | A malformed offsets word yields an underflowed length rather than an explicit revert |
| `ExtensionLib.customData` | Does not go through `_get`, and `DynamicField.CustomData` index 8 would shift by 256 (lines 106-112, 25) | The enum implies a ninth slot that the offsets word cannot address |
| `description.md` epoch limits | Line 940 says 255, line 945 says 256 | Self-contradiction, see `DIV-012` |

## 9. Investigated and rejected

**Claimed operator-precedence bug in `MakerTraitsLib.usePermit2` and `unwrapWeth`.**

Lines 170 and 179 read `MakerTraits.unwrap(makerTraits) & _USE_PERMIT2_FLAG != 0`
without parentheses, unlike the other eleven flag readers in the same file. In C
and C-derived languages `&` binds *looser* than `!=`, which would parse this as
`unwrap & (FLAG != 0)` and test bit 0 instead of bit 248 — a critical bug.

**This does not apply to Solidity, where `&` binds tighter than `!=`.** Verified
empirically with the repository's own compiler (solc 0.8.30) rather than by
argument:

| Variant | Result |
|---|---|
| `a & FLAG != 0` (as written) | compiles |
| `(a & FLAG) != 0` | compiles, **byte-identical deployed bytecode** with metadata hash disabled |
| `a & (FLAG != 0)` | `Built-in binary operator & cannot be applied to types uint256 and bool` |

The third row is decisive on its own: the alternative parse is not merely
different, it does not type-check, so a contract using it could not compile. The
two functions read bits 248 and 247 correctly. No finding. Recorded here because
the missing parentheses are a real readability inconsistency worth a style fix,
and because the next reviewer will otherwise re-derive the same false positive.

## 10. Requirements-relevant conclusions for Phase 2

Blocked pending Gate A: no canonical requirement may be derived from an undecided
material divergence. Specifically, `ECON-*` requirements for `FeeTaker` cannot be
written at all until `DIV-010` is resolved, because no statement of intended fee
behaviour exists in any document.

`OPS-*` requirements depend on `DIV-004`, and the whole `INT-*` group for
integrators depends on `DIV-001`, `DIV-002`, `DIV-003` and `DIV-014`.

## 11. Final risk assessment

No divergence in this report demonstrates a loss-of-funds defect in the core fill
path, and the parts of the protocol that move money — amount calculation,
threshold enforcement, invalidation, transfer ordering — match their
specification precisely.

The risk that remains is of two kinds. Integration risk is immediate and
concrete: three callback signatures, one flag and one getter calling convention
are documented incorrectly, and each failure mode is a reverting fill rather than
a silent loss. Governance risk is structural: the specification describes a
protocol with no privileged actor, and the deployed contract has an owner who can
pause every fill.

The largest unquantified area is `FeeTaker`, which is deployed widely and
specified nowhere. It is not assessed in this report beyond noting its absence,
and it should not be waved through Gate A.
