const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ether } = require('./helpers/utils');
const { signOrder, buildOrder, buildTakerTraits, compactSignature } = require('./helpers/orderUtils');
const { deploySwapTokens } = require('./helpers/fixtures');
const { ethers } = require('hardhat');

describe('ChainLinkExample', function () {
    let addr, addr1;

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
    });

    async function deployContractsAndInit () {
        const { dai, weth, inch, swap, chainId } = await deploySwapTokens();

        await dai.mint(addr, ether('1000000'));
        await weth.deposit({ value: ether('100') });
        await inch.mint(addr, ether('1000000'));
        await dai.mint(addr1, ether('1000000'));
        await weth.connect(addr1).deposit({ value: ether('100') });
        await inch.mint(addr1, ether('1000000'));

        await dai.approve(swap, ether('1000000'));
        await weth.approve(swap, ether('1000000'));
        await inch.approve(swap, ether('1000000'));
        await dai.connect(addr1).approve(swap, ether('1000000'));
        await weth.connect(addr1).approve(swap, ether('1000000'));
        await inch.connect(addr1).approve(swap, ether('1000000'));

        const ChainlinkCalculator = await ethers.getContractFactory('ChainlinkCalculator');
        const chainlink = await ChainlinkCalculator.deploy();
        await chainlink.waitForDeployment();

        const AggregatorMock = await ethers.getContractFactory('AggregatorMock');
        const daiOracle = await AggregatorMock.deploy(ether('0.00025'));
        await daiOracle.waitForDeployment();
        const inchOracle = await AggregatorMock.deploy('1577615249227853');
        await inchOracle.waitForDeployment();

        return { dai, weth, inch, swap, chainId, chainlink, daiOracle, inchOracle };
    };

    it('eth -> dai chainlink+eps order', async function () {
        const { dai, weth, swap, chainId, chainlink, daiOracle } = await loadFixture(deployContractsAndInit);

        // chainlink rate is 1 eth = 4000 dai
        const order = buildOrder(
            {
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('4000'),
                maker: addr1.address,
            },
            {
                makingAmountData: ethers.solidityPacked(['address', 'uint256', 'uint256'], [await chainlink.getAddress(), await daiOracle.getAddress(), '990000000']), // maker offset is 0.99
                takingAmountData: ethers.solidityPacked(['address', 'uint256', 'uint256'], [await chainlink.getAddress(), await daiOracle.getAddress(), '1010000000']), // taker offset is 1.01
            },
        );

        const signature = await signOrder(order, chainId, await swap.getAddress(), addr1);
        const { r, vs } = await compactSignature(signature);
        // taking threshold = 4000 + 1% + eps
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
            minReturn: ether('4040.01'),
        });
        const fillTx = swap.fillOrderArgs(order, r, vs, ether('1'), takerTraits.traits, takerTraits.args);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [ether('-4040'), ether('4040')]);
        await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [ether('1'), ether('-1')]);
    });

    it('dai -> 1inch stop loss order', async function () {
        const { dai, inch, swap, chainId, chainlink, daiOracle, inchOracle } = await loadFixture(deployContractsAndInit);

        const makingAmount = ether('100');
        const takingAmount = ether('631');
        const priceCall = swap.interface.encodeFunctionData('arbitraryStaticCall', [
            await chainlink.getAddress(),
            chainlink.interface.encodeFunctionData('doublePrice', [await inchOracle.getAddress(), await daiOracle.getAddress(), '1000000000', '0', ether('1')]),
        ]);

        const order = buildOrder(
            {
                makerAsset: await inch.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount,
                takingAmount,
                maker: addr1.address,
            }, {
                predicate: swap.interface.encodeFunctionData('lt', [ether('6.32'), priceCall]),
            },
        );
        const signature = await signOrder(order, chainId, await swap.getAddress(), addr1);
        const { r, vs } = await compactSignature(signature);
        // taking threshold = exact taker amount + eps
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
            minReturn: takingAmount + ether('0.01'),
        });
        const fillTx = swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [-takingAmount, takingAmount]);
        await expect(fillTx).to.changeTokenBalances(inch, [addr, addr1], [makingAmount, -makingAmount]);
    });

    it('dai -> 1inch stop loss order predicate is invalid', async function () {
        const { dai, inch, swap, chainId, chainlink, daiOracle, inchOracle } = await loadFixture(deployContractsAndInit);

        const makingAmount = ether('100');
        const takingAmount = ether('631');
        const priceCall = chainlink.interface.encodeFunctionData('doublePrice', [await inchOracle.getAddress(), await daiOracle.getAddress(), '1000000000', '0', ether('1')]);

        const order = buildOrder(
            {
                makerAsset: await inch.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount,
                takingAmount,
                maker: addr1.address,
            },
            {
                predicate: swap.interface.encodeFunctionData('lt', [ether('6.31'), priceCall]),
            },
        );
        const signature = await signOrder(order, chainId, await swap.getAddress(), addr1);
        const { r, vs } = await compactSignature(signature);
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
            minReturn: takingAmount + ether('0.01'),
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
            await daiOracle.getAddress(),
            daiOracle.interface.encodeFunctionData('latestAnswer'),
        ]);

        const order = buildOrder(
            {
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount,
                takingAmount,
                maker: addr1.address,
            },
            {
                predicate: swap.interface.encodeFunctionData('lt', [ether('0.0002501'), latestAnswerCall]),
            },
        );
        const signature = await signOrder(order, chainId, await swap.getAddress(), addr1);
        const { r, vs } = await compactSignature(signature);
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
            minReturn: takingAmount,
        });
        const fillTx = swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [-takingAmount, takingAmount]);
        await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [makingAmount, -makingAmount]);
    });
});
