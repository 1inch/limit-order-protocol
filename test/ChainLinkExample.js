const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { web3 } = require('hardhat');
const Wallet = require('ethereumjs-wallet').default;

const TokenMock = artifacts.require('TokenMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');
const AggregatorMock = artifacts.require('AggregatorMock');

const { buildOrder, signOrder } = require('./helpers/orderUtils');
const { toBN, cutLastArg } = require('./helpers/utils');

describe('ChainLinkExample', async function () {
    let _, wallet;
    const privatekey = '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
    const account = Wallet.fromPrivateKey(Buffer.from(privatekey, 'hex'));

    function buildInverseWithSpread (inverse, spread) {
        return toBN(spread).setn(255, inverse).toString();
    }

    function buildSinglePriceGetter (swap, oracle, inverse, spread, amount = '0') {
        return swap.contract.methods.singlePrice(oracle.address, buildInverseWithSpread(inverse, spread), amount).encodeABI();
    }

    // eslint-disable-next-line no-unused-vars
    function buildDoublePriceGetter (swap, oracle1, oracle2, spread, amount = '0') {
        return swap.contract.methods.doublePrice(oracle1.address, oracle2.address, buildInverseWithSpread(false, spread), '0', amount).encodeABI();
    }

    before(async function () {
        [_, wallet] = await web3.eth.getAccounts();
        this.chainId = await web3.eth.getChainId();
    });

    beforeEach(async function () {
        this.dai = await TokenMock.new('DAI', 'DAI');
        this.weth = await TokenMock.new('WETH', 'WETH');
        this.inch = await TokenMock.new('1INCH', '1INCH');

        this.swap = await LimitOrderProtocol.new();

        await this.dai.mint(wallet, ether('1000000'));
        await this.weth.mint(wallet, ether('1000000'));
        await this.inch.mint(wallet, ether('1000000'));
        await this.dai.mint(_, ether('1000000'));
        await this.weth.mint(_, ether('1000000'));
        await this.inch.mint(_, ether('1000000'));

        await this.dai.approve(this.swap.address, ether('1000000'));
        await this.weth.approve(this.swap.address, ether('1000000'));
        await this.inch.approve(this.swap.address, ether('1000000'));
        await this.dai.approve(this.swap.address, ether('1000000'), { from: wallet });
        await this.weth.approve(this.swap.address, ether('1000000'), { from: wallet });
        await this.inch.approve(this.swap.address, ether('1000000'), { from: wallet });

        this.daiOracle = await AggregatorMock.new(ether('0.00025'));
        this.inchOracle = await AggregatorMock.new('1577615249227853');
    });

    it('eth -> dai chainlink+eps order', async function () {
        // chainlink rate is 1 eth = 4000 dai
        const order = buildOrder(
            {
                exchange: this.swap,
                makerAsset: this.weth.address,
                takerAsset: this.dai.address,
                makingAmount: ether('1').toString(),
                takingAmount: ether('4000').toString(),
                from: wallet,
            },
            {
                getMakingAmount: cutLastArg(buildSinglePriceGetter(this.swap, this.daiOracle, false, '990000000')), // maker offset is 0.99
                getTakingAmount: cutLastArg(buildSinglePriceGetter(this.swap, this.daiOracle, true, '1010000000')), // taker offset is 1.01
            },
        );

        const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

        const makerDai = await this.dai.balanceOf(wallet);
        const takerDai = await this.dai.balanceOf(_);
        const makerWeth = await this.weth.balanceOf(wallet);
        const takerWeth = await this.weth.balanceOf(_);

        await this.swap.fillOrder(order, signature, '0x', ether('1'), 0, ether('4040.01')); // taking threshold = 4000 + 1% + eps

        expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.add(ether('4040')));
        expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.sub(ether('4040')));
        expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.sub(ether('1')));
        expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.add(ether('1')));
    });

    it('dai -> 1inch stop loss order', async function () {
        const makingAmount = ether('100');
        const takingAmount = ether('631');
        const priceCall = buildDoublePriceGetter(this.swap, this.inchOracle, this.daiOracle, '1000000000', ether('1'));

        const order = buildOrder(
            {
                exchange: this.swap,
                makerAsset: this.inch.address,
                takerAsset: this.dai.address,
                makingAmount,
                takingAmount,
                from: wallet,
            }, {
                getMakingAmount: cutLastArg(this.swap.contract.methods.getMakingAmount(makingAmount, takingAmount, 0).encodeABI()),
                getTakingAmount: cutLastArg(this.swap.contract.methods.getTakingAmount(makingAmount, takingAmount, 0).encodeABI()),
                predicate: this.swap.contract.methods.lt(ether('6.32'), this.swap.address, priceCall).encodeABI(),
            },
        );
        const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

        const makerDai = await this.dai.balanceOf(wallet);
        const takerDai = await this.dai.balanceOf(_);
        const makerInch = await this.inch.balanceOf(wallet);
        const takerInch = await this.inch.balanceOf(_);

        await this.swap.fillOrder(order, signature, '0x', makingAmount, 0, takingAmount.add(ether('0.01'))); // taking threshold = exact taker amount + eps

        expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.add(takingAmount));
        expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.sub(takingAmount));
        expect(await this.inch.balanceOf(wallet)).to.be.bignumber.equal(makerInch.sub(makingAmount));
        expect(await this.inch.balanceOf(_)).to.be.bignumber.equal(takerInch.add(makingAmount));
    });

    it('dai -> 1inch stop loss order predicate is invalid', async function () {
        const makingAmount = ether('100');
        const takingAmount = ether('631');
        const priceCall = buildDoublePriceGetter(this.swap, this.inchOracle, this.daiOracle, '1000000000', ether('1'));

        const order = buildOrder(
            {
                exchange: this.swap,
                makerAsset: this.inch.address,
                takerAsset: this.dai.address,
                makingAmount,
                takingAmount,
                from: wallet,
            },
            {
                getMakingAmount: cutLastArg(this.swap.contract.methods.getMakingAmount(makingAmount, takingAmount, 0).encodeABI()),
                getTakingAmount: cutLastArg(this.swap.contract.methods.getTakingAmount(makingAmount, takingAmount, 0).encodeABI()),
                predicate: this.swap.contract.methods.lt(ether('6.31'), this.swap.address, priceCall).encodeABI(),
            },
        );
        const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

        await expectRevert(
            this.swap.fillOrder(order, signature, '0x', makingAmount, 0, takingAmount.add(ether('0.01'))), // taking threshold = exact taker amount + eps
            'LOP: predicate is not true',
        );
    });

    it('eth -> dai stop loss order', async function () {
        const makingAmount = ether('1');
        const takingAmount = ether('4000');
        const latestAnswerCall = this.daiOracle.contract.methods.latestAnswer().encodeABI();

        const order = buildOrder(
            {
                exchange: this.swap,
                makerAsset: this.weth.address,
                takerAsset: this.dai.address,
                makingAmount,
                takingAmount,
                from: wallet,
            },
            {
                getMakingAmount: cutLastArg(this.swap.contract.methods.getMakingAmount(makingAmount, takingAmount, 0).encodeABI()),
                getTakingAmount: cutLastArg(this.swap.contract.methods.getTakingAmount(makingAmount, takingAmount, 0).encodeABI()),
                predicate: this.swap.contract.methods.lt(ether('0.0002501'), this.daiOracle.address, latestAnswerCall).encodeABI(),
            },
        );
        const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

        const makerDai = await this.dai.balanceOf(wallet);
        const takerDai = await this.dai.balanceOf(_);
        const makerWeth = await this.weth.balanceOf(wallet);
        const takerWeth = await this.weth.balanceOf(_);

        await this.swap.fillOrder(order, signature, '0x', makingAmount, 0, takingAmount);

        expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.add(takingAmount));
        expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.sub(takingAmount));
        expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.sub(makingAmount));
        expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.add(makingAmount));
    });
});
