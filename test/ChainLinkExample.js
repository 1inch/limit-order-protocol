const { expect, ether, toBN } = require('@1inch/solidity-utils');
const { web3 } = require('hardhat');
const { buildOrder, signOrder } = require('./helpers/orderUtils');
const { cutLastArg, addr0Wallet, addr1Wallet } = require('./helpers/utils');

const TokenMock = artifacts.require('TokenMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');
const AggregatorMock = artifacts.require('AggregatorMock');
const ChainlinkCalculator = artifacts.require('ChainlinkCalculator');

describe('ChainLinkExample', async function () {
    const [addr0, addr1] = [addr0Wallet.getAddressString(), addr1Wallet.getAddressString()];

    function buildInverseWithSpread (inverse, spread) {
        return toBN(spread).setn(255, inverse).toString();
    }

    function buildSinglePriceGetter (chainlink, oracle, inverse, spread, amount = '0') {
        return chainlink.address + chainlink.contract.methods.singlePrice(oracle.address, buildInverseWithSpread(inverse, spread), amount).encodeABI().substring(2);
    }

    function buildDoublePriceGetter (chainlink, oracle1, oracle2, spread, amount = '0') {
        return chainlink.address + chainlink.contract.methods.doublePrice(oracle1.address, oracle2.address, buildInverseWithSpread(false, spread), '0', amount).encodeABI().substring(2);
    }

    before(async function () {
        this.chainId = await web3.eth.getChainId();
    });

    beforeEach(async function () {
        this.dai = await TokenMock.new('DAI', 'DAI');
        this.weth = await TokenMock.new('WETH', 'WETH');
        this.inch = await TokenMock.new('1INCH', '1INCH');

        this.swap = await LimitOrderProtocol.new();
        this.chainlink = await ChainlinkCalculator.new();

        await this.dai.mint(addr1, ether('1000000'));
        await this.weth.mint(addr1, ether('1000000'));
        await this.inch.mint(addr1, ether('1000000'));
        await this.dai.mint(addr0, ether('1000000'));
        await this.weth.mint(addr0, ether('1000000'));
        await this.inch.mint(addr0, ether('1000000'));

        await this.dai.approve(this.swap.address, ether('1000000'));
        await this.weth.approve(this.swap.address, ether('1000000'));
        await this.inch.approve(this.swap.address, ether('1000000'));
        await this.dai.approve(this.swap.address, ether('1000000'), { from: addr1 });
        await this.weth.approve(this.swap.address, ether('1000000'), { from: addr1 });
        await this.inch.approve(this.swap.address, ether('1000000'), { from: addr1 });

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
                from: addr1,
            },
            {
                getMakingAmount: cutLastArg(buildSinglePriceGetter(this.chainlink, this.daiOracle, false, '990000000')), // maker offset is 0.99
                getTakingAmount: cutLastArg(buildSinglePriceGetter(this.chainlink, this.daiOracle, true, '1010000000')), // taker offset is 1.01
            },
        );

        const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

        const makerDai = await this.dai.balanceOf(addr1);
        const takerDai = await this.dai.balanceOf(addr0);
        const makerWeth = await this.weth.balanceOf(addr1);
        const takerWeth = await this.weth.balanceOf(addr0);

        await this.swap.fillOrder(order, signature, '0x', ether('1'), 0, ether('4040.01')); // taking threshold = 4000 + 1% + eps

        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.add(ether('4040')));
        expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.sub(ether('4040')));
        expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.sub(ether('1')));
        expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.add(ether('1')));
    });

    it('dai -> 1inch stop loss order', async function () {
        const makingAmount = ether('100');
        const takingAmount = ether('631');
        const priceCall = this.swap.contract.methods.arbitraryStaticCall(
            this.chainlink.address,
            this.chainlink.contract.methods.doublePrice(this.inchOracle.address, this.daiOracle.address, buildInverseWithSpread(false, '1000000000'), '0', ether('1')).encodeABI(),
        ).encodeABI();

        const order = buildOrder(
            {
                exchange: this.swap,
                makerAsset: this.inch.address,
                takerAsset: this.dai.address,
                makingAmount,
                takingAmount,
                from: addr1,
            }, {
                getMakingAmount: this.swap.address + cutLastArg(this.swap.contract.methods.getMakingAmount(makingAmount, takingAmount, 0).encodeABI()).substring(2),
                getTakingAmount: this.swap.address + cutLastArg(this.swap.contract.methods.getTakingAmount(makingAmount, takingAmount, 0).encodeABI()).substring(2),
                predicate: this.swap.contract.methods.lt(ether('6.32'), priceCall).encodeABI(),
            },
        );
        const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

        const makerDai = await this.dai.balanceOf(addr1);
        const takerDai = await this.dai.balanceOf(addr0);
        const makerInch = await this.inch.balanceOf(addr1);
        const takerInch = await this.inch.balanceOf(addr0);

        await this.swap.fillOrder(order, signature, '0x', makingAmount, 0, takingAmount.add(ether('0.01'))); // taking threshold = exact taker amount + eps

        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.add(takingAmount));
        expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.sub(takingAmount));
        expect(await this.inch.balanceOf(addr1)).to.be.bignumber.equal(makerInch.sub(makingAmount));
        expect(await this.inch.balanceOf(addr0)).to.be.bignumber.equal(takerInch.add(makingAmount));
    });

    it('dai -> 1inch stop loss order predicate is invalid', async function () {
        const makingAmount = ether('100');
        const takingAmount = ether('631');
        const priceCall = buildDoublePriceGetter(this.chainlink, this.inchOracle, this.daiOracle, '1000000000', ether('1'));

        const order = buildOrder(
            {
                exchange: this.swap,
                makerAsset: this.inch.address,
                takerAsset: this.dai.address,
                makingAmount,
                takingAmount,
                from: addr1,
            },
            {
                getMakingAmount: this.swap.address + cutLastArg(this.swap.contract.methods.getMakingAmount(makingAmount, takingAmount, 0).encodeABI()).substring(2),
                getTakingAmount: this.swap.address + cutLastArg(this.swap.contract.methods.getTakingAmount(makingAmount, takingAmount, 0).encodeABI()).substring(2),
                predicate: this.swap.contract.methods.lt(ether('6.31'), priceCall).encodeABI(),
            },
        );
        const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

        await expect(
            this.swap.fillOrder(order, signature, '0x', makingAmount, 0, takingAmount.add(ether('0.01'))), // taking threshold = exact taker amount + eps
        ).to.eventually.be.rejectedWith('PredicateIsNotTrue()');
    });

    it('eth -> dai stop loss order', async function () {
        const makingAmount = ether('1');
        const takingAmount = ether('4000');
        const latestAnswerCall = this.swap.contract.methods.arbitraryStaticCall(
            this.daiOracle.address,
            this.daiOracle.contract.methods.latestAnswer().encodeABI(),
        ).encodeABI();

        const order = buildOrder(
            {
                exchange: this.swap,
                makerAsset: this.weth.address,
                takerAsset: this.dai.address,
                makingAmount,
                takingAmount,
                from: addr1,
            },
            {
                getMakingAmount: this.swap.address + cutLastArg(this.swap.contract.methods.getMakingAmount(makingAmount, takingAmount, 0).encodeABI()).substring(2),
                getTakingAmount: this.swap.address + cutLastArg(this.swap.contract.methods.getTakingAmount(makingAmount, takingAmount, 0).encodeABI()).substring(2),
                predicate: this.swap.contract.methods.lt(ether('0.0002501'), latestAnswerCall).encodeABI(),
            },
        );
        const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

        const makerDai = await this.dai.balanceOf(addr1);
        const takerDai = await this.dai.balanceOf(addr0);
        const makerWeth = await this.weth.balanceOf(addr1);
        const takerWeth = await this.weth.balanceOf(addr0);

        await this.swap.fillOrder(order, signature, '0x', makingAmount, 0, takingAmount);

        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.add(takingAmount));
        expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.sub(takingAmount));
        expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.sub(makingAmount));
        expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.add(makingAmount));
    });
});
