const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('@1inch/solidity-utils');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens, deployArbitraryPredicate } = require('./helpers/fixtures');
const { buildOrder, buildTakerTraits, signOrder, buildMakerTraits } = require('./helpers/orderUtils');
const { ether } = require('./helpers/utils');

// Specification tests closing three gaps the existing suite left open:
//
//   GAP-014 - SEC-003. The `not` and `eq` predicate primitives are documented
//             in description.md and no test ever called them. Coverage
//             reported PredicateHelper.sol lines 40, 41, 48, 49 unreached.
//   GAP-007 - TIME-001. The expiry boundary second itself was untested: the
//             suite covered before and after but not the inclusive boundary.
//   GAP-005 - FR-CANCEL-003. Only the failure path of bitsInvalidateForOrder
//             was covered; OrderMixin.sol lines 107-108, the success path,
//             were unreached.
//
// Scenarios: SCN-030, SCN-028, SCN-036.

describe('Predicates and boundaries', function () {
    let addr, addr1;

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
    });

    async function deployContractsAndInit () {
        const { dai, weth, swap, chainId } = await deploySwapTokens();

        await dai.mint(addr1, ether('1000000'));
        await weth.deposit({ value: ether('100') });
        await dai.connect(addr1).approve(swap, ether('1000000'));
        await weth.approve(swap, ether('100'));

        const { arbitraryPredicate } = await deployArbitraryPredicate();

        return { dai, weth, swap, chainId, arbitraryPredicate };
    }

    async function signedOrder ({ dai, weth, swap, chainId, makerTraits, predicate }) {
        const order = buildOrder(
            {
                maker: addr1.address,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                makerTraits: makerTraits ?? buildMakerTraits(),
            },
            predicate ? { predicate } : {},
        );
        const { r, yParityAndS: vs } = ethers.Signature.from(
            await signOrder(order, chainId, await swap.getAddress(), addr1),
        );
        return { order, r, vs };
    }

    describe('SEC-003 predicate primitives [GAP-014]', function () {
        // Builds `arbitraryStaticCall(mock, copyArg(value))`, which evaluates
        // to `value`.
        function arbitraryCall (swap, arbitraryPredicate, value) {
            return swap.interface.encodeFunctionData('arbitraryStaticCall', [
                arbitraryPredicate.target,
                arbitraryPredicate.interface.encodeFunctionData('copyArg', [value]),
            ]);
        }

        // `not` returns true when the inner result is exactly 0.
        it('[SEC-003] `not` passes when the inner call returns zero', async function () {
            const { dai, weth, swap, chainId, arbitraryPredicate } = await loadFixture(deployContractsAndInit);

            const predicate = swap.interface.encodeFunctionData('not', [
                arbitraryCall(swap, arbitraryPredicate, 0),
            ]);
            expect(await swap.checkPredicate(predicate)).to.equal(true);

            const { order, r, vs } = await signedOrder({ dai, weth, swap, chainId, predicate });
            const takerTraits = buildTakerTraits({ extension: order.extension });

            await expect(
                swap.fillOrderArgs(order, r, vs, order.makingAmount, takerTraits.traits, takerTraits.args),
            ).to.changeTokenBalances(dai, [addr, addr1], [order.makingAmount, -order.makingAmount]);
        });

        it('[SEC-003] `not` fails when the inner call returns non-zero', async function () {
            const { dai, weth, swap, chainId, arbitraryPredicate } = await loadFixture(deployContractsAndInit);

            const predicate = swap.interface.encodeFunctionData('not', [
                arbitraryCall(swap, arbitraryPredicate, 1),
            ]);
            expect(await swap.checkPredicate(predicate)).to.equal(false);

            const { order, r, vs } = await signedOrder({ dai, weth, swap, chainId, predicate });
            const takerTraits = buildTakerTraits({ extension: order.extension });

            await expect(
                swap.fillOrderArgs(order, r, vs, order.makingAmount, takerTraits.traits, takerTraits.args),
            ).to.be.revertedWithCustomError(swap, 'PredicateIsNotTrue');
        });

        it('[SEC-003] `eq` passes only on an exact match', async function () {
            const { swap, arbitraryPredicate } = await loadFixture(deployContractsAndInit);

            const matching = swap.interface.encodeFunctionData('eq', [
                42, arbitraryCall(swap, arbitraryPredicate, 42),
            ]);
            const offByOne = swap.interface.encodeFunctionData('eq', [
                42, arbitraryCall(swap, arbitraryPredicate, 43),
            ]);

            expect(await swap.checkPredicate(matching)).to.equal(true);
            expect(await swap.checkPredicate(offByOne)).to.equal(false);
        });

        it('[SEC-003] `eq` blocks a fill when the condition is false', async function () {
            const { dai, weth, swap, chainId, arbitraryPredicate } = await loadFixture(deployContractsAndInit);

            const predicate = swap.interface.encodeFunctionData('eq', [
                42, arbitraryCall(swap, arbitraryPredicate, 41),
            ]);

            const { order, r, vs } = await signedOrder({ dai, weth, swap, chainId, predicate });
            const takerTraits = buildTakerTraits({ extension: order.extension });

            await expect(
                swap.fillOrderArgs(order, r, vs, order.makingAmount, takerTraits.traits, takerTraits.args),
            ).to.be.revertedWithCustomError(swap, 'PredicateIsNotTrue');
        });

        // SEC-003 criterion 4. `res == 1` is stricter than truthiness, so a
        // predicate returning any other non-zero value fails closed. Easy to
        // lose in a refactor, so pinned explicitly.
        it('[SEC-003] treats a predicate result of 2 as false, not as truthy', async function () {
            const { swap, arbitraryPredicate } = await loadFixture(deployContractsAndInit);

            expect(await swap.checkPredicate(arbitraryCall(swap, arbitraryPredicate, 1))).to.equal(true);
            expect(await swap.checkPredicate(arbitraryCall(swap, arbitraryPredicate, 2))).to.equal(false);
            expect(await swap.checkPredicate(arbitraryCall(swap, arbitraryPredicate, 0))).to.equal(false);
        });
    });

    describe('TIME-001 expiry boundary [GAP-007]', function () {
        // SCN-030. Three rows: below, at, above. The middle one is the whole
        // point - `expiration < block.timestamp` means the order is still
        // fillable during the entire second equal to its expiry.
        it('[TIME-001] fills one second before expiry', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const expiry = BigInt(await time.latest()) + 3600n;
            const { order, r, vs } = await signedOrder({
                dai, weth, swap, chainId, makerTraits: buildMakerTraits({ expiry }),
            });

            await time.setNextBlockTimestamp(expiry - 1n);
            const takerTraits = buildTakerTraits({});

            await expect(
                swap.fillOrder(order, r, vs, order.makingAmount, takerTraits.traits),
            ).to.changeTokenBalances(dai, [addr, addr1], [order.makingAmount, -order.makingAmount]);
        });

        it('[TIME-001] fills at exactly the expiry timestamp', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const expiry = BigInt(await time.latest()) + 3600n;
            const { order, r, vs } = await signedOrder({
                dai, weth, swap, chainId, makerTraits: buildMakerTraits({ expiry }),
            });

            await time.setNextBlockTimestamp(expiry);
            const takerTraits = buildTakerTraits({});

            await expect(
                swap.fillOrder(order, r, vs, order.makingAmount, takerTraits.traits),
            ).to.changeTokenBalances(dai, [addr, addr1], [order.makingAmount, -order.makingAmount]);
        });

        it('[TIME-001] reverts OrderExpired one second after expiry', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const expiry = BigInt(await time.latest()) + 3600n;
            const { order, r, vs } = await signedOrder({
                dai, weth, swap, chainId, makerTraits: buildMakerTraits({ expiry }),
            });

            await time.setNextBlockTimestamp(expiry + 1n);
            const takerTraits = buildTakerTraits({});

            await expect(
                swap.fillOrder(order, r, vs, order.makingAmount, takerTraits.traits),
            ).to.be.revertedWithCustomError(swap, 'OrderExpired');
        });

        // SCN-031. A zero expiry means no expiry, not "expired at the epoch".
        it('[TIME-001] never expires when the expiry field is zero', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const { order, r, vs } = await signedOrder({
                dai, weth, swap, chainId, makerTraits: buildMakerTraits({ expiry: 0 }),
            });

            // Ten years on.
            await time.increase(10 * 365 * 24 * 3600);
            const takerTraits = buildTakerTraits({});

            await expect(
                swap.fillOrder(order, r, vs, order.makingAmount, takerTraits.traits),
            ).to.changeTokenBalances(dai, [addr, addr1], [order.makingAmount, -order.makingAmount]);
        });
    });

    describe('FR-CANCEL-003 mass invalidation [GAP-005]', function () {
        // SCN-028. The success path: previously only the revert branch was
        // exercised, and only through simulate().
        it('[FR-CANCEL-003][INV-004] invalidates the traits nonce plus the mask in one call', async function () {
            const { swap } = await loadFixture(deployContractsAndInit);

            const nonce = 5n;
            const makerTraits = buildMakerTraits({ allowMultipleFills: false, nonce });
            const additionalMask = (1n << 6n) | (1n << 7n);
            const expectedSlotValue = (1n << nonce) | additionalMask;

            expect(await swap.bitInvalidatorForOrder(addr1.address, 0)).to.equal(0n);

            await expect(swap.connect(addr1).bitsInvalidateForOrder(makerTraits, additionalMask))
                .to.emit(swap, 'BitInvalidatorUpdated')
                .withArgs(addr1.address, 0, expectedSlotValue);

            expect(await swap.bitInvalidatorForOrder(addr1.address, 0)).to.equal(expectedSlotValue);
        });

        // INV-004 criterion 4 / SCN-028: the write is an OR, so no previously
        // set bit is ever cleared.
        it('[FR-CANCEL-003][INV-004] never clears a previously set bit', async function () {
            const { swap } = await loadFixture(deployContractsAndInit);

            const first = buildMakerTraits({ allowMultipleFills: false, nonce: 1 });
            await swap.connect(addr1).bitsInvalidateForOrder(first, 0);
            const afterFirst = await swap.bitInvalidatorForOrder(addr1.address, 0);
            expect(afterFirst).to.equal(1n << 1n);

            const second = buildMakerTraits({ allowMultipleFills: false, nonce: 2 });
            await swap.connect(addr1).bitsInvalidateForOrder(second, 0);
            const afterSecond = await swap.bitInvalidatorForOrder(addr1.address, 0);

            expect(afterSecond & afterFirst).to.equal(afterFirst);
            expect(afterSecond).to.equal((1n << 1n) | (1n << 2n));
        });

        // Unlike a fill, mass invalidation is idempotent: re-invalidating an
        // already-set bit succeeds rather than reverting BitInvalidatedOrder.
        it('[FR-CANCEL-003] is idempotent for an already-invalidated nonce', async function () {
            const { swap } = await loadFixture(deployContractsAndInit);

            const makerTraits = buildMakerTraits({ allowMultipleFills: false, nonce: 9 });
            await swap.connect(addr1).bitsInvalidateForOrder(makerTraits, 0);
            const after = await swap.bitInvalidatorForOrder(addr1.address, 0);

            await expect(swap.connect(addr1).bitsInvalidateForOrder(makerTraits, 0)).to.not.be.reverted;
            expect(await swap.bitInvalidatorForOrder(addr1.address, 0)).to.equal(after);
        });

        it('[FR-CANCEL-003] rejects traits that select the remaining invalidator', async function () {
            const { swap } = await loadFixture(deployContractsAndInit);

            // Partial and multiple fills both allowed selects the remaining
            // invalidator, which has no bitmap to mass-invalidate.
            const makerTraits = buildMakerTraits({ allowPartialFill: true, allowMultipleFills: true });

            await expect(swap.connect(addr1).bitsInvalidateForOrder(makerTraits, 0))
                .to.be.revertedWithCustomError(swap, 'OrderIsNotSuitableForMassInvalidation');
        });

        // The consequence: every nonce covered by the mask becomes unfillable.
        it('[FR-CANCEL-003] makes every masked nonce unfillable', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const invalidateTraits = buildMakerTraits({ allowMultipleFills: false, nonce: 5 });
            await swap.connect(addr1).bitsInvalidateForOrder(invalidateTraits, (1n << 6n) | (1n << 7n));

            for (const nonce of [5, 6, 7]) {
                const { order, r, vs } = await signedOrder({
                    dai,
                    weth,
                    swap,
                    chainId,
                    makerTraits: buildMakerTraits({ allowMultipleFills: false, nonce }),
                });
                const takerTraits = buildTakerTraits({});

                await expect(
                    swap.fillOrder(order, r, vs, order.makingAmount, takerTraits.traits),
                    `nonce ${nonce} was still fillable`,
                ).to.be.revertedWithCustomError(swap, 'BitInvalidatedOrder');
            }
        });
    });
});
