const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('@1inch/solidity-utils');
const { ABIOrder, fillWithMakingAmount, buildMakerTraitsRFQ, buildOrderRFQ } = require('./helpers/orderUtils');
const { ethers } = require('hardhat');
const { ether } = require('./helpers/utils');
const { deploySwap, deployUSDC, deployUSDT } = require('./helpers/fixtures');
const { constants } = require('ethers');

describe('MakerContract', function () {
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

        const MakerContract = await ethers.getContractFactory('MakerContract');
        const rfq = await MakerContract.deploy(swap.address, usdc.address, usdt.address, ether('0.9993'), 'USDT+USDC', 'USDX');
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

        const order = buildOrderRFQ({
            maker: rfq.address,
            makerAsset: usdc.address,
            takerAsset: usdt.address,
            makingAmount: 1000000000,
            takingAmount: 1000700000,
            makerTraits: buildMakerTraitsRFQ({ nonce: 1 }),
        });

        const order2 = buildOrderRFQ({
            maker: rfq.address,
            makerAsset: usdc.address,
            takerAsset: usdt.address,
            makingAmount: 1000000000,
            takingAmount: 1000700000,
            makerTraits: buildMakerTraitsRFQ({ nonce: 2 }),
        });

        const signature = abiCoder.encode([ABIOrder], [order]);
        const tx = await swap.fillContractOrder(order, signature, 1000000, fillWithMakingAmount(1n << 200n), constants.AddressZero, emptyInteraction, '0x');
        expect(tx).to.changeTokenBalances(usdc, [addr.address, rfq.address], [1000000n, -1000000n]);
        expect(tx).to.changeTokenBalances(usdt, [addr.address, rfq.address], [-1000700n, 1000700n]);

        const signature2 = abiCoder.encode([ABIOrder], [order2]);
        await swap.fillContractOrder(order2, signature2, 1000000, fillWithMakingAmount(1n << 200n), constants.AddressZero, emptyInteraction, '0x');
    });
});
