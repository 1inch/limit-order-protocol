const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('@1inch/solidity-utils');
const { signOrder, buildOrder } = require('./helpers/orderUtils');
const { ethers } = require('hardhat');
const { deploySwap, deployUSDC, deployUSDT } = require('./helpers/fixtures');

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
});
