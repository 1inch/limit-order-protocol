# Bug report: `RangeAmountCalculator.getRangeMakerAmount` rounds in the taker's favour

Self-contained write-up for the protocol team. Everything needed to reproduce
and assess is below; no other document is required.

| Field | Value |
|---|---|
| Contract | `contracts/extensions/RangeAmountCalculator.sol` |
| Function | `getRangeMakerAmount` (lines 86-104) |
| Commit | `837c8f823d39ab388daacb07b7adeaadec3dbf2b` (branch at `origin/master`) |
| Found by | Property-based testing with `fast-check` |
| Severity | **Medium**, proposed — economic loss to the maker, not attacker-initiated |
| Fund loss | Possible, bounded by order configuration |
| Contract changed | No |

## Summary

`getRangeMakerAmount` returns **more** maker asset than the corresponding
`getRangeTakerAmount` cost justifies. This is the opposite direction from every
other rounding in the protocol: `AmountCalculatorLib.getMakingAmount` floors and
`getTakingAmount` ceils, both deliberately in the maker's favour, and
`AmountGetterWithFee` preserves that convention. The range calculator's inverse
does not.

The error is exactly zero for realistic range orders and grows without bound as
the price spread narrows relative to the order size. There is no guard and no
diagnostic; in the worst case the function reverts with a raw arithmetic panic.

## Root cause

One line — the curve's slope, floored:

```95:95:contracts/extensions/RangeAmountCalculator.sol
        uint256 k = (priceEnd - priceStart) * 1e18 / orderMakingAmount;
```

`k` is then used as a divisor inside the integer square root:

```98:103:contracts/extensions/RangeAmountCalculator.sol
        return (Math.sqrt(
            (
                b * bDivK +
                alreadyFilledMakingAmount * (2 * b + k * alreadyFilledMakingAmount / 1e18) +
                2 * takingAmount * 1e18
            ) / k * 1e18
        ) - bDivK) - alreadyFilledMakingAmount;
```

When `(priceEnd - priceStart) * 1e18 < orderMakingAmount`, `k` floors to zero
and the division reverts. Just above that point `k` retains almost no
significant digits, and the error it introduces is amplified by the `* 1e18`
scaling and the square root.

`getRangeTakerAmount` does not use `k` and is unaffected, which is what makes
the failure asymmetric.

## Three regimes

Measured at `priceStart = 100e18`, `orderMakingAmount = 1e18 + 1`, fill = half
the order.

| spread (wei) | `k` | result |
|---|---|---|
| 1e0 | 0 | **reverts**, panic `0x12` (division by zero) |
| 1e3 | ~1e3 | overshoot 1e+14 relative |
| 1e6 | ~1e6 | overshoot 1e+8 relative |
| 1e9 | ~1e9 | overshoot 1e+2 relative |
| 1e12 | ~1e12 | overshoot 1e-4 relative |
| 1e15 | ~1e15 | overshoot 1e-10 relative |
| 1e18 | ~1e18 | exact |

The relative error goes as roughly `1e20 / k²`; the absolute overshoot as
`priceStart * fill / k²`. The `priceStart` factor comes from the `bDivK` term,
which is proportional to the price level.

A realistic order — a 3000-to-4000 price range on a 10-token position — gives
`k ≈ 1e20` and an overshoot of exactly zero. The defect requires a price range
narrow relative to the order size, which a maker can configure without warning.

## Why the core does not contain it

`getRangeMakerAmount` is reached when the taker fills by **taking** amount.
`OrderMixin` then does:

```314:322:contracts/OrderMixin.sol
        else {
            takingAmount = amount;
            makingAmount = order.calculateMakingAmount(extension, takingAmount, remainingMakingAmount, orderHash);
            if (makingAmount > remainingMakingAmount) {
                // Try to decrease taking amount because computed making amount exceeds remaining amount
                makingAmount = remainingMakingAmount;
                takingAmount = order.calculateTakingAmount(extension, makingAmount, remainingMakingAmount, orderHash);
                if (takingAmount > amount) revert TakingAmountExceeded();
            }
```

The clamp and the re-pricing fire **only** when the returned making amount
exceeds the remainder. Below that threshold the overshooting value is used
directly: the taker pays their chosen `amount` and receives the inflated
`makingAmount`.

The taker's threshold does not help the maker either — it is a *minimum* on what
the taker receives (`makingAmount < threshold` reverts), so it constrains the
wrong direction.

For a large order early in its life, the remainder is large, so the clamp is
exactly where it does not apply.

## Reproduction

Runs against the repository as-is, no modifications:

```bash
npx hardhat test test/property/AmountCalculators.property.js
```

The three regimes are pinned as `REG-001`, `REG-002` and `REG-003` in that
file. Original fast-check seeds, if you want to re-derive them:

| Regime | Seed |
|---|---|
| `k == 0`, reverts | `-1924954020` |
| `k == 1`, 19 orders of magnitude | `-771726958` |
| finite `k`, systematic overshoot | `-1830898547` |

Minimal standalone check:

```js
const priceStart = 100n * 10n ** 18n;
const priceEnd = priceStart + 2n;          // 2 wei spread
const orderMaking = 10n ** 18n + 1n;
const fill = orderMaking / 2n;             // 5e17

const cost = await range.getRangeTakerAmount(priceStart, priceEnd, orderMaking, fill, orderMaking);
const back = await range.getRangeMakerAmount(priceStart, priceEnd, orderMaking, cost, orderMaking);

// back = 20710678118654752425646882050998827663  (~2.07e37)
// fill =                      500000000000000000  (5e17)
// The round trip returns 19 orders of magnitude more than was paid for.
```

## Impact assessment

**Not attacker-initiated.** An attacker cannot choose an order's parameters;
they can only fill an order whose maker configured a narrow spread. There is no
way to induce a maker into such a configuration from outside.

**Loss falls on the maker**, who gives up more maker asset than the curve
prices. In the `k == 0` regime the order simply cannot be filled by taking
amount at all, while remaining fillable by making amount — a confusing partial
failure reported as a raw panic rather than a named error.

Proposed **Medium**: real economic loss, reachable through a legitimate-looking
configuration, no diagnostic, but bounded by parameters the maker controls and
not triggerable by a third party.

## Suggested directions

Not implemented — this workflow does not modify contracts. Offered as starting
points.

1. **Reject the degenerate configuration.** Require `k > 0`, or equivalently
   `(priceEnd - priceStart) * 1e18 >= orderMakingAmount`, with a named error
   alongside the existing `IncorrectRange`. Fixes `k == 0` cleanly and turns the
   panic into a diagnosable revert, but leaves the precision loss just above the
   boundary.
2. **Avoid materialising `k`.** Restructure the inverse so the slope appears
   only as the exact ratio `(priceEnd - priceStart) / orderMakingAmount` inside
   a single `mulDiv`, rather than as a separately floored intermediate. This
   addresses the cause rather than the symptom.
3. **Round the inverse toward the maker.** Whatever precision remains, the final
   result should floor in the direction that favours the maker, matching
   `AmountCalculatorLib`'s convention. This is worth doing regardless of 1 or 2.
4. **Document the safe parameter range** if the behaviour is accepted as-is, so
   makers and order-building tooling can avoid the regime.

Option 3 alone would remove the directional unfairness even if the magnitude
remained, and is the smallest change that restores consistency with the rest of
the protocol.

## If you accept rather than fix

`REG-003` currently asserts the overshoot *exists* — it pins current behaviour
rather than endorsing it. If the behaviour is fixed, that test must be inverted
to assert `roundTripped <= fill`. The comment in the test says so.

The committed property test asserts a measured envelope with the ideal
invariant written out in its comments as false, so the violation stays visible
in the source rather than living only in this document.
