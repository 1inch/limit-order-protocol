const hre = require('hardhat');
const { ethers } = hre;
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');
const { ether } = require('./helpers/utils');
const { fillWithMakingAmount, signOrder, buildOrder, buildMakerTraits } = require('./helpers/orderUtils');

describe('MeasureGas', function () {
    before(async function () {
        if (hre.__SOLIDITY_COVERAGE_RUNNING) { this.skip(); }
    });

    const initContracts = async function (addrs, dai, weth, swap) {
        await dai.mint(addrs[1], ether('1000000'));
        await dai.mint(addrs[0], ether('1000000'));
        await weth.deposit({ value: ether('100') });
        await weth.connect(addrs[1]).deposit({ value: ether('100') });
        await dai.approve(swap, ether('1000000'));
        await dai.connect(addrs[1]).approve(swap, ether('1000000'));
        await weth.approve(swap, ether('100'));
        await weth.connect(addrs[1]).approve(swap, ether('100'));
    };

    const deployContractsAndInit = async function () {
        const addrs = await ethers.getSigners();
        const { dai, weth, swap, chainId } = await deploySwapTokens();
        await initContracts(addrs, dai, weth, swap);
        return { addrs, dai, weth, swap, chainId };
    };

    it('swap without predicates', async function () {
        const { addrs, dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

        const order = buildOrder({
            makerAsset: await dai.getAddress(),
            takerAsset: await weth.getAddress(),
            makingAmount: 1,
            takingAmount: 1,
            maker: addrs[1].address,
        });

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addrs[1]));
        const tx = await swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1));
        console.log(`swap without predicates gasUsed: ${(await tx.wait()).gasUsed}`);
    });

    it('swap partial fill without predicates', async function () {
        const { addrs, dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

        const order = buildOrder({
            makerAsset: await dai.getAddress(),
            takerAsset: await weth.getAddress(),
            makingAmount: 2,
            takingAmount: 2,
            maker: addrs[1].address,
        });

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addrs[1]));
        const tx = await swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1));
        console.log(`swap partial fill without predicates gasUsed: ${(await tx.wait()).gasUsed}`);
    });

    it('swap with predicate nonce', async function () {
        const { addrs, dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

        const order = buildOrder({
            makerAsset: await dai.getAddress(),
            takerAsset: await weth.getAddress(),
            makingAmount: 1,
            takingAmount: 1,
            maker: addrs[1].address,
            makerTraits: buildMakerTraits({ nonce: 1 }),
        });

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addrs[1]));
        const tx = await swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1));
        console.log(`swap with predicate nonce gasUsed: ${(await tx.wait()).gasUsed}`);
    });

    it('swap with predicate expiry', async function () {
        const { addrs, dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

        const order = buildOrder({
            makerAsset: await dai.getAddress(),
            takerAsset: await weth.getAddress(),
            makingAmount: 1,
            takingAmount: 1,
            maker: addrs[1].address,
            makerTraits: buildMakerTraits({ expiry: 0xff00000000 }),
        });

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addrs[1]));
        const tx = await swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1));
        console.log(`swap with predicate expiry gasUsed: ${(await tx.wait()).gasUsed}`);
    });

    it('swap with predicate nonce and expiry', async function () {
        const { addrs, dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

        const order = buildOrder({
            makerAsset: await dai.getAddress(),
            takerAsset: await weth.getAddress(),
            makingAmount: 1,
            takingAmount: 1,
            maker: addrs[1].address,
            makerTraits: buildMakerTraits({ nonce: 1, expiry: 0xff00000000 }),
        });

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addrs[1]));
        const tx = await swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1));
        console.log(`swap with predicate nonce and expiry gasUsed: ${(await tx.wait()).gasUsed}`);
    });

    it('invalidate order', async function () {
        const { addrs, dai, weth, swap } = await loadFixture(deployContractsAndInit);

        const order = buildOrder({
            makerAsset: await dai.getAddress(),
            takerAsset: await weth.getAddress(),
            makingAmount: 1,
            takingAmount: 1,
            maker: addrs[1].address,
        });

        const orderHash = await swap.hashOrder(order);
        const tx = await swap.cancelOrder(order.makerTraits, orderHash); ;
        console.log(`invalidate order gasUsed: ${(await tx.wait()).gasUsed}`);
    });
});
