const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { expect, constants, ether } = require('@1inch/solidity-utils');
const { signOrder, buildOrder } = require('./helpers/orderUtils');
const { ethers } = require('hardhat');
const { deploySwap, deployUSDC, deployUSDT } = require('./helpers/fixtures');
const { executeContractCallWithSigners } = require('@gnosis.pm/safe-contracts/dist');

describe('OrderRegistrator', function () {
    let addr;

    before(async function () {
        [addr] = await ethers.getSigners();
    });

    async function deployAndInit () {
        const { swap } = await deploySwap();
        const { usdc } = await deployUSDC();
        const { usdt } = await deployUSDT();
        const OrderRegistrator = await ethers.getContractFactory('OrderRegistrator');
        const registrator = await OrderRegistrator.deploy(swap);
        await registrator.waitForDeployment();
        const chainId = (await ethers.provider.getNetwork()).chainId;
        return { swap, usdc, usdt, registrator, chainId };
    };

    async function buildAndSignOrder (usdc, usdt, swap, chainId) {
        const order = buildOrder({
            makerAsset: await usdc.getAddress(),
            takerAsset: await usdt.getAddress(),
            makingAmount: 1,
            takingAmount: 2,
            maker: addr.address,
        });
        const signature = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr)).compactSerialized;
        return { order, signature };
    }

    it('should emit OrderRegistered event', async function () {
        const { usdc, usdt, swap, registrator, chainId } = await loadFixture(deployAndInit);

        const order = buildOrder({
            makerAsset: await usdc.getAddress(),
            takerAsset: await usdt.getAddress(),
            makingAmount: 1,
            takingAmount: 2,
            maker: addr.address,
        });

        const orderTuple = [order.salt, order.maker, order.receiver, order.makerAsset, order.takerAsset, order.makingAmount, order.takingAmount, order.makerTraits];

        const signature = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr)).compactSerialized;

        const tx = registrator.registerOrder(order, order.extension, signature);
        await expect(tx).to.emit(registrator, 'OrderRegistered').withArgs(orderTuple, order.extension, signature);
    });

    it('should revert with wrong signature', async function () {
        const { usdc, usdt, swap, registrator, chainId } = await loadFixture(deployAndInit);

        const order = buildOrder({
            makerAsset: await usdc.getAddress(),
            takerAsset: await usdt.getAddress(),
            makingAmount: 1,
            takingAmount: 2,
            maker: addr.address,
        });
        const signature = ethers.Signature.from(await signOrder(order, chainId + 1n, await swap.getAddress(), addr)).compactSerialized;

        const tx = registrator.registerOrder(order, order.extension, signature);
        await expect(tx).to.be.revertedWithCustomError(swap, 'BadSignature');
    });

    it('should revert with wrong extension', async function () {
        const { usdc, usdt, swap, registrator, chainId } = await loadFixture(deployAndInit);

        const order = buildOrder({
            makerAsset: await usdc.getAddress(),
            takerAsset: await usdt.getAddress(),
            makingAmount: 1,
            takingAmount: 2,
            maker: addr.address,
        });
        const orderLibFactory = await ethers.getContractFactory('OrderLib');

        const signature = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr)).compactSerialized;
        const tx = registrator.registerOrder(order, order.extension + '00', signature);
        await expect(tx).to.be.revertedWithCustomError(orderLibFactory, 'UnexpectedOrderExtension');
    });

    describe('announcements', function () {
        it('should record when an order was announced', async function () {
            const { usdc, usdt, swap, registrator, chainId } = await loadFixture(deployAndInit);
            const { order, signature } = await buildAndSignOrder(usdc, usdt, swap, chainId);
            const orderHash = await swap.hashOrder(order);

            const tx = await registrator.registerOrder(order, order.extension, signature);
            const receipt = await tx.wait();

            expect(await registrator.announcedAt(orderHash)).to.equal(await time.latest());
            expect(await registrator.announcedAtBlock(orderHash)).to.equal(receipt.blockNumber);
        });

        it('should report an order that was never announced as unannounced', async function () {
            const { usdc, usdt, swap, registrator, chainId } = await loadFixture(deployAndInit);
            const { order } = await buildAndSignOrder(usdc, usdt, swap, chainId);

            expect(await registrator.announcedAt(await swap.hashOrder(order))).to.equal(0);
            expect(await registrator.announcedAtBlock(await swap.hashOrder(order))).to.equal(0);
        });

        it('should keep the first announcement when the same order is registered again', async function () {
            const { usdc, usdt, swap, registrator, chainId } = await loadFixture(deployAndInit);
            const { order, signature } = await buildAndSignOrder(usdc, usdt, swap, chainId);
            const orderHash = await swap.hashOrder(order);

            await registrator.registerOrder(order, order.extension, signature);
            const announcedAt = await registrator.announcedAt(orderHash);
            const announcedAtBlock = await registrator.announcedAtBlock(orderHash);

            await time.increase(3600);
            // A repeated announcement is not an error — SafeOrderBuilder rebuilds an unchanged order this way —
            // but it must not move an auction that is already anchored to the first one.
            await expect(registrator.registerOrder(order, order.extension, signature)).to.emit(registrator, 'OrderRegistered');

            expect(await registrator.announcedAt(orderHash)).to.equal(announcedAt);
            expect(await registrator.announcedAtBlock(orderHash)).to.equal(announcedAtBlock);
        });
    });

    describe('announcement by a contract maker', function () {
        async function deploySafeAndInit () {
            const { swap, usdc, usdt, registrator } = await deployAndInit();

            const GnosisSafeProxyFactory = await ethers.getContractFactory('GnosisSafeProxyFactory');
            const proxyFactoryContract = await GnosisSafeProxyFactory.deploy();
            await proxyFactoryContract.waitForDeployment();
            const GnosisSafe = await ethers.getContractFactory('GnosisSafe');
            const gnosisSafeContract = await GnosisSafe.deploy();
            await gnosisSafeContract.waitForDeployment();
            const CompatibilityFallbackHandler = await ethers.getContractFactory('CompatibilityFallbackHandler');
            const fallbackHandler = await CompatibilityFallbackHandler.deploy();
            await fallbackHandler.waitForDeployment();
            const SafeOrderBuilder = await ethers.getContractFactory('SafeOrderBuilder');
            const safeOrderBuilder = await SafeOrderBuilder.deploy(swap, registrator);
            await safeOrderBuilder.waitForDeployment();
            const AggregatorMock = await ethers.getContractFactory('AggregatorMock');
            const oracle = await AggregatorMock.deploy(ether('0.00025'));
            await oracle.waitForDeployment();

            const setupData = gnosisSafeContract.interface.encodeFunctionData(
                'setup',
                [[addr.address], 1, constants.ZERO_ADDRESS, '0x', await fallbackHandler.getAddress(), constants.ZERO_ADDRESS, 0, constants.ZERO_ADDRESS],
            );
            const receipt = await (await proxyFactoryContract.createProxy(await gnosisSafeContract.getAddress(), setupData)).wait();
            const safe = GnosisSafe.attach(receipt.logs[1].args[0]);

            // workaround as safe lib expects old version of ethers
            safe.address = await safe.getAddress();
            safeOrderBuilder.address = await safeOrderBuilder.getAddress();
            addr._signTypedData = addr.signTypedData;

            const order = buildOrder({
                makerAsset: await usdc.getAddress(),
                takerAsset: await usdt.getAddress(),
                makingAmount: 100n,
                takingAmount: 100n,
                maker: await safe.getAddress(),
            });

            return { swap, registrator, safe, safeOrderBuilder, oracle, order };
        }

        it('should record an announcement made with an on-chain signature', async function () {
            const { swap, registrator, safe, safeOrderBuilder, oracle, order } = await loadFixture(deploySafeAndInit);

            // The Safe marks the order digest and announces it with an empty ERC-1271 signature — the flow a
            // multisig maker uses, and the one the anchored auction has to price from.
            const oracleParams = [await oracle.getAddress(), ether('0.00025'), 1000];
            const tx = await executeContractCallWithSigners(
                safe,
                safeOrderBuilder,
                'buildAndSignOrder',
                [order, order.extension, oracleParams, oracleParams],
                [addr],
                true,
            );
            const receipt = await tx.wait();

            await expect(tx).to.emit(registrator, 'OrderRegistered');
            const orderHash = await swap.hashOrder(order);
            expect(await registrator.announcedAt(orderHash)).to.equal(await time.latest());
            expect(await registrator.announcedAtBlock(orderHash)).to.equal(receipt.blockNumber);
        });
    });
});
