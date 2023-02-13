const { expect, trim0x } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { makeMakingAmount, compactSignature, signOrderRFQ, buildOrder } = require('./helpers/orderUtils');
const { cutLastArg, ether, setn } = require('./helpers/utils');
const { deploySwapTokens } = require('./helpers/fixtures');
const { ethers } = require('hardhat');

describe('ChainLinkExample', function () {
    let addr, addr1;

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
    });

    function buildInverseWithSpread (inverse, spread) {
        return setn(spread, 255, inverse).toString();
    }

    function buildSinglePriceGetter (chainlink, oracle, inverse, spread, amount = '0') {
        return chainlink.address + trim0x(chainlink.interface.encodeFunctionData('singlePrice', [oracle.address, buildInverseWithSpread(inverse, spread), amount]));
    }

    function buildDoublePriceGetter (chainlink, oracle1, oracle2, spread, amount = '0') {
        return chainlink.address + trim0x(chainlink.interface.encodeFunctionData('doublePrice', [oracle1.address, oracle2.address, buildInverseWithSpread(false, spread), '0', amount]));
    }

    async function deployContractsAndInit () {
        const { dai, weth, inch, swap, chainId } = await deploySwapTokens();

        await dai.mint(addr.address, ether('1000000'));
        await weth.mint(addr.address, ether('1000000'));
        await inch.mint(addr.address, ether('1000000'));
        await dai.mint(addr1.address, ether('1000000'));
        await weth.mint(addr1.address, ether('1000000'));
        await inch.mint(addr1.address, ether('1000000'));

        await dai.approve(swap.address, ether('1000000'));
        await weth.approve(swap.address, ether('1000000'));
        await inch.approve(swap.address, ether('1000000'));
        await dai.connect(addr1).approve(swap.address, ether('1000000'));
        await weth.connect(addr1).approve(swap.address, ether('1000000'));
        await inch.connect(addr1).approve(swap.address, ether('1000000'));

        const ChainlinkCalculator = await ethers.getContractFactory('ChainlinkCalculator');
        const chainlink = await ChainlinkCalculator.deploy();
        await chainlink.deployed();

        const AggregatorMock = await ethers.getContractFactory('AggregatorMock');
        const daiOracle = await AggregatorMock.deploy(ether('0.00025'));
        await daiOracle.deployed();
        const inchOracle = await AggregatorMock.deploy('1577615249227853');
        await inchOracle.deployed();

        return { dai, weth, inch, swap, chainId, chainlink, daiOracle, inchOracle };
    };

    it('eth -> dai chainlink+eps order', async function () {
        const { dai, weth, swap, chainId, chainlink, daiOracle } = await loadFixture(deployContractsAndInit);

        // chainlink rate is 1 eth = 4000 dai
        const order = buildOrder(
            {
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('1').toString(),
                takingAmount: ether('4000').toString(),
                maker: addr1.address,
            },
            {
                getMakingAmount: cutLastArg(buildSinglePriceGetter(chainlink, daiOracle, false, '990000000')), // maker offset is 0.99
                getTakingAmount: cutLastArg(buildSinglePriceGetter(chainlink, daiOracle, true, '1010000000')), // taker offset is 1.01
            },
        );

        const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

        const makerDai = await dai.balanceOf(addr1.address);
        const takerDai = await dai.balanceOf(addr.address);
        const makerWeth = await weth.balanceOf(addr1.address);
        const takerWeth = await weth.balanceOf(addr.address);

        const { r, vs } = compactSignature(signature);
        await swap.fillOrderRFQExt(order, r, vs, makeMakingAmount(ether('1')), ether('4040.01'), order.extension); // taking threshold = 4000 + 1% + eps

        expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.add(ether('4040')));
        expect(await dai.balanceOf(addr.address)).to.equal(takerDai.sub(ether('4040')));
        expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.sub(ether('1')));
        expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.add(ether('1')));
    });

    it('dai -> 1inch stop loss order', async function () {
        const { dai, inch, swap, chainId, chainlink, daiOracle, inchOracle } = await loadFixture(deployContractsAndInit);

        const makingAmount = ether('100');
        const takingAmount = ether('631');
        const priceCall = swap.interface.encodeFunctionData('arbitraryStaticCall', [
            chainlink.address,
            chainlink.interface.encodeFunctionData('doublePrice', [inchOracle.address, daiOracle.address, buildInverseWithSpread(false, '1000000000'), '0', ether('1')]),
        ]);

        const order = buildOrder(
            {
                makerAsset: inch.address,
                takerAsset: dai.address,
                makingAmount,
                takingAmount,
                maker: addr1.address,
            }, {
                getMakingAmount: '0x',
                getTakingAmount: '0x',
                predicate: swap.interface.encodeFunctionData('lt', [ether('6.32'), priceCall]),
            },
        );
        const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

        const makerDai = await dai.balanceOf(addr1.address);
        const takerDai = await dai.balanceOf(addr.address);
        const makerInch = await inch.balanceOf(addr1.address);
        const takerInch = await inch.balanceOf(addr.address);

        const { r, vs } = compactSignature(signature);
        await swap.fillOrderRFQExt(order, r, vs, makeMakingAmount(makingAmount), takingAmount.add(ether('0.01')), order.extension); // taking threshold = exact taker amount + eps

        expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.add(takingAmount));
        expect(await dai.balanceOf(addr.address)).to.equal(takerDai.sub(takingAmount));
        expect(await inch.balanceOf(addr1.address)).to.equal(makerInch.sub(makingAmount));
        expect(await inch.balanceOf(addr.address)).to.equal(takerInch.add(makingAmount));
    });

    it('dai -> 1inch stop loss order predicate is invalid', async function () {
        const { dai, inch, swap, chainId, chainlink, daiOracle, inchOracle } = await loadFixture(deployContractsAndInit);

        const makingAmount = ether('100');
        const takingAmount = ether('631');
        const priceCall = buildDoublePriceGetter(chainlink, inchOracle, daiOracle, '1000000000', ether('1'));

        const order = buildOrder(
            {
                makerAsset: inch.address,
                takerAsset: dai.address,
                makingAmount,
                takingAmount,
                maker: addr1.address,
            },
            {
                getMakingAmount: '0x',
                getTakingAmount: '0x',
                predicate: swap.interface.encodeFunctionData('lt', [ether('6.31'), priceCall]),
            },
        );
        const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

        const { r, vs } = compactSignature(signature);
        await expect(
            swap.fillOrderRFQExt(order, r, vs, makeMakingAmount(makingAmount), takingAmount.add(ether('0.01')), order.extension), // taking threshold = exact taker amount + eps
        ).to.be.revertedWithCustomError(swap, 'RFQPredicateIsNotTrue');
    });

    it('eth -> dai stop loss order', async function () {
        const { dai, weth, swap, chainId, daiOracle } = await loadFixture(deployContractsAndInit);

        const makingAmount = ether('1');
        const takingAmount = ether('4000');
        const latestAnswerCall = swap.interface.encodeFunctionData('arbitraryStaticCall', [
            daiOracle.address,
            daiOracle.interface.encodeFunctionData('latestAnswer'),
        ]);

        const order = buildOrder(
            {
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount,
                takingAmount,
                maker: addr1.address,
            },
            {
                getMakingAmount: '0x',
                getTakingAmount: '0x',
                predicate: swap.interface.encodeFunctionData('lt', [ether('0.0002501'), latestAnswerCall]),
            },
        );
        const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

        const makerDai = await dai.balanceOf(addr1.address);
        const takerDai = await dai.balanceOf(addr.address);
        const makerWeth = await weth.balanceOf(addr1.address);
        const takerWeth = await weth.balanceOf(addr.address);

        const { r, vs } = compactSignature(signature);
        await swap.fillOrderRFQExt(order, r, vs, makeMakingAmount(makingAmount), takingAmount, order.extension);

        expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.add(takingAmount));
        expect(await dai.balanceOf(addr.address)).to.equal(takerDai.sub(takingAmount));
        expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.sub(makingAmount));
        expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.add(makingAmount));
    });
});
