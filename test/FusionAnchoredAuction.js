const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('@1inch/solidity-utils');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');
const {
    buildAnchoredAuctionDetails,
    buildAnchoredExclusivity,
    buildFeeTakerExtensions,
    buildOrder,
    buildTakerTraits,
    signOrder,
} = require('./helpers/orderUtils');
const { ether } = require('./helpers/utils');
const {
    BASE_POINTS,
    NO_FEE_DATA,
    ceilDiv,
    buildLegacyAuctionDetails,
    scaleByFill,
    takingAmountFor,
    makingAmountFor,
} = require('./helpers/fusionAuction');

const HALF_PERCENT = 50_000n; // 0.5% in 1e7

describe('FusionAnchoredAuction', function () {
    let maker, taker, otherResolver;

    before(async function () {
        [maker, taker, otherResolver] = await ethers.getSigners();
    });

    async function deployContractsAndInit () {
        const { dai, weth, inch, swap, chainId } = await deploySwapTokens();

        await dai.mint(maker, ether('1000000'));
        await inch.mint(taker, ether('1'));
        await weth.connect(taker).deposit({ value: ether('100') });
        await dai.connect(maker).approve(swap, ether('1000000'));
        await weth.connect(taker).approve(swap, ether('100'));

        const OrderRegistrator = await ethers.getContractFactory('OrderRegistrator');
        const registrator = await OrderRegistrator.deploy(swap);
        await registrator.waitForDeployment();

        const FusionAnchoredAuction = await ethers.getContractFactory('FusionAnchoredAuction');
        const auction = await FusionAnchoredAuction.deploy(registrator);
        await auction.waitForDeployment();

        const FeeTaker = await ethers.getContractFactory('FeeTaker');
        const feeTaker = await FeeTaker.deploy(swap, inch, weth, maker);
        await feeTaker.waitForDeployment();

        return { dai, weth, inch, swap, chainId, registrator, auction, feeTaker };
    }

    const MAKING_AMOUNT = ether('100');
    const TAKING_AMOUNT = ether('0.1');

    /** An order priced solely by the auction contract, with no settlement layer in front of it. */
    async function buildAuctionOrder ({ dai, weth, auction, auctionDetails, exclusivity, receiver }) {
        const auctionAddress = await auction.getAddress();
        return buildOrder(
            {
                maker: maker.address,
                receiver,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: MAKING_AMOUNT,
                takingAmount: TAKING_AMOUNT,
            },
            {
                makingAmountData: ethers.solidityPacked(['address', 'bytes'], [auctionAddress, auctionDetails]),
                takingAmountData: ethers.solidityPacked(['address', 'bytes'], [auctionAddress, auctionDetails]),
                postInteraction: exclusivity === undefined
                    ? '0x'
                    : ethers.solidityPacked(['address', 'bytes'], [auctionAddress, exclusivity]),
            },
        );
    }

    async function signature (order, chainId, swap) {
        return ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), maker));
    }

    async function announce (registrator, swap, chainId, order) {
        const sig = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), maker)).compactSerialized;
        await registrator.registerOrder(order, order.extension, sig);
        return await time.latest();
    }

    function fill (swap, order, sig, amount, { byMakingAmount = true, from = taker, overrides = {} } = {}) {
        const takerTraits = buildTakerTraits({ makingAmount: byMakingAmount, extension: order.extension });
        return swap.connect(from).fillOrderArgs(order, sig.r, sig.yParityAndS, amount, takerTraits.traits, takerTraits.args, overrides);
    }

    describe('unanchored auction', function () {
        it('prices at the initial rate bump before the auction starts', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 1000;
            const params = { startTime, duration: 100, initialRateBump: Number(HALF_PERCENT) };
            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
            const sig = await signature(order, chainId, swap);

            const fillTime = startTime - 10;
            await time.setNextBlockTimestamp(fillTime);
            const fillTx = fill(swap, order, sig, MAKING_AMOUNT);

            const expected = takingAmountFor(order, params, fillTime, MAKING_AMOUNT, MAKING_AMOUNT);
            expect(expected).to.equal(ceilDiv(TAKING_AMOUNT * (BASE_POINTS + HALF_PERCENT), BASE_POINTS));
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('decays linearly during the auction and settles at the floor price after it', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 100;
            const params = { startTime, duration: 100, initialRateBump: Number(HALF_PERCENT) };
            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
            const sig = await signature(order, chainId, swap);

            const halfway = startTime + 50;
            await time.setNextBlockTimestamp(halfway);
            const halfwayFill = fill(swap, order, sig, MAKING_AMOUNT / 2n);
            const halfwayExpected = takingAmountFor(order, params, halfway, MAKING_AMOUNT / 2n, MAKING_AMOUNT);
            // Half the auction elapsed, so half of the initial rate bump is left.
            expect(halfwayExpected).to.equal(ceilDiv((TAKING_AMOUNT / 2n) * (BASE_POINTS + HALF_PERCENT / 2n), BASE_POINTS));
            await expect(halfwayFill).to.changeTokenBalances(weth, [taker, maker], [-halfwayExpected, halfwayExpected]);

            const afterAuction = startTime + 200;
            await time.setNextBlockTimestamp(afterAuction);
            const floorFill = fill(swap, order, sig, MAKING_AMOUNT / 2n);
            const floorExpected = takingAmountFor(order, params, afterAuction, MAKING_AMOUNT / 2n, MAKING_AMOUNT / 2n);
            expect(floorExpected).to.equal(TAKING_AMOUNT / 2n);
            await expect(floorFill).to.changeTokenBalances(weth, [taker, maker], [-floorExpected, floorExpected]);
        });

        it('follows the piecewise curve through its points', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 100;
            const params = {
                startTime,
                duration: 100,
                initialRateBump: Number(HALF_PERCENT),
                points: [{ coefficient: Number(HALF_PERCENT / 2n), delay: 20 }],
            };
            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
            const sig = await signature(order, chainId, swap);

            const fillTime = startTime + 10;
            await time.setNextBlockTimestamp(fillTime);
            const fillTx = fill(swap, order, sig, MAKING_AMOUNT);

            const expected = takingAmountFor(order, params, fillTime, MAKING_AMOUNT, MAKING_AMOUNT);
            // Halfway to the first point, so halfway between the initial bump and that point's coefficient.
            expect(expected).to.equal(ceilDiv(TAKING_AMOUNT * (BASE_POINTS + HALF_PERCENT * 3n / 4n), BASE_POINTS));
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('walks past the points it has already passed', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 100;
            const params = {
                startTime,
                duration: 100,
                initialRateBump: Number(HALF_PERCENT),
                points: [
                    { coefficient: Number(HALF_PERCENT * 4n / 5n), delay: 20 },
                    { coefficient: Number(HALF_PERCENT * 2n / 5n), delay: 20 },
                ],
            };
            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
            const sig = await signature(order, chainId, swap);

            // Past both points, so the curve runs from the last one down to zero at the finish.
            const fillTime = startTime + 60;
            await time.setNextBlockTimestamp(fillTime);
            const fillTx = fill(swap, order, sig, MAKING_AMOUNT);

            const expected = takingAmountFor(order, params, fillTime, MAKING_AMOUNT, MAKING_AMOUNT);
            expect(expected).to.equal(ceilDiv(TAKING_AMOUNT * (BASE_POINTS + HALF_PERCENT * 4n / 15n), BASE_POINTS));
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('offsets the gas bump from the rate bump', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 100;
            const gasBumpEstimate = Number(HALF_PERCENT / 5n);
            const gasPriceEstimate = 1000; // 1 gwei
            const order = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails({
                    startTime,
                    duration: 100,
                    initialRateBump: Number(HALF_PERCENT),
                    gasBumpEstimate,
                    gasPriceEstimate,
                }),
            });
            const sig = await signature(order, chainId, swap);

            const baseFee = 1000000000n; // exactly the estimated gas price, so the whole gas bump applies
            await hre.network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x' + baseFee.toString(16)]);
            await time.setNextBlockTimestamp(startTime - 1);
            // The gas price is pinned because the fee history the provider would infer one from predates the
            // base fee this test forces.
            const fillTx = fill(swap, order, sig, MAKING_AMOUNT, { overrides: { gasPrice: baseFee * 2n } });

            const expected = ceilDiv(TAKING_AMOUNT * (BASE_POINTS + HALF_PERCENT - HALF_PERCENT / 5n), BASE_POINTS);
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });
    });

    describe('announcement-anchored auction', function () {
        const anchoredParams = { startTime: 0, duration: 100, initialRateBump: Number(HALF_PERCENT), startDelay: 10 };

        it('reverts when the order was never announced', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(anchoredParams) });
            const sig = await signature(order, chainId, swap);

            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.be.revertedWithCustomError(auction, 'OrderNotAnnounced');
        });

        it('starts the auction at the announcement however stale the built start time is', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(anchoredParams) });
            const sig = await signature(order, chainId, swap);

            // A build-time start of 0 is long past; the announcement is what the auction runs from.
            const announcedAt = await announce(registrator, swap, chainId, order);
            const resolved = { ...anchoredParams, startTime: announcedAt + anchoredParams.startDelay };

            const fillTime = resolved.startTime + 50;
            await time.setNextBlockTimestamp(fillTime);
            const fillTx = fill(swap, order, sig, MAKING_AMOUNT);

            const expected = takingAmountFor(order, resolved, fillTime, MAKING_AMOUNT, MAKING_AMOUNT);
            expect(expected).to.equal(ceilDiv(TAKING_AMOUNT * (BASE_POINTS + HALF_PERCENT / 2n), BASE_POINTS));
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('keeps a build-time start that is later than the announcement', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 1000;
            const params = { ...anchoredParams, startTime };
            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
            const sig = await signature(order, chainId, swap);

            const announcedAt = await announce(registrator, swap, chainId, order);
            expect(announcedAt + params.startDelay).to.be.lessThan(startTime);

            // Anchoring may only move the start later, so the auction has not begun yet.
            const fillTime = announcedAt + 20;
            await time.setNextBlockTimestamp(fillTime);
            const fillTx = fill(swap, order, sig, MAKING_AMOUNT);

            const expected = takingAmountFor(order, params, fillTime, MAKING_AMOUNT, MAKING_AMOUNT);
            expect(expected).to.equal(ceilDiv(TAKING_AMOUNT * (BASE_POINTS + HALF_PERCENT), BASE_POINTS));
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('gives a slow announcement the same curve a prompt one gets', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(anchoredParams) });
            const sig = await signature(order, chainId, swap);

            // Announce hours after the order was built, as a multisig collecting signatures would.
            await time.increase(6 * 60 * 60);
            const announcedAt = await announce(registrator, swap, chainId, order);

            const fillTime = announcedAt + anchoredParams.startDelay;
            await time.setNextBlockTimestamp(fillTime);
            const fillTx = fill(swap, order, sig, MAKING_AMOUNT);

            // Still the top of the curve rather than the floor price an unanchored order would have decayed to.
            const expected = ceilDiv(TAKING_AMOUNT * (BASE_POINTS + HALF_PERCENT), BASE_POINTS);
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });
    });

    describe('post-auction deadline', function () {
        const params = { startTime: 0, duration: 100, initialRateBump: Number(HALF_PERCENT), startDelay: 0, postAuctionWindow: 60 };

        it('allows a fill inside the window that follows the auction', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
            const sig = await signature(order, chainId, swap);
            const announcedAt = await announce(registrator, swap, chainId, order);

            await time.setNextBlockTimestamp(announcedAt + params.duration + params.postAuctionWindow - 1);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.changeTokenBalances(
                weth, [taker, maker], [-TAKING_AMOUNT, TAKING_AMOUNT],
            );
        });

        it('reverts once the window has passed', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
            const sig = await signature(order, chainId, swap);
            const announcedAt = await announce(registrator, swap, chainId, order);

            await time.setNextBlockTimestamp(announcedAt + params.duration + params.postAuctionWindow + 1);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.be.revertedWithCustomError(auction, 'AuctionExpired');
        });

        it('leaves an order without the deadline fillable indefinitely', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 10;
            const order = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails({ startTime, duration: 100, initialRateBump: Number(HALF_PERCENT) }),
            });
            const sig = await signature(order, chainId, swap);

            await time.setNextBlockTimestamp(startTime + 100000);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.changeTokenBalances(
                weth, [taker, maker], [-TAKING_AMOUNT, TAKING_AMOUNT],
            );
        });
    });

    describe('fill-scaled pricing', function () {
        // Filled after the auction has run its course, so the whole rate bump on offer comes from fill scaling.
        async function deployFilledOrder (fillScalingNumerator) {
            const contracts = await loadFixture(deployContractsAndInit);
            const { dai, weth, swap, chainId, auction } = contracts;
            const startTime = await time.latest() + 10;
            const params = { startTime, duration: 100, initialRateBump: Number(HALF_PERCENT), fillScalingNumerator };
            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
            const sig = await signature(order, chainId, swap);
            return { ...contracts, order, sig, params, afterAuction: startTime + 200 };
        }

        it('prices a full fill at the auction price', async function () {
            const { weth, swap, order, sig, params, afterAuction } = await deployFilledOrder(100);

            await time.setNextBlockTimestamp(afterAuction);
            const fillTx = fill(swap, order, sig, MAKING_AMOUNT);

            const expected = takingAmountFor(order, params, afterAuction, MAKING_AMOUNT, MAKING_AMOUNT);
            expect(expected).to.equal(TAKING_AMOUNT);
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('charges a tenth-sized fill nine tenths of the way back to the start price', async function () {
            const { weth, swap, order, sig, params, afterAuction } = await deployFilledOrder(100);

            await time.setNextBlockTimestamp(afterAuction);
            const makingAmount = MAKING_AMOUNT / 10n;
            const fillTx = fill(swap, order, sig, makingAmount);

            const expected = takingAmountFor(order, params, afterAuction, makingAmount, MAKING_AMOUNT);
            expect(expected).to.equal(ceilDiv((TAKING_AMOUNT / 10n) * (BASE_POINTS + HALF_PERCENT * 9n / 10n), BASE_POINTS));
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('scales the penalty by the configured strength', async function () {
            const { weth, swap, order, sig, params, afterAuction } = await deployFilledOrder(50);

            await time.setNextBlockTimestamp(afterAuction);
            const makingAmount = MAKING_AMOUNT / 10n;
            const fillTx = fill(swap, order, sig, makingAmount);

            const expected = takingAmountFor(order, params, afterAuction, makingAmount, MAKING_AMOUNT);
            // Half the strength, so half the premium of the previous case.
            expect(expected).to.equal(ceilDiv((TAKING_AMOUNT / 10n) * (BASE_POINTS + HALF_PERCENT * 9n / 20n), BASE_POINTS));
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('charges nothing extra at zero strength', async function () {
            const { weth, swap, order, sig, params, afterAuction } = await deployFilledOrder(0);

            await time.setNextBlockTimestamp(afterAuction);
            const makingAmount = MAKING_AMOUNT / 10n;
            const fillTx = fill(swap, order, sig, makingAmount);

            const expected = takingAmountFor(order, params, afterAuction, makingAmount, MAKING_AMOUNT);
            expect(expected).to.equal(TAKING_AMOUNT / 10n);
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('measures the share against what is left, so a remainder still clears at the auction price', async function () {
            const { weth, swap, order, sig, params, afterAuction } = await deployFilledOrder(100);

            await time.setNextBlockTimestamp(afterAuction);
            const firstFill = MAKING_AMOUNT / 2n;
            await expect(fill(swap, order, sig, firstFill)).to.changeTokenBalances(
                weth,
                [taker, maker],
                (() => {
                    const paid = takingAmountFor(order, params, afterAuction, firstFill, MAKING_AMOUNT);
                    return [-paid, paid];
                })(),
            );

            const secondFillTime = afterAuction + 10;
            await time.setNextBlockTimestamp(secondFillTime);
            const remaining = MAKING_AMOUNT - firstFill;
            const expected = takingAmountFor(order, params, secondFillTime, remaining, remaining);
            expect(expected).to.equal(TAKING_AMOUNT / 2n);
            await expect(fill(swap, order, sig, remaining)).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('never lets a split fill undercut a single fill of the same size', async function () {
            // Two takers buy the same total amount at the same auction state: one sweeps it in a single fill,
            // the other splits it in two. The premium is superadditive under splitting, so the splitter must
            // always pay more — otherwise takers would shred orders into parts and the penalty would price in
            // nothing.
            async function totalPaid (fills) {
                const { weth, swap, order, sig, afterAuction } = await deployFilledOrder(100);
                let paid = 0n;
                let nextTime = afterAuction;
                for (const makingAmount of fills) {
                    await time.setNextBlockTimestamp(nextTime++);
                    const before = await weth.balanceOf(taker);
                    await fill(swap, order, sig, makingAmount);
                    paid += before - await weth.balanceOf(taker);
                }
                return paid;
            }

            const single = await totalPaid([MAKING_AMOUNT / 2n]);
            const split = await totalPaid([MAKING_AMOUNT / 4n, MAKING_AMOUNT / 4n]);
            expect(split).to.be.greaterThan(single);

            const singleFull = await totalPaid([MAKING_AMOUNT]);
            const splitFull = await totalPaid([MAKING_AMOUNT / 2n, MAKING_AMOUNT / 2n]);
            expect(splitFull).to.be.greaterThan(singleFull);
        });

        it('mixes the auction and the fill share while the auction is running', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 10;
            const params = { startTime, duration: 100, initialRateBump: Number(HALF_PERCENT), fillScalingNumerator: 100 };
            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
            const sig = await signature(order, chainId, swap);

            const halfway = startTime + 50;
            await time.setNextBlockTimestamp(halfway);
            const makingAmount = MAKING_AMOUNT / 2n;
            const fillTx = fill(swap, order, sig, makingAmount);

            const expected = takingAmountFor(order, params, halfway, makingAmount, MAKING_AMOUNT);
            // Half the auction elapsed leaves half the bump, and half of the rest is restored by the half fill.
            expect(expected).to.equal(ceilDiv((TAKING_AMOUNT / 2n) * (BASE_POINTS + HALF_PERCENT * 3n / 4n), BASE_POINTS));
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('prices a fill by taking amount no better than an exact solution would', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 10;
            const params = { startTime, duration: 100, initialRateBump: Number(HALF_PERCENT), fillScalingNumerator: 100 };
            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
            const sig = await signature(order, chainId, swap);

            const afterAuction = startTime + 200;
            await time.setNextBlockTimestamp(afterAuction);
            const takingAmount = TAKING_AMOUNT / 10n;
            const fillTx = fill(swap, order, sig, takingAmount, { byMakingAmount: false });

            const expected = makingAmountFor(order, params, afterAuction, takingAmount, MAKING_AMOUNT);
            await expect(fillTx).to.changeTokenBalances(dai, [taker, maker], [expected, -expected]);

            // The estimate is conservative: never more making tokens than the exact fixed point would hand out.
            const exact = (() => {
                let amount = expected;
                for (let i = 0; i < 64; i++) {
                    const rateBump = scaleByFill(0n, params, amount, MAKING_AMOUNT);
                    amount = (order.makingAmount * takingAmount / order.takingAmount) * BASE_POINTS / (BASE_POINTS + rateBump);
                }
                return amount;
            })();
            expect(expected).to.be.lessThanOrEqual(exact);
        });

        it('rejects a strength above 100%', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 10;
            const order = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails({
                    startTime,
                    duration: 100,
                    initialRateBump: Number(HALF_PERCENT),
                    fillScalingNumerator: 101,
                }),
            });
            const sig = await signature(order, chainId, swap);

            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.be.revertedWithCustomError(auction, 'InvalidFillScalingNumerator');
        });
    });

    describe('announcement-anchored resolver exclusivity', function () {
        const auctionParams = { startTime: 0, duration: 100, initialRateBump: Number(HALF_PERCENT), startDelay: 0 };

        it('holds the exclusive window open relative to the announcement', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const order = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails(auctionParams),
                exclusivity: buildAnchoredExclusivity({
                    allowedTimeDelay: 30,
                    whitelist: [{ address: taker.address }],
                }),
            });
            const sig = await signature(order, chainId, swap);
            const announcedAt = await announce(registrator, swap, chainId, order);

            await time.setNextBlockTimestamp(announcedAt + 29);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.be.revertedWithCustomError(auction, 'AllowedTimeViolation');

            await time.setNextBlockTimestamp(announcedAt + 30);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.changeTokenBalances(dai, [taker, maker], [MAKING_AMOUNT, -MAKING_AMOUNT]);
        });

        it('makes a resolver outside the whitelist wait out every window', async function () {
            const { dai, weth, swap, chainId, registrator, auction, inch } = await loadFixture(deployContractsAndInit);

            await inch.mint(otherResolver, ether('1'));
            await weth.connect(otherResolver).deposit({ value: ether('1') });
            await weth.connect(otherResolver).approve(swap, ether('1'));

            const order = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails(auctionParams),
                exclusivity: buildAnchoredExclusivity({
                    allowedTimeDelay: 10,
                    whitelist: [{ address: taker.address, delta: 20 }],
                }),
            });
            const sig = await signature(order, chainId, swap);
            const announcedAt = await announce(registrator, swap, chainId, order);

            await time.setNextBlockTimestamp(announcedAt + 25);
            await expect(fill(swap, order, sig, MAKING_AMOUNT, { from: otherResolver }))
                .to.be.revertedWithCustomError(auction, 'AllowedTimeViolation');

            await time.setNextBlockTimestamp(announcedAt + 30);
            await expect(fill(swap, order, sig, MAKING_AMOUNT, { from: otherResolver }))
                .to.changeTokenBalances(dai, [otherResolver, maker], [MAKING_AMOUNT, -MAKING_AMOUNT]);
        });

        it('still enforces an absolute allowed time when not anchored', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const allowedTime = await time.latest() + 100;
            const order = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails({ startTime: allowedTime, duration: 100, initialRateBump: 0 }),
                exclusivity: buildAnchoredExclusivity({ allowedTime, whitelist: [{ address: taker.address }] }),
            });
            const sig = await signature(order, chainId, swap);

            await time.setNextBlockTimestamp(allowedTime - 1);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.be.revertedWithCustomError(auction, 'AllowedTimeViolation');

            await time.setNextBlockTimestamp(allowedTime);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.changeTokenBalances(dai, [taker, maker], [MAKING_AMOUNT, -MAKING_AMOUNT]);
        });

        it('passes the fill on to the next post-interaction', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const InteractionMock = await ethers.getContractFactory('InteractionMock');
            const interactionMock = await InteractionMock.deploy();
            await interactionMock.waitForDeployment();

            const buildOrderWithChainedInteraction = async (threshold) => {
                const order = await buildAuctionOrder({
                    dai,
                    weth,
                    auction,
                    auctionDetails: buildAnchoredAuctionDetails({ ...auctionParams, startTime: 0 }),
                    exclusivity: ethers.solidityPacked(
                        ['bytes', 'address', 'uint256'],
                        [
                            buildAnchoredExclusivity({ allowedTimeDelay: 0, whitelist: [{ address: taker.address }] }),
                            await interactionMock.getAddress(),
                            threshold,
                        ],
                    ),
                });
                return { order, sig: await signature(order, chainId, swap) };
            };

            // The auction is running, so the fill costs more than the unbumped taking amount.
            const rejecting = await buildOrderWithChainedInteraction(TAKING_AMOUNT);
            await announce(registrator, swap, chainId, rejecting.order);
            await expect(fill(swap, rejecting.order, rejecting.sig, MAKING_AMOUNT))
                .to.be.revertedWithCustomError(interactionMock, 'TakingAmountTooHigh');

            const accepting = await buildOrderWithChainedInteraction(TAKING_AMOUNT * 2n);
            await announce(registrator, swap, chainId, accepting.order);
            await expect(fill(swap, accepting.order, accepting.sig, MAKING_AMOUNT))
                .to.changeTokenBalances(dai, [taker, maker], [MAKING_AMOUNT, -MAKING_AMOUNT]);
        });

        it('reverts when an anchored window has no announcement to hang on', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 10;
            const order = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails({ startTime, duration: 100, initialRateBump: 0 }),
                exclusivity: buildAnchoredExclusivity({ allowedTimeDelay: 0, whitelist: [{ address: taker.address }] }),
            });
            const sig = await signature(order, chainId, swap);

            await time.setNextBlockTimestamp(startTime + 200);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.be.revertedWithCustomError(auction, 'OrderNotAnnounced');
        });
    });

    describe('parity with the deployed settlement auction', function () {
        it('prices an unanchored auction exactly as the settlement contract does', async function () {
            const { dai, weth, inch, swap, auction } = await loadFixture(deployContractsAndInit);

            const SimpleSettlementMock = await ethers.getContractFactory('SimpleSettlementMock');
            const settlement = await SimpleSettlementMock.deploy(swap, inch, weth, maker);
            await settlement.waitForDeployment();

            const params = {
                gasBumpEstimate: 100000,
                gasPriceEstimate: 1000,
                startTime: await time.latest() + 100,
                duration: 200,
                initialRateBump: Number(HALF_PERCENT),
                points: [
                    { coefficient: Number(HALF_PERCENT * 4n / 5n), delay: 30 },
                    { coefficient: Number(HALF_PERCENT * 2n / 5n), delay: 30 },
                ],
            };
            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
            const orderHash = await swap.hashOrder(order);
            const settlementExtraData = ethers.solidityPacked(['bytes', 'bytes'], [buildLegacyAuctionDetails(params), NO_FEE_DATA]);
            const anchoredExtraData = buildAnchoredAuctionDetails(params);

            // Before the auction, at each of its points, between them, and after it has finished.
            for (const offset of [-10, 0, 15, 30, 45, 60, 120, 199, 200, 500]) {
                await time.setNextBlockTimestamp(params.startTime + offset);
                await hre.network.provider.send('evm_mine');

                for (const amount of [MAKING_AMOUNT, MAKING_AMOUNT / 3n]) {
                    const args = [order, order.extension, orderHash, taker.address, amount, MAKING_AMOUNT];
                    expect(await auction.getTakingAmount(...args, anchoredExtraData))
                        .to.equal(await settlement.getTakingAmount(...args, settlementExtraData));
                    expect(await auction.getMakingAmount(...args, anchoredExtraData))
                        .to.equal(await settlement.getMakingAmount(...args, settlementExtraData));
                }
            }
        });
    });

    describe('composition with a settlement contract', function () {
        it('leaves the settlement auction contributing nothing when its curve is neutralized', async function () {
            const { dai, weth, inch, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const SimpleSettlementMock = await ethers.getContractFactory('SimpleSettlementMock');
            const settlement = await SimpleSettlementMock.deploy(swap, inch, weth, maker);
            await settlement.waitForDeployment();

            const resolverFee = 1000n; // 1% in 1e5
            const auctionParams = { startTime: 0, duration: 100, initialRateBump: Number(HALF_PERCENT), startDelay: 10, fillScalingNumerator: 100 };
            const auctionTail = ethers.solidityPacked(
                ['address', 'bytes'],
                [await auction.getAddress(), buildAnchoredAuctionDetails(auctionParams)],
            );
            const exclusivityTail = ethers.solidityPacked(
                ['address', 'bytes'],
                [await auction.getAddress(), buildAnchoredExclusivity({ allowedTimeDelay: 30, whitelist: [{ address: taker.address }] })],
            );

            const order = buildOrder(
                {
                    maker: maker.address,
                    receiver: await settlement.getAddress(),
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: MAKING_AMOUNT,
                    takingAmount: TAKING_AMOUNT,
                },
                buildFeeTakerExtensions({
                    feeTaker: await settlement.getAddress(),
                    // A curve that cannot move: no initial bump and no duration, so the settlement multiplies by one
                    // and the chained auction is the only thing pricing the order.
                    getterExtraPrefix: buildLegacyAuctionDetails(),
                    protocolFeeRecipient: otherResolver.address,
                    resolverFee,
                    whitelistDiscount: 100,
                    whitelist: '0x01' + taker.address.slice(-20),
                    // The settlement's own whitelist is left open, so exclusivity is the chained contract's to enforce.
                    whitelistPostInteraction: ethers.solidityPacked(
                        ['uint32', 'uint8', 'uint80', 'uint16'],
                        [0, 1, BigInt(taker.address) & ((1n << 80n) - 1n), 0],
                    ),
                    customMakingGetter: auctionTail,
                    customTakingGetter: auctionTail,
                    customPostInteraction: exclusivityTail,
                }),
            );
            const sig = await signature(order, chainId, swap);
            const announcedAt = await announce(registrator, swap, chainId, order);

            // The exclusivity chained behind the settlement still bites, though the settlement let the taker in.
            await time.setNextBlockTimestamp(announcedAt + 20);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.be.revertedWithCustomError(auction, 'AllowedTimeViolation');

            const fillTime = announcedAt + 60;
            await time.setNextBlockTimestamp(fillTime);
            const fillTx = fill(swap, order, sig, MAKING_AMOUNT / 2n);

            // The price is the anchored, fill-scaled curve with the resolver fee on top, and nothing else.
            const auctionPrice = takingAmountFor(
                order,
                { ...auctionParams, startTime: announcedAt + auctionParams.startDelay },
                fillTime,
                MAKING_AMOUNT / 2n,
                MAKING_AMOUNT,
            );
            const withFee = ceilDiv(auctionPrice * (100000n + resolverFee), 100000n);
            const feeAmount = withFee - ceilDiv(withFee * 100000n, 100000n + resolverFee);
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker, otherResolver], [-withFee, withFee - feeAmount, feeAmount]);
            await expect(fillTx).to.changeTokenBalances(dai, [taker, maker], [MAKING_AMOUNT / 2n, -MAKING_AMOUNT / 2n]);
        });

        it('prices through the fee taker and the anchored auction together', async function () {
            const { dai, weth, swap, chainId, registrator, auction, feeTaker } = await loadFixture(deployContractsAndInit);

            const resolverFee = 1000n; // 1% in 1e5
            const auctionParams = { startTime: 0, duration: 100, initialRateBump: Number(HALF_PERCENT), startDelay: 10 };
            const auctionTail = ethers.solidityPacked(
                ['address', 'bytes'],
                [await auction.getAddress(), buildAnchoredAuctionDetails(auctionParams)],
            );
            const exclusivityTail = ethers.solidityPacked(
                ['address', 'bytes'],
                [await auction.getAddress(), buildAnchoredExclusivity({ allowedTimeDelay: 30, whitelist: [{ address: taker.address }] })],
            );

            const order = buildOrder(
                {
                    maker: maker.address,
                    receiver: await feeTaker.getAddress(),
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: MAKING_AMOUNT,
                    takingAmount: TAKING_AMOUNT,
                },
                buildFeeTakerExtensions({
                    feeTaker: await feeTaker.getAddress(),
                    protocolFeeRecipient: otherResolver.address,
                    resolverFee,
                    whitelistDiscount: 100,
                    customMakingGetter: auctionTail,
                    customTakingGetter: auctionTail,
                    customPostInteraction: exclusivityTail,
                }),
            );
            const sig = await signature(order, chainId, swap);
            const announcedAt = await announce(registrator, swap, chainId, order);

            // The exclusivity chained behind the fee taker still bites.
            await time.setNextBlockTimestamp(announcedAt + 20);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.be.revertedWithCustomError(auction, 'AllowedTimeViolation');

            const fillTime = announcedAt + 60;
            await time.setNextBlockTimestamp(fillTime);
            const fillTx = fill(swap, order, sig, MAKING_AMOUNT);

            const auctionPrice = takingAmountFor(order, { ...auctionParams, startTime: announcedAt + 10 }, fillTime, MAKING_AMOUNT, MAKING_AMOUNT);
            const withFee = ceilDiv(auctionPrice * (100000n + resolverFee), 100000n);
            const feeAmount = withFee - ceilDiv(withFee * 100000n, 100000n + resolverFee);
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker, otherResolver], [-withFee, withFee - feeAmount, feeAmount]);
            await expect(fillTx).to.changeTokenBalances(dai, [taker, maker], [MAKING_AMOUNT, -MAKING_AMOUNT]);
        });
    });
});
