const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('@1inch/solidity-utils');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');
const {
    buildAnchoredAuctionDetails,
    buildAnchoredExclusivity,
    buildFeeTakerExtensions,
    buildMakerTraits,
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
    fillPremiumAt,
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

        it('treats the start and finish instants as inside and after the auction', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 100;
            const params = { startTime, duration: 100, initialRateBump: Number(HALF_PERCENT) };
            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
            const sig = await signature(order, chainId, swap);

            // Exactly at the start the full initial bump still applies.
            await time.setNextBlockTimestamp(startTime);
            const atStart = ceilDiv((TAKING_AMOUNT / 2n) * (BASE_POINTS + HALF_PERCENT), BASE_POINTS);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 2n)).to.changeTokenBalances(weth, [taker, maker], [-atStart, atStart]);

            // Exactly at the finish the bump is already gone.
            await time.setNextBlockTimestamp(startTime + params.duration);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 2n)).to.changeTokenBalances(
                weth, [taker, maker], [-TAKING_AMOUNT / 2n, TAKING_AMOUNT / 2n],
            );
        });

        it('turns a zero-duration auction into a step from the initial bump to the floor', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 100;
            const order = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails({ startTime, duration: 0, initialRateBump: Number(HALF_PERCENT) }),
            });
            const sig = await signature(order, chainId, swap);

            await time.setNextBlockTimestamp(startTime);
            const atStart = ceilDiv((TAKING_AMOUNT / 2n) * (BASE_POINTS + HALF_PERCENT), BASE_POINTS);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 2n)).to.changeTokenBalances(weth, [taker, maker], [-atStart, atStart]);

            await time.setNextBlockTimestamp(startTime + 1);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 2n)).to.changeTokenBalances(
                weth, [taker, maker], [-TAKING_AMOUNT / 2n, TAKING_AMOUNT / 2n],
            );
        });

        it('lets a zero-delay point re-anchor the curve away from the initial bump', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 100;
            const params = {
                startTime,
                duration: 100,
                initialRateBump: Number(HALF_PERCENT),
                points: [{ coefficient: Number(HALF_PERCENT / 5n), delay: 0 }],
            };
            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
            const sig = await signature(order, chainId, swap);

            // The moment the auction starts the curve runs from the zero-delay point, not the initial bump.
            const fillTime = startTime + 50;
            await time.setNextBlockTimestamp(fillTime);
            const fillTx = fill(swap, order, sig, MAKING_AMOUNT);

            const expected = takingAmountFor(order, params, fillTime, MAKING_AMOUNT, MAKING_AMOUNT);
            expect(expected).to.equal(ceilDiv(TAKING_AMOUNT * (BASE_POINTS + HALF_PERCENT / 10n), BASE_POINTS));
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('clamps the price at the floor when the gas bump exceeds the auction bump', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 100;
            const baseFee = 1000000000n; // 1 gwei, exactly the estimate below
            const overrides = { gasPrice: baseFee * 2n };

            // A gas bump worth twice the whole curve: the rate bump bottoms out at zero rather than underflowing.
            const clamped = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails({
                    startTime,
                    duration: 100,
                    initialRateBump: Number(HALF_PERCENT),
                    gasBumpEstimate: Number(HALF_PERCENT * 2n),
                    gasPriceEstimate: 1000,
                }),
            });
            const clampedSig = await signature(clamped, chainId, swap);
            await hre.network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x' + baseFee.toString(16)]);
            await time.setNextBlockTimestamp(startTime + 50);
            await expect(fill(swap, clamped, clampedSig, MAKING_AMOUNT, { overrides })).to.changeTokenBalances(
                weth, [taker, maker], [-TAKING_AMOUNT, TAKING_AMOUNT],
            );

            // A gas bump estimate without a gas price estimate is inert rather than dividing by zero.
            const inert = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails({
                    startTime,
                    duration: 100,
                    initialRateBump: Number(HALF_PERCENT),
                    gasBumpEstimate: Number(HALF_PERCENT * 2n),
                    gasPriceEstimate: 0,
                }),
            });
            const inertSig = await signature(inert, chainId, swap);
            await hre.network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x' + baseFee.toString(16)]);
            await time.setNextBlockTimestamp(startTime + 75);
            const expected = ceilDiv(TAKING_AMOUNT * (BASE_POINTS + HALF_PERCENT / 4n), BASE_POINTS);
            await expect(fill(swap, inert, inertSig, MAKING_AMOUNT, { overrides })).to.changeTokenBalances(
                weth, [taker, maker], [-expected, expected],
            );
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

        it('lets anyone holding the signature announce, and prices from that announcement', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(anchoredParams) });
            const sig = await signature(order, chainId, swap);

            // Registration is permissionless by design: the first caller starts the clock.
            await registrator.connect(otherResolver).registerOrder(order, order.extension, sig.compactSerialized);
            const announcedAt = await time.latest();

            await time.setNextBlockTimestamp(announcedAt + anchoredParams.startDelay);
            const expected = ceilDiv(TAKING_AMOUNT * (BASE_POINTS + HALF_PERCENT), BASE_POINTS);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('does not outrank a cancellation by the maker', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(anchoredParams) });
            const sig = await signature(order, chainId, swap);
            const announcedAt = await announce(registrator, swap, chainId, order);

            // The announcement is immutable, but the order itself stays cancellable at the protocol level.
            await swap.connect(maker).cancelOrder(order.makerTraits, await swap.hashOrder(order));

            await time.setNextBlockTimestamp(announcedAt + anchoredParams.startDelay + 50);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.be.revertedWithCustomError(swap, 'InvalidatedOrder');
        });

        it('cannot resurrect an order past its own expiry', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const expiry = await time.latest() + 100;
            const auctionAddress = await auction.getAddress();
            const auctionData = ethers.solidityPacked(['address', 'bytes'], [auctionAddress, buildAnchoredAuctionDetails(anchoredParams)]);
            const order = buildOrder(
                {
                    maker: maker.address,
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: MAKING_AMOUNT,
                    takingAmount: TAKING_AMOUNT,
                    makerTraits: buildMakerTraits({ expiry }),
                },
                { makingAmountData: auctionData, takingAmountData: auctionData },
            );
            const sig = await signature(order, chainId, swap);
            const announcedAt = await announce(registrator, swap, chainId, order);
            expect(await registrator.announcedAt(await swap.hashOrder(order))).to.equal(announcedAt);

            // The maker's absolute expiry is enforced by the protocol core and always wins over the announcement.
            await time.setNextBlockTimestamp(announcedAt + 20);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 2n)).to.changeTokenBalances(dai, [taker, maker], [MAKING_AMOUNT / 2n, -MAKING_AMOUNT / 2n]);

            await time.setNextBlockTimestamp(expiry + 1);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 2n)).to.be.revertedWithCustomError(swap, 'OrderExpired');
        });

        it('handles every optional field at once, in both fill directions', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const params = {
                startTime: 0,
                duration: 100,
                initialRateBump: Number(HALF_PERCENT),
                startDelay: 10,
                fillScalingNumerator: 100,
                postAuctionWindow: 60,
            };
            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
            const sig = await signature(order, chainId, swap);
            const announcedAt = await announce(registrator, swap, chainId, order);
            const resolved = { ...params, startTime: announcedAt + params.startDelay };

            // A fill by making amount halfway through the anchored auction, penalized for its half share.
            const firstFillTime = announcedAt + 60;
            await time.setNextBlockTimestamp(firstFillTime);
            const firstExpected = takingAmountFor(order, resolved, firstFillTime, MAKING_AMOUNT / 2n, MAKING_AMOUNT);
            expect(firstExpected).to.equal(ceilDiv((TAKING_AMOUNT / 2n) * (BASE_POINTS + HALF_PERCENT * 3n / 4n), BASE_POINTS));
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 2n)).to.changeTokenBalances(weth, [taker, maker], [-firstExpected, firstExpected]);

            // A fill by taking amount after the auction, priced through the conservative estimate.
            const secondFillTime = announcedAt + 120;
            await time.setNextBlockTimestamp(secondFillTime);
            const takingAmount = TAKING_AMOUNT / 10n;
            const secondExpected = makingAmountFor(order, resolved, secondFillTime, takingAmount, MAKING_AMOUNT / 2n);
            await expect(fill(swap, order, sig, takingAmount, { byMakingAmount: false }))
                .to.changeTokenBalances(dai, [taker, maker], [secondExpected, -secondExpected]);

            // And past the anchored deadline nothing fills at all.
            await time.setNextBlockTimestamp(announcedAt + params.startDelay + params.duration + params.postAuctionWindow + 1);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 10n)).to.be.revertedWithCustomError(auction, 'AuctionExpired');
        });

        it('prices a fill announced in the same block at the top of the curve', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const order = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails({ ...anchoredParams, startDelay: 0 }),
            });
            const sig = await signature(order, chainId, swap);

            // A resolver may announce and fill atomically; the fill sees the announcement written earlier in
            // the same block and prices at the very start of the curve.
            const compact = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), maker)).compactSerialized;
            await hre.network.provider.send('evm_setAutomine', [false]);
            let announceTx, fillTx;
            try {
                announceTx = await registrator.connect(taker).registerOrder(order, order.extension, compact, { gasLimit: 300000 });
                const takerTraits = buildTakerTraits({ makingAmount: true, extension: order.extension });
                fillTx = await swap.connect(taker).fillOrderArgs(
                    order, sig.r, sig.yParityAndS, MAKING_AMOUNT, takerTraits.traits, takerTraits.args, { gasLimit: 500000 },
                );
            } finally {
                await hre.network.provider.send('evm_setAutomine', [true]);
                await hre.network.provider.send('evm_mine');
            }

            const announceReceipt = await announceTx.wait();
            const fillReceipt = await fillTx.wait();
            expect(announceReceipt.blockNumber).to.equal(fillReceipt.blockNumber);

            const expected = ceilDiv(TAKING_AMOUNT * (BASE_POINTS + HALF_PERCENT), BASE_POINTS);
            expect(await weth.balanceOf(maker)).to.equal(expected);
            expect(await dai.balanceOf(taker)).to.equal(MAKING_AMOUNT);
            expect(await registrator.announcedAt(await swap.hashOrder(order))).to.equal(await time.latest());
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

        it('allows a fill up to the very last second of the window', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
            const sig = await signature(order, chainId, swap);
            const announcedAt = await announce(registrator, swap, chainId, order);

            await time.setNextBlockTimestamp(announcedAt + params.duration + params.postAuctionWindow);
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

        it('prices whoever completes the order at the plain auction price', async function () {
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

        it('walks successive fills down the ladder of the original amount', async function () {
            const { weth, swap, order, sig, afterAuction } = await deployFilledOrder(100);

            // Each tenth-sized fill is priced by where it ends on the order's own volume ladder: the first
            // withholds nine tenths of the released discount, the second eight tenths, and so on.
            let fillTime = afterAuction;
            for (const laddersLeft of [9n, 8n, 7n]) {
                await time.setNextBlockTimestamp(fillTime++);
                const expected = ceilDiv((TAKING_AMOUNT / 10n) * (BASE_POINTS + HALF_PERCENT * laddersLeft / 10n), BASE_POINTS);
                await expect(fill(swap, order, sig, MAKING_AMOUNT / 10n))
                    .to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
            }
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
                    const rateBump = scaleByFill(0n, params, MAKING_AMOUNT, amount, MAKING_AMOUNT);
                    amount = (order.makingAmount * takingAmount / order.takingAmount) * BASE_POINTS / (BASE_POINTS + rateBump);
                }
                return amount;
            })();
            expect(expected).to.be.lessThanOrEqual(exact);
        });

        it('applies no penalty while the curve sits above the initial bump', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 100;
            const params = {
                startTime,
                duration: 100,
                initialRateBump: Number(HALF_PERCENT),
                fillScalingNumerator: 100,
                points: [{ coefficient: Number(HALF_PERCENT * 2n), delay: 50 }],
            };
            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
            const sig = await signature(order, chainId, swap);

            // A rising curve has released no discount to withhold, so a small fill pays the curve and no more.
            const fillTime = startTime + 25;
            await time.setNextBlockTimestamp(fillTime);
            const makingAmount = MAKING_AMOUNT / 10n;
            const fillTx = fill(swap, order, sig, makingAmount);

            const expected = takingAmountFor(order, params, fillTime, makingAmount, MAKING_AMOUNT);
            expect(expected).to.equal(ceilDiv((TAKING_AMOUNT / 10n) * (BASE_POINTS + HALF_PERCENT * 3n / 2n), BASE_POINTS));
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('offsets the gas bump from the already-scaled bump', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 100;
            const baseFee = 1000000000n; // 1 gwei, exactly the estimate below
            const order = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails({
                    startTime,
                    duration: 100,
                    initialRateBump: Number(HALF_PERCENT),
                    fillScalingNumerator: 100,
                    gasBumpEstimate: Number(HALF_PERCENT / 2n),
                    gasPriceEstimate: 1000,
                }),
            });
            const sig = await signature(order, chainId, swap);

            await hre.network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x' + baseFee.toString(16)]);
            await time.setNextBlockTimestamp(startTime + 200);
            const fillTx = fill(swap, order, sig, MAKING_AMOUNT / 10n, { overrides: { gasPrice: baseFee * 2n } });

            // After the auction the tenth-sized fill is scaled up to 0.9 of the initial bump and the gas bump
            // of half the initial bump comes off that, leaving 0.4 — the ordering this contract commits to.
            const expected = ceilDiv((TAKING_AMOUNT / 10n) * (BASE_POINTS + HALF_PERCENT * 4n / 10n), BASE_POINTS);
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('caps an oversized taking-amount fill at the remainder priced as a full fill', async function () {
            const { dai, weth, swap, order, sig, afterAuction } = await deployFilledOrder(100);

            await time.setNextBlockTimestamp(afterAuction);
            const fillTx = fill(swap, order, sig, TAKING_AMOUNT * 2n, { byMakingAmount: false });

            // The protocol caps the fill at what is left and reprices it through getTakingAmount, so the taker
            // sweeps the order at the full-fill price instead of paying the amount they offered.
            await expect(fillTx).to.changeTokenBalances(dai, [taker, maker], [MAKING_AMOUNT, -MAKING_AMOUNT]);
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-TAKING_AMOUNT, TAKING_AMOUNT]);
        });

        it('is inert for an order that forbids partial fills', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 10;
            const auctionData = ethers.solidityPacked(
                ['address', 'bytes'],
                [await auction.getAddress(), buildAnchoredAuctionDetails({ startTime, duration: 100, initialRateBump: Number(HALF_PERCENT), fillScalingNumerator: 100 })],
            );
            const order = buildOrder(
                {
                    maker: maker.address,
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: MAKING_AMOUNT,
                    takingAmount: TAKING_AMOUNT,
                    makerTraits: buildMakerTraits({ allowPartialFill: false }),
                },
                { makingAmountData: auctionData, takingAmountData: auctionData },
            );
            const sig = await signature(order, chainId, swap);

            await time.setNextBlockTimestamp(startTime + 150);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 2n)).to.be.revertedWithCustomError(swap, 'PartialFillNotAllowed');

            // The only fill such an order allows is the full one, which fill scaling prices at the plain curve.
            await time.setNextBlockTimestamp(startTime + 151);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.changeTokenBalances(
                weth, [taker, maker], [-TAKING_AMOUNT, TAKING_AMOUNT],
            );
        });

        it('keeps its rounding directions at dust-sized amounts', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 10;
            const params = { startTime, duration: 100, initialRateBump: Number(HALF_PERCENT), fillScalingNumerator: 100 };
            const auctionData = ethers.solidityPacked(
                ['address', 'bytes'],
                [await auction.getAddress(), buildAnchoredAuctionDetails(params)],
            );
            const order = buildOrder(
                {
                    maker: maker.address,
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: 3n,
                    takingAmount: 1n,
                },
                { makingAmountData: auctionData, takingAmountData: auctionData },
            );
            const sig = await signature(order, chainId, swap);

            // One wei of a three-wei order: the taking amount rounds up twice, so the penalized dust fill
            // costs two wei rather than a rounded-down zero premium.
            const fillTime = startTime + 200;
            await time.setNextBlockTimestamp(fillTime);
            const expected = takingAmountFor(order, params, fillTime, 1n, 3n);
            expect(expected).to.equal(2n);
            await expect(fill(swap, order, sig, 1n)).to.changeTokenBalances(weth, [taker, maker], [-2n, 2n]);

            // A fill by taking amount rounds the making amount down and the cap reprices the sweep exactly.
            await time.setNextBlockTimestamp(fillTime + 1);
            await expect(fill(swap, order, sig, 1n, { byMakingAmount: false })).to.changeTokenBalances(
                dai, [taker, maker], [2n, -2n],
            );
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

    describe('fill-priced by a matrix of rates', function () {
        // The quote's matrix for 1/10 … 10/10 of the amount, expressed as the premium each size pays over
        // the rate for the full amount. Deliberately convex, the shape a depth-based quote produces and the
        // linear rule cannot: small sizes are worth far more per unit than mid sizes.
        const MATRIX = [400_000, 250_000, 160_000, 105_000, 70_000, 45_000, 26_000, 12_000, 4_000, 0];
        const FILL_PREMIUMS = {
            initial: 500_000, // 5% for a vanishing fill
            // Nine points at each decile up to 9/10; the implied final point is zero premium at a full sweep.
            points: MATRIX.slice(0, 9).map((premium) => ({ premium, shareDelta: 1000 })),
        };

        async function deployMatrixOrder (extra = {}) {
            const contracts = await loadFixture(deployContractsAndInit);
            const { dai, weth, swap, chainId, auction } = contracts;
            const startTime = await time.latest() + 10;
            const params = { startTime, duration: 100, initialRateBump: Number(HALF_PERCENT), fillPremiums: FILL_PREMIUMS, ...extra };
            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
            const sig = await signature(order, chainId, swap);
            return { ...contracts, order, sig, params, afterAuction: startTime + 200 };
        }

        it('prices every decile exactly at its matrix row', async function () {
            const { swap, auction, order, params, afterAuction } = await deployMatrixOrder();

            await time.setNextBlockTimestamp(afterAuction);
            await hre.network.provider.send('evm_mine');

            const orderHash = await swap.hashOrder(order);
            const extraData = buildAnchoredAuctionDetails(params);
            for (let decile = 1; decile <= 10; decile++) {
                const makingAmount = MAKING_AMOUNT * BigInt(decile) / 10n;
                const taking = await auction.getTakingAmount(order, order.extension, orderHash, taker.address, makingAmount, MAKING_AMOUNT, extraData);
                const expectedBump = BigInt(MATRIX[decile - 1]);
                expect(taking).to.equal(ceilDiv(ceilDiv(TAKING_AMOUNT * BigInt(decile), 10n) * (BASE_POINTS + expectedBump), BASE_POINTS));
            }
        });

        it('prices successive fills at successive matrix rows', async function () {
            const { weth, swap, order, sig, afterAuction } = await deployMatrixOrder();

            // The first taker's tenth prices at the 1/10 row, the next taker's tenth at the 2/10 row, and
            // so on down the ladder — the rows are consumed cumulatively, not re-measured per fill.
            let fillTime = afterAuction;
            for (const row of [0, 1, 2]) {
                await time.setNextBlockTimestamp(fillTime++);
                const expected = ceilDiv((TAKING_AMOUNT / 10n) * (BASE_POINTS + BigInt(MATRIX[row])), BASE_POINTS);
                await expect(fill(swap, order, sig, MAKING_AMOUNT / 10n))
                    .to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
            }
        });

        it('interpolates between matrix rows instead of stepping', async function () {
            const { weth, swap, order, sig, params, afterAuction } = await deployMatrixOrder();

            await time.setNextBlockTimestamp(afterAuction);
            const makingAmount = MAKING_AMOUNT * 15n / 100n; // halfway between the 1/10 and 2/10 rows
            const fillTx = fill(swap, order, sig, makingAmount);

            const expected = takingAmountFor(order, params, afterAuction, makingAmount, MAKING_AMOUNT);
            const midRowBump = BigInt(MATRIX[0] + MATRIX[1]) / 2n;
            expect(expected).to.equal(ceilDiv(ceilDiv(TAKING_AMOUNT * 15n, 100n) * (BASE_POINTS + midRowBump), BASE_POINTS));
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('interpolates past the last row toward zero at completion', async function () {
            const { swap, auction, order, params, afterAuction } = await deployMatrixOrder();

            await time.setNextBlockTimestamp(afterAuction);
            await hre.network.provider.send('evm_mine');

            // The last explicit row sits at 9/10; a fill ending at 95% lands on the implied final segment,
            // halfway between that row and the zero premium of completion.
            const makingAmount = MAKING_AMOUNT * 95n / 100n;
            const taking = await auction.getTakingAmount(
                order, order.extension, await swap.hashOrder(order), taker.address, makingAmount, MAKING_AMOUNT, buildAnchoredAuctionDetails(params),
            );
            const halfLastRow = BigInt(MATRIX[8]) / 2n;
            expect(taking).to.equal(ceilDiv(ceilDiv(TAKING_AMOUNT * 95n, 100n) * (BASE_POINTS + halfLastRow), BASE_POINTS));
        });

        it('offsets the gas bump from the matrix premium', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { dai, weth, swap, chainId, auction } = contracts;

            const startTime = await time.latest() + 10;
            const baseFee = 1000000000n; // 1 gwei, exactly the estimate below
            const params = {
                startTime,
                duration: 100,
                initialRateBump: Number(HALF_PERCENT),
                fillPremiums: FILL_PREMIUMS,
                gasBumpEstimate: Number(HALF_PERCENT * 4n), // 2%
                gasPriceEstimate: 1000,
            };
            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
            const sig = await signature(order, chainId, swap);

            // After the auction the first decile carries the 4% row, and the 2% gas bump comes off it.
            await hre.network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x' + baseFee.toString(16)]);
            await time.setNextBlockTimestamp(startTime + 200);
            const fillTx = fill(swap, order, sig, MAKING_AMOUNT / 10n, { overrides: { gasPrice: baseFee * 2n } });

            const expected = ceilDiv((TAKING_AMOUNT / 10n) * (BASE_POINTS + BigInt(MATRIX[0]) - HALF_PERCENT * 4n), BASE_POINTS);
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('parses and prices a matrix with the maximum number of rows', async function () {
            const contracts = await loadFixture(deployContractsAndInit);
            const { dai, weth, swap, chainId, auction } = contracts;

            // 255 rows, the count byte's ceiling: premiums stepping down 39 units of share apart.
            const fillPremiums = {
                initial: 255_000,
                points: Array.from({ length: 255 }, (_, i) => ({ premium: (254 - i) * 1000, shareDelta: 39 })),
            };
            const startTime = await time.latest() + 10;
            const params = { startTime, duration: 100, initialRateBump: Number(HALF_PERCENT), fillPremiums };
            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
            await signature(order, chainId, swap);

            await time.setNextBlockTimestamp(startTime + 200);
            await hre.network.provider.send('evm_mine');

            const orderHash = await swap.hashOrder(order);
            const extraData = buildAnchoredAuctionDetails(params);
            for (const makingAmount of [MAKING_AMOUNT / 100n, MAKING_AMOUNT / 3n, MAKING_AMOUNT * 99n / 100n]) {
                const taking = await auction.getTakingAmount(order, order.extension, orderHash, taker.address, makingAmount, MAKING_AMOUNT, extraData);
                expect(taking).to.equal(takingAmountFor(order, params, startTime + 200, makingAmount, MAKING_AMOUNT));
            }
        });

        it('never lets any split of the order undercut a single sweep', async function () {
            const { swap, auction, order, params, afterAuction } = await deployMatrixOrder();
            const linear = await deployMatrixOrder({ fillPremiums: undefined, fillScalingNumerator: 100 });

            await time.setNextBlockTimestamp(afterAuction + 1000);
            await hre.network.provider.send('evm_mine');

            // A seeded sweep over random partitions, priced through the contract's own view methods: for
            // both encodings, no way of slicing the order may cost less in total than one full sweep.
            let seed = 0xdead4351n;
            const nextRand = (bound) => {
                seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
                return seed % bound;
            };

            for (const { o, p } of [{ o: order, p: params }, { o: linear.order, p: linear.params }]) {
                const orderHash = await swap.hashOrder(o);
                const extraData = buildAnchoredAuctionDetails(p);
                const sweep = await auction.getTakingAmount(o, o.extension, orderHash, taker.address, MAKING_AMOUNT, MAKING_AMOUNT, extraData);

                for (let trial = 0; trial < 8; trial++) {
                    const chunks = [];
                    let remaining = MAKING_AMOUNT;
                    const parts = 2n + nextRand(4n);
                    for (let i = 1n; i < parts; i++) {
                        const chunk = 1n + nextRand(remaining - (parts - i));
                        chunks.push(chunk);
                        remaining -= chunk;
                    }
                    chunks.push(remaining);

                    let total = 0n;
                    let left = MAKING_AMOUNT;
                    for (const chunk of chunks) {
                        total += await auction.getTakingAmount(o, o.extension, orderHash, taker.address, chunk, left, extraData);
                        left -= chunk;
                    }
                    expect(total, `partition ${chunks.join('+')}`).to.be.greaterThanOrEqual(sweep);
                }
            }
        });

        it('adds the matrix premium on top of the running time curve', async function () {
            const { weth, swap, order, sig, params } = await deployMatrixOrder();

            // Halfway through the auction the time curve still carries half the initial bump, and the
            // 3/10-sized fill pays its matrix row on top of it.
            const fillTime = params.startTime + 50;
            await time.setNextBlockTimestamp(fillTime);
            const makingAmount = MAKING_AMOUNT * 3n / 10n;
            const fillTx = fill(swap, order, sig, makingAmount);

            const expected = takingAmountFor(order, params, fillTime, makingAmount, MAKING_AMOUNT);
            expect(expected).to.equal(ceilDiv(ceilDiv(TAKING_AMOUNT * 3n, 10n) * (BASE_POINTS + HALF_PERCENT / 2n + BigInt(MATRIX[2])), BASE_POINTS));
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('sweeps the remainder at the plain curve price', async function () {
            const { weth, swap, order, sig, afterAuction } = await deployMatrixOrder();

            await time.setNextBlockTimestamp(afterAuction);
            await fill(swap, order, sig, MAKING_AMOUNT * 3n / 5n);

            // Whatever its absolute size, taking everything that is left costs no premium at all.
            await time.setNextBlockTimestamp(afterAuction + 10);
            const remainder = MAKING_AMOUNT * 2n / 5n;
            await expect(fill(swap, order, sig, remainder)).to.changeTokenBalances(
                weth, [taker, maker], [-TAKING_AMOUNT * 2n / 5n, TAKING_AMOUNT * 2n / 5n],
            );
        });

        it('charges a vanishing fill the full initial premium', async function () {
            const { swap, auction, order, params, afterAuction } = await deployMatrixOrder();

            await time.setNextBlockTimestamp(afterAuction);
            await hre.network.provider.send('evm_mine');

            // One wei of a hundred-ether order rounds to a zero share, which sits at the top of the curve.
            const taking = await auction.getTakingAmount(
                order, order.extension, await swap.hashOrder(order), taker.address, 1n, MAKING_AMOUNT, buildAnchoredAuctionDetails(params),
            );
            expect(taking).to.equal(ceilDiv(ceilDiv(TAKING_AMOUNT, MAKING_AMOUNT) * (BASE_POINTS + BigInt(FILL_PREMIUMS.initial)), BASE_POINTS));
        });

        it('prices a fill by taking amount no better than an exact solution would', async function () {
            const { dai, swap, order, sig, params, afterAuction } = await deployMatrixOrder();

            await time.setNextBlockTimestamp(afterAuction);
            const takingAmount = TAKING_AMOUNT / 4n;
            const fillTx = fill(swap, order, sig, takingAmount, { byMakingAmount: false });

            const expected = makingAmountFor(order, params, afterAuction, takingAmount, MAKING_AMOUNT);
            await expect(fillTx).to.changeTokenBalances(dai, [taker, maker], [expected, -expected]);

            const exact = (() => {
                let amount = expected;
                for (let i = 0; i < 64; i++) {
                    const rateBump = amount >= MAKING_AMOUNT ? 0n : fillPremiumAt(MAKING_AMOUNT, amount, MAKING_AMOUNT, FILL_PREMIUMS);
                    amount = (order.makingAmount * takingAmount / order.takingAmount) * BASE_POINTS / (BASE_POINTS + rateBump);
                }
                return amount;
            })();
            expect(expected).to.be.lessThanOrEqual(exact);
        });

        it('works alongside anchoring and the post-auction deadline', async function () {
            const { weth, swap, chainId, registrator, auction, order, sig, params } = await deployMatrixOrder({
                startTime: 0,
                startDelay: 10,
                postAuctionWindow: 60,
            });

            const announcedAt = await announce(registrator, swap, chainId, order);
            const resolved = { ...params, startTime: announcedAt + 10 };

            const fillTime = announcedAt + 120; // past the anchored auction, inside the deadline window
            await time.setNextBlockTimestamp(fillTime);
            const makingAmount = MAKING_AMOUNT / 2n;
            const expected = takingAmountFor(order, resolved, fillTime, makingAmount, MAKING_AMOUNT);
            expect(expected).to.equal(ceilDiv((TAKING_AMOUNT / 2n) * (BASE_POINTS + BigInt(MATRIX[4])), BASE_POINTS));
            await expect(fill(swap, order, sig, makingAmount)).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);

            await time.setNextBlockTimestamp(announcedAt + 10 + 100 + 60 + 1);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 2n)).to.be.revertedWithCustomError(auction, 'AuctionExpired');
        });

        it('collapses to a linear premium when the matrix has a single row', async function () {
            const { weth, swap, order, sig, params, afterAuction } = await deployMatrixOrder({
                fillPremiums: { initial: Number(HALF_PERCENT), points: [] },
            });

            await time.setNextBlockTimestamp(afterAuction);
            const makingAmount = MAKING_AMOUNT / 4n;
            const fillTx = fill(swap, order, sig, makingAmount);

            // A single-entry curve runs straight from the initial premium to zero, matching the linear rule.
            const expected = takingAmountFor(order, params, afterAuction, makingAmount, MAKING_AMOUNT);
            expect(expected).to.equal(ceilDiv((TAKING_AMOUNT / 4n) * (BASE_POINTS + HALF_PERCENT * 3n / 4n), BASE_POINTS));
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('stays conservative when the matrix peaks at an interior row', async function () {
            // A hump-shaped matrix: mid-sized fills pay the most. Odd economically, but encodable, and the
            // making-amount estimate must anchor on the curve's true peak rather than its first value.
            const humpPremiums = {
                initial: 100_000,
                points: [
                    { premium: 400_000, shareDelta: 3000 },
                    { premium: 50_000, shareDelta: 4000 },
                ],
            };
            const { dai, weth, swap, order, sig, params, afterAuction } = await deployMatrixOrder({ fillPremiums: humpPremiums });

            await time.setNextBlockTimestamp(afterAuction);
            const makingAmount = MAKING_AMOUNT * 3n / 10n; // exactly at the peak
            const atPeak = takingAmountFor(order, params, afterAuction, makingAmount, MAKING_AMOUNT);
            expect(atPeak).to.equal(ceilDiv(ceilDiv(TAKING_AMOUNT * 3n, 10n) * (BASE_POINTS + 400_000n), BASE_POINTS));
            await expect(fill(swap, order, sig, makingAmount)).to.changeTokenBalances(weth, [taker, maker], [-atPeak, atPeak]);

            await time.setNextBlockTimestamp(afterAuction + 10);
            const takingAmount = TAKING_AMOUNT / 10n;
            const expected = makingAmountFor(order, params, afterAuction + 10, takingAmount, MAKING_AMOUNT - makingAmount);
            await expect(fill(swap, order, sig, takingAmount, { byMakingAmount: false }))
                .to.changeTokenBalances(dai, [taker, maker], [expected, -expected]);
        });

        it('rejects an order that carries both the linear rule and a matrix', async function () {
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
                    fillScalingNumerator: 100,
                    fillPremiums: { initial: 100_000, points: [] },
                }),
            });
            const sig = await signature(order, chainId, swap);

            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.be.revertedWithCustomError(auction, 'ConflictingFillPricing');
        });
    });

    describe('adversarial fills', function () {
        it('rejects a taker who swaps in cheaper auction bytes', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);
            const orderLib = await ethers.getContractFactory('OrderLib');

            const startTime = await time.latest() + 10;
            const expensive = { startTime, duration: 100, initialRateBump: Number(HALF_PERCENT), fillPremiums: { initial: 400_000, points: [] } };
            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(expensive) });
            const sig = await signature(order, chainId, swap);

            // The attacker rebuilds the same order with a free curve and presents that extension instead;
            // the salt commits to the extension hash, so the fill never reaches the pricing at all.
            const forged = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails({ startTime, duration: 100, initialRateBump: 0 }),
            });
            await time.setNextBlockTimestamp(startTime + 200);

            const forgedTraits = buildTakerTraits({ makingAmount: true, extension: forged.extension });
            await expect(swap.connect(taker).fillOrderArgs(order, sig.r, sig.yParityAndS, MAKING_AMOUNT / 10n, forgedTraits.traits, forgedTraits.args))
                .to.be.revertedWithCustomError(orderLib, 'InvalidExtensionHash');

            // Dropping the extension entirely does not help either.
            const strippedTraits = buildTakerTraits({ makingAmount: true });
            await expect(swap.connect(taker).fillOrderArgs(order, sig.r, sig.yParityAndS, MAKING_AMOUNT / 10n, strippedTraits.traits, strippedTraits.args))
                .to.be.revertedWithCustomError(orderLib, 'MissingOrderExtension');
        });

        it('cannot take more than the order holds across fills', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 10;
            const order = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails({ startTime, duration: 100, initialRateBump: Number(HALF_PERCENT), fillScalingNumerator: 100 }),
            });
            const sig = await signature(order, chainId, swap);

            await time.setNextBlockTimestamp(startTime + 200);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.changeTokenBalances(dai, [taker, maker], [MAKING_AMOUNT, -MAKING_AMOUNT]);

            // The order is spent; no crafted amount squeezes another wei out of the maker.
            await expect(fill(swap, order, sig, 1n)).to.be.revertedWithCustomError(swap, 'InvalidatedOrder');
            await expect(fill(swap, order, sig, TAKING_AMOUNT, { byMakingAmount: false })).to.be.revertedWithCustomError(swap, 'InvalidatedOrder');
        });

        it('never prices the maker below the min return, whatever the fill', async function () {
            const { dai, weth, swap, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 100;
            const modes = [];
            for (const extra of [
                { fillScalingNumerator: 100 },
                { fillPremiums: { initial: 400_000, points: [{ premium: 150_000, shareDelta: 3000 }, { premium: 30_000, shareDelta: 4000 }] } },
            ]) {
                const params = { startTime, duration: 100, initialRateBump: Number(HALF_PERCENT), ...extra };
                const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
                modes.push({ order, extraData: buildAnchoredAuctionDetails(params), orderHash: await swap.hashOrder(order) });
            }

            // Sample the whole surface: before, during and after the auction, random fill sizes and random
            // remainders. The rate bump only ever moves the price against the taker, so the maker's floor —
            // the plain proportional rate — must hold everywhere, in both directions and both encodings.
            await time.setNextBlockTimestamp(startTime + 150);
            await hre.network.provider.send('evm_mine');

            let seed = 0xfee1dead1n;
            const nextRand = (bound) => {
                seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
                return seed % bound;
            };

            for (const { order, extraData, orderHash } of modes) {
                for (let trial = 0; trial < 12; trial++) {
                    const remaining = 1n + nextRand(MAKING_AMOUNT);
                    const makingAmount = 1n + nextRand(remaining);
                    const taking = await auction.getTakingAmount(order, order.extension, orderHash, taker.address, makingAmount, remaining, extraData);
                    expect(taking, 'taker paying below the base rate').to.be.greaterThanOrEqual(ceilDiv(TAKING_AMOUNT * makingAmount, MAKING_AMOUNT));

                    const takingAmount = 1000n + nextRand(TAKING_AMOUNT - 1000n);
                    const making = await auction.getMakingAmount(order, order.extension, orderHash, taker.address, takingAmount, remaining, extraData);
                    expect(making, 'taker receiving above the base rate').to.be.lessThanOrEqual(takingAmount * MAKING_AMOUNT / TAKING_AMOUNT);

                    // Round-tripping the directions must not manufacture a discount either. The price passes
                    // through two ceiling divisions on the way back, so up to two wei of rounding dust is the
                    // whole allowance.
                    if (making !== 0n && making < remaining) {
                        const roundTrip = await auction.getTakingAmount(order, order.extension, orderHash, taker.address, making, remaining, extraData);
                        expect(roundTrip, 'direction round trip').to.be.lessThanOrEqual(takingAmount + 2n);
                    }
                }
            }
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

        it('keeps a built allowed time that is later than the anchored one', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const allowedTime = await time.latest() + 100;
            const order = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails(auctionParams),
                exclusivity: buildAnchoredExclusivity({
                    allowedTime,
                    allowedTimeDelay: 5,
                    whitelist: [{ address: taker.address }],
                }),
            });
            const sig = await signature(order, chainId, swap);
            const announcedAt = await announce(registrator, swap, chainId, order);
            expect(announcedAt + 5).to.be.lessThan(allowedTime);

            // Anchoring may only move the window later, mirroring the auction start's max() semantics.
            await time.setNextBlockTimestamp(allowedTime - 1);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.be.revertedWithCustomError(auction, 'AllowedTimeViolation');

            await time.setNextBlockTimestamp(allowedTime);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.changeTokenBalances(dai, [taker, maker], [MAKING_AMOUNT, -MAKING_AMOUNT]);
        });

        it('staggers two whitelisted resolvers by their deltas', async function () {
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
                    whitelist: [
                        { address: taker.address, delta: 20 },
                        { address: otherResolver.address },
                    ],
                }),
            });
            const sig = await signature(order, chainId, swap);
            const announcedAt = await announce(registrator, swap, chainId, order);

            // The second resolver is whitelisted but its window opens a delta after the first one's.
            await time.setNextBlockTimestamp(announcedAt + 15);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 2n, { from: otherResolver }))
                .to.be.revertedWithCustomError(auction, 'AllowedTimeViolation');

            await time.setNextBlockTimestamp(announcedAt + 16);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 2n))
                .to.changeTokenBalances(dai, [taker, maker], [MAKING_AMOUNT / 2n, -MAKING_AMOUNT / 2n]);

            await time.setNextBlockTimestamp(announcedAt + 30);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 2n, { from: otherResolver }))
                .to.changeTokenBalances(dai, [otherResolver, maker], [MAKING_AMOUNT / 2n, -MAKING_AMOUNT / 2n]);
        });

        it('gates everyone by the anchored time when the whitelist is empty', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const order = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails(auctionParams),
                exclusivity: buildAnchoredExclusivity({ allowedTimeDelay: 30, whitelist: [] }),
            });
            const sig = await signature(order, chainId, swap);
            const announcedAt = await announce(registrator, swap, chainId, order);

            await time.setNextBlockTimestamp(announcedAt + 29);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.be.revertedWithCustomError(auction, 'AllowedTimeViolation');

            await time.setNextBlockTimestamp(announcedAt + 30);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.changeTokenBalances(dai, [taker, maker], [MAKING_AMOUNT, -MAKING_AMOUNT]);
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

        it('prices a matrix order chained behind the fee taker', async function () {
            const { dai, weth, swap, chainId, registrator, auction, feeTaker } = await loadFixture(deployContractsAndInit);

            const resolverFee = 1000n; // 1% in 1e5
            const auctionParams = {
                startTime: 0,
                duration: 100,
                initialRateBump: Number(HALF_PERCENT),
                startDelay: 10,
                fillPremiums: { initial: 400_000, points: [{ premium: 100_000, shareDelta: 5000 }] },
            };
            const auctionTail = ethers.solidityPacked(
                ['address', 'bytes'],
                [await auction.getAddress(), buildAnchoredAuctionDetails(auctionParams)],
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
                }),
            );
            const sig = await signature(order, chainId, swap);
            const announcedAt = await announce(registrator, swap, chainId, order);

            // A quarter-sized fill lands halfway up the matrix's first segment, on top of the fee.
            const fillTime = announcedAt + 200;
            await time.setNextBlockTimestamp(fillTime);
            const fillTx = fill(swap, order, sig, MAKING_AMOUNT / 4n);

            const auctionPrice = takingAmountFor(
                order,
                { ...auctionParams, startTime: announcedAt + auctionParams.startDelay },
                fillTime,
                MAKING_AMOUNT / 4n,
                MAKING_AMOUNT,
            );
            const withFee = ceilDiv(auctionPrice * (100000n + resolverFee), 100000n);
            const feeAmount = withFee - ceilDiv(withFee * 100000n, 100000n + resolverFee);
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker, otherResolver], [-withFee, withFee - feeAmount, feeAmount]);
            await expect(fillTx).to.changeTokenBalances(dai, [taker, maker], [MAKING_AMOUNT / 4n, -MAKING_AMOUNT / 4n]);
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
