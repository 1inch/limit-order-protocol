const { ether, expectRevert, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { web3 } = require('hardhat');
const Wallet = require('ethereumjs-wallet').default;

const TokenMock = artifacts.require('TokenMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');
const AggregatorMock = artifacts.require('AggregatorMock');

const { signOrder } = require('./helpers/orderUtils');
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

    function buildOrder (
        salt,
        makerAsset,
        takerAsset,
        makingAmount,
        takingAmount,
        getMakerAmount,
        getTakerAmount,
        allowedSender = constants.ZERO_ADDRESS,
        predicate = '0x',
        permit = '0x',
        preInteraction = '0x',
        postInteraction = '0x'
    ) {
        const makerAssetData = '0x';
        const takerAssetData = '0x';

        const allInteractions = [
            makerAssetData,
            takerAssetData,
            getMakerAmount,
            getTakerAmount,
            predicate,
            permit,
            preInteraction,
            postInteraction,
        ];

        const interactions = '0x' + allInteractions.map(a => a.substr(2)).join('');

        // https://stackoverflow.com/a/55261098/440168
        const cumulativeSum = (sum => value => sum += value)(0);
        const offsets = allInteractions
            .map(a => a.length / 2 - 1)
            .map(cumulativeSum)
            .reduce((acc, a, i) => acc.add(toBN(a).shln(32 * i)), toBN('0'))
            .toString();

        return {
            salt,
            makerAsset: makerAsset.address,
            takerAsset: takerAsset.address,
            maker: wallet,
            receiver: constants.ZERO_ADDRESS,
            allowedSender,
            makingAmount,
            takingAmount,
            offsets,
            interactions,
        };
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

    it.only('eth -> dai chainlink+eps order', async function () {
        // chainlink rate is 1 eth = 4000 dai
        const order = buildOrder(
            '1', this.weth, this.dai, ether('1').toString(), ether('4000').toString(),
            cutLastArg(buildSinglePriceGetter(this.swap, this.daiOracle, false, '990000000')), // maker offset is 0.99
            cutLastArg(buildSinglePriceGetter(this.swap, this.daiOracle, true, '1010000000')), // taker offset is 1.01
        );

        const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

        const makerDai = await this.dai.balanceOf(wallet);
        const takerDai = await this.dai.balanceOf(_);
        const makerWeth = await this.weth.balanceOf(wallet);
        const takerWeth = await this.weth.balanceOf(_);

        console.log("order: ", order)
        await this.swap.fillOrder(order, signature, '0x', ether('1'), 0, ether('4040.01')); // taking threshold = 4000 + 1% + eps

        expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.add(ether('4040')));
        expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.sub(ether('4040')));
        expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.sub(ether('1')));
        expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.add(ether('1')));
    });

    it('dai -> 1inch stop loss order', async function () {
        const makerAmount = ether('100');
        const takerAmount = ether('631');
        const priceCall = buildDoublePriceGetter(this.swap, this.inchOracle, this.daiOracle, '1000000000', ether('1'));
        const predicate = this.swap.contract.methods.lt(ether('6.32'), this.swap.address, priceCall).encodeABI();

        const order = buildOrder(
            '1', this.inch, this.dai, makerAmount.toString(), takerAmount.toString(),
            cutLastArg(this.swap.contract.methods.getMakerAmount(makerAmount, takerAmount, 0).encodeABI()),
            cutLastArg(this.swap.contract.methods.getTakerAmount(makerAmount, takerAmount, 0).encodeABI()),
            constants.ZERO_ADDRESS,
            predicate,
        );
        const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

        const makerDai = await this.dai.balanceOf(wallet);
        const takerDai = await this.dai.balanceOf(_);
        const makerInch = await this.inch.balanceOf(wallet);
        const takerInch = await this.inch.balanceOf(_);

        await this.swap.fillOrder(order, signature, '', makerAmount, 0, takerAmount.add(ether('0.01'))); // taking threshold = exact taker amount + eps

        expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.add(takerAmount));
        expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.sub(takerAmount));
        expect(await this.inch.balanceOf(wallet)).to.be.bignumber.equal(makerInch.sub(makerAmount));
        expect(await this.inch.balanceOf(_)).to.be.bignumber.equal(takerInch.add(makerAmount));
    });

    it('dai -> 1inch stop loss order predicate is invalid', async function () {
        const makerAmount = ether('100');
        const takerAmount = ether('631');
        const priceCall = buildDoublePriceGetter(this.swap, this.inchOracle, this.daiOracle, '1000000000', ether('1'));
        const predicate = this.swap.contract.methods.lt(ether('6.31'), this.swap.address, priceCall).encodeABI();

        const order = buildOrder(
            '1', this.inch, this.dai, makerAmount.toString(), takerAmount.toString(),
            cutLastArg(this.swap.contract.methods.getMakerAmount(makerAmount, takerAmount, 0).encodeABI()),
            cutLastArg(this.swap.contract.methods.getTakerAmount(makerAmount, takerAmount, 0).encodeABI()),
            constants.ZERO_ADDRESS,
            predicate,
        );
        const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

        await expectRevert(
            this.swap.fillOrder(order, signature, '', makerAmount, 0, takerAmount.add(ether('0.01'))), // taking threshold = exact taker amount + eps
            'LOP: predicate returned false',
        );
    });

    it('eth -> dai stop loss order', async function () {
        const makerAmount = ether('1');
        const takerAmount = ether('4000');
        const latestAnswerCall = this.daiOracle.contract.methods.latestAnswer().encodeABI();
        const predicate = this.swap.contract.methods.lt(ether('0.0002501'), this.daiOracle.address, latestAnswerCall).encodeABI();

        const order = buildOrder(
            '1', this.weth, this.dai, makerAmount.toString(), takerAmount.toString(),
            cutLastArg(this.swap.contract.methods.getMakerAmount(makerAmount, takerAmount, 0).encodeABI()),
            cutLastArg(this.swap.contract.methods.getTakerAmount(makerAmount, takerAmount, 0).encodeABI()),
            constants.ZERO_ADDRESS,
            predicate,
        );
        const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

        const makerDai = await this.dai.balanceOf(wallet);
        const takerDai = await this.dai.balanceOf(_);
        const makerWeth = await this.weth.balanceOf(wallet);
        const takerWeth = await this.weth.balanceOf(_);

        await this.swap.fillOrder(order, signature, '', makerAmount, 0, takerAmount);

        expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.add(takerAmount));
        expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.sub(takerAmount));
        expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.sub(makerAmount));
        expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.add(makerAmount));
    });
});
