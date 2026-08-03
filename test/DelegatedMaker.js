const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('@1inch/solidity-utils');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');
const {
    buildAnchoredAuctionDetails,
    buildMakerTraitsRFQ,
    buildOrder,
    buildTakerTraits,
} = require('./helpers/orderUtils');
const { ether } = require('./helpers/utils');
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
        const { dai, weth, swap, chainId } = await deploySwapTokens();

        const OrderRegistrator = await ethers.getContractFactory('OrderRegistrator');
        const registrator = await OrderRegistrator.deploy(swap);
        await registrator.waitForDeployment();

        const FusionAnchoredAuction = await ethers.getContractFactory('FusionAnchoredAuction');
        const auction = await FusionAnchoredAuction.deploy(registrator);
        await auction.waitForDeployment();

        const DelegatedMaker = await ethers.getContractFactory('DelegatedMaker');
        const delegatedMaker = await DelegatedMaker.deploy(swap, registrator);
        await delegatedMaker.waitForDeployment();

        // The owners' one-time setup: funds stay in the wallet, only an allowance is granted.
        await dai.mint(user, ether('1000000'));
        await dai.connect(user).approve(delegatedMaker, ether('1000000'));
        await dai.mint(user2, ether('1000000'));
        await dai.connect(user2).approve(delegatedMaker, ether('1000000'));

        await weth.connect(taker).deposit({ value: ether('100') });
        await weth.connect(taker).approve(swap, ether('100'));

        return { dai, weth, swap, chainId, registrator, auction, delegatedMaker };
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
            const receipt = await tx.wait();

            await expect(tx).to.emit(delegatedMaker, 'DelegatedOrderCreated').withArgs(orderHash, user.address);
            await expect(tx).to.emit(registrator, 'OrderRegistered');
            await expect(tx).to.emit(registrator, 'OrderAnnounced').withArgs(orderHash, await time.latest(), receipt.blockNumber);

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

            // Proceeds must bypass the shared contract: a zero receiver would pay the contract itself,
            // and a foreign receiver would pay someone the puller never authorized.
            const order = await buildDelegatedOrder({ dai, weth, delegatedMaker });
            await expect(delegatedMaker.connect(user2).createOrder(order, order.extension))
                .to.be.revertedWithCustomError(delegatedMaker, 'InvalidReceiver');

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
    });
});
