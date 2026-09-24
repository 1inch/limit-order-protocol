const fc = require('fast-check');
const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { ether } = require('../helpers/utils');

// Property-based tests for the pricing curves.
//
// Both range functions and both Dutch functions are pure or view with explicit
// arguments, which makes them the cheapest high-value target for property
// testing in this codebase: no chain state, no time control, no fixtures per
// case.
//
// INV-007  - rounding never favours the taker
// INV-014  - the two amount-getter directions agree
// MATH-005 - Dutch auction interpolates and clamps
// MATH-006 - range order prices along a linear curve against volume filled
//
// fast-check was added as a devDependency under the Gate B decision on
// 2026-08-03 (OQ-6). It prints a reproducing seed and a shrunk counterexample
// on failure; any counterexample found here should be committed as a
// deterministic regression test rather than left to the fuzzer to rediscover.

const NUM_RUNS = 200;

describe('Amount calculators [property]', function () {
    async function deployCalculators () {
        const RangeAmountCalculator = await ethers.getContractFactory('RangeAmountCalculator');
        const range = await RangeAmountCalculator.deploy();
        await range.waitForDeployment();

        const DutchAuctionCalculator = await ethers.getContractFactory('DutchAuctionCalculator');
        const dutch = await DutchAuctionCalculator.deploy();
        await dutch.waitForDeployment();

        return { range, dutch };
    }

    describe('RangeAmountCalculator [MATH-006]', function () {
        // Prices are wei-per-unit scaled to 1e18, as the contract's own tests
        // use. Kept well inside the square-root path's safe range.
        const priceArb = fc.bigInt({ min: ether('100'), max: ether('10000') });
        const amountArb = fc.bigInt({ min: ether('1'), max: ether('1000') });

        // The curve runs from priceStart to priceEnd, so the cost of any fill
        // must sit between valuing it entirely at the start price and entirely
        // at the end price. This follows from the curve being bounded by its
        // endpoints and needs no knowledge of the trapezoid arithmetic.
        it('[MATH-006] prices every fill between the start and end price', async function () {
            const { range } = await loadFixture(deployCalculators);

            await fc.assert(
                fc.asyncProperty(priceArb, priceArb, amountArb, async (a, b, orderMaking) => {
                    const priceStart = a < b ? a : b;
                    const priceEnd = a < b ? b : a;
                    fc.pre(priceEnd > priceStart);

                    // Unfilled order, fill the whole thing.
                    const taker = await range.getRangeTakerAmount(
                        priceStart, priceEnd, orderMaking, orderMaking, orderMaking,
                    );

                    const atStart = orderMaking * priceStart / ether('1');
                    const atEnd = orderMaking * priceEnd / ether('1');

                    expect(taker).to.be.gte(atStart);
                    expect(taker).to.be.lte(atEnd);
                }),
                { numRuns: NUM_RUNS },
            );
        });

        // A bigger fill costs more. Non-strict because flooring can make two
        // adjacent dust fills cost the same.
        it('[MATH-006] is non-decreasing in the amount filled', async function () {
            const { range } = await loadFixture(deployCalculators);

            await fc.assert(
                fc.asyncProperty(priceArb, priceArb, amountArb, amountArb, async (a, b, m1, m2) => {
                    const priceStart = a < b ? a : b;
                    const priceEnd = a < b ? b : a;
                    fc.pre(priceEnd > priceStart);

                    const small = m1 < m2 ? m1 : m2;
                    const large = m1 < m2 ? m2 : m1;
                    const orderMaking = large;

                    const costSmall = await range.getRangeTakerAmount(
                        priceStart, priceEnd, orderMaking, small, orderMaking,
                    );
                    const costLarge = await range.getRangeTakerAmount(
                        priceStart, priceEnd, orderMaking, large, orderMaking,
                    );

                    expect(costLarge).to.be.gte(costSmall);
                }),
                { numRuns: NUM_RUNS },
            );
        });

        // The defining feature of a range order: the price rises as volume is
        // consumed, so the same fill size costs more later in the order's life.
        it('[MATH-006] charges more for the same fill once the order is partly filled', async function () {
            const { range } = await loadFixture(deployCalculators);

            await fc.assert(
                fc.asyncProperty(priceArb, priceArb, async (a, b) => {
                    const priceStart = a < b ? a : b;
                    const priceEnd = a < b ? b : a;
                    fc.pre(priceEnd > priceStart);

                    const orderMaking = ether('100');
                    const fill = ether('10');

                    const fresh = await range.getRangeTakerAmount(
                        priceStart, priceEnd, orderMaking, fill, orderMaking,
                    );
                    const halfFilled = await range.getRangeTakerAmount(
                        priceStart, priceEnd, orderMaking, fill, orderMaking / 2n,
                    );

                    expect(halfFilled).to.be.gte(fresh);
                }),
                { numRuns: NUM_RUNS },
            );
        });

        // INV-014 / INV-007.
        //
        // IMPORTANT: this property does NOT assert the invariant the protocol's
        // rounding policy implies. The ideal statement is
        //
        //     getRangeMakerAmount(getRangeTakerAmount(m)) <= m
        //
        // i.e. feeding a cost back must never yield a larger fill than the one
        // that produced it, because rounding must favour the maker (INV-007,
        // and consistent with MATH-001 flooring and MATH-002 ceiling).
        //
        // That statement is FALSE for this contract at every finite slope.
        // Running it unguarded found violations immediately and at every
        // threshold tried, the overshoot shrinking as roughly 1/k^2 but never
        // reaching zero until the arithmetic happens to be exact. Raising the
        // guard until it passed would have been normalising a failure, so it is
        // not done here.
        //
        // What is asserted instead is the measured behaviour with an explicit
        // tolerance, so the suite stays green while the defect stays visible
        // and pinned. The violation itself is reported in
        // 10-test-implementation-report.md as the headline finding of Phase 9
        // and carried to Phase 11. See REG-001, REG-002, REG-003 for the
        // concrete reproductions.
        it('[MATH-006][INV-014] the inverse round-trip stays within its measured tolerance', async function () {
            const { range } = await loadFixture(deployCalculators);

            // The spread is generated directly rather than derived from two
            // independent prices, so every case lands in the regime this
            // property covers without being filtered out. Below k ~ 1e6 the
            // error does not follow the 1/k^2 model at all - it collapses
            // completely - and that regime is pinned explicitly by REG-001
            // (k == 0, reverts), REG-002 (k == 1, 19 orders of magnitude) and
            // REG-003 (the measured scaling).
            const spreadArb = fc.bigInt({ min: ether('0.001'), max: ether('1000') });

            await fc.assert(
                fc.asyncProperty(priceArb, spreadArb, amountArb, async (priceStart, spread, orderMaking) => {
                    const priceEnd = priceStart + spread;
                    const k = spread * ether('1') / orderMaking;
                    const fill = orderMaking / 2n;

                    const takerAmount = await range.getRangeTakerAmount(
                        priceStart, priceEnd, orderMaking, fill, orderMaking,
                    );
                    fc.pre(takerAmount > 0n);

                    const roundTripped = await range.getRangeMakerAmount(
                        priceStart, priceEnd, orderMaking, takerAmount, orderMaking,
                    );

                    // The overshoot goes as priceStart * fill / k^2.
                    //
                    // The priceStart factor is not a guess: the inverse's
                    // bDivK term is priceStart * orderMakingAmount /
                    // (priceEnd - priceStart), so the error the floored slope
                    // introduces is proportional to the price level. An
                    // earlier envelope omitted it and fast-check defeated it
                    // three times in a row by scaling priceStart to sit one
                    // wei outside whatever constant was chosen - which is how
                    // the missing factor was identified.
                    //
                    // 16x slack on top: this is a regression detector for the
                    // error getting materially worse, not a proof of a bound.
                    const overshoot = roundTripped > fill ? roundTripped - fill : 0n;
                    const envelope = 16n * priceStart * fill / (k * k) + 256n;

                    expect(
                        overshoot,
                        `overshoot ${overshoot} exceeded envelope ${envelope} at k=${k}`,
                    ).to.be.lte(envelope);
                }),
                // Fewer runs than the other properties: the k > 0 precondition
                // discards a large share of generated cases and each accepted
                // case costs three chain calls.
                { numRuns: 40 },
            );
        });

        // REG-001. Found by the round-trip property above on its first run,
        // shrunk by fast-check to this minimal counterexample:
        //
        //   seed -1924954020
        //   priceStart = 100e18, priceEnd = 100e18 + 1, orderMakingAmount = 1e18 + 1
        //
        // getRangeMakerAmount computes the curve slope as
        //   k = (priceEnd - priceStart) * 1e18 / orderMakingAmount
        // which floors to 0 whenever (priceEnd - priceStart) * 1e18 is below
        // orderMakingAmount - that is, a price spread in wei narrower than
        // orderMakingAmount / 1e18. The function then divides by k and reverts
        // with a low-level panic 0x12 rather than a named error.
        //
        // The asymmetry is the substance: getRangeTakerAmount does not use k
        // and keeps working, so such an order is fillable by making amount but
        // not by taking amount. A maker can reach this with a legitimate-looking
        // configuration and gets no diagnostic.
        //
        // No fund loss. Reported in 10-test-implementation-report.md and carried
        // to Phase 11; the contract is NOT changed by this workflow.
        it('[MATH-006][REG-001] reverts with a raw panic when the curve slope floors to zero', async function () {
            const { range } = await loadFixture(deployCalculators);

            const priceStart = ether('100');
            const priceEnd = ether('100') + 1n;
            const orderMaking = ether('1') + 1n;

            // The slope underflows to zero.
            expect((priceEnd - priceStart) * ether('1') / orderMaking).to.equal(0n);

            // The taking direction is unaffected and still prices the fill.
            expect(
                await range.getRangeTakerAmount(priceStart, priceEnd, orderMaking, orderMaking, orderMaking),
            ).to.be.gt(0n);

            // The making direction divides by the zero slope. Panic 0x12 is a
            // division-by-zero, not a custom error, so there is no selector to
            // match on.
            await expect(
                range.getRangeMakerAmount(priceStart, priceEnd, orderMaking, 1n, orderMaking),
            ).to.be.revertedWithPanic(0x12);
        });

        // The boundary: one more unit of spread makes the slope 1 and the
        // function defined again.
        it('[MATH-006][REG-001] is defined again once the slope reaches one', async function () {
            const { range } = await loadFixture(deployCalculators);

            const priceStart = ether('100');
            const priceEnd = ether('100') + 1n;
            const orderMaking = ether('1');

            expect((priceEnd - priceStart) * ether('1') / orderMaking).to.equal(1n);

            await expect(
                range.getRangeMakerAmount(priceStart, priceEnd, orderMaking, 1n, orderMaking),
            ).to.not.be.reverted;
        });

        // REG-002. Found by the same property immediately after REG-001 was
        // guarded, shrunk to:
        //
        //   seed -771726958
        //   priceStart = 100e18, priceEnd = 100e18 + 2, orderMakingAmount = 1e18 + 1
        //
        // Here the slope k floors to 1 from a true value of ~2, so it survives
        // the k > 0 guard but has lost essentially all precision. The inverse
        // then divides by k and scales by 1e18, and returns a making amount
        // about 20 orders of magnitude larger than the fill that produced the
        // cost it was given: 2.07e37 against an input fill of 5e17.
        //
        // Same root cause as REG-001: k = (priceEnd - priceStart) * 1e18 /
        // orderMakingAmount collapses when the spread is small relative to the
        // order size. Together the two findings mean the range calculator's
        // inverse is unusable across the whole narrow-spread regime, not just
        // at the exact zero point.
        //
        // The core fill path bounds the consequence - see the integration test
        // below - so this is a correctness and usability defect rather than a
        // direct exploit. Reported in 10-test-implementation-report.md and
        // carried to Phase 11. The contract is NOT changed by this workflow.
        it('[MATH-006][REG-002] the inverse blows up when the slope loses precision', async function () {
            const { range } = await loadFixture(deployCalculators);

            const priceStart = ether('100');
            const priceEnd = ether('100') + 2n;
            const orderMaking = ether('1') + 1n;
            const fill = orderMaking / 2n;

            // The slope survives the zero guard but is floored from ~2 to 1.
            const k = (priceEnd - priceStart) * ether('1') / orderMaking;
            expect(k).to.equal(1n);

            const cost = await range.getRangeTakerAmount(priceStart, priceEnd, orderMaking, fill, orderMaking);
            const roundTripped = await range.getRangeMakerAmount(priceStart, priceEnd, orderMaking, cost, orderMaking);

            // The round trip should return at most the original fill. It does
            // not: it returns a value larger by more than 19 orders of
            // magnitude. Pinned as current behaviour.
            expect(roundTripped).to.be.gt(fill);
            expect(roundTripped / fill).to.be.gt(10n ** 19n);
        });

        // REG-003. The general form of REG-001 and REG-002, and the finding
        // that matters most.
        //
        // getRangeMakerAmount does not merely lose precision for small k: it
        // loses it *in the taker's favour*. Feeding a cost back through the
        // inverse returns MORE maker asset than the fill that produced that
        // cost, which is the opposite of the protocol's stated rounding policy
        // (INV-007: rounding never favours the taker; MATH-001 and MATH-002
        // both round toward the maker).
        //
        // Measured relative overshoot, priceStart = 100e18, orderMaking = 1e18+1,
        // fill = half the order:
        //
        //   spread (wei)   k        relative overshoot
        //   1e0            0        reverts, panic 0x12   (REG-001)
        //   1e3            ~1e3     1e+14                 (REG-002 regime)
        //   1e6            ~1e6     1e+8
        //   1e9            ~1e9     1e+2
        //   1e12           ~1e12    1e-4
        //   1e15           ~1e15    1e-10
        //   1e18           ~1e18    0  (exact)
        //
        // The error goes as roughly 1/k^2, so it is exactly zero for realistic
        // range orders - a 3000-to-4000 price range on a 10-token order gives
        // k ~ 1e20 - and unbounded as the spread narrows.
        //
        // Why it is not merely cosmetic: the core calls getRangeMakerAmount
        // when the taker fills by TAKING amount. If the returned making amount
        // does not exceed the remaining amount, OrderMixin does NOT clamp it
        // and does NOT recompute the price (the clamp and recomputation at
        // OrderMixin.sol:317-322 only trigger on overflow past the remainder).
        // The taker then pays their chosen taking amount and receives the
        // overshooting making amount. The taker's own threshold is a MINIMUM on
        // what they receive, so it does not protect the maker either.
        //
        // Reported in 10-test-implementation-report.md and carried to Phase 11.
        // The contract is NOT changed by this workflow.
        it('[MATH-006][REG-003][INV-007] the inverse overshoots in the taker\'s favour for narrow spreads', async function () {
            const { range } = await loadFixture(deployCalculators);

            const priceStart = ether('100');
            const orderMaking = ether('1') + 1n;
            const fill = orderMaking / 2n;

            // Each row: spread in wei, and whether the invariant holds.
            const rows = [
                { spread: 10n ** 9n, holds: false },
                { spread: 10n ** 12n, holds: false },
                { spread: 10n ** 18n, holds: true },
            ];

            for (const { spread, holds } of rows) {
                const priceEnd = priceStart + spread;
                const cost = await range.getRangeTakerAmount(priceStart, priceEnd, orderMaking, fill, orderMaking);
                const back = await range.getRangeMakerAmount(priceStart, priceEnd, orderMaking, cost, orderMaking);

                if (holds) {
                    expect(back, `spread 1e${spread.toString().length - 1} should not overshoot`).to.be.lte(fill);
                } else {
                    // Pinned as current behaviour, not endorsed as correct.
                    expect(back, `spread 1e${spread.toString().length - 1} should overshoot`).to.be.gt(fill);
                }
            }
        });

        it('[MATH-006] rejects a non-increasing price range', async function () {
            const { range } = await loadFixture(deployCalculators);

            await fc.assert(
                fc.asyncProperty(priceArb, async (price) => {
                    const orderMaking = ether('100');

                    await expect(
                        range.getRangeTakerAmount(price, price, orderMaking, orderMaking, orderMaking),
                    ).to.be.revertedWithCustomError(range, 'IncorrectRange');

                    await expect(
                        range.getRangeTakerAmount(price, price - 1n, orderMaking, orderMaking, orderMaking),
                    ).to.be.revertedWithCustomError(range, 'IncorrectRange');
                }),
                { numRuns: 25 },
            );
        });
    });

    describe('DutchAuctionCalculator [MATH-005]', function () {
        const abiCoder = ethers.AbiCoder.defaultAbiCoder();
        const amountArb = fc.bigInt({ min: ether('0.01'), max: ether('10') });

        function orderFor (makingAmount, takingAmount) {
            return {
                salt: 1n,
                maker: ethers.ZeroAddress,
                receiver: ethers.ZeroAddress,
                makerAsset: ethers.ZeroAddress,
                takerAsset: ethers.ZeroAddress,
                makingAmount,
                takingAmount,
                makerTraits: 0n,
            };
        }

        // extraData for the Dutch calculator is three words: the packed
        // start/end times, then the start and end taking amounts.
        function extraData (startTime, endTime, takingStart, takingEnd) {
            return abiCoder.encode(
                ['uint256', 'uint256', 'uint256'],
                [(startTime << 128n) | endTime, takingStart, takingEnd],
            );
        }

        // MATH-005 criteria 1 and 2: the auction clamps outside its window, so
        // a window entirely in the past prices at exactly the end amount and
        // one entirely in the future prices at exactly the start amount.
        it('[MATH-005] clamps to the endpoint amounts outside the auction window', async function () {
            const { dutch } = await loadFixture(deployCalculators);
            const now = BigInt((await ethers.provider.getBlock('latest')).timestamp);

            await fc.assert(
                fc.asyncProperty(amountArb, amountArb, async (t1, t2) => {
                    const takingStart = t1 > t2 ? t1 : t2;
                    const takingEnd = t1 > t2 ? t2 : t1;
                    fc.pre(takingStart > takingEnd);

                    const making = ether('1');
                    const order = orderFor(making, takingStart);

                    // Window wholly in the future: clamped to the start amount.
                    const future = await dutch.getTakingAmount(
                        order, '0x', ethers.ZeroHash, ethers.ZeroAddress, making, making,
                        extraData(now + 10000n, now + 20000n, takingStart, takingEnd),
                    );
                    expect(future).to.equal(takingStart);

                    // Window wholly in the past: clamped to the end amount.
                    const past = await dutch.getTakingAmount(
                        order, '0x', ethers.ZeroHash, ethers.ZeroAddress, making, making,
                        extraData(now - 20000n, now - 10000n, takingStart, takingEnd),
                    );
                    expect(past).to.equal(takingEnd);
                }),
                { numRuns: 50 },
            );
        });

        // MATH-005 criterion 5: a descending auction never quotes a higher
        // price as time advances. Checked across the window without moving the
        // chain clock, by shifting the window relative to a fixed now.
        it('[MATH-005] a descending auction is non-increasing through its window', async function () {
            const { dutch } = await loadFixture(deployCalculators);
            const now = BigInt((await ethers.provider.getBlock('latest')).timestamp);

            const making = ether('1');
            const takingStart = ether('1');
            const takingEnd = ether('0.5');
            const order = orderFor(making, takingStart);
            const span = 1000n;

            let previous = null;
            // elapsed = 0 places the window start at now; elapsed = span places
            // the window end at now.
            for (let elapsed = 0n; elapsed <= span; elapsed += 100n) {
                const quote = await dutch.getTakingAmount(
                    order, '0x', ethers.ZeroHash, ethers.ZeroAddress, making, making,
                    extraData(now - elapsed, now - elapsed + span, takingStart, takingEnd),
                );
                if (previous !== null) {
                    expect(quote).to.be.lte(previous);
                }
                previous = quote;
            }

            expect(previous).to.equal(takingEnd);
        });

        // INV-007. The taking direction ceils, so the quote is always at least
        // the exact rational price - never less, which would favour the taker.
        it('[MATH-005][INV-007] the taking amount never rounds in the taker\'s favour', async function () {
            const { dutch } = await loadFixture(deployCalculators);
            const now = BigInt((await ethers.provider.getBlock('latest')).timestamp);

            await fc.assert(
                fc.asyncProperty(amountArb, amountArb, async (making, takingFlat) => {
                    fc.pre(making > 0n && takingFlat > 0n);

                    const order = orderFor(making, takingFlat);
                    // A degenerate window with equal endpoints makes the
                    // calculated price exactly takingFlat, so the expected
                    // value is computable in closed form.
                    const data = extraData(now - 20000n, now - 10000n, takingFlat, takingFlat);

                    const fill = making / 3n;
                    fc.pre(fill > 0n);

                    const quote = await dutch.getTakingAmount(
                        order, '0x', ethers.ZeroHash, ethers.ZeroAddress, fill, making, data,
                    );

                    // ceil(takingFlat * fill / making)
                    const exactNumerator = takingFlat * fill;
                    expect(quote * making).to.be.gte(exactNumerator);
                    // And no more than one unit above it.
                    expect((quote - 1n) * making).to.be.lt(exactNumerator);
                }),
                { numRuns: NUM_RUNS },
            );
        });
    });
});
