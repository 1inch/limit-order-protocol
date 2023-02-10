const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('@1inch/solidity-utils');
const { ABIOrderRFQ, buildOrderRFQ, makeMakingAmount, buildConstraints } = require('./helpers/orderUtils');
const { ethers } = require('hardhat');
const { ether } = require('./helpers/utils');
const { deploySwap, deployUSDC, deployUSDT } = require('./helpers/fixtures');
const { constants } = require('ethers');

describe('ContractRFQ', function () {
    const emptyInteraction = '0x';
    const abiCoder = ethers.utils.defaultAbiCoder;
    let addr;

    before(async function () {
        [addr] = await ethers.getSigners();
    });

    async function deployAndInit () {
        const { swap } = await deploySwap();
        const { usdc } = await deployUSDC();
        const { usdt } = await deployUSDT();

        const ContractRFQ = await ethers.getContractFactory('ContractRFQ');
        const rfq = await ContractRFQ.deploy(swap.address, usdc.address, usdt.address, ether('0.9993'), 'USDT+USDC', 'USDX');
        await rfq.deployed();

        await usdc.mint(addr.address, '1000000000');
        await usdt.mint(addr.address, '1000000000');
        await usdc.mint(rfq.address, '1000000000');
        await usdt.mint(rfq.address, '1000000000');

        await usdc.approve(swap.address, '1000000000');
        await usdt.approve(swap.address, '1000000000');

        return { usdc, usdt, swap, rfq };
    };

    it('should fill contract-signed RFQ order', async function () {
        const { usdc, usdt, swap, rfq } = await loadFixture(deployAndInit);

        const makerUsdc = await usdc.balanceOf(rfq.address);
        const takerUsdc = await usdc.balanceOf(addr.address);
        const makerUsdt = await usdt.balanceOf(rfq.address);
        const takerUsdt = await usdt.balanceOf(addr.address);

        const order = buildOrderRFQ({
            maker: rfq.address,
            makerAsset: usdc.address,
            takerAsset: usdt.address,
            makingAmount: 1000000000,
            takingAmount: 1000700000,
            constraints: buildConstraints({ nonce: 1 }),
        });

        const order2 = buildOrderRFQ({
            maker: rfq.address,
            makerAsset: usdc.address,
            takerAsset: usdt.address,
            makingAmount: 1000000000,
            takingAmount: 1000700000,
            constraints: buildConstraints({ nonce: 2 }),
        });

        const signature = abiCoder.encode([ABIOrderRFQ], [order]);
        await swap.fillContractOrderRFQ(order, signature, makeMakingAmount(1000000), 1n << 255n, constants.AddressZero, emptyInteraction, '0x');

        expect(await usdc.balanceOf(rfq.address)).to.equal(makerUsdc.sub(1000000));
        expect(await usdc.balanceOf(addr.address)).to.equal(takerUsdc.add(1000000));
        expect(await usdt.balanceOf(rfq.address)).to.equal(makerUsdt.add(1000700));
        expect(await usdt.balanceOf(addr.address)).to.equal(takerUsdt.sub(1000700));

        const signature2 = abiCoder.encode([ABIOrderRFQ], [order2]);
        await swap.fillContractOrderRFQ(order2, signature2, makeMakingAmount(1000000), 1n << 255n, constants.AddressZero, emptyInteraction, '0x');
    });
});
