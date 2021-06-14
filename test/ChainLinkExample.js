const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const ethSigUtil = require('eth-sig-util');
const Wallet = require('ethereumjs-wallet').default;

const TokenMock = artifacts.require('TokenMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');
const ChainlinkCalculator = artifacts.require('ChainlinkCalculator');
const AggregatorV3Mock = artifacts.require('AggregatorV3Mock');

const { buildOrderData } = require('./helpers/orderUtils');
const { toBN, cutLastArg } = require('./helpers/utils');

contract('ChainLinkExample', async function ([_, wallet]) {
    const privatekey = '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
    const account = Wallet.fromPrivateKey(Buffer.from(privatekey, 'hex'));

    const zeroAddress = '0x0000000000000000000000000000000000000000';

    function buildInverseWithSpread (inverse, spread) {
        return toBN(spread).setn(255, inverse).toString();
    }

    function buildSinglePriceGetter (swap, calculator, oracle, inverse, spread) {
        const data = calculator.contract.methods.singlePrice(oracle.address, buildInverseWithSpread(inverse, spread), 0).encodeABI();
        return cutLastArg(swap.contract.methods.arbitraryStaticCall(calculator.address, data).encodeABI(), (64 - (data.length - 2) % 64) % 64);
    }

    // eslint-disable-next-line no-unused-vars
    function buildDoublePriceGetter (swap, calculator, oracle1, oracle2, spread) {
        const data = calculator.contract.methods.doublePrice(oracle1.address, oracle2.address, buildInverseWithSpread(false, spread), 0).encodeABI();
        return cutLastArg(swap.contract.methods.arbitraryStaticCall(calculator.address, data).encodeABI(), (64 - (data.length - 2) % 64) % 64);
    }

    function buildOrder (salt, makerAsset, takerAsset, makerAmount, takerAmount, makerGetter, takerGetter, taker = zeroAddress, predicate = '0x', permit = '0x', interaction = '0x') {
        return {
            salt: salt,
            makerAsset: makerAsset.address,
            takerAsset: takerAsset.address,
            makerAssetData: makerAsset.contract.methods.transferFrom(wallet, taker, makerAmount).encodeABI(),
            takerAssetData: takerAsset.contract.methods.transferFrom(taker, wallet, takerAmount).encodeABI(),
            getMakerAmount: makerGetter,
            getTakerAmount: takerGetter,
            predicate: predicate,
            permit: permit,
            interaction: interaction,
        };
    }

    beforeEach(async function () {
        this.dai = await TokenMock.new('DAI', 'DAI');
        this.weth = await TokenMock.new('WETH', 'WETH');
        this.inch = await TokenMock.new('1INCH', '1INCH');

        this.swap = await LimitOrderProtocol.new();
        this.calculator = await ChainlinkCalculator.new();

        // We get the chain id from the contract because Ganache (used for coverage) does not return the same chain id
        // from within the EVM as from the JSON RPC interface.
        // See https://github.com/trufflesuite/ganache-core/issues/515
        this.chainId = await this.dai.getChainId();

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

        this.daiOracle = await AggregatorV3Mock.new(ether('0.00025'));
        this.inchOracle = await AggregatorV3Mock.new('1577615249227853');
    });

    it('eth -> dai chainlink+eps order', async function () {
        // chainlink rate is 1 eth = 4000 dai
        const order = buildOrder(
            '1', this.weth, this.dai, ether('1'), ether('4000'),
            buildSinglePriceGetter(this.swap, this.calculator, this.daiOracle, false, '990000000'), // maker offset is 0.99
            buildSinglePriceGetter(this.swap, this.calculator, this.daiOracle, true, '1010000000'), // taker offset is 1.01
        );

        const data = buildOrderData(this.chainId, this.swap.address, order);
        const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

        const makerDai = await this.dai.balanceOf(wallet);
        const takerDai = await this.dai.balanceOf(_);
        const makerWeth = await this.weth.balanceOf(wallet);
        const takerWeth = await this.weth.balanceOf(_);

        await this.swap.fillOrder(order, signature, ether('1'), 0, ether('4040.01')); // taking threshold = 4000 + 1% + eps

        expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.add(ether('4040')));
        expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.sub(ether('4040')));
        expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.sub(ether('1')));
        expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.add(ether('1')));
    });

    it('dai -> 1inch stop loss order', async function () {
        const makerAmount = ether('100');
        const takerAmount = ether('631');
        const calculatorCall = this.calculator.contract.methods.doublePrice(this.inchOracle.address, this.daiOracle.address, '1000000000', ether('1')).encodeABI();
        const predicate = this.swap.contract.methods.lt(ether('6.32'), this.calculator.address, calculatorCall).encodeABI();

        const order = buildOrder(
            '1', this.inch, this.dai, makerAmount, takerAmount,
            cutLastArg(this.swap.contract.methods.getMakerAmount(makerAmount, takerAmount, 0).encodeABI()),
            cutLastArg(this.swap.contract.methods.getTakerAmount(makerAmount, takerAmount, 0).encodeABI()),
            zeroAddress,
            predicate,
        );
        const data = buildOrderData(this.chainId, this.swap.address, order);
        const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

        const makerDai = await this.dai.balanceOf(wallet);
        const takerDai = await this.dai.balanceOf(_);
        const makerInch = await this.inch.balanceOf(wallet);
        const takerInch = await this.inch.balanceOf(_);

        await this.swap.fillOrder(order, signature, makerAmount, 0, takerAmount.add(ether('0.01'))); // taking threshold = exact taker amount + eps

        expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.add(takerAmount));
        expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.sub(takerAmount));
        expect(await this.inch.balanceOf(wallet)).to.be.bignumber.equal(makerInch.sub(makerAmount));
        expect(await this.inch.balanceOf(_)).to.be.bignumber.equal(takerInch.add(makerAmount));
    });

    it('dai -> 1inch stop loss order predicate is invalid', async function () {
        const makerAmount = ether('100');
        const takerAmount = ether('631');
        const calculatorCall = this.calculator.contract.methods.doublePrice(this.inchOracle.address, this.daiOracle.address, '1000000000', ether('1')).encodeABI();
        const predicate = this.swap.contract.methods.lt(ether('6.31'), this.calculator.address, calculatorCall).encodeABI();

        const order = buildOrder(
            '1', this.inch, this.dai, makerAmount, takerAmount,
            cutLastArg(this.swap.contract.methods.getMakerAmount(makerAmount, takerAmount, 0).encodeABI()),
            cutLastArg(this.swap.contract.methods.getTakerAmount(makerAmount, takerAmount, 0).encodeABI()),
            zeroAddress,
            predicate,
        );
        const data = buildOrderData(this.chainId, this.swap.address, order);
        const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

        await expectRevert(
            this.swap.fillOrder(order, signature, makerAmount, 0, takerAmount.add(ether('0.01'))), // taking threshold = exact taker amount + eps
            'LOP: predicate returned false',
        );
    });

    it('eth -> dai stop loss order', async function () {
        const makerAmount = ether('1');
        const takerAmount = ether('4000');
        const latestAnswerCall = this.daiOracle.contract.methods.latestAnswer().encodeABI();
        const predicate = this.swap.contract.methods.lt(ether('0.0002501'), this.daiOracle.address, latestAnswerCall).encodeABI();

        const order = buildOrder(
            '1', this.weth, this.dai, makerAmount, takerAmount,
            cutLastArg(this.swap.contract.methods.getMakerAmount(makerAmount, takerAmount, 0).encodeABI()),
            cutLastArg(this.swap.contract.methods.getTakerAmount(makerAmount, takerAmount, 0).encodeABI()),
            zeroAddress,
            predicate,
        );
        const data = buildOrderData(this.chainId, this.swap.address, order);
        const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

        const makerDai = await this.dai.balanceOf(wallet);
        const takerDai = await this.dai.balanceOf(_);
        const makerWeth = await this.weth.balanceOf(wallet);
        const takerWeth = await this.weth.balanceOf(_);

        await this.swap.fillOrder(order, signature, makerAmount, 0, takerAmount);

        expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.add(takerAmount));
        expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.sub(takerAmount));
        expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.sub(makerAmount));
        expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.add(makerAmount));
    });
});
