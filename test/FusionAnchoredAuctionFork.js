const hre = require('hardhat');
const { ethers, network } = hre;
const { expect, constants } = require('@1inch/solidity-utils');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { executeContractCallWithSigners } = require('@gnosis.pm/safe-contracts/dist');
const {
    ABIOrder,
    buildOrder,
    buildTakerTraits,
    buildAnchoredAuctionDetails,
    buildAnchoredExclusivity,
} = require('./helpers/orderUtils');
const { NO_FEE_DATA, buildLegacyAuctionDetails, takingAmountFor } = require('./helpers/fusionAuction');
const { ether } = require('./helpers/utils');

const FORK_RPC_URL = process.env.MAINNET_RPC_URL || process.env.FORK_RPC_URL;

const MAINNET = {
    // 1inch Aggregation Router V6, which embeds this limit order protocol.
    router: '0x111111125421ca6dc452d289314280a0f8842a65',
    // The Fusion settlement (limit-order-settlement's Settlement contract) resolvers fill through today.
    settlement: '0x2Ad5004c60e16E54d5007C80CE329Adde5B51Ef5',
    dai: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    // Gnosis Safe 1.3.0 deployments, the ones sub-wallet makers run on.
    safeSingleton: '0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552',
    safeProxyFactory: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
    signMessageLib: '0xA65387F16B013cf2Af4605Ad8aA5ec25a2cbA3a2',
    fallbackHandler: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
};

const DAI_BALANCE_SLOT = 2n;
const HALF_PERCENT = 50_000n; // 0.5% in 1e7
const MAKING_AMOUNT = ether('100');
const TAKING_AMOUNT = ether('0.03');

/**
 * Integration tests against a mainnet fork: the live router, the live Fusion settlement and the live Safe
 * contracts, with only the two new contracts deployed on top. Opt-in — set MAINNET_RPC_URL (or FORK_RPC_URL)
 * to run, for example:
 *
 *   MAINNET_RPC_URL=https://ethereum-rpc.publicnode.com yarn test:fork
 *
 * The suite is skipped when no RPC is configured, so it does not affect CI.
 */
describe('FusionAnchoredAuction (mainnet fork)', function () {
    this.timeout(600000);

    let maker, taker;
    let router, dai, weth, registrator, auction;
    let chainId;

    before(async function () {
        if (!FORK_RPC_URL) { this.skip(); }

        await network.provider.request({
            method: 'hardhat_reset',
            params: [{
                forking: {
                    jsonRpcUrl: FORK_RPC_URL,
                    ...(process.env.FORK_BLOCK_NUMBER ? { blockNumber: Number(process.env.FORK_BLOCK_NUMBER) } : {}),
                },
            }],
        });

        // Fail loudly if the reset silently produced a pristine chain instead of a fork.
        expect(await ethers.provider.getBlockNumber()).to.be.greaterThan(20_000_000);

        [maker, taker] = await ethers.getSigners();
        chainId = (await ethers.provider.getNetwork()).chainId;
        router = await ethers.getContractAt('LimitOrderProtocol', MAINNET.router);
        dai = await ethers.getContractAt('TokenMock', MAINNET.dai);
        weth = await ethers.getContractAt('WrappedTokenMock', MAINNET.weth);

        const OrderRegistrator = await ethers.getContractFactory('OrderRegistrator');
        registrator = await OrderRegistrator.deploy(router);
        await registrator.waitForDeployment();
        const FusionAnchoredAuction = await ethers.getContractFactory('FusionAnchoredAuction');
        auction = await FusionAnchoredAuction.deploy(registrator);
        await auction.waitForDeployment();

        await setDaiBalance(maker.address, ether('1000000'));
        await dai.connect(maker).approve(router, ether('1000000'));
        await weth.connect(taker).deposit({ value: ether('50') });
        await weth.connect(taker).approve(router, ether('50'));
    });

    after(async function () {
        if (FORK_RPC_URL) {
            await network.provider.request({ method: 'hardhat_reset', params: [] });
        }
    });

    async function setDaiBalance (account, amount) {
        const slot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [account, DAI_BALANCE_SLOT]));
        await network.provider.send('hardhat_setStorageAt', [MAINNET.dai, slot, ethers.toBeHex(amount, 32)]);
        expect(await dai.balanceOf(account)).to.equal(amount);
    }

    /** The live router's EIP-712 domain differs from the locally deployed protocol's. */
    function signRouterOrder (order, wallet) {
        return wallet.signTypedData(
            { name: '1inch Aggregation Router', version: '6', chainId, verifyingContract: MAINNET.router },
            { Order: ABIOrder.components },
            order,
        );
    }

    it('prices an announced order through the live router', async function () {
        const params = { startTime: 0, duration: 100, initialRateBump: Number(HALF_PERCENT), startDelay: 10, fillScalingNumerator: 100 };
        const auctionData = ethers.solidityPacked(
            ['address', 'bytes'],
            [await auction.getAddress(), buildAnchoredAuctionDetails(params)],
        );
        const order = buildOrder(
            {
                maker: maker.address,
                makerAsset: MAINNET.dai,
                takerAsset: MAINNET.weth,
                makingAmount: MAKING_AMOUNT,
                takingAmount: TAKING_AMOUNT,
            },
            { makingAmountData: auctionData, takingAmountData: auctionData },
        );

        const signature = await signRouterOrder(order, maker);
        // The signing domain has to be the live router's, or nothing below would validate.
        expect(await router.hashOrder(order)).to.equal(ethers.TypedDataEncoder.hash(
            { name: '1inch Aggregation Router', version: '6', chainId, verifyingContract: MAINNET.router },
            { Order: ABIOrder.components },
            order,
        ));

        await registrator.registerOrder(order, order.extension, ethers.Signature.from(signature).compactSerialized);
        const announcedAt = await time.latest();
        expect(await registrator.announcedAt(await router.hashOrder(order))).to.equal(announcedAt);

        const fillTime = announcedAt + 60;
        await time.setNextBlockTimestamp(fillTime);
        const { r, yParityAndS: vs } = ethers.Signature.from(signature);
        const takerTraits = buildTakerTraits({ makingAmount: true, extension: order.extension });
        const fillAmount = MAKING_AMOUNT * 2n / 5n;
        const fillTx = router.connect(taker).fillOrderArgs(order, r, vs, fillAmount, takerTraits.traits, takerTraits.args);

        const expected = takingAmountFor(
            order,
            { ...params, startTime: announcedAt + params.startDelay },
            fillTime,
            fillAmount,
            MAKING_AMOUNT,
        );
        await expect(fillTx).to.changeTokenBalances(dai, [taker, maker], [fillAmount, -fillAmount]);
        await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
    });

    it('composes behind the live Fusion settlement', async function () {
        const params = { startTime: 0, duration: 100, initialRateBump: Number(HALF_PERCENT), startDelay: 10 };
        const auctionTail = ethers.solidityPacked(
            ['address', 'bytes'],
            [await auction.getAddress(), buildAnchoredAuctionDetails(params)],
        );
        const exclusivityTail = ethers.solidityPacked(
            ['address', 'bytes'],
            [await auction.getAddress(), buildAnchoredExclusivity({ allowedTimeDelay: 30, whitelist: [{ address: taker.address }] })],
        );

        // The live settlement prices first, with its curve neutralized so the chained auction owns the price,
        // and its post-interaction runs first, with zero fees, the taker whitelisted from time zero, the
        // estimated taking amount at the order's own and no surplus cut.
        const getterData = ethers.solidityPacked(
            ['address', 'bytes', 'bytes', 'bytes'],
            [MAINNET.settlement, buildLegacyAuctionDetails(), NO_FEE_DATA, auctionTail],
        );
        const postInteractionData = ethers.solidityPacked(
            ['address', 'bytes1', 'address', 'address', 'uint16', 'uint8', 'uint16', 'uint8', 'uint32', 'uint8', 'uint80', 'uint16', 'uint256', 'uint8', 'bytes'],
            [
                MAINNET.settlement,
                '0x00', // no custom receiver
                constants.ZERO_ADDRESS, // integrator fee recipient
                constants.ZERO_ADDRESS, // protocol fee recipient
                0, 0, 0, 0, // no integrator fee, share, resolver fee or whitelist discount
                0, 1, BigInt(taker.address) & ((1n << 80n) - 1n), 0, // whitelist open from time zero
                TAKING_AMOUNT, 0, // estimated taking amount and no surplus fee
                exclusivityTail,
            ],
        );
        const order = buildOrder(
            {
                maker: maker.address,
                makerAsset: MAINNET.dai,
                takerAsset: MAINNET.weth,
                makingAmount: MAKING_AMOUNT,
                takingAmount: TAKING_AMOUNT,
            },
            { makingAmountData: getterData, takingAmountData: getterData, postInteraction: postInteractionData },
        );

        const { r, yParityAndS: vs, compactSerialized } = ethers.Signature.from(await signRouterOrder(order, maker));
        await registrator.registerOrder(order, order.extension, compactSerialized);
        const announcedAt = await time.latest();

        // The live settlement validates the resolver's priority fee, so tip nothing.
        const gasOverrides = { maxPriorityFeePerGas: 0 };
        const takerTraits = buildTakerTraits({ makingAmount: true, extension: order.extension });
        const fill = () => router.connect(taker).fillOrderArgs(order, r, vs, MAKING_AMOUNT, takerTraits.traits, takerTraits.args, gasOverrides);

        // Exclusivity chained behind the live settlement still bites before the anchored window.
        await time.setNextBlockTimestamp(announcedAt + 20);
        await expect(fill()).to.be.revertedWithCustomError(auction, 'AllowedTimeViolation');

        const fillTime = announcedAt + 60;
        await time.setNextBlockTimestamp(fillTime);
        const fillTx = fill();

        // The price is the anchored curve alone: the live settlement contributed a factor of one and no fees.
        const expected = takingAmountFor(
            order,
            { ...params, startTime: announcedAt + params.startDelay },
            fillTime,
            MAKING_AMOUNT,
            MAKING_AMOUNT,
        );
        await expect(fillTx).to.changeTokenBalances(dai, [taker, maker], [MAKING_AMOUNT, -MAKING_AMOUNT]);
        await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
    });

    it('announces through a live Safe with the empty ERC-1271 signature', async function () {
        // The multisig maker flow: a Safe on the live 1.3.0 contracts marks the order digest, anyone announces
        // it with an empty signature, and the auction prices from that announcement.
        const GnosisSafe = await ethers.getContractFactory('GnosisSafe');
        const factory = await ethers.getContractAt('GnosisSafeProxyFactory', MAINNET.safeProxyFactory);
        const setupData = GnosisSafe.interface.encodeFunctionData(
            'setup',
            [[maker.address], 1, constants.ZERO_ADDRESS, '0x', MAINNET.fallbackHandler, constants.ZERO_ADDRESS, 0, constants.ZERO_ADDRESS],
        );
        const receipt = await (await factory.createProxy(MAINNET.safeSingleton, setupData)).wait();
        const proxyCreation = receipt.logs
            .map((log) => { try { return factory.interface.parseLog(log); } catch { return null; } })
            .find((parsed) => parsed?.name === 'ProxyCreation');
        const safe = GnosisSafe.attach(proxyCreation.args.proxy);
        const signMessageLib = new ethers.Contract(MAINNET.signMessageLib, ['function signMessage(bytes _data)'], maker);

        // workaround as safe lib expects old version of ethers
        safe.address = await safe.getAddress();
        dai.address = MAINNET.dai;
        signMessageLib.address = MAINNET.signMessageLib;
        maker._signTypedData = maker.signTypedData;

        await setDaiBalance(safe.address, MAKING_AMOUNT);
        await executeContractCallWithSigners(safe, dai, 'approve', [MAINNET.router, MAKING_AMOUNT], [maker], false);

        const params = { startTime: 0, duration: 100, initialRateBump: Number(HALF_PERCENT), startDelay: 10 };
        const auctionData = ethers.solidityPacked(
            ['address', 'bytes'],
            [await auction.getAddress(), buildAnchoredAuctionDetails(params)],
        );
        const order = buildOrder(
            {
                maker: safe.address,
                makerAsset: MAINNET.dai,
                takerAsset: MAINNET.weth,
                makingAmount: MAKING_AMOUNT,
                takingAmount: TAKING_AMOUNT,
            },
            { makingAmountData: auctionData, takingAmountData: auctionData },
        );
        const orderHash = await router.hashOrder(order);

        // Before the digest is marked the announcement has nothing to validate against.
        await expect(registrator.registerOrder(order, order.extension, '0x'))
            .to.be.revertedWithCustomError(router, 'BadSignature');

        await executeContractCallWithSigners(safe, signMessageLib, 'signMessage', [orderHash], [maker], true);
        await registrator.registerOrder(order, order.extension, '0x');
        const announcedAt = await time.latest();
        expect(await registrator.announcedAt(orderHash)).to.equal(announcedAt);

        const fillTime = announcedAt + params.startDelay + 50;
        await time.setNextBlockTimestamp(fillTime);
        const takerTraits = buildTakerTraits({ makingAmount: true, extension: order.extension });
        const fillTx = router.connect(taker).fillContractOrderArgs(order, '0x', MAKING_AMOUNT, takerTraits.traits, takerTraits.args);

        const expected = takingAmountFor(
            order,
            { ...params, startTime: announcedAt + params.startDelay },
            fillTime,
            MAKING_AMOUNT,
            MAKING_AMOUNT,
        );
        await expect(fillTx).to.changeTokenBalances(dai, [taker, safe], [MAKING_AMOUNT, -MAKING_AMOUNT]);
        await expect(fillTx).to.changeTokenBalances(weth, [taker, safe], [-expected, expected]);
    });
});
