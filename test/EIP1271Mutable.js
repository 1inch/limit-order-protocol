const { expect } = require('@1inch/solidity-utils');
const { buildOrderRFQ, signOrderRFQ } = require('./helpers/orderUtils');
const { addr0Wallet } = require('./helpers/utils');

const TokenMock = artifacts.require('TokenMock');
const EIP1271Mutable = artifacts.require('EIP1271Mutable');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');

describe('EIP1271Mutable', async function () {
    const addr0 = addr0Wallet.getAddressString();

    before(async function () {
        this.chainId = await web3.eth.getChainId();
    });

    beforeEach(async function () {
        this.swap = await LimitOrderProtocol.new();
        this.usdc = await TokenMock.new('USDC', 'USDC');
        this.usdt = await TokenMock.new('USDT', 'USDT');
        this.rfq = await EIP1271Mutable.new(this.swap.address);

        await this.usdc.mint(addr0, '1000000000');
        await this.usdt.mint(addr0, '1000000000');
        await this.usdc.mint(this.rfq.address, '1000000000');
        await this.usdt.mint(this.rfq.address, '1000000000');

        await this.usdc.approve(this.swap.address, '1000000000');
        await this.usdt.approve(this.swap.address, '1000000000');
    });

    it('should fill contract-signed RFQ order', async function () {
        const makerUsdc = await this.usdc.balanceOf(this.rfq.address);
        const takerUsdc = await this.usdc.balanceOf(addr0);
        const makerUsdt = await this.usdt.balanceOf(this.rfq.address);
        const takerUsdt = await this.usdt.balanceOf(addr0);

        const order = buildOrderRFQ('1', this.usdc.address, this.usdt.address, 1000000000, 1000700000, this.rfq.address);
        const signature = signOrderRFQ(order, this.chainId, this.swap.address, addr0Wallet.getPrivateKey());
        await this.swap.fillOrderRFQ(order, signature, 1000000, 0);

        expect(await this.usdc.balanceOf(this.rfq.address)).to.be.bignumber.equal(makerUsdc.subn(1000000));
        expect(await this.usdc.balanceOf(addr0)).to.be.bignumber.equal(takerUsdc.addn(1000000));
        expect(await this.usdt.balanceOf(this.rfq.address)).to.be.bignumber.equal(makerUsdt.addn(1000700));
        expect(await this.usdt.balanceOf(addr0)).to.be.bignumber.equal(takerUsdt.subn(1000700));

        const order2 = buildOrderRFQ('2', this.usdc.address, this.usdt.address, 1000000000, 1000700000, this.rfq.address);
        const signature2 = signOrderRFQ(order2, this.chainId, this.swap.address, addr0Wallet.getPrivateKey());
        await this.swap.fillOrderRFQ(order2, signature2, 1000000, 0);
    });
});
