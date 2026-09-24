const fc = require('fast-check');
const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('../helpers/fixtures');
const { buildOrder, buildTakerTraits, signOrder, buildMakerTraits } = require('../helpers/orderUtils');
const { ether } = require('../helpers/utils');

// Stateful invariant tests.
//
// The property tests in test/property/ cover pure pricing functions. These
// cover the invariants that only mean anything across a SEQUENCE of
// transactions: that an order cannot be over-filled, that invalidation is
// one-way, and that the protocol never retains value.
//
// Approach: generate a random action sequence, replay it against a fresh
// fixture, and assert every invariant after each action. Actions are allowed
// to revert - a reverting fill is a legitimate outcome and simply means no
// state changed. What is never allowed is an invariant breaking.
//
//   INV-001  the protocol retains no token or ETH balance
//   INV-002  the remaining amount never increases
//   INV-003  the sum of fills never exceeds the signed making amount
//   INV-004  invalidator bits are monotonic
//   INV-005  an order lives in exactly one invalidator
//   INV-006  epochs only advance
//   INV-011  a fill conserves value across the maker/taker pair
//
// Ghost state is tracked in JavaScript and reconciled against the chain after
// every action, which is what makes INV-003 checkable at all: the contract
// stores a remainder, not a running total.

describe('Order fill [invariant]', function () {
    const MAKING = ether('1000');
    const TAKING = ether('1');

    let addr, addr1;

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
    });

    async function deployAndSignOrders () {
        const { dai, weth, swap, chainId } = await deploySwapTokens();

        await dai.mint(addr1, ether('1000000'));
        await dai.connect(addr1).approve(swap, ether('1000000'));
        await weth.deposit({ value: ether('100') });
        await weth.approve(swap, ether('100'));

        const swapAddress = await swap.getAddress();

        // Two orders from one maker, deliberately on different invalidators:
        // the partial/multiple one uses the remaining invalidator, the other
        // the bitmap. INV-005 depends on them staying separate.
        const partial = buildOrder({
            maker: addr1.address,
            makerAsset: await dai.getAddress(),
            takerAsset: await weth.getAddress(),
            makingAmount: MAKING,
            takingAmount: TAKING,
            makerTraits: buildMakerTraits({ allowPartialFill: true, allowMultipleFills: true }),
        });
        const single = buildOrder({
            maker: addr1.address,
            makerAsset: await dai.getAddress(),
            takerAsset: await weth.getAddress(),
            makingAmount: MAKING,
            takingAmount: TAKING,
            makerTraits: buildMakerTraits({ allowMultipleFills: false, nonce: 3 }),
        });

        const sign = async (order) => {
            const { r, yParityAndS: vs } = ethers.Signature.from(
                await signOrder(order, chainId, swapAddress, addr1),
            );
            return { order, r, vs, hash: await swap.hashOrder(order) };
        };

        return {
            dai,
            weth,
            swap,
            swapAddress,
            orders: [await sign(partial), await sign(single)],
        };
    }

    // Actions the sequence can draw from. Amounts are kept to simple
    // fractions so a sequence has a realistic chance of exhausting an order
    // rather than always making dust fills.
    const actionArb = fc.oneof(
        fc.record({
            kind: fc.constant('fill'),
            orderIndex: fc.integer({ min: 0, max: 1 }),
            fraction: fc.integer({ min: 1, max: 4 }),
            byMakingAmount: fc.boolean(),
        }),
        fc.record({
            kind: fc.constant('cancel'),
            orderIndex: fc.integer({ min: 0, max: 1 }),
        }),
        fc.record({
            kind: fc.constant('advanceEpoch'),
            series: fc.integer({ min: 0, max: 2 }),
            amount: fc.integer({ min: 1, max: 255 }),
        }),
    );

    it('[INV-001..INV-011] holds across random action sequences', async function () {
        await fc.assert(
            fc.asyncProperty(fc.array(actionArb, { minLength: 1, maxLength: 8 }), async (actions) => {
                const { dai, weth, swap, swapAddress, orders } = await loadFixture(deployAndSignOrders);

                // Ghost state.
                const filled = [0n, 0n];
                const cancelled = [false, false];
                let lastRemaining = [MAKING, MAKING];
                let lastBitSlot = await swap.bitInvalidatorForOrder(addr1.address, 0);
                const lastEpoch = [0n, 0n, 0n];

                for (const action of actions) {
                    if (action.kind === 'fill') {
                        const { order, r, vs } = orders[action.orderIndex];
                        const amount = action.byMakingAmount
                            ? MAKING / BigInt(action.fraction)
                            : TAKING / BigInt(action.fraction);
                        const takerTraits = buildTakerTraits({ makingAmount: action.byMakingAmount });

                        const before = await dai.balanceOf(addr1.address);
                        try {
                            await swap.fillOrder(order, r, vs, amount, takerTraits.traits);
                            const after = await dai.balanceOf(addr1.address);
                            // The maker's outflow is the authoritative record
                            // of how much of the order was consumed.
                            filled[action.orderIndex] += before - after;
                        } catch (e) {
                            // A reverting fill is a legitimate outcome.
                        }
                    } else if (action.kind === 'cancel') {
                        const { order, hash } = orders[action.orderIndex];
                        try {
                            await swap.connect(addr1).cancelOrder(order.makerTraits, hash);
                            cancelled[action.orderIndex] = true;
                        } catch (e) {
                            // Cancelling twice is harmless.
                        }
                    } else {
                        try {
                            await swap.connect(addr1).advanceEpoch(action.series, action.amount);
                        } catch (e) {
                            // Out-of-range advance reverts by design.
                        }
                    }

                    // ---- INV-001: the protocol retains nothing ----
                    expect(await dai.balanceOf(swapAddress), 'INV-001 protocol holds DAI').to.equal(0n);
                    expect(await weth.balanceOf(swapAddress), 'INV-001 protocol holds WETH').to.equal(0n);
                    expect(await ethers.provider.getBalance(swapAddress), 'INV-001 protocol holds ETH').to.equal(0n);

                    // ---- INV-002 / INV-003: remaining only falls, fills never exceed the order ----
                    const rawPartial = await swap.rawRemainingInvalidatorForOrder(addr1.address, orders[0].hash);
                    const remainingPartial = rawPartial === 0n
                        ? MAKING
                        : await swap.remainingInvalidatorForOrder(addr1.address, orders[0].hash);

                    expect(remainingPartial, 'INV-002 remaining increased').to.be.lte(lastRemaining[0]);
                    expect(filled[0], 'INV-003 fills exceeded the signed making amount').to.be.lte(MAKING);

                    if (cancelled[0]) {
                        // Cancellation writes the fully-filled marker without
                        // any asset moving, so the remainder-plus-fills
                        // identity no longer applies. What must hold is that
                        // the order is exhausted and stays that way.
                        expect(remainingPartial, 'INV-002 a cancelled order regained a remainder').to.equal(0n);
                    } else {
                        // Every unit that left the maker is a unit off the
                        // remainder, exactly.
                        expect(remainingPartial + filled[0], 'INV-003 remainder and fills disagree').to.equal(MAKING);
                    }
                    lastRemaining = [remainingPartial, lastRemaining[1]];

                    // ---- INV-004: invalidator bits never clear ----
                    const bitSlot = await swap.bitInvalidatorForOrder(addr1.address, 0);
                    expect(bitSlot & lastBitSlot, 'INV-004 a set bit was cleared').to.equal(lastBitSlot);
                    lastBitSlot = bitSlot;

                    // ---- INV-005: the bit-invalidator order never touches the remaining invalidator ----
                    expect(
                        await swap.rawRemainingInvalidatorForOrder(addr1.address, orders[1].hash),
                        'INV-005 a bit-invalidator order wrote the remaining invalidator',
                    ).to.equal(0n);

                    // ---- INV-006: epochs only advance ----
                    for (let s = 0; s < 3; s++) {
                        const epoch = await swap.epoch(addr1.address, s);
                        expect(epoch, `INV-006 epoch for series ${s} decreased`).to.be.gte(lastEpoch[s]);
                        lastEpoch[s] = epoch;
                    }
                }
            }),
            // Each action is a chain transaction plus seven assertions, so the
            // run count is kept modest deliberately.
            { numRuns: 25 },
        );
    });

    // INV-011 as a focused deterministic check: the pair conserves value on a
    // single fill, which the sequence test above cannot isolate because it
    // tolerates reverts.
    it('[INV-011] a fill moves exactly the computed amounts between the two parties', async function () {
        const { dai, weth, swap, orders } = await loadFixture(deployAndSignOrders);
        const { order, r, vs } = orders[0];

        const amount = MAKING / 4n;
        const takerTraits = buildTakerTraits({ makingAmount: true });

        const expectedTaking = (amount * TAKING + MAKING - 1n) / MAKING; // ceil, MATH-002

        const fillTx = swap.fillOrder(order, r, vs, amount, takerTraits.traits);

        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [amount, -amount]);
        await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-expectedTaking, expectedTaking]);
    });
});
