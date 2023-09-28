const { expect, trim0x } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { signOrder, buildOrder, buildTakerTraits } = require('./helpers/orderUtils');
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
        await weth.deposit({ value: ether('100') });
        await inch.mint(addr.address, ether('1000000'));
        await dai.mint(addr1.address, ether('1000000'));
        await weth.connect(addr1).deposit({ value: ether('100') });
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
                makingAmountGetter: cutLastArg(buildSinglePriceGetter(chainlink, daiOracle, false, '990000000')), // maker offset is 0.99
                takingAmountGetter: cutLastArg(buildSinglePriceGetter(chainlink, daiOracle, true, '1010000000')), // taker offset is 1.01
            },
        );

        const signature = await signOrder(order, chainId, swap.address, addr1);

        const { r, _vs: vs } = ethers.utils.splitSignature(signature);
        // taking threshold = 4000 + 1% + eps
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
            minReturn: ether('4040.01'),
        });
        const filltx = swap.fillOrderArgs(order, r, vs, ether('1'), takerTraits.traits, takerTraits.args);
        await expect(filltx).to.changeTokenBalances(dai, [addr, addr1], [ether('-4040'), ether('4040')]);
        await expect(filltx).to.changeTokenBalances(weth, [addr, addr1], [ether('1'), ether('-1')]);
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
                predicate: swap.interface.encodeFunctionData('lt', [ether('6.32'), priceCall]),
            },
        );
        const signature = await signOrder(order, chainId, swap.address, addr1);

        const { r, _vs: vs } = ethers.utils.splitSignature(signature);
        // taking threshold = exact taker amount + eps
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
            minReturn: takingAmount.add(ether('0.01')),
        });
        const filltx = swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);
        await expect(filltx).to.changeTokenBalances(dai, [addr, addr1], [takingAmount.mul(-1), takingAmount]);
        await expect(filltx).to.changeTokenBalances(inch, [addr, addr1], [makingAmount, makingAmount.mul(-1)]);
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
                predicate: swap.interface.encodeFunctionData('lt', [ether('6.31'), priceCall]),
            },
        );
        const signature = await signOrder(order, chainId, swap.address, addr1);

        const { r, _vs: vs } = ethers.utils.splitSignature(signature);
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
            minReturn: takingAmount.add(ether('0.01')),
        });
        await expect(
            swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args), // taking threshold = exact taker amount + eps
        ).to.be.revertedWithCustomError(swap, 'PredicateIsNotTrue');
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
                predicate: swap.interface.encodeFunctionData('lt', [ether('0.0002501'), latestAnswerCall]),
            },
        );
        const signature = await signOrder(order, chainId, swap.address, addr1);

        const { r, _vs: vs } = ethers.utils.splitSignature(signature);
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
            minReturn: takingAmount,
        });
        const filltx = swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);
        await expect(filltx).to.changeTokenBalances(dai, [addr, addr1], [takingAmount.mul(-1), takingAmount]);
        await expect(filltx).to.changeTokenBalances(weth, [addr, addr1], [makingAmount, makingAmount.mul(-1)]);
    });
});
