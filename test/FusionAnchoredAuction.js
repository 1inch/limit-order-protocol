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

    async function announce (registrator, order) {
        await registrator.connect(maker).registerOrder(order, order.extension);
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
        const anchoredParams = { startTime: 0, duration: 100, initialRateBump: Number(HALF_PERCENT), anchored: true };

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
            const announcedAt = await announce(registrator, order);
            const resolved = { ...anchoredParams, startTime: announcedAt };

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

            const announcedAt = await announce(registrator, order);
            expect(announcedAt).to.be.lessThan(startTime);

            // Anchoring may only move the start later, so the auction has not begun yet.
            const fillTime = announcedAt + 20;
            await time.setNextBlockTimestamp(fillTime);
            const fillTx = fill(swap, order, sig, MAKING_AMOUNT);

            const expected = takingAmountFor(order, params, fillTime, MAKING_AMOUNT, MAKING_AMOUNT);
            expect(expected).to.equal(ceilDiv(TAKING_AMOUNT * (BASE_POINTS + HALF_PERCENT), BASE_POINTS));
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('rejects registration from anyone but the maker', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(anchoredParams) });
            const sig = await signature(order, chainId, swap);

            // Registration authenticates by sender alone, so a resolver cannot start the clock early to
            // burn auction time — even one holding a perfectly valid fill signature.
            await expect(registrator.connect(otherResolver).registerOrder(order, order.extension))
                .to.be.revertedWithCustomError(registrator, 'AccessDenied');
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.be.revertedWithCustomError(auction, 'OrderNotAnnounced');

            // The maker's own registration is what starts the clock, and the fill prices from it.
            const announcedAt = await announce(registrator, order);
            const fillTime = announcedAt + 1;
            await time.setNextBlockTimestamp(fillTime);
            const expected = takingAmountFor(order, { ...anchoredParams, startTime: announcedAt }, fillTime, MAKING_AMOUNT, MAKING_AMOUNT);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('does not outrank a cancellation by the maker', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(anchoredParams) });
            const sig = await signature(order, chainId, swap);
            const announcedAt = await announce(registrator, order);

            // The announcement is immutable, but the order itself stays cancellable at the protocol level.
            await swap.connect(maker).cancelOrder(order.makerTraits, await swap.hashOrder(order));

            await time.setNextBlockTimestamp(announcedAt + 50);
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
            const announcedAt = await announce(registrator, order);
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
                anchored: true,
                fillPremiums: { initial: Number(HALF_PERCENT), points: [] },
            };
            const order = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails(params),
                // The fill-by deadline rides in the post-interaction blob: an anchored exclusivity with
                // an empty whitelist is exactly "a deadline without exclusivity".
                exclusivity: buildAnchoredExclusivity({ allowedTimeDelay: 0, announcementDeadlineDelay: 160, whitelist: [] }),
            });
            const sig = await signature(order, chainId, swap);
            const announcedAt = await announce(registrator, order);
            const resolved = { ...params, startTime: announcedAt };

            // A fill by making amount halfway through the anchored auction, its curve premium on top.
            const firstFillTime = announcedAt + 50;
            await time.setNextBlockTimestamp(firstFillTime);
            const firstExpected = takingAmountFor(order, resolved, firstFillTime, MAKING_AMOUNT / 2n, MAKING_AMOUNT);
            expect(firstExpected).to.equal(ceilDiv((TAKING_AMOUNT / 2n) * (BASE_POINTS + HALF_PERCENT), BASE_POINTS));
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 2n)).to.changeTokenBalances(weth, [taker, maker], [-firstExpected, firstExpected]);

            // A fill by taking amount after the auction, priced through the conservative estimate.
            const secondFillTime = announcedAt + 120;
            await time.setNextBlockTimestamp(secondFillTime);
            const takingAmount = TAKING_AMOUNT / 10n;
            const secondExpected = makingAmountFor(order, resolved, secondFillTime, takingAmount, MAKING_AMOUNT / 2n);
            await expect(fill(swap, order, sig, takingAmount, { byMakingAmount: false }))
                .to.changeTokenBalances(dai, [taker, maker], [secondExpected, -secondExpected]);

            // And past the anchored deadline nothing fills at all.
            await time.setNextBlockTimestamp(announcedAt + 160 + 1);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 10n)).to.be.revertedWithCustomError(auction, 'AuctionExpired');
        });

        it('prices a fill announced in the same block at the top of the curve', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const order = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails(anchoredParams),
            });
            const sig = await signature(order, chainId, swap);

            // The maker announces and a resolver fills in the same block; the fill sees the announcement
            // written earlier in the block and prices at the very start of the curve.
            await hre.network.provider.send('evm_setAutomine', [false]);
            let announceTx, fillTx;
            try {
                announceTx = await registrator.connect(maker).registerOrder(order, order.extension, { gasLimit: 300000 });
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
            const announcedAt = await announce(registrator, order);

            const fillTime = announcedAt + 1;
            await time.setNextBlockTimestamp(fillTime);
            const fillTx = fill(swap, order, sig, MAKING_AMOUNT);

            // One second into the anchored curve — essentially the top, rather than the floor price an
            // unanchored order would have decayed to hours ago.
            const expected = takingAmountFor(order, { ...anchoredParams, startTime: announcedAt }, fillTime, MAKING_AMOUNT, MAKING_AMOUNT);
            expect(expected).to.be.greaterThan(ceilDiv(TAKING_AMOUNT * (BASE_POINTS + HALF_PERCENT * 9n / 10n), BASE_POINTS));
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
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

        it('prices successive fills by their share of what remains', async function () {
            const { weth, swap, order, sig, params, afterAuction } = await deployMatrixOrder();

            // Every fill sees the remainder as a fresh ladder: the first tenth is a 10% slice of a whole
            // order, the next tenth is a 10/90 slice of what is left, and so on — each priced by its own
            // share of the remainder rather than by where it lands on the original amount.
            let fillTime = afterAuction;
            let remaining = MAKING_AMOUNT;
            for (let i = 0; i < 3; i++) {
                await time.setNextBlockTimestamp(fillTime);
                const expected = takingAmountFor(order, params, fillTime, MAKING_AMOUNT / 10n, remaining);
                const share = (MAKING_AMOUNT / 10n) * 10000n / remaining;
                const interpolated = (share - 1000n) * BigInt(MATRIX[1]) + (2000n - share) * BigInt(MATRIX[0]);
                const premium = i === 0 ? BigInt(MATRIX[0]) : interpolated / 1000n;
                expect(expected).to.equal(ceilDiv((TAKING_AMOUNT / 10n) * (BASE_POINTS + premium), BASE_POINTS));
                await expect(fill(swap, order, sig, MAKING_AMOUNT / 10n))
                    .to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
                remaining -= MAKING_AMOUNT / 10n;
                fillTime++;
            }
        });

        it('charges a late small fill by its share of the remainder, not its place on the original', async function () {
            const { weth, swap, order, sig, params, afterAuction } = await deployMatrixOrder();

            // The scenario team review caught under the earlier cumulative indexing: with 80% already
            // filled, a fill of 10% of the original order is half of what remains, so it prices at the
            // 5/10 row — not at the nearly-free 9/10 row its cumulative end would have landed on.
            await time.setNextBlockTimestamp(afterAuction);
            await fill(swap, order, sig, MAKING_AMOUNT * 8n / 10n);

            const fillTime = afterAuction + 1;
            await time.setNextBlockTimestamp(fillTime);
            const remaining = MAKING_AMOUNT * 2n / 10n;
            const expected = takingAmountFor(order, params, fillTime, MAKING_AMOUNT / 10n, remaining);
            expect(expected).to.equal(ceilDiv((TAKING_AMOUNT / 10n) * (BASE_POINTS + BigInt(MATRIX[4])), BASE_POINTS));
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 10n))
                .to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
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
            const singleRow = await deployMatrixOrder({ fillPremiums: { initial: Number(HALF_PERCENT), points: [] } });

            await time.setNextBlockTimestamp(afterAuction + 1000);
            await hre.network.provider.send('evm_mine');

            // A seeded sweep over random partitions, priced through the contract's own view methods: for
            // both curve shapes, no way of slicing the order may cost less in total than one full sweep.
            let seed = 0xdead4351n;
            const nextRand = (bound) => {
                seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
                return seed % bound;
            };

            for (const { o, p } of [{ o: order, p: params }, { o: singleRow.order, p: singleRow.params }]) {
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
                    const rateBump = amount >= MAKING_AMOUNT ? 0n : fillPremiumAt(amount, MAKING_AMOUNT, FILL_PREMIUMS);
                    amount = (order.makingAmount * takingAmount / order.takingAmount) * BASE_POINTS / (BASE_POINTS + rateBump);
                }
                return amount;
            })();
            expect(expected).to.be.lessThanOrEqual(exact);
        });

        it('works alongside anchoring', async function () {
            const { weth, swap, registrator, order, sig, params } = await deployMatrixOrder({
                startTime: 0,
                anchored: true,
            });

            const announcedAt = await announce(registrator, order);
            const resolved = { ...params, startTime: announcedAt };

            const fillTime = announcedAt + 120; // past the anchored auction
            await time.setNextBlockTimestamp(fillTime);
            const makingAmount = MAKING_AMOUNT / 2n;
            const expected = takingAmountFor(order, resolved, fillTime, makingAmount, MAKING_AMOUNT);
            expect(expected).to.equal(ceilDiv((TAKING_AMOUNT / 2n) * (BASE_POINTS + BigInt(MATRIX[4])), BASE_POINTS));
            await expect(fill(swap, order, sig, makingAmount)).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('prices a pointless curve straight from the initial premium to zero', async function () {
            const { weth, swap, order, sig, params, afterAuction } = await deployMatrixOrder({
                fillPremiums: { initial: Number(HALF_PERCENT), points: [] },
            });

            await time.setNextBlockTimestamp(afterAuction);
            const makingAmount = MAKING_AMOUNT / 4n;
            const fillTx = fill(swap, order, sig, makingAmount);

            // A curve with no interior points is the one-parameter schedule: the premium falls linearly
            // from the initial value to zero at completion.
            const expected = takingAmountFor(order, params, afterAuction, makingAmount, MAKING_AMOUNT);
            expect(expected).to.equal(ceilDiv((TAKING_AMOUNT / 4n) * (BASE_POINTS + HALF_PERCENT * 3n / 4n), BASE_POINTS));
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
        });

        it('rejects a matrix whose premium rises along the ladder', async function () {
            // A hump-shaped matrix: mid-sized fills pay the most. It is encodable, but a rising stretch
            // makes two fills cheaper than their sum — a taker would be paid to split — so pricing off
            // such a curve reverts instead.
            const humpPremiums = {
                initial: 100_000,
                points: [
                    { premium: 400_000, shareDelta: 3000 },
                    { premium: 50_000, shareDelta: 4000 },
                ],
            };
            const { swap, auction, order, sig, afterAuction } = await deployMatrixOrder({ fillPremiums: humpPremiums });

            await time.setNextBlockTimestamp(afterAuction);
            await expect(fill(swap, order, sig, MAKING_AMOUNT * 3n / 10n))
                .to.be.revertedWithCustomError(auction, 'NonMonotonicFillCurve');

            // The taking-amount direction walks the same curve and refuses it the same way.
            await expect(fill(swap, order, sig, TAKING_AMOUNT / 10n, { byMakingAmount: false }))
                .to.be.revertedWithCustomError(auction, 'NonMonotonicFillCurve');
        });

        it('rejects a rising first row before any interior point is read', async function () {
            // The initial premium is the curve's whole prefix for a vanishing fill, so a first row above
            // it is caught on the very first comparison of the walk.
            const risingPremiums = { initial: 50_000, points: [{ premium: 100_000, shareDelta: 5000 }] };
            const { swap, auction, order, sig, afterAuction } = await deployMatrixOrder({ fillPremiums: risingPremiums });

            await time.setNextBlockTimestamp(afterAuction);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 10n))
                .to.be.revertedWithCustomError(auction, 'NonMonotonicFillCurve');
        });

        it('validates only the prefix a fill is actually priced on', async function () {
            // Enforcement is lazy — one comparison per visited point — so a fill priced entirely on the
            // legal early rows goes through even when a later stretch of the curve is broken, and the
            // completing fill never reads the curve at all.
            const brokenTail = {
                initial: 300_000,
                points: [
                    { premium: 200_000, shareDelta: 3000 },
                    { premium: 400_000, shareDelta: 4000 }, // illegal, but only for fills that reach it
                ],
            };
            const { weth, swap, auction, order, sig, params, afterAuction } = await deployMatrixOrder({ fillPremiums: brokenTail });

            await time.setNextBlockTimestamp(afterAuction);
            const firstAmount = MAKING_AMOUNT * 2n / 10n;
            const first = takingAmountFor(order, params, afterAuction, firstAmount, MAKING_AMOUNT);
            await expect(fill(swap, order, sig, firstAmount)).to.changeTokenBalances(weth, [taker, maker], [-first, first]);

            // Reaching past the legal prefix hits the rising row and reverts.
            await time.setNextBlockTimestamp(afterAuction + 10);
            await expect(fill(swap, order, sig, MAKING_AMOUNT * 3n / 10n))
                .to.be.revertedWithCustomError(auction, 'NonMonotonicFillCurve');

            // Completing the order short-circuits to the plain auction price without walking the curve.
            await time.setNextBlockTimestamp(afterAuction + 20);
            const rest = MAKING_AMOUNT - firstAmount;
            const completing = takingAmountFor(order, params, afterAuction + 20, rest, rest);
            await expect(fill(swap, order, sig, rest)).to.changeTokenBalances(weth, [taker, maker], [-completing, completing]);
        });

        it('caps an oversized taking-amount fill at the remainder priced as a full fill', async function () {
            const { dai, weth, swap, order, sig, afterAuction } = await deployMatrixOrder();

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
                [await auction.getAddress(), buildAnchoredAuctionDetails({ startTime, duration: 100, initialRateBump: Number(HALF_PERCENT), fillPremiums: FILL_PREMIUMS })],
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

            // The only fill such an order allows is the full one, which the curve prices at the plain rate.
            await time.setNextBlockTimestamp(startTime + 151);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.changeTokenBalances(
                weth, [taker, maker], [-TAKING_AMOUNT, TAKING_AMOUNT],
            );
        });

        it('keeps its rounding directions at dust-sized amounts', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            const startTime = await time.latest() + 10;
            const params = { startTime, duration: 100, initialRateBump: Number(HALF_PERCENT), fillPremiums: FILL_PREMIUMS };
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
    });

    describe('full-width amounts', function () {
        // The fixed-point scaling takes a guarded fast path for amounts below 2**128 and falls back to
        // full-width mulDiv above it. These pin the fallback branches — unreachable through fills of any
        // realistic order — against the same exact formula the fast path uses, straddling the boundary.
        const BUMP = HALF_PERCENT;
        // The auction has not started yet, so the bump is exactly the initial one and no clock is read.
        const params = { startTime: 4000000000, duration: 100, initialRateBump: Number(BUMP) };

        async function priceHugeOrder (auction, swap, orderFields, method, amount, remaining, extraParams = params) {
            const order = buildOrder({ maker: maker.address, ...orderFields });
            return auction[method](
                order, order.extension, await swap.hashOrder(order), taker.address,
                amount, remaining, buildAnchoredAuctionDetails(extraParams),
            );
        }

        it('prices a taking amount past 2**128 through the full-width fallback', async function () {
            const { dai, weth, swap, auction } = await loadFixture(deployContractsAndInit);
            const fields = { makerAsset: await dai.getAddress(), takerAsset: await weth.getAddress(), makingAmount: 1n << 127n, takingAmount: 1n << 128n };

            // The full fill's base taking amount is exactly 2**128, one past the fast path's ceiling.
            const fallback = await priceHugeOrder(auction, swap, fields, 'getTakingAmount', 1n << 127n, 1n << 127n);
            expect(fallback).to.equal(ceilDiv((1n << 128n) * (BASE_POINTS + BUMP), BASE_POINTS));

            // One making-amount step down, the base lands at 2**128 - 2 and the fast path prices it —
            // by the identical formula.
            const fast = await priceHugeOrder(auction, swap, fields, 'getTakingAmount', (1n << 127n) - 1n, 1n << 127n);
            expect(fast).to.equal(ceilDiv(((1n << 128n) - 2n) * (BASE_POINTS + BUMP), BASE_POINTS));
        });

        it('prices a making amount past 2**128 through the full-width fallback', async function () {
            const { dai, weth, swap, auction } = await loadFixture(deployContractsAndInit);
            const fields = { makerAsset: await dai.getAddress(), takerAsset: await weth.getAddress(), makingAmount: 1n << 128n, takingAmount: 1n << 127n };

            const fallback = await priceHugeOrder(auction, swap, fields, 'getMakingAmount', 1n << 127n, 1n << 128n);
            expect(fallback).to.equal((1n << 128n) * BASE_POINTS / (BASE_POINTS + BUMP));

            const fast = await priceHugeOrder(auction, swap, fields, 'getMakingAmount', (1n << 127n) - 1n, 1n << 128n);
            expect(fast).to.equal(((1n << 128n) - 2n) * BASE_POINTS / (BASE_POINTS + BUMP));
        });

        it('measures a cumulative fill share past 2**128 through the full-width fallback', async function () {
            const { dai, weth, swap, auction } = await loadFixture(deployContractsAndInit);
            const curveParams = { ...params, fillPremiums: { initial: Number(BUMP), points: [] } };
            // The taking side stays tiny so the share computation is the only branch near the boundary.
            const fields = { makerAsset: await dai.getAddress(), takerAsset: await weth.getAddress(), makingAmount: 1n << 129n, takingAmount: 1n << 100n };

            // A partial fill whose cumulative end is 2**128 of a 2**129 order: the share is measured
            // through the fallback as exactly half the ladder, so the single-row premium reads half its
            // initial value on top of the time curve's bump.
            const taking = await priceHugeOrder(auction, swap, fields, 'getTakingAmount', 1n << 128n, 1n << 129n, curveParams);
            const base = ceilDiv((1n << 128n) * (1n << 100n), 1n << 129n);
            expect(taking).to.equal(ceilDiv(base * (BASE_POINTS + BUMP + BUMP / 2n), BASE_POINTS));
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
                auctionDetails: buildAnchoredAuctionDetails({
                    startTime,
                    duration: 100,
                    initialRateBump: Number(HALF_PERCENT),
                    fillPremiums: { initial: Number(HALF_PERCENT), points: [] },
                }),
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
                { fillPremiums: { initial: Number(HALF_PERCENT), points: [] } },
                { fillPremiums: { initial: 400_000, points: [{ premium: 150_000, shareDelta: 3000 }, { premium: 30_000, shareDelta: 4000 }] } },
            ]) {
                const params = { startTime, duration: 100, initialRateBump: Number(HALF_PERCENT), ...extra };
                const order = await buildAuctionOrder({ dai, weth, auction, auctionDetails: buildAnchoredAuctionDetails(params) });
                modes.push({ order, extraData: buildAnchoredAuctionDetails(params), orderHash: await swap.hashOrder(order) });
            }

            // Sample the whole surface: before, during and after the auction, random fill sizes and random
            // remainders. The rate bump only ever moves the price against the taker, so the maker's floor —
            // the plain proportional rate — must hold everywhere, in both directions and both curve shapes.
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
        const auctionParams = { startTime: 0, duration: 100, initialRateBump: Number(HALF_PERCENT), anchored: true };

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
            const announcedAt = await announce(registrator, order);

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
            const announcedAt = await announce(registrator, order);

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
            const announcedAt = await announce(registrator, order);
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
            const announcedAt = await announce(registrator, order);

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
            const announcedAt = await announce(registrator, order);

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
            await announce(registrator, rejecting.order);
            await expect(fill(swap, rejecting.order, rejecting.sig, MAKING_AMOUNT))
                .to.be.revertedWithCustomError(interactionMock, 'TakingAmountTooHigh');

            const accepting = await buildOrderWithChainedInteraction(TAKING_AMOUNT * 2n);
            await announce(registrator, accepting.order);
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

        it('stops fills once the announcement deadline has passed', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const order = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails(auctionParams),
                exclusivity: buildAnchoredExclusivity({
                    allowedTimeDelay: 0,
                    announcementDeadlineDelay: 120,
                    whitelist: [{ address: taker.address }],
                }),
            });
            const sig = await signature(order, chainId, swap);
            const announcedAt = await announce(registrator, order);

            // On the deadline itself the order still fills — the cutoff is strictly after it.
            await time.setNextBlockTimestamp(announcedAt + 120);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 2n))
                .to.changeTokenBalances(dai, [taker, maker], [MAKING_AMOUNT / 2n, -MAKING_AMOUNT / 2n]);

            await time.setNextBlockTimestamp(announcedAt + 121);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 2n)).to.be.revertedWithCustomError(auction, 'AuctionExpired');
        });

        it('rejects a deadline that is not anchored', async function () {
            const { dai, weth, swap, chainId, auction } = await loadFixture(deployContractsAndInit);

            // The deadline is measured from the announcement, so without the anchored bit there is
            // nothing to measure it from — the combination fails closed instead of silently no-oping.
            const order = await buildAuctionOrder({
                dai,
                weth,
                auction,
                auctionDetails: buildAnchoredAuctionDetails({ startTime: 0, duration: 100, initialRateBump: 0 }),
                exclusivity: buildAnchoredExclusivity({
                    announcementDeadlineDelay: 120,
                    whitelist: [{ address: taker.address }],
                }),
            });
            const sig = await signature(order, chainId, swap);

            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.be.revertedWithCustomError(auction, 'InvalidFlagCombination');
        });

        it('bounds an order whose getters were mis-assembled', async function () {
            const { dai, weth, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            // An order assembled without routing its amount data through the auction prices at the plain
            // ratio and skips the getter-side post-auction deadline entirely. The announcement deadline
            // rides in the post-interaction, which is not skippable, so the exposure still ends.
            const order = buildOrder(
                {
                    maker: maker.address,
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: MAKING_AMOUNT,
                    takingAmount: TAKING_AMOUNT,
                },
                {
                    postInteraction: ethers.solidityPacked(
                        ['address', 'bytes'],
                        [
                            await auction.getAddress(),
                            buildAnchoredExclusivity({
                                allowedTimeDelay: 0,
                                announcementDeadlineDelay: 60,
                                whitelist: [{ address: taker.address }],
                            }),
                        ],
                    ),
                },
            );
            const sig = await signature(order, chainId, swap);
            const announcedAt = await announce(registrator, order);

            await time.setNextBlockTimestamp(announcedAt + 30);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 2n))
                .to.changeTokenBalances(weth, [taker, maker], [-TAKING_AMOUNT / 2n, TAKING_AMOUNT / 2n]);

            await time.setNextBlockTimestamp(announcedAt + 61);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 2n)).to.be.revertedWithCustomError(auction, 'AuctionExpired');
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
            const auctionParams = {
                startTime: 0,
                duration: 100,
                initialRateBump: Number(HALF_PERCENT),
                anchored: true,
                fillPremiums: { initial: Number(HALF_PERCENT), points: [] },
            };
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
            const announcedAt = await announce(registrator, order);

            // The exclusivity chained behind the settlement still bites, though the settlement let the taker in.
            await time.setNextBlockTimestamp(announcedAt + 20);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.be.revertedWithCustomError(auction, 'AllowedTimeViolation');

            const fillTime = announcedAt + 60;
            await time.setNextBlockTimestamp(fillTime);
            const fillTx = fill(swap, order, sig, MAKING_AMOUNT / 2n);

            // The price is the anchored, fill-scaled curve with the resolver fee on top, and nothing else.
            const auctionPrice = takingAmountFor(
                order,
                { ...auctionParams, startTime: announcedAt },
                fillTime,
                MAKING_AMOUNT / 2n,
                MAKING_AMOUNT,
            );
            const withFee = ceilDiv(auctionPrice * (100000n + resolverFee), 100000n);
            const feeAmount = withFee - ceilDiv(withFee * 100000n, 100000n + resolverFee);
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker, otherResolver], [-withFee, withFee - feeAmount, feeAmount]);
            await expect(fillTx).to.changeTokenBalances(dai, [taker, maker], [MAKING_AMOUNT / 2n, -MAKING_AMOUNT / 2n]);
        });

        it('enforces the announcement deadline through a chained settlement', async function () {
            const { dai, weth, inch, swap, chainId, registrator, auction } = await loadFixture(deployContractsAndInit);

            const SimpleSettlementMock = await ethers.getContractFactory('SimpleSettlementMock');
            const settlement = await SimpleSettlementMock.deploy(swap, inch, weth, maker);
            await settlement.waitForDeployment();

            const auctionParams = { startTime: 0, duration: 100, initialRateBump: 0, anchored: true };
            const auctionTail = ethers.solidityPacked(
                ['address', 'bytes'],
                [await auction.getAddress(), buildAnchoredAuctionDetails(auctionParams)],
            );
            const exclusivityTail = ethers.solidityPacked(
                ['address', 'bytes'],
                [
                    await auction.getAddress(),
                    buildAnchoredExclusivity({
                        allowedTimeDelay: 0,
                        announcementDeadlineDelay: 200,
                        whitelist: [{ address: taker.address }],
                    }),
                ],
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
                    getterExtraPrefix: buildLegacyAuctionDetails(),
                    whitelistDiscount: 100,
                    whitelist: '0x01' + taker.address.slice(-20),
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
            const announcedAt = await announce(registrator, order);

            // The deadline chained behind the settlement holds even though the settlement let the taker in.
            await time.setNextBlockTimestamp(announcedAt + 200);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 2n))
                .to.changeTokenBalances(dai, [taker, maker], [MAKING_AMOUNT / 2n, -MAKING_AMOUNT / 2n]);

            await time.setNextBlockTimestamp(announcedAt + 201);
            await expect(fill(swap, order, sig, MAKING_AMOUNT / 2n))
                .to.be.revertedWithCustomError(auction, 'AuctionExpired');
        });

        it('prices a matrix order chained behind the fee taker', async function () {
            const { dai, weth, swap, chainId, registrator, auction, feeTaker } = await loadFixture(deployContractsAndInit);

            const resolverFee = 1000n; // 1% in 1e5
            const auctionParams = {
                startTime: 0,
                duration: 100,
                initialRateBump: Number(HALF_PERCENT),
                anchored: true,
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
            const announcedAt = await announce(registrator, order);

            // A quarter-sized fill lands halfway up the matrix's first segment, on top of the fee.
            const fillTime = announcedAt + 200;
            await time.setNextBlockTimestamp(fillTime);
            const fillTx = fill(swap, order, sig, MAKING_AMOUNT / 4n);

            const auctionPrice = takingAmountFor(
                order,
                { ...auctionParams, startTime: announcedAt },
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
            const auctionParams = { startTime: 0, duration: 100, initialRateBump: Number(HALF_PERCENT), anchored: true };
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
            const announcedAt = await announce(registrator, order);

            // The exclusivity chained behind the fee taker still bites.
            await time.setNextBlockTimestamp(announcedAt + 20);
            await expect(fill(swap, order, sig, MAKING_AMOUNT)).to.be.revertedWithCustomError(auction, 'AllowedTimeViolation');

            const fillTime = announcedAt + 60;
            await time.setNextBlockTimestamp(fillTime);
            const fillTx = fill(swap, order, sig, MAKING_AMOUNT);

            const auctionPrice = takingAmountFor(order, { ...auctionParams, startTime: announcedAt }, fillTime, MAKING_AMOUNT, MAKING_AMOUNT);
            const withFee = ceilDiv(auctionPrice * (100000n + resolverFee), 100000n);
            const feeAmount = withFee - ceilDiv(withFee * 100000n, 100000n + resolverFee);
            await expect(fillTx).to.changeTokenBalances(weth, [taker, maker, otherResolver], [-withFee, withFee - feeAmount, feeAmount]);
            await expect(fillTx).to.changeTokenBalances(dai, [taker, maker], [MAKING_AMOUNT, -MAKING_AMOUNT]);
        });
    });
});
