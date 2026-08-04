const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('@1inch/solidity-utils');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');
const {
    buildAnchoredAuctionDetails,
    buildAnchoredExclusivity,
    buildFeeTakerExtensions,
    buildMakerTraitsRFQ,
    buildOrder,
    buildTakerTraits,
} = require('./helpers/orderUtils');
const { ether, trim0x } = require('./helpers/utils');
const { getPermit } = require('./helpers/eip712');
const { BASE_POINTS, ceilDiv, takingAmountFor } = require('./helpers/fusionAuction');

const HALF_PERCENT = 50_000n; // 0.5% in 1e7

describe('DelegatedMaker', function () {
    let user, user2, taker, stranger;

    before(async function () {
        [user, user2, taker, stranger] = await ethers.getSigners();
    });

    const MAKING_AMOUNT = ether('100');
    const TAKING_AMOUNT = ether('0.1');

    async function deployContractsAndInit () {
        const { dai, weth, inch, swap, chainId } = await deploySwapTokens();

        const OrderRegistrator = await ethers.getContractFactory('OrderRegistrator');
        const registrator = await OrderRegistrator.deploy(swap);
        await registrator.waitForDeployment();

        const FusionAnchoredAuction = await ethers.getContractFactory('FusionAnchoredAuction');
        const auction = await FusionAnchoredAuction.deploy(registrator);
        await auction.waitForDeployment();

        const DelegatedMaker = await ethers.getContractFactory('DelegatedMaker');
        const delegatedMaker = await DelegatedMaker.deploy(swap, registrator);
        await delegatedMaker.waitForDeployment();

        const FeeTaker = await ethers.getContractFactory('FeeTaker');
        const feeTaker = await FeeTaker.deploy(swap, inch, weth, user);
        await feeTaker.waitForDeployment();

        // The owners' one-time setup: funds stay in the wallet, only an allowance is granted.
        await dai.mint(user, ether('1000000'));
        await dai.connect(user).approve(delegatedMaker, ether('1000000'));
        await dai.mint(user2, ether('1000000'));
        await dai.connect(user2).approve(delegatedMaker, ether('1000000'));

        await weth.connect(taker).deposit({ value: ether('100') });
        await weth.connect(taker).approve(swap, ether('100'));
        // The taker pays dai in the permit tests and holds the access token in the fee tests.
        await dai.mint(taker, ether('1000000'));
        await dai.connect(taker).approve(swap, ether('1000000'));
        await inch.mint(taker, ether('1'));

        return { dai, weth, inch, swap, chainId, registrator, auction, delegatedMaker, feeTaker };
    }

    /** An order the shared contract makes on behalf of `owner`, funded from the owner's wallet. */
    async function buildDelegatedOrder ({ dai, weth, delegatedMaker, owner = user, auctionData, makingAmount = MAKING_AMOUNT }) {
        const delegatedMakerAddress = await delegatedMaker.getAddress();
        return buildOrder(
            {
                maker: delegatedMakerAddress,
                receiver: owner.address,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount,
                takingAmount: TAKING_AMOUNT,
            },
            {
                ...(auctionData ? { makingAmountData: auctionData, takingAmountData: auctionData } : {}),
                preInteraction: delegatedMakerAddress,
            },
        );
    }

    function fill (swap, order, amount, { byMakingAmount = true, from = taker } = {}) {
        const takerTraits = buildTakerTraits({ makingAmount: byMakingAmount, extension: order.extension });
        return swap.connect(from).fillContractOrderArgs(order, '0x', amount, takerTraits.traits, takerTraits.args);
    }

    describe('lifecycle', function () {
        it('creates, anchors and presigns in one transaction, moving nothing', async function () {
            const { dai, weth, swap, registrator, delegatedMaker } = await loadFixture(deployContractsAndInit);

            const order = await buildDelegatedOrder({ dai, weth, delegatedMaker });
            const orderHash = await swap.hashOrder(order);

            const tx = await delegatedMaker.connect(user).createOrder(order, order.extension);
            await tx.wait();

            await expect(tx).to.emit(delegatedMaker, 'DelegatedOrderCreated').withArgs(orderHash, user.address);
            await expect(tx).to.emit(registrator, 'OrderRegistered');
            await expect(tx).to.emit(registrator, 'OrderAnnounced').withArgs(orderHash, await time.latest());

            expect(await delegatedMaker.approvedOrders(orderHash)).to.equal(user.address);
            expect(await registrator.announcedAt(orderHash)).to.equal(await time.latest());
            // The presign is live and the wallet untouched: nothing moved and nothing was signed.
            expect(await delegatedMaker.isValidSignature(orderHash, '0x')).to.equal('0x1626ba7e');
            expect(await dai.balanceOf(user)).to.equal(ether('1000000'));
            expect(await dai.balanceOf(delegatedMaker)).to.equal(0);
        });

        it('fills with an empty signature, pulling funds just in time', async function () {
            const { dai, weth, swap, delegatedMaker } = await loadFixture(deployContractsAndInit);

            const order = await buildDelegatedOrder({ dai, weth, delegatedMaker });
            await delegatedMaker.connect(user).createOrder(order, order.extension);
            await delegatedMaker.approveRouter(dai);

            const fillTx = fill(swap, order, MAKING_AMOUNT);
            // The pull, the fill and the payout are one transaction: the wallet funds the order at the
            // moment it fills, the shared contract keeps nothing, and proceeds land on the owner directly.
            await expect(fillTx).to.changeTokenBalances(dai, [user, taker, delegatedMaker], [-MAKING_AMOUNT, MAKING_AMOUNT, 0]);
            await expect(fillTx).to.changeTokenBalances(weth, [taker, user], [-TAKING_AMOUNT, TAKING_AMOUNT]);
        });

        it('pulls exactly the filled amount across partial fills', async function () {
            const { dai, weth, swap, delegatedMaker } = await loadFixture(deployContractsAndInit);

            const order = await buildDelegatedOrder({ dai, weth, delegatedMaker });
            await delegatedMaker.connect(user).createOrder(order, order.extension);
            await delegatedMaker.approveRouter(dai);

            const first = MAKING_AMOUNT * 2n / 5n;
            await expect(fill(swap, order, first))
                .to.changeTokenBalances(dai, [user, taker, delegatedMaker], [-first, first, 0]);

            const rest = MAKING_AMOUNT - first;
            const restTx = fill(swap, order, rest);
            await expect(restTx).to.changeTokenBalances(dai, [user, taker, delegatedMaker], [-rest, rest, 0]);
            await expect(restTx).to.changeTokenBalances(weth, [taker, user], [-TAKING_AMOUNT * 3n / 5n, TAKING_AMOUNT * 3n / 5n]);
        });

        it('cannot fill until someone approves the router for the maker asset', async function () {
            const { dai, weth, swap, delegatedMaker } = await loadFixture(deployContractsAndInit);

            const order = await buildDelegatedOrder({ dai, weth, delegatedMaker });
            await delegatedMaker.connect(user).createOrder(order, order.extension);

            // The pull succeeds but the protocol cannot move the pulled funds on without the contract's
            // own allowance — the second leg of the token path.
            await expect(fill(swap, order, MAKING_AMOUNT)).to.be.revertedWithCustomError(swap, 'TransferFromMakerToTakerFailed');

            // The approval is permissionless: any stranger may switch the token on.
            await delegatedMaker.connect(stranger).approveRouter(dai);
            await expect(fill(swap, order, MAKING_AMOUNT))
                .to.changeTokenBalances(dai, [user, taker], [-MAKING_AMOUNT, MAKING_AMOUNT]);
        });
    });

    describe('creation rules', function () {
        it('rejects an order that does not name this contract as maker', async function () {
            const { dai, weth, delegatedMaker } = await loadFixture(deployContractsAndInit);

            const order = await buildDelegatedOrder({ dai, weth, delegatedMaker });
            order.maker = user.address;
            await expect(delegatedMaker.connect(user).createOrder(order, order.extension))
                .to.be.revertedWithCustomError(delegatedMaker, 'InvalidMaker');
        });

        it('rejects an order whose receiver is not the creator', async function () {
            const { dai, weth, delegatedMaker } = await loadFixture(deployContractsAndInit);

            // A zero receiver would pay the order's maker — this contract — and a foreign receiver is
            // only acceptable in the verified fee-collection shape, which a bare order does not carry.
            const order = await buildDelegatedOrder({ dai, weth, delegatedMaker });
            await expect(delegatedMaker.connect(user2).createOrder(order, order.extension))
                .to.be.revertedWithCustomError(delegatedMaker, 'InvalidFeeReceiver');

            const zeroReceiver = await buildDelegatedOrder({ dai, weth, delegatedMaker });
            zeroReceiver.receiver = ethers.ZeroAddress;
            await expect(delegatedMaker.connect(user).createOrder(zeroReceiver, zeroReceiver.extension))
                .to.be.revertedWithCustomError(delegatedMaker, 'InvalidReceiver');
        });

        it('rejects bit-invalidator traits and a missing pre-interaction hook', async function () {
            const { dai, weth, delegatedMaker } = await loadFixture(deployContractsAndInit);
            const delegatedMakerAddress = await delegatedMaker.getAddress();

            // The bit-invalidator nonce space would be shared across every user of the contract.
            const rfqStyle = buildOrder(
                {
                    maker: delegatedMakerAddress,
                    receiver: user.address,
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: MAKING_AMOUNT,
                    takingAmount: TAKING_AMOUNT,
                    makerTraits: buildMakerTraitsRFQ(),
                },
                { preInteraction: delegatedMakerAddress },
            );
            await expect(delegatedMaker.connect(user).createOrder(rfqStyle, rfqStyle.extension))
                .to.be.revertedWithCustomError(delegatedMaker, 'InvalidMakerTraits');

            // Without the pre-interaction hook no pull ever happens and the order could never fill.
            const noHook = buildOrder({
                maker: delegatedMakerAddress,
                receiver: user.address,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: MAKING_AMOUNT,
                takingAmount: TAKING_AMOUNT,
            });
            await expect(delegatedMaker.connect(user).createOrder(noHook, noHook.extension))
                .to.be.revertedWithCustomError(delegatedMaker, 'InvalidMakerTraits');
        });

        it('rejects a pre-interaction that targets a foreign contract', async function () {
            const { dai, weth, delegatedMaker } = await loadFixture(deployContractsAndInit);

            const order = buildOrder(
                {
                    maker: await delegatedMaker.getAddress(),
                    receiver: user.address,
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: MAKING_AMOUNT,
                    takingAmount: TAKING_AMOUNT,
                },
                { preInteraction: taker.address },
            );
            await expect(delegatedMaker.connect(user).createOrder(order, order.extension))
                .to.be.revertedWithCustomError(delegatedMaker, 'InvalidPreInteractionTarget');
        });

        it('rejects a duplicate and a cancelled order alike', async function () {
            const { dai, weth, delegatedMaker } = await loadFixture(deployContractsAndInit);

            const order = await buildDelegatedOrder({ dai, weth, delegatedMaker });
            await delegatedMaker.connect(user).createOrder(order, order.extension);
            await expect(delegatedMaker.connect(user).createOrder(order, order.extension))
                .to.be.revertedWithCustomError(delegatedMaker, 'OrderAlreadyRegistered');

            // Re-creating a cancelled order would re-arm the presign for an order the protocol has
            // invalidated forever — a paid-for dead order. The ever-registered check refuses it.
            await delegatedMaker.connect(user).cancelOrder(order);
            await expect(delegatedMaker.connect(user).createOrder(order, order.extension))
                .to.be.revertedWithCustomError(delegatedMaker, 'OrderAlreadyRegistered');
        });
    });

    describe('cancellation', function () {
        it('kills an already-started order at the protocol level', async function () {
            const { dai, weth, swap, delegatedMaker } = await loadFixture(deployContractsAndInit);

            const order = await buildDelegatedOrder({ dai, weth, delegatedMaker });
            const orderHash = await swap.hashOrder(order);
            await delegatedMaker.connect(user).createOrder(order, order.extension);
            await delegatedMaker.approveRouter(dai);

            const first = MAKING_AMOUNT / 2n;
            await expect(fill(swap, order, first)).to.changeTokenBalances(dai, [user, taker], [-first, first]);

            // The protocol validates ERC-1271 only on the first fill, so deleting the presign alone would
            // not stop the rest of a started order — the cancellation invalidates it at the protocol too.
            const cancelTx = delegatedMaker.connect(user).cancelOrder(order);
            await expect(cancelTx).to.emit(delegatedMaker, 'DelegatedOrderCancelled').withArgs(orderHash);
            expect(await delegatedMaker.approvedOrders(orderHash)).to.equal(ethers.ZeroAddress);
            expect(await delegatedMaker.isValidSignature(orderHash, '0x')).to.equal('0x00000000');

            await expect(fill(swap, order, MAKING_AMOUNT - first)).to.be.revertedWithCustomError(swap, 'InvalidatedOrder');
        });

        it('is the recorded owner\'s alone to call', async function () {
            const { dai, weth, delegatedMaker } = await loadFixture(deployContractsAndInit);

            const order = await buildDelegatedOrder({ dai, weth, delegatedMaker });
            await delegatedMaker.connect(user).createOrder(order, order.extension);

            await expect(delegatedMaker.connect(user2).cancelOrder(order))
                .to.be.revertedWithCustomError(delegatedMaker, 'AccessDenied');
            // An order that was never created has no owner either.
            const foreign = await buildDelegatedOrder({ dai, weth, delegatedMaker, makingAmount: MAKING_AMOUNT / 2n });
            await expect(delegatedMaker.connect(user).cancelOrder(foreign))
                .to.be.revertedWithCustomError(delegatedMaker, 'AccessDenied');
        });
    });

    describe('pull authorization', function () {
        it('rejects pulls from anyone but the protocol, and for orders with no owner', async function () {
            const { dai, weth, swap, delegatedMaker } = await loadFixture(deployContractsAndInit);

            const order = await buildDelegatedOrder({ dai, weth, delegatedMaker });
            const orderHash = await swap.hashOrder(order);
            await delegatedMaker.connect(user).createOrder(order, order.extension);

            await expect(
                delegatedMaker.connect(stranger).preInteraction(order, '0x', orderHash, taker.address, 1n, 1n, 1n, '0x'),
            ).to.be.revertedWithCustomError(delegatedMaker, 'OnlyLimitOrderProtocol');

            // Even the protocol itself cannot pull for an order with no owner on record — the per-fill
            // belt to the cancellation suspender.
            const swapAddress = await swap.getAddress();
            await ethers.provider.send('hardhat_impersonateAccount', [swapAddress]);
            await ethers.provider.send('hardhat_setBalance', [swapAddress, '0xde0b6b3a7640000']);
            const swapSigner = await ethers.getSigner(swapAddress);
            await expect(
                delegatedMaker.connect(swapSigner).preInteraction(order, '0x', ethers.id('unapproved'), taker.address, 1n, 1n, 1n, '0x'),
            ).to.be.revertedWithCustomError(delegatedMaker, 'AccessDenied');
            await ethers.provider.send('hardhat_stopImpersonatingAccount', [swapAddress]);
        });

        it('keeps two users on the shared maker out of each other\'s way', async function () {
            const { dai, weth, swap, delegatedMaker } = await loadFixture(deployContractsAndInit);

            const first = await buildDelegatedOrder({ dai, weth, delegatedMaker, owner: user });
            const second = await buildDelegatedOrder({ dai, weth, delegatedMaker, owner: user2 });
            await delegatedMaker.connect(user).createOrder(first, first.extension);
            await delegatedMaker.connect(user2).createOrder(second, second.extension);
            await delegatedMaker.approveRouter(dai);

            // The first user's cancellation touches nothing of the second user's order.
            await delegatedMaker.connect(user).cancelOrder(first);
            await expect(fill(swap, first, MAKING_AMOUNT)).to.be.revertedWithCustomError(swap, 'InvalidatedOrder');

            const fillTx = fill(swap, second, MAKING_AMOUNT);
            await expect(fillTx).to.changeTokenBalances(dai, [user2, user, taker], [-MAKING_AMOUNT, 0, MAKING_AMOUNT]);
            await expect(fillTx).to.changeTokenBalances(weth, [taker, user2, user], [-TAKING_AMOUNT, TAKING_AMOUNT, 0]);
        });
    });

    describe('composition with the anchored auction', function () {
        it('anchors the auction to the create transaction and prices the matrix from it', async function () {
            const { dai, weth, swap, auction, registrator, delegatedMaker } = await loadFixture(deployContractsAndInit);

            const params = {
                startTime: 0,
                duration: 100,
                initialRateBump: Number(HALF_PERCENT),
                startDelay: 0,
                fillPremiums: { initial: 400_000, points: [{ premium: 100_000, shareDelta: 5000 }] },
            };
            const auctionData = ethers.solidityPacked(
                ['address', 'bytes'],
                [await auction.getAddress(), buildAnchoredAuctionDetails(params)],
            );
            const order = await buildDelegatedOrder({ dai, weth, delegatedMaker, auctionData });
            const orderHash = await swap.hashOrder(order);

            await delegatedMaker.approveRouter(dai);
            await delegatedMaker.connect(user).createOrder(order, order.extension);
            const announcedAt = Number(await registrator.announcedAt(orderHash));
            expect(announcedAt).to.equal(await time.latest());

            // Half the order, filled past the auction, pays the matrix premium for its rung — priced from
            // the create transaction, with no signature anywhere in the flow.
            const fillTime = announcedAt + 200;
            await time.setNextBlockTimestamp(fillTime);
            const makingAmount = MAKING_AMOUNT / 2n;
            const expected = takingAmountFor(order, { ...params, startTime: announcedAt }, fillTime, makingAmount, MAKING_AMOUNT);
            expect(expected).to.equal(ceilDiv((TAKING_AMOUNT / 2n) * (BASE_POINTS + 100_000n), BASE_POINTS));

            const fillTx = fill(swap, order, makingAmount);
            await expect(fillTx).to.changeTokenBalances(dai, [user, taker, delegatedMaker], [-makingAmount, makingAmount, 0]);
            await expect(fillTx).to.changeTokenBalances(weth, [taker, user], [-expected, expected]);
        });

        it('carries resolver exclusivity alongside the pull in one order', async function () {
            const { dai, weth, swap, auction, registrator, delegatedMaker } = await loadFixture(deployContractsAndInit);

            // The production shape: the pre-interaction pulls and the post-interaction gates resolvers,
            // both hooks on the same order, both anchored to the create transaction.
            const params = { startTime: 0, duration: 100, initialRateBump: Number(HALF_PERCENT), startDelay: 0 };
            const auctionAddress = await auction.getAddress();
            const delegatedMakerAddress = await delegatedMaker.getAddress();
            const order = buildOrder(
                {
                    maker: delegatedMakerAddress,
                    receiver: user.address,
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: MAKING_AMOUNT,
                    takingAmount: TAKING_AMOUNT,
                },
                {
                    makingAmountData: ethers.solidityPacked(['address', 'bytes'], [auctionAddress, buildAnchoredAuctionDetails(params)]),
                    takingAmountData: ethers.solidityPacked(['address', 'bytes'], [auctionAddress, buildAnchoredAuctionDetails(params)]),
                    preInteraction: delegatedMakerAddress,
                    postInteraction: ethers.solidityPacked(
                        ['address', 'bytes'],
                        [auctionAddress, buildAnchoredExclusivity({ allowedTimeDelay: 30, whitelist: [{ address: taker.address }] })],
                    ),
                },
            );

            await delegatedMaker.approveRouter(dai);
            await delegatedMaker.connect(user).createOrder(order, order.extension);
            const announcedAt = Number(await registrator.announcedAt(await swap.hashOrder(order)));

            await time.setNextBlockTimestamp(announcedAt + 29);
            await expect(fill(swap, order, MAKING_AMOUNT)).to.be.revertedWithCustomError(auction, 'AllowedTimeViolation');

            const fillTime = announcedAt + 30;
            await time.setNextBlockTimestamp(fillTime);
            const expected = takingAmountFor(order, { ...params, startTime: announcedAt }, fillTime, MAKING_AMOUNT, MAKING_AMOUNT);
            const fillTx = fill(swap, order, MAKING_AMOUNT);
            await expect(fillTx).to.changeTokenBalances(dai, [user, taker, delegatedMaker], [-MAKING_AMOUNT, MAKING_AMOUNT, 0]);
            await expect(fillTx).to.changeTokenBalances(weth, [taker, user], [-expected, expected]);
        });
    });

    describe('fee collection', function () {
        it('collects fees through a fee taker that routes the net back to the creator', async function () {
            const { dai, weth, swap, registrator, auction, delegatedMaker, feeTaker } = await loadFixture(deployContractsAndInit);

            // The full production shape on one order: the pre-interaction pulls from the creator, the
            // fee taker is the receiver and pays the creator as its custom receiver, the anchored
            // auction prices through the fee taker's getters, and the anchored exclusivity rides the
            // fee taker's post-interaction tail.
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
            const delegatedMakerAddress = await delegatedMaker.getAddress();

            const order = buildOrder(
                {
                    maker: delegatedMakerAddress,
                    receiver: await feeTaker.getAddress(),
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: MAKING_AMOUNT,
                    takingAmount: TAKING_AMOUNT,
                },
                {
                    ...buildFeeTakerExtensions({
                        feeTaker: await feeTaker.getAddress(),
                        makerReceiver: user.address,
                        protocolFeeRecipient: stranger.address,
                        resolverFee,
                        whitelistDiscount: 100,
                        customMakingGetter: auctionTail,
                        customTakingGetter: auctionTail,
                        customPostInteraction: exclusivityTail,
                    }),
                    preInteraction: delegatedMakerAddress,
                },
            );

            await delegatedMaker.approveRouter(dai);
            await delegatedMaker.connect(user).createOrder(order, order.extension);
            const announcedAt = Number(await registrator.announcedAt(await swap.hashOrder(order)));

            // The exclusivity chained behind the fee taker still bites.
            await time.setNextBlockTimestamp(announcedAt + 20);
            await expect(fill(swap, order, MAKING_AMOUNT)).to.be.revertedWithCustomError(auction, 'AllowedTimeViolation');

            const fillTime = announcedAt + 60;
            await time.setNextBlockTimestamp(fillTime);
            const auctionPrice = takingAmountFor(order, { ...auctionParams, startTime: announcedAt + 10 }, fillTime, MAKING_AMOUNT, MAKING_AMOUNT);
            const withFee = ceilDiv(auctionPrice * (100000n + resolverFee), 100000n);
            const feeAmount = withFee - ceilDiv(withFee * 100000n, 100000n + resolverFee);

            const fillTx = fill(swap, order, MAKING_AMOUNT);
            await expect(fillTx).to.changeTokenBalances(dai, [user, taker, delegatedMaker], [-MAKING_AMOUNT, MAKING_AMOUNT, 0]);
            await expect(fillTx).to.changeTokenBalances(
                weth,
                [taker, user, stranger, feeTaker, delegatedMaker],
                [-withFee, withFee - feeAmount, feeAmount, 0, 0],
            );
        });

        it('refuses a fee order unless its bytes route proceeds back to the creator', async function () {
            const { dai, weth, delegatedMaker, feeTaker } = await loadFixture(deployContractsAndInit);
            const delegatedMakerAddress = await delegatedMaker.getAddress();
            const feeTakerAddress = await feeTaker.getAddress();

            const buildFeeOrder = (receiver, postInteraction) => buildOrder(
                {
                    maker: delegatedMakerAddress,
                    receiver,
                    makerAsset: dai.target,
                    takerAsset: weth.target,
                    makingAmount: MAKING_AMOUNT,
                    takingAmount: TAKING_AMOUNT,
                },
                { preInteraction: delegatedMakerAddress, postInteraction },
            );
            const feeData = ({ flags = '0x01', customReceiver = user.address } = {}) => ethers.solidityPacked(
                ['address', 'bytes1', 'address', 'address'].concat(customReceiver ? ['address'] : []),
                [feeTakerAddress, flags, ethers.ZeroAddress, ethers.ZeroAddress].concat(customReceiver ? [customReceiver] : []),
            );

            // The custom-receiver flag is what makes a conforming fee taker forward the net at all.
            const noFlag = buildFeeOrder(feeTakerAddress, feeData({ flags: '0x00' }));
            await expect(delegatedMaker.connect(user).createOrder(noFlag, noFlag.extension))
                .to.be.revertedWithCustomError(delegatedMaker, 'InvalidFeeReceiver');

            // A custom receiver naming anyone but the creator diverts the proceeds.
            const wrongReceiver = buildFeeOrder(feeTakerAddress, feeData({ customReceiver: user2.address }));
            await expect(delegatedMaker.connect(user).createOrder(wrongReceiver, wrongReceiver.extension))
                .to.be.revertedWithCustomError(delegatedMaker, 'InvalidFeeReceiver');

            // The receiver must be the very contract whose post-interaction distributes, or the taking
            // asset lands on an address that never forwards it.
            const foreignTarget = buildFeeOrder(user2.address, feeData());
            await expect(delegatedMaker.connect(user).createOrder(foreignTarget, foreignTarget.extension))
                .to.be.revertedWithCustomError(delegatedMaker, 'InvalidFeeReceiver');

            // Too short to even carry a custom receiver.
            const short = buildFeeOrder(feeTakerAddress, feeData({ customReceiver: false }));
            await expect(delegatedMaker.connect(user).createOrder(short, short.extension))
                .to.be.revertedWithCustomError(delegatedMaker, 'InvalidFeeReceiver');

            // Well-formed bytes with the post-interaction trait switched off never run the distribution.
            const noHook = buildFeeOrder(feeTakerAddress, feeData());
            noHook.makerTraits = BigInt(noHook.makerTraits) & ~(1n << 251n);
            await expect(delegatedMaker.connect(user).createOrder(noHook, noHook.extension))
                .to.be.revertedWithCustomError(delegatedMaker, 'InvalidFeeReceiver');

            // The same well-formed shape, untampered, is accepted.
            const valid = buildFeeOrder(feeTakerAddress, feeData());
            await expect(delegatedMaker.connect(user).createOrder(valid, valid.extension))
                .to.emit(delegatedMaker, 'DelegatedOrderCreated');
        });
    });

    describe('permit', function () {
        it('folds the allowance into the create transaction', async function () {
            const { dai, weth, swap, chainId, registrator, delegatedMaker } = await loadFixture(deployContractsAndInit);
            const delegatedMakerAddress = await delegatedMaker.getAddress();

            // The maker asset is the permit-capable WETH; the user holds funds but has approved nothing.
            await weth.connect(user).deposit({ value: ether('1') });
            await delegatedMaker.approveRouter(weth);

            const order = buildOrder(
                {
                    maker: delegatedMakerAddress,
                    receiver: user.address,
                    makerAsset: await weth.getAddress(),
                    takerAsset: await dai.getAddress(),
                    makingAmount: ether('1'),
                    takingAmount: ether('100'),
                },
                { preInteraction: delegatedMakerAddress },
            );
            const orderHash = await swap.hashOrder(order);

            const permit = await getPermit(user.address, user, weth, '1', chainId, delegatedMakerAddress, ether('1').toString());
            await delegatedMaker.connect(user).createOrderWithPermit(order, order.extension, permit);

            // One transaction did everything: allowance, presign, broadcast and anchor.
            expect(await weth.allowance(user, delegatedMaker)).to.equal(ether('1'));
            expect(await registrator.announcedAt(orderHash)).to.equal(await time.latest());

            const fillTx = fill(swap, order, ether('1'));
            await expect(fillTx).to.changeTokenBalances(weth, [user, taker, delegatedMaker], [-ether('1'), ether('1'), 0]);
            await expect(fillTx).to.changeTokenBalances(dai, [taker, user], [-ether('100'), ether('100')]);
        });

        it('shrugs off a front-run permit', async function () {
            const { dai, weth, swap, chainId, delegatedMaker } = await loadFixture(deployContractsAndInit);
            const delegatedMakerAddress = await delegatedMaker.getAddress();

            await weth.connect(user).deposit({ value: ether('1') });
            await delegatedMaker.approveRouter(weth);

            const order = buildOrder(
                {
                    maker: delegatedMakerAddress,
                    receiver: user.address,
                    makerAsset: await weth.getAddress(),
                    takerAsset: await dai.getAddress(),
                    makingAmount: ether('1'),
                    takingAmount: ether('100'),
                },
                { preInteraction: delegatedMakerAddress },
            );
            const orderHash = await swap.hashOrder(order);

            // Anyone can lift the permit from the mempool and submit it first; the allowance lands anyway.
            const permit = await getPermit(user.address, user, weth, '1', chainId, delegatedMakerAddress, ether('1').toString());
            const selector = weth.interface.getFunction('permit(address,address,uint256,uint256,uint8,bytes32,bytes32)').selector;
            await stranger.sendTransaction({ to: await weth.getAddress(), data: selector + trim0x(permit) });
            expect(await weth.allowance(user, delegatedMaker)).to.equal(ether('1'));

            // The spent permit reverts inside the token and is swallowed; the order is created anyway
            // and fills through the allowance the front-run itself granted.
            await delegatedMaker.connect(user).createOrderWithPermit(order, order.extension, permit);
            expect(await delegatedMaker.approvedOrders(orderHash)).to.equal(user.address);
            await expect(fill(swap, order, ether('1')))
                .to.changeTokenBalances(weth, [user, taker], [-ether('1'), ether('1')]);
        });
    });
});
