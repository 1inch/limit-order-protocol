# 04 — Entry points and privilege model

Phase 4, produced with the `entry-point-analyzer` specialist.

**Analysed:** 2026-08-03, baseline `837c8f82`
**Scope:** `contracts/`, excluding `contracts/mocks/`
**Language:** Solidity 0.8.30
**Focus:** State-changing functions only; `view` and `pure` excluded

**Tooling:** `which slither` returned nothing, so Slither's `entry-points`
printer was unavailable and this analysis is manual, per the skill's fallback.
Recorded because a Slither-assisted pass might find something a manual read
missed, and that gap should be visible rather than implied.

## Summary

| Category | Count |
|---|---|
| Public (unrestricted) | 14 |
| Role-restricted | 6 |
| Restricted (review required) | 2 |
| Contract-only | 6 |
| **Total** | **28** |

Read-only functions are excluded by the skill's scope. That exclusion removes
the entire `PredicateHelper` surface (`or`, `and`, `not`, `eq`, `lt`, `gt`,
`arbitraryStaticCall` — all `public view`) and every amount getter. They are
still reachable by anyone and they do perform external calls, so §Read-only
below records why their exclusion is safe rather than letting them disappear.

---

## Public entry points (unrestricted)

State-changing and callable by anyone. This is the primary attack surface.

| ID | Function | File | Notes |
|---|---|---|---|
| `EP-001` | `fillOrder(Order,bytes32,bytes32,uint256,TakerTraits)` | `OrderMixin.sol:129` | `payable`. Authorisation is the maker's signature, not the caller |
| `EP-002` | `fillOrderArgs(Order,bytes32,bytes32,uint256,TakerTraits,bytes)` | `OrderMixin.sol:142` | `payable`. Adds target, extension and taker interaction |
| `EP-003` | `fillContractOrder(Order,bytes,uint256,TakerTraits)` | `OrderMixin.sol:194` | Not payable. ERC-1271 path |
| `EP-004` | `fillContractOrderArgs(Order,bytes,uint256,TakerTraits,bytes)` | `OrderMixin.sol:206` | Not payable |
| `EP-005` | `cancelOrder(MakerTraits,bytes32)` | `OrderMixin.sol:80` | Writes keyed by `msg.sender`; caller can only affect their own orders |
| `EP-006` | `cancelOrders(MakerTraits[],bytes32[])` | `OrderMixin.sol:93` | Loops `EP-005` |
| `EP-007` | `bitsInvalidateForOrder(MakerTraits,uint256)` | `OrderMixin.sol:105` | Masked mass invalidation of the caller's own nonces |
| `EP-008` | `increaseEpoch(uint96)` | `SeriesEpochManager.sol:29` | Caller's own epoch |
| `EP-009` | `advanceEpoch(uint96,uint256)` | `SeriesEpochManager.sol:34` | Caller's own epoch, bounded 1-255 |
| `EP-010` | `simulate(address,bytes)` | `OrderMixin.sol:71` | **Arbitrary `delegatecall`.** Always reverts, which is the entire safety argument. See `SEC-001` |
| `EP-011` | `registerOrder(Order,bytes,bytes)` | `OrderRegistrator.sol:27` | Validates extension and signature, then emits only. Stores nothing |
| `EP-012` | `increaseNonce(uint8)` | `SeriesNonceManager.sol:24` | Standalone helper, not used by the core |
| `EP-013` | `advanceNonce(uint256,uint256)` | `SeriesNonceManager.sol:29` | Standalone helper |
| `EP-014` | `create(Order)` | `NativeOrderFactory.sol:52` | `payable`. Deploys a `NativeOrderImpl` clone |

`EP-005` through `EP-009`, and `EP-012`/`EP-013`, are "unrestricted" only in the
sense that anyone may call them. Their effect is confined to the caller's own
state by the mapping key rather than by a check — the classification the skill
asks for is about the guard, and there is none. Rejecting the shortcut the skill
warns about: these are *not* admin functions with an obvious owner, and they are
*not* dangerous despite lacking a modifier. The structural key is the control.

`EP-010` is the one that deserves a second look despite being "safe". It is
unrestricted, takes an arbitrary target, and delegatecalls it in the protocol's
storage context. Nothing but the unconditional `revert` on the next line stands
between a caller and arbitrary writes to both invalidator mappings.

---

## Role-restricted entry points

### Owner

| ID | Function | File | Restriction |
|---|---|---|---|
| `EP-015` | `pause()` | `LimitOrderProtocol.sol:49` | `onlyOwner` (OpenZeppelin `Ownable`) |
| `EP-016` | `unpause()` | `LimitOrderProtocol.sol:56` | `onlyOwner` |
| `EP-017` | `rescueFunds(IERC20,uint256)` | `FeeTaker.sol:97` | `onlyOwner` — `FeeTaker`'s own owner, unrelated to the protocol's |
| `EP-018` | `rescueFunds(address,address,uint256)` | `NativeOrderFactory.sol:69` | `onlyOwner` — a third, independent owner |
| `EP-019` | `transferOwnership` / `renounceOwnership` | inherited `Ownable` | `onlyOwner`. Present on `LimitOrderProtocol`, `FeeTaker`, `NativeOrderFactory` |

There are **three unrelated `Ownable` instances** in the deployed system:
`LimitOrderProtocol`, `FeeTaker` and `NativeOrderFactory`. Nothing in the code
links them, so they may be three different keys. Verifying who holds each on
each of the 16 chains is deployment configuration, not code, and belongs in
Phase 11. `OQ-4` covers the protocol's owner; it should be widened to all three.

### Maker (via immutable binding)

| ID | Function | File | Restriction | Role |
|---|---|---|---|---|
| `EP-020` | `withdraw(Order,address,uint256,bytes)` | `NativeOrderImpl.sol:156` | `onlyMaker`, checked against the order | Maker of the native order |

---

## Restricted (review required)

Access control that a modifier name does not fully describe.

| ID | Function | File | Pattern | Why review |
|---|---|---|---|---|
| `EP-021` | `cancelExpiredOrderByResolver(Order,uint256)` | `NativeOrderImpl.sol:122` | Access-token balance plus expiry timing, plus a caller-supplied `rewardLimit` | Permissionless-with-incentive: anyone holding the access token can cancel someone else's expired order and take a reward. The reward is bounded by a caller-supplied limit and by time since expiry. The authorisation is economic rather than identity-based, and the reward arithmetic sets who profits |
| `EP-022` | `buildAndSignOrder(...)` | `SafeOrderBuilder.sol:47` | Executes in Gnosis Safe storage context via `GnosisSafeStorage` | Not called normally: intended to run as a Safe module or delegatecall target. Its effective caller and storage context depend on deployment wiring that is not visible in this repository |

`EP-022` is the one genuine unknown in this analysis. `SafeOrderBuilder is
GnosisSafeStorage` means it is written to operate on another contract's storage
layout, so reasoning about it from this repository alone is incomplete.

---

## Contract-only (integration points)

Callable only by a specific contract. These define the trust boundaries.

| ID | Function | File | Expected caller |
|---|---|---|---|
| `EP-023` | `postInteraction(...)` | `FeeTaker.sol:79` | `onlyLimitOrderProtocol`, immutable |
| `EP-024` | `preInteraction(...)` | `OrderIdInvalidator.sol:34` | `onlyLimitOrderProtocol`, immutable |
| `EP-025` | `preInteraction(...)` | `ApprovalPreInteraction.sol:25` | `onlyImmutableOwner` — the protocol address, fixed at construction |
| `EP-026` | `func_60iHVgK` / `func_301JL5R` / `func_nZHTch` / `func_801zDya` | `ERC721Proxy.sol:23`, `ERC721ProxySafe.sol:23`, `ERC1155Proxy.sol:22`, `Permit2Proxy.sol:44`, `Permit2WitnessProxy.sol:30` | `onlyImmutableOwner`. Five proxies, each with a name ground to collide with the `transferFrom` selector |
| `EP-027` | `depositAndApprove()` | `NativeOrderImpl.sol:85` | `onlyFactory`, `payable` |
| `EP-028` | `receive()` | `FeeTaker.sol:74` | Anyone may send ETH; empty body, accepts silently |

`EP-026` is worth pausing on. Five separate contracts expose a function whose
selector is deliberately identical to `IERC20.transferFrom`, generated by the
brute-force tool documented in `dev.md`. The `onlyImmutableOwner` guard is what
stops anyone but the protocol invoking them. If that guard were ever wrong, a
proxy holding NFT approvals would be directly drainable.

`EP-028` accepts ETH from anyone into a contract whose owner can rescue any
balance (`EP-017`). Not a defect — the WETH unwrap path needs it — but it means
`FeeTaker` can accumulate stray ETH that only its owner can retrieve.

---

## Callbacks the protocol invokes on others

Not entry points into the protocol, but the mirror image, and the skill is
explicit that callbacks must not be skipped. These are the interfaces the
protocol calls out to, from inside `_fill`.

| Interface | Called at | Caller-supplied by |
|---|---|---|
| `IPreInteraction.preInteraction` | `OrderMixin.sol:352` | Maker |
| `ITakerInteraction.takerInteraction` | `OrderMixin.sol:380` | Taker |
| `IPostInteraction.postInteraction` | `OrderMixin.sol:435` | Maker |
| `IAmountGetter.getMakingAmount` / `getTakingAmount` | `OrderLib.sol:123`, `157` | Maker |
| `IERC1271.isValidSignature` | via `ECDSA.isValidSignature`, `OrderMixin.sol:235` | Maker |

Each is a point where an untrusted contract of someone's choosing executes
inside the protocol's transaction.

---

## Read-only functions, and why excluding them is safe here

The skill excludes `view`/`pure`, on the reasoning that they cannot corrupt
state. That reasoning holds in this codebase, and it is worth showing rather
than assuming, because two of the excluded groups perform external calls.

`PredicateHelper.or`, `and`, `not`, `eq`, `lt`, `gt` and `arbitraryStaticCall`
are all `public view` and all reach `_staticcallForUint`, which uses `staticcall`
exclusively (`PredicateHelper.sol:81`). The EVM guarantees a static context
cannot write, so no reachable path from these can modify state. `SEC-003` states
this as a requirement.

Every `IAmountGetter` implementation is `external view` for the same reason.

`OrderMixin.checkPredicate`, `hashOrder`, `bitInvalidatorForOrder`,
`remainingInvalidatorForOrder` and `rawRemainingInvalidatorForOrder` are plain
`view` reads.

The exclusion is therefore sound. It does mean an attacker's ability to make the
protocol perform arbitrary `staticcall`s to any address, at anyone's expense, is
not represented in the counts above — a denial-of-service and
information-disclosure surface rather than a state-corruption one.

---

## Privilege matrix

Rows are actors, columns are what they can reach.

| Capability | Anyone | Maker (self) | Protocol owner | FeeTaker owner | Factory owner | LOP contract |
|---|---|---|---|---|---|---|
| Fill an order | `EP-001`-`004` | — | — | — | — | — |
| Cancel own orders | — | `EP-005`-`007` | — | — | — | — |
| Advance own epoch | — | `EP-008`, `EP-009` | — | — | — | — |
| Simulate | `EP-010` | — | — | — | — | — |
| Register an order | `EP-011` | — | — | — | — | — |
| Create a native order | `EP-014` | — | — | — | — | — |
| Cancel an expired native order | `EP-021` (with access token) | — | — | — | — | — |
| Withdraw from a native order | — | `EP-020` | — | — | — | — |
| Pause / unpause | — | — | `EP-015`, `EP-016` | — | — | — |
| Rescue funds | — | — | — | `EP-017` | `EP-018` | — |
| Transfer ownership | — | — | `EP-019` | `EP-019` | `EP-019` | — |
| Fee post-interaction | — | — | — | — | — | `EP-023` |
| Order-id pre-interaction | — | — | — | — | — | `EP-024` |
| Approval pre-interaction | — | — | — | — | — | `EP-025` |
| Proxy transfers | — | — | — | — | — | `EP-026` |

The shape of this matrix is the headline: **no privileged actor can move a user's
funds, and no privileged actor can touch an individual order.** The owner column
contains availability control and nothing else. The only paths that move value
belong to the counterparties themselves.

---

## Files analysed

`OrderMixin.sol` (7), `LimitOrderProtocol.sol` (2 plus inherited `Ownable`),
`SeriesEpochManager.sol` (2), `SeriesNonceManager.sol` (2),
`OrderRegistrator.sol` (1), `SafeOrderBuilder.sol` (1),
`NativeOrderFactory.sol` (2), `NativeOrderImpl.sol` (4), `FeeTaker.sol` (3),
`OrderIdInvalidator.sol` (1), `ApprovalPreInteraction.sol` (1),
`ERC721Proxy.sol` (1), `ERC721ProxySafe.sol` (1), `ERC1155Proxy.sol` (1),
`Permit2Proxy.sol` (1), `Permit2WitnessProxy.sol` (1).

Zero state-changing entry points, as expected: `OrderLib.sol`, all of
`contracts/libraries/`, `PredicateHelper.sol`, `PrioirityFeeLimiter.sol`, all
amount getters, `ImmutableOwner.sol`, `EIP712Alien.sol`, all interfaces.

## Analysis warnings

- Slither was unavailable; a tool-assisted cross-check has not been done.
- `EP-022` cannot be fully classified from this repository because it executes
  in an external Safe's storage context.
- `NativeOrderImpl` clone address derivation was not traced in this pass and
  bears on `EP-020`/`EP-021` authorisation. Recorded as a gap rather than
  assumed correct.
