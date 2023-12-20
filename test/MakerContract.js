const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('@1inch/solidity-utils');
const { ABIOrder, fillWithMakingAmount, buildMakerTraitsRFQ, buildOrderRFQ } = require('./helpers/orderUtils');
const { ethers } = require('hardhat');
const { ether } = require('./helpers/utils');
const { deploySwap, deployUSDC, deployUSDT } = require('./helpers/fixtures');

describe('MakerContract', function () {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    let addr;

    before(async function () {
        [addr] = await ethers.getSigners();
    });

    async function deployAndInit () {
        const { swap } = await deploySwap();
        const { usdc } = await deployUSDC();
        const { usdt } = await deployUSDT();

        const MakerContract = await ethers.getContractFactory('MakerContract');
        const rfq = await MakerContract.deploy(swap, usdc, usdt, ether('0.9993'), 'USDT+USDC', 'USDX');
        await rfq.waitForDeployment();

        await usdc.mint(addr, '1000000000');
        await usdt.mint(addr, '1000000000');
        await usdc.mint(rfq, '1000000000');
        await usdt.mint(rfq, '1000000000');

        await usdc.approve(swap, '1000000000');
        await usdt.approve(swap, '1000000000');

        return { usdc, usdt, swap, rfq };
    };

    it('should fill contract-signed RFQ order', async function () {
        const { usdc, usdt, swap, rfq } = await loadFixture(deployAndInit);

        const makerUsdc = await usdc.balanceOf(rfq);
        const takerUsdc = await usdc.balanceOf(addr);
        const makerUsdt = await usdt.balanceOf(rfq);
        const takerUsdt = await usdt.balanceOf(addr);

        const order = buildOrderRFQ({
            maker: await rfq.getAddress(),
            makerAsset: await usdc.getAddress(),
            takerAsset: await usdt.getAddress(),
            makingAmount: 1000000000,
            takingAmount: 1000700000,
            makerTraits: buildMakerTraitsRFQ({ nonce: 1 }),
        });

        const order2 = buildOrderRFQ({
            maker: await rfq.getAddress(),
            makerAsset: await usdc.getAddress(),
            takerAsset: await usdt.getAddress(),
            makingAmount: 1000000000,
            takingAmount: 1000700000,
            makerTraits: buildMakerTraitsRFQ({ nonce: 2 }),
        });

        const signature = abiCoder.encode([ABIOrder], [order]);
        await swap.fillContractOrder(order, signature, 1000000, fillWithMakingAmount(1n << 200n));

        expect(await usdc.balanceOf(rfq)).to.equal(makerUsdc - 1000000n);
        expect(await usdc.balanceOf(addr)).to.equal(takerUsdc + 1000000n);
        expect(await usdt.balanceOf(rfq)).to.equal(makerUsdt + 1000700n);
        expect(await usdt.balanceOf(addr)).to.equal(takerUsdt - 1000700n);

        const signature2 = abiCoder.encode([ABIOrder], [order2]);
        await swap.fillContractOrder(order2, signature2, 1000000, fillWithMakingAmount(1n << 200n));
    });
});
