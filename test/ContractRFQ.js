const { ether } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const TokenMock = artifacts.require('TokenMock');
const ContractRFQ = artifacts.require('ContractRFQ');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');

const { ABIOrderRFQ, buildOrderRFQ } = require('./helpers/orderUtils');

describe('ContractRFQ', async function () {
    let addr1;

    before(async function () {
        [addr1] = await web3.eth.getAccounts();
        this.chainId = await web3.eth.getChainId();
    });

    beforeEach(async function () {
        this.swap = await LimitOrderProtocol.new();
        this.usdc = await TokenMock.new('USDC', 'USDC');
        this.usdt = await TokenMock.new('USDT', 'USDT');
        this.rfq = await ContractRFQ.new(this.swap.address, this.usdc.address, this.usdt.address, ether('0.9993'), 'USDT+USDC', 'USDX');

        await this.usdc.mint(addr1, '1000000000');
        await this.usdt.mint(addr1, '1000000000');
        await this.usdc.mint(this.rfq.address, '1000000000');
        await this.usdt.mint(this.rfq.address, '1000000000');

        await this.usdc.approve(this.swap.address, '1000000000');
        await this.usdt.approve(this.swap.address, '1000000000');
    });

    it('should fill contract-signed RFQ order', async function () {
        const makerUsdc = await this.usdc.balanceOf(this.rfq.address);
        const takerUsdc = await this.usdc.balanceOf(addr1);
        const makerUsdt = await this.usdt.balanceOf(this.rfq.address);
        const takerUsdt = await this.usdt.balanceOf(addr1);

        const order = buildOrderRFQ('1', this.usdc.address, this.usdt.address, 1000000000, 1000700000, this.rfq.address);
        const signature = web3.eth.abi.encodeParameter(ABIOrderRFQ, order);
        await this.swap.fillOrderRFQ(order, signature, 1000000, 0);

        expect(await this.usdc.balanceOf(this.rfq.address)).to.be.bignumber.equal(makerUsdc.subn(1000000));
        expect(await this.usdc.balanceOf(addr1)).to.be.bignumber.equal(takerUsdc.addn(1000000));
        expect(await this.usdt.balanceOf(this.rfq.address)).to.be.bignumber.equal(makerUsdt.addn(1000700));
        expect(await this.usdt.balanceOf(addr1)).to.be.bignumber.equal(takerUsdt.subn(1000700));

        const order2 = buildOrderRFQ('2', this.usdc.address, this.usdt.address, 1000000000, 1000700000, this.rfq.address);
        const signature2 = web3.eth.abi.encodeParameter(ABIOrderRFQ, order2);
        await this.swap.fillOrderRFQ(order2, signature2, 1000000, 0);
    });
});
