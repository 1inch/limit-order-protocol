const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { expect, constants, ether } = require('@1inch/solidity-utils');
const { signOrder, buildOrder } = require('./helpers/orderUtils');
const { ethers } = require('hardhat');
const { deploySwap, deployUSDC, deployUSDT } = require('./helpers/fixtures');
const { executeContractCallWithSigners } = require('@gnosis.pm/safe-contracts/dist');

/** Packs one transaction of a MultiSend batch: operation, target, value, data length, data. */
function encodeMultiSendTx (operation, to, data) {
    return ethers.solidityPacked(['uint8', 'address', 'uint256', 'uint256', 'bytes'], [operation, to, 0, ethers.dataLength(data), data]);
}

describe('OrderRegistrator', function () {
    let addr, addr1;

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
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
        async function buildSignedOrder (usdc, usdt, swap, chainId) {
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

        it('should record the time of the first registration', async function () {
            const { usdc, usdt, swap, registrator, chainId } = await loadFixture(deployAndInit);
            const { order, signature } = await buildSignedOrder(usdc, usdt, swap, chainId);
            const orderHash = await swap.hashOrder(order);

            expect(await registrator.announcedAt(orderHash)).to.equal(0);

            await registrator.registerOrder(order, order.extension, signature);
            expect(await registrator.announcedAt(orderHash)).to.equal(await time.latest());
        });

        it('should keep the first timestamp and still emit on a repeated registration', async function () {
            const { usdc, usdt, swap, registrator, chainId } = await loadFixture(deployAndInit);
            const { order, signature } = await buildSignedOrder(usdc, usdt, swap, chainId);
            const orderHash = await swap.hashOrder(order);

            await registrator.registerOrder(order, order.extension, signature);
            const announcedAt = await registrator.announcedAt(orderHash);

            await time.increase(3600);
            const tx = registrator.registerOrder(order, order.extension, signature);
            await expect(tx).to.emit(registrator, 'OrderRegistered');
            expect(await registrator.announcedAt(orderHash)).to.equal(announcedAt);
        });

        it('should accept a registration relayed by anyone with a valid signature', async function () {
            const { usdc, usdt, swap, registrator, chainId } = await loadFixture(deployAndInit);
            const { order, signature } = await buildSignedOrder(usdc, usdt, swap, chainId);
            const orderHash = await swap.hashOrder(order);

            const tx = registrator.connect(addr1).registerOrder(order, order.extension, signature);
            await expect(tx).to.emit(registrator, 'OrderRegistered');
            expect(await registrator.announcedAt(orderHash)).to.equal(await time.latest());
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
            const AggregatorMock = await ethers.getContractFactory('AggregatorMock');
            const oracle = await AggregatorMock.deploy(ether('0.00025'));
            await oracle.waitForDeployment();
            const SafeOrderBuilder = await ethers.getContractFactory('SafeOrderBuilder');
            const safeOrderBuilder = await SafeOrderBuilder.deploy(swap, registrator);
            await safeOrderBuilder.waitForDeployment();

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

        it('should record an announcement made through SafeOrderBuilder', async function () {
            const { swap, registrator, safe, safeOrderBuilder, oracle, order } = await loadFixture(deploySafeAndInit);

            const oracleParams = [await oracle.getAddress(), ether('0.00025'), 1000];
            const tx = await executeContractCallWithSigners(
                safe,
                safeOrderBuilder,
                'buildAndSignOrder',
                [order, order.extension, oracleParams, oracleParams],
                [addr],
                true,
            );
            await tx.wait();

            const orderHash = await swap.hashOrder(order);
            await expect(tx).to.emit(registrator, 'OrderRegistered');
            expect(await registrator.announcedAt(orderHash)).to.equal(await time.latest());
        });

        it('should reject an empty signature for a contract maker that has not presigned', async function () {
            const { swap, registrator, order } = await loadFixture(deploySafeAndInit);

            const tx = registrator.registerOrder(order, order.extension, '0x');
            await expect(tx).to.be.revertedWithCustomError(swap, 'BadSignature');
        });

        it('should record an announcement made through a MultiSend batch with an empty signature', async function () {
            const { swap, registrator, safe, order } = await loadFixture(deploySafeAndInit);

            const MultiSend = await ethers.getContractFactory('MultiSend');
            const multiSend = await MultiSend.deploy();
            await multiSend.waitForDeployment();
            const SignMessageLib = await ethers.getContractFactory('SignMessageLib');
            const signMessageLib = await SignMessageLib.deploy();
            await signMessageLib.waitForDeployment();

            // workaround as safe lib expects old version of ethers
            multiSend.address = await multiSend.getAddress();

            // The batch marks the digest first, so the empty signature passes the ERC-1271 check.
            const orderHash = await swap.hashOrder(order);
            const batch = ethers.concat([
                encodeMultiSendTx(1, await signMessageLib.getAddress(), signMessageLib.interface.encodeFunctionData('signMessage', [orderHash])),
                encodeMultiSendTx(0, await registrator.getAddress(), registrator.interface.encodeFunctionData('registerOrder', [order, order.extension, '0x'])),
            ]);
            const tx = await executeContractCallWithSigners(safe, multiSend, 'multiSend', [batch], [addr], true);
            await tx.wait();

            await expect(tx).to.emit(registrator, 'OrderRegistered');
            expect(await registrator.announcedAt(orderHash)).to.equal(await time.latest());

            const validator = await ethers.getContractAt('CompatibilityFallbackHandler', safe.address);
            expect(await validator['isValidSignature(bytes32,bytes)'](orderHash, '0x')).to.equal('0x1626ba7e');
        });
    });
});
