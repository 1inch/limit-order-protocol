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
    // The Fusion settlement resolvers fill through today — fusion-protocol's Settlement contract,
    // the address its deployments/mainnet/Settlement.json records.
    settlement: '0x2Ad5004c60e16E54d5007C80CE329Adde5B51Ef5',
    dai: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    // Gnosis Safe 1.3.0 deployments, the ones sub-wallet makers run on.
    safeSingleton: '0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552',
    safeProxyFactory: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
    fallbackHandler: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
    signMessageLib: '0xA65387F16B013cf2Af4605Ad8aA5ec25a2cbA3a2',
    multiSend: '0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761',
};

const DAI_BALANCE_SLOT = 2n;

/** Packs one transaction of a MultiSend batch: operation, target, value, data length, data. */
function encodeMultiSendTx (operation, to, data) {
    return ethers.solidityPacked(['uint8', 'address', 'uint256', 'uint256', 'bytes'], [operation, to, 0, ethers.dataLength(data), data]);
}
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

    let maker, taker, protocolRecipient;
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

        [maker, taker, protocolRecipient] = await ethers.getSigners();
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
        const params = {
            startTime: 0,
            duration: 100,
            initialRateBump: Number(HALF_PERCENT),
            startDelay: 10,
            fillPremiums: { initial: Number(HALF_PERCENT), points: [] },
        };
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

        // The fill signature's domain has to be the live router's, or nothing below would validate. The
        // registration itself takes no signature — the maker sending it is the authentication.
        const signature = await signRouterOrder(order, maker);
        expect(await router.hashOrder(order)).to.equal(ethers.TypedDataEncoder.hash(
            { name: '1inch Aggregation Router', version: '6', chainId, verifyingContract: MAINNET.router },
            { Order: ABIOrder.components },
            order,
        ));

        await registrator.connect(maker).registerOrder(order, order.extension);
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

        const { r, yParityAndS: vs } = ethers.Signature.from(await signRouterOrder(order, maker));
        await registrator.connect(maker).registerOrder(order, order.extension);
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

    it('marks the digest and announces through one MultiSend batch on a live Safe', async function () {
        // The multisig maker flow: a Safe on the live 1.3.0 contracts co-signs one MultiSend execution,
        // marking the order digest through the already-deployed SignMessageLib and starting the anchored
        // clock in the same co-signed execution — nothing signed off-chain, no bespoke helper — and the
        // auction prices from that announcement.
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

        const multiSend = await ethers.getContractAt('MultiSend', MAINNET.multiSend);
        const signMessageLib = await ethers.getContractAt('SignMessageLib', MAINNET.signMessageLib);

        // workaround as safe lib expects old version of ethers
        safe.address = await safe.getAddress();
        dai.address = MAINNET.dai;
        multiSend.address = MAINNET.multiSend;
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

        // Only the Safe itself can start its orders' clocks; its owner EOA is a stranger to the registrator.
        await expect(registrator.connect(maker).registerOrder(order, order.extension))
            .to.be.revertedWithCustomError(registrator, 'AccessDenied');

        const batch = ethers.concat([
            encodeMultiSendTx(1, MAINNET.signMessageLib, signMessageLib.interface.encodeFunctionData('signMessage', [orderHash])),
            encodeMultiSendTx(0, await registrator.getAddress(), registrator.interface.encodeFunctionData('registerOrder', [order, order.extension])),
        ]);
        await executeContractCallWithSigners(safe, multiSend, 'multiSend', [batch], [maker], true);
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

    it('runs the DelegatedMaker flow end to end through the live router', async function () {
        // The EOA flow with nothing signed and nothing escrowed: one createOrder transaction presigns and
        // announces, the maker asset stays in the wallet until the live router's fill pulls it just in time.
        const DelegatedMaker = await ethers.getContractFactory('DelegatedMaker');
        const delegatedMaker = await DelegatedMaker.deploy(router, registrator);
        await delegatedMaker.waitForDeployment();

        await dai.connect(maker).approve(delegatedMaker, MAKING_AMOUNT);

        const params = { startTime: 0, duration: 100, initialRateBump: Number(HALF_PERCENT), startDelay: 0 };
        const auctionData = ethers.solidityPacked(
            ['address', 'bytes'],
            [await auction.getAddress(), buildAnchoredAuctionDetails(params)],
        );
        const delegatedMakerAddress = await delegatedMaker.getAddress();
        const order = buildOrder(
            {
                maker: delegatedMakerAddress,
                receiver: maker.address,
                makerAsset: MAINNET.dai,
                takerAsset: MAINNET.weth,
                makingAmount: MAKING_AMOUNT,
                takingAmount: TAKING_AMOUNT,
            },
            { makingAmountData: auctionData, takingAmountData: auctionData, preInteraction: delegatedMakerAddress },
        );
        const orderHash = await router.hashOrder(order);

        await delegatedMaker.connect(maker).createOrder(order, order.extension);
        const announcedAt = await time.latest();
        expect(await registrator.announcedAt(orderHash)).to.equal(announcedAt);

        const fillTime = announcedAt + 60;
        await time.setNextBlockTimestamp(fillTime);
        const takerTraits = buildTakerTraits({ makingAmount: true, extension: order.extension });
        const fillTx = router.connect(taker).fillContractOrderArgs(order, '0x', MAKING_AMOUNT, takerTraits.traits, takerTraits.args);

        const expected = takingAmountFor(order, { ...params, startTime: announcedAt }, fillTime, MAKING_AMOUNT, MAKING_AMOUNT);
        await expect(fillTx).to.changeTokenBalances(dai, [maker, taker, delegatedMaker], [-MAKING_AMOUNT, MAKING_AMOUNT, 0n]);
        await expect(fillTx).to.changeTokenBalances(weth, [taker, maker], [-expected, expected]);
    });

    it('collects the live settlement surplus fee on a DelegatedMaker fill premium', async function () {
        // The fee-collecting production shape end to end: the live Settlement is the order's receiver
        // and pays the creator as its custom receiver. The surplus fee is set on purpose — the ladder
        // premium lands above the quoted estimate, so the settlement taxes surplusFee% of it, pinning
        // the number behind the rollout note that partial-fill premiums count as settlement surplus.
        const DelegatedMaker = await ethers.getContractFactory('DelegatedMaker');
        const delegatedMaker = await DelegatedMaker.deploy(router, registrator);
        await delegatedMaker.waitForDeployment();
        const delegatedMakerAddress = await delegatedMaker.getAddress();

        await dai.connect(maker).approve(delegatedMaker, MAKING_AMOUNT);

        const params = {
            startTime: 0,
            duration: 100,
            initialRateBump: Number(HALF_PERCENT),
            startDelay: 0,
            fillPremiums: { initial: Number(HALF_PERCENT), points: [] },
        };
        const auctionTail = ethers.solidityPacked(
            ['address', 'bytes'],
            [await auction.getAddress(), buildAnchoredAuctionDetails(params)],
        );
        const getterData = ethers.solidityPacked(
            ['address', 'bytes', 'bytes', 'bytes'],
            [MAINNET.settlement, buildLegacyAuctionDetails(), NO_FEE_DATA, auctionTail],
        );
        const surplusFee = 50n; // in 1e2: half of anything above the estimate goes to the protocol
        const postInteractionData = ethers.solidityPacked(
            ['address', 'bytes1', 'address', 'address', 'address', 'uint16', 'uint8', 'uint16', 'uint8', 'uint32', 'uint8', 'uint80', 'uint16', 'uint256', 'uint8'],
            [
                MAINNET.settlement,
                '0x01', // custom receiver follows the fee recipients
                constants.ZERO_ADDRESS, // integrator fee recipient
                protocolRecipient.address,
                maker.address, // custom receiver: the creator, enforced by DelegatedMaker
                0, 0, 0, 0, // no integrator fee, share, resolver fee or whitelist discount
                0, 1, BigInt(taker.address) & ((1n << 80n) - 1n), 0, // whitelist open from time zero
                TAKING_AMOUNT, surplusFee, // the quoted estimate and the surplus cut
            ],
        );
        const order = buildOrder(
            {
                maker: delegatedMakerAddress,
                receiver: MAINNET.settlement,
                makerAsset: MAINNET.dai,
                takerAsset: MAINNET.weth,
                makingAmount: MAKING_AMOUNT,
                takingAmount: TAKING_AMOUNT,
            },
            {
                makingAmountData: getterData,
                takingAmountData: getterData,
                preInteraction: delegatedMakerAddress,
                postInteraction: postInteractionData,
            },
        );

        await delegatedMaker.connect(maker).createOrder(order, order.extension);
        const announcedAt = await time.latest();

        // Half the order after the auction: the price is the plain rate plus the ladder premium.
        const fillTime = announcedAt + 200;
        await time.setNextBlockTimestamp(fillTime);
        const fillAmount = MAKING_AMOUNT / 2n;
        const actualTaking = takingAmountFor(order, { ...params, startTime: announcedAt }, fillTime, fillAmount, MAKING_AMOUNT);

        // The settlement compares against the estimate scaled to the fill, so the whole premium counts
        // as surplus here and half of it is taxed.
        const scaledEstimate = (TAKING_AMOUNT * fillAmount + MAKING_AMOUNT - 1n) / MAKING_AMOUNT;
        const surplusCut = (actualTaking - scaledEstimate) * surplusFee / 100n;
        expect(surplusCut).to.be.greaterThan(0n);

        const takerTraits = buildTakerTraits({ makingAmount: true, extension: order.extension });
        const fillTx = router.connect(taker).fillContractOrderArgs(
            order, '0x', fillAmount, takerTraits.traits, takerTraits.args, { maxPriorityFeePerGas: 0 },
        );

        await expect(fillTx).to.changeTokenBalances(dai, [maker, taker, delegatedMaker], [-fillAmount, fillAmount, 0n]);
        await expect(fillTx).to.changeTokenBalances(
            weth,
            [taker, maker, protocolRecipient],
            [-actualTaking, actualTaking - surplusCut, surplusCut],
        );
    });
});
