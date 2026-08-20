# Assets, arithmetic, external calls and unenforceable assumptions

Phase 3.

## Asset and accounting model

The protocol has **no accounting model**, and that is the finding rather than an
omission in this document.

It holds no balances, issues no shares, tracks no debt, has no collateral, no
liquidation, no interest, no reserves and no treasury. There is no total supply
to conserve and no solvency condition to maintain, because there is no liability
side. Assets touch the protocol's address only transiently, in one case only:
WETH wrapping and unwrapping inside a fill.

| Asset | Custody | Duration |
|---|---|---|
| Maker asset | Never held. Pulled from maker, pushed to target in one call | Zero |
| Taker asset | Never held, except the WETH wrap path | Zero, or one internal step |
| Native ETH | Transiently, between `msg.value` arriving and the refund/forward | Within one call |
| WETH | Transiently during deposit or withdraw | Within one call |
| Fees | Held by `FeeTaker`, not by the protocol | Within one call |

The correct conservation statement for Phase 6 is therefore not "assets in equal
assets out" over time, but the stronger per-transaction claim: **the protocol's
balance of every asset is the same after a fill as before it.** Any residue is a
defect. This is a much sharper invariant than a typical DeFi solvency check and
should be written that way.

The single accounting quantity that does persist is the remaining making amount
per order, and its invariant is monotonic non-increase bounded below by zero
(`STATE-002`).

## Formulas, units and rounding

### Core amount calculation

```solidity
// making from taking — floor
(swapTakerAmount * orderMakerAmount) / orderTakerAmount

// taking from making — ceil
(swapMakerAmount * orderTakerAmount + orderMakerAmount - 1) / orderMakerAmount
```

Units are raw token units throughout. The protocol never normalises decimals and
never assumes 18; the maker's ratio of `makingAmount` to `takingAmount` carries
the decimal relationship implicitly. A range-order test explicitly covers
differing decimals, confirming this is intended rather than accidental.

**Rounding policy: every rounding in the core favours the maker.** Making amounts
floor, taking amounts ceil. The fee overlay preserves the same direction —
`AmountGetterWithFee` floors the making side and ceils the taking side. This
consistency is the invariant worth stating in Phase 6; each individual rounding
is only one unit, but they are systematic and unidirectional.

### Threshold checks

Cross-multiplied rather than divided, which avoids introducing a second rounding
into the taker's protection:

```solidity
// making direction
takingAmount * amount <= threshold * makingAmount
// taking direction
makingAmount * amount >= threshold * takingAmount
```

Each has a gas-optimised equality branch used when the requested amount was
filled exactly. The two branches are supposed to be equivalent, which is a
testable claim rather than an assumption.

### Fixed-point scales

Three different bases coexist, which is a source of confusion worth tabulating.

| Scale | Base | Used for |
|---|---|---|
| `1e5` | 100000 | Integrator and resolver fee rates in `AmountGetterWithFee` |
| `1e2` | 100 | Integrator revenue share, whitelist discount numerator |
| `1e9` | 1000000000 | Chainlink spread denominator |
| `1e18` | — | Range calculator internal precision, and `2e18` in its trapezoid divisor |

A fee rate is a 16-bit field against a `1e5` base, so the representable maximum
is 65535/100000, roughly 65%. Whether that ceiling is deliberate is unknown and
part of `OQ-3`.

### Overflow discipline

`unchecked` appears in: `AmountCalculatorLib` (guarded by an explicit operand
size test, so provably safe), the `cancelOrders` loop (bounded by array length),
`RemainingInvalidatorLib` (complement arithmetic where wrapping is the intent),
`SeriesEpochManager.advanceEpoch` (unreachable overflow), the zero-amount product
check in `_fill`, and the whole of `FeeTaker._postInteraction` plus three
functions in `AmountGetterWithFee`.

The last group is the one that is not obviously safe. `FeeTaker.sol` line 144
computes `takingAmount - integratorFeeAmount - protocolFeeAmount` inside
`unchecked` with no guard that the fees do not exceed the taking amount. Under
the current fee formula they cannot, because both are floored fractions of a
common denominator that includes them — but that safety is a property of the
formula, not of a check, and it would not survive an independent change to
either. This is exactly why `ECON-001` criterion 2 is written as a conservation
assertion.

## External call inventory

Every point where control leaves the protocol during a fill, in execution order.

| # | Call | Type | Target chosen by | Reached before invalidator write? |
|---|---|---|---|---|
| 1 | `isValidSignature` (contract orders) | `call` | Maker | **Yes** |
| 2 | `tryPermit` on the maker's token | `call` | Maker | **Yes** |
| 3 | Predicate evaluation, nested | `staticcall` | Maker | Yes, but cannot write |
| 4 | Amount getter | `staticcall` via `view` | Maker | Yes, but cannot write |
| 5 | `preInteraction` | `call` | Maker | No |
| 6 | `transferFrom` maker leg, or Permit2 | `call` | Maker (asset) | No |
| 7 | WETH `withdraw` | `call` | Protocol (immutable) | No |
| 8 | `takerInteraction` | `call` | Taker | No |
| 9 | ETH refund of excess | raw `call` | Taker (`msg.sender`) | No |
| 10 | ETH forward to receiver | raw `call` | Maker (receiver) | No |
| 11 | WETH `deposit` / `transfer` | `call` | Protocol (immutable) | No |
| 12 | `transferFrom` taker leg, or Permit2 | `call` | Maker (asset) | No |
| 13 | `postInteraction` | `call` | Maker | No |

Calls 1 and 2 are the only mutating external calls that precede the invalidator
write, which is precisely why the reentrancy guard exists and why it is scoped to
the permit path. Call 1 has no equivalent guard, because a contract maker
re-entering to fill their own order reaches the same `_checkRemainingMakingAmount`
and would be filling against un-updated state — a case worth a targeted test in
Phase 8 rather than an assumption here.

Calls 9 and 10 are unusual in being raw value transfers with all gas forwarded,
to addresses that may be arbitrary contracts, occurring after the maker's asset
has settled.

## Assumptions the code cannot enforce

The most useful output of this phase. Each is something the protocol relies on
and has no way to check.

| # | Assumption | Consequence if false | Who bears it |
|---|---|---|---|
| A1 | The maker's two amount getters price consistently | The taker always picks the cheaper direction and extracts the difference | Maker |
| A2 | Tokens behave as ERC-20: no fee-on-transfer, no rebasing, no reentrancy on transfer | Amounts settled differ from amounts computed; the protocol asserts no post-transfer balance check | Both parties |
| A3 | Chainlink feeds report honestly within their four-hour window | Oracle-priced orders fill at a manipulated rate | Maker |
| A4 | Four hours is an appropriate staleness bound for every feed a maker chooses | A slow feed's normal heartbeat could exceed it, or a fast feed's four-hour-old price is badly stale | Maker |
| A5 | An 80-bit address match is sufficient for allowed-sender and for `FeeTaker`'s whitelist | An attacker who grinds a colliding address bypasses the restriction; roughly 2^80 work | Maker |
| A6 | A 160-bit extension-hash match is sufficient | Extension substitution; roughly 2^80 work under a birthday attack | Maker |
| A7 | The maker's chosen interaction contracts are not hostile to the maker | Arbitrary code runs inside the fill with the maker's own authorisation | Maker |
| A8 | The taker sets a meaningful threshold | A zero threshold means no slippage protection at all | Taker |
| A9 | The maker passes correct traits to `cancelOrder` | The cancellation silently writes to the wrong invalidator and the order stays live | Maker |
| A10 | `FeeTaker` is never the receiver of an order it was not configured for | The `InconsistentFee` guard catches the reverse case, but a zero-fee order pointed at `FeeTaker` forwards funds correctly by accident rather than by check | Maker |
| A11 | Off-chain infrastructure does not leak private orders | Allowed-sender restricts execution, not visibility; order contents are public once distributed | Maker |
| A12 | The owner key is secure and its holder is honest about timing | Pause and unpause timing has value even though the owner cannot move funds | All users |
| A13 | Extension offsets are well-formed and monotonic | `OffsetsLib` bounds-checks the end offset but not `begin > end` | Maker |

A2 deserves emphasis because it is the broadest. The protocol computes amounts,
calls `transferFrom`, and checks only the boolean-or-empty return. It never
verifies that the recipient's balance actually rose by the expected amount. A
fee-on-transfer or rebasing token therefore settles a different amount than the
one recorded in `OrderFilled` and used for the threshold check. Nothing in the
code prevents such a token being named in an order.

A5 and A6 are the two deliberate truncations. Both are documented, both are
sound at today's cost of grinding addresses or hash preimages, and both are
weaker than a full comparison. They should be recorded as accepted rather than
discovered later and treated as findings.
