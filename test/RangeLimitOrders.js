const { ethers } = require('hardhat');
const { parseUnits } = require('ethers/lib/utils.js');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect, trim0x } = require('@1inch/solidity-utils');
const { fillWithMakingAmount, buildMakerTraits, buildOrder, signOrder, compactSignature } = require('./helpers/orderUtils');
const { cutLastArg, ether } = require('./helpers/utils');
const { deploySwapTokens, deployRangeAmountCalculator } = require('./helpers/fixtures');

describe('RangeLimitOrders', function () {
    const deployContractsAndInit = async function () {
        const [taker, maker] = await ethers.getSigners();

        const { dai, weth, usdc, swap, chainId } = await deploySwapTokens();
        const { rangeAmountCalculator } = await deployRangeAmountCalculator();

        await initContracts(taker, maker, dai, weth, usdc, swap);
        const contracts = { swap, rangeAmountCalculator };
        const tokens = { weth, dai, usdc };

        for (const token of Object.values(tokens)) {
            const metadata = ('decimals' in token) ? token : await ethers.getContractAt('IERC20Metadata', token.address);
            const tokenDecimals = await metadata.decimals();
            token.parseAmount = (value) => parseUnits(value, tokenDecimals);
        }

        return { taker, maker, tokens, contracts, chainId };
    };

    async function initContracts (taker, maker, dai, weth, usdc, swap) {
        const e6 = (value) => ether(value).div(1000000000000n);

        await dai.mint(maker.address, ether('1000000'));
        await dai.mint(taker.address, ether('1000000'));
        await weth.deposit({ value: ether('100') });
        await weth.connect(maker).deposit({ value: ether('100') });
        await dai.approve(swap.address, ether('1000000'));
        await dai.connect(maker).approve(swap.address, ether('1000000'));
        await weth.approve(swap.address, ether('100'));
        await weth.connect(maker).approve(swap.address, ether('100'));
        await usdc.mint(maker.address, e6('1000000000000'));
        await usdc.mint(taker.address, e6('1000000000000'));
        await usdc.approve(swap.address, e6('1000000000000'));
        await usdc.connect(maker).approve(swap.address, e6('1000000000000'));
    };

    async function createOrder ({
        makerAsset,
        takerAsset,
        maker,
        swap,
        rangeAmountCalculator,
        chainId,
    }) {
        // Order: 10 makerAsset -> 35000 takerAsset with price range: 3000 -> 4000 takerAsset
        const makingAmount = makerAsset.parseAmount('10');
        const takingAmount = takerAsset.parseAmount('35000');
        const startPrice = takerAsset.parseAmount('3000');
        const endPrice = takerAsset.parseAmount('4000');
        const order = buildOrder({
            makerAsset: makerAsset.address,
            takerAsset: takerAsset.address,
            makingAmount,
            takingAmount,
            maker: maker.address,
            makerTraits: buildMakerTraits({ allowMultipleFills: true }),
        }, {
            makingAmountGetter: rangeAmountCalculator.address + trim0x(cutLastArg(cutLastArg(
                rangeAmountCalculator.interface.encodeFunctionData('getRangeMakerAmount', [startPrice, endPrice, makingAmount, 0, 0], 64),
            ))),
            takingAmountGetter: rangeAmountCalculator.address + trim0x(cutLastArg(cutLastArg(
                rangeAmountCalculator.interface.encodeFunctionData('getRangeTakerAmount', [startPrice, endPrice, makingAmount, 0, 0], 64),
            ))),
        });
        const signature = await signOrder(order, chainId, swap.address, maker);
        const { r, vs } = compactSignature(signature);
        return { order, r, vs, startPrice, endPrice, makingAmount, takingAmount };
    }

    async function fillByTakerAsset ({
        maker,
        taker,
        makerAsset,
        takerAsset,
        fillParams = {
            firstFill: { makingAmount: '0', takingAmount: '0', thresholdAmount: '0' },
            secondFill: { makingAmount: '0', takingAmount: '0', thresholdAmount: '0' },
        },
        swap,
        rangeAmountCalculator,
        chainId,
    }) {
        if (!maker || !makerAsset || !takerAsset || !swap || !rangeAmountCalculator || !chainId) {
            throw Error('There is no necessary param');
        }
        const { order, r, vs, startPrice, endPrice, makingAmount } = await createOrder({ makerAsset, takerAsset, maker, swap, rangeAmountCalculator, chainId });

        // first fill order
        let fillOrder = swap.fillOrderExt(
            order,
            r,
            vs,
            takerAsset.parseAmount(fillParams.firstFill.takingAmount),
            makerAsset.parseAmount(fillParams.firstFill.thresholdAmount),
            order.extension,
        );
        const rangeAmount1 = await rangeAmountCalculator.getRangeMakerAmount(
            startPrice,
            endPrice,
            makingAmount,
            takerAsset.parseAmount(fillParams.firstFill.takingAmount),
            makingAmount,
        );
        await expect(fillOrder)
            .to.changeTokenBalances(takerAsset, [maker.address, taker.address], [
                takerAsset.parseAmount(fillParams.firstFill.takingAmount),
                -BigInt(takerAsset.parseAmount(fillParams.firstFill.takingAmount)),
            ])
            .to.changeTokenBalances(makerAsset, [maker.address, taker.address], [
                -BigInt(rangeAmount1),
                rangeAmount1,
            ]);

        // second fill order
        fillOrder = swap.fillOrderExt(
            order,
            r,
            vs,
            takerAsset.parseAmount(fillParams.secondFill.takingAmount),
            makerAsset.parseAmount(fillParams.secondFill.thresholdAmount),
            order.extension,
        );
        const rangeAmount2 = await rangeAmountCalculator.getRangeMakerAmount(
            startPrice,
            endPrice,
            makingAmount,
            takerAsset.parseAmount(fillParams.secondFill.takingAmount),
            makingAmount.sub(rangeAmount1),
        );
        await expect(fillOrder)
            .to.changeTokenBalances(takerAsset, [maker.address, taker.address], [
                takerAsset.parseAmount(fillParams.secondFill.takingAmount),
                -BigInt(takerAsset.parseAmount(fillParams.secondFill.takingAmount)),
            ])
            .to.changeTokenBalances(makerAsset, [maker.address, taker.address], [
                -BigInt(rangeAmount2),
                rangeAmount2,
            ]);
    };

    async function fillByMakerAsset ({
        maker,
        taker,
        makerAsset,
        takerAsset,
        fillParams = {
            firstFill: { makingAmount: '0', takingAmount: '0', thresholdAmount: '0' },
            secondFill: { makingAmount: '0', takingAmount: '0', thresholdAmount: '0' },
        },
        swap,
        rangeAmountCalculator,
        chainId,
    }) {
        if (!maker || !makerAsset || !takerAsset || !swap || !rangeAmountCalculator || !chainId) {
            throw Error('There is no necessary param');
        }
        const { order, r, vs, startPrice, endPrice, makingAmount } = await createOrder({ makerAsset, takerAsset, maker, swap, rangeAmountCalculator, chainId });

        // first fill order
        let fillOrder = swap.fillOrderExt(
            order,
            r,
            vs,
            makerAsset.parseAmount(fillParams.firstFill.makingAmount),
            fillWithMakingAmount(takerAsset.parseAmount(fillParams.firstFill.thresholdAmount)),
            order.extension,
        );
        const rangeAmount1 = await rangeAmountCalculator.getRangeTakerAmount(
            startPrice,
            endPrice,
            makingAmount,
            makerAsset.parseAmount(fillParams.firstFill.makingAmount),
            makingAmount,
        );
        await expect(fillOrder)
            .to.changeTokenBalances(takerAsset, [maker.address, taker.address], [
                rangeAmount1,
                -BigInt(rangeAmount1),
            ])
            .to.changeTokenBalances(makerAsset, [maker.address, taker.address], [
                -BigInt(makerAsset.parseAmount(fillParams.firstFill.makingAmount)),
                makerAsset.parseAmount(fillParams.firstFill.makingAmount),
            ]);

        // second fill order
        fillOrder = swap.fillOrderExt(
            order,
            r,
            vs,
            makerAsset.parseAmount(fillParams.secondFill.makingAmount),
            fillWithMakingAmount(takerAsset.parseAmount(fillParams.secondFill.thresholdAmount)),
            order.extension,
        );
        const rangeAmount2 = await rangeAmountCalculator.getRangeMakerAmount(
            startPrice,
            endPrice,
            makingAmount,
            makerAsset.parseAmount(fillParams.secondFill.makingAmount),
            makingAmount.sub(makerAsset.parseAmount(fillParams.firstFill.makingAmount)),
        );
        await expect(fillOrder)
            .to.changeTokenBalances(takerAsset, [maker.address, taker.address], [
                rangeAmount2,
                -BigInt(rangeAmount2),
            ])
            .to.changeTokenBalances(makerAsset, [maker.address, taker.address], [
                -BigInt(makerAsset.parseAmount(fillParams.secondFill.makingAmount)),
                makerAsset.parseAmount(fillParams.secondFill.makingAmount),
            ]);
    };

    it('Fill range limit-order by maker asset', async function () {
        const { taker, maker, tokens, contracts, chainId } = await loadFixture(deployContractsAndInit);
        await fillByMakerAsset({
            makerAsset: tokens.weth,
            takerAsset: tokens.dai,
            fillParams: {
                firstFill: { makingAmount: '2', takingAmount: '0', thresholdAmount: '6200' },
                secondFill: { makingAmount: '2', takingAmount: '0', thresholdAmount: '6600' },
            },
            maker,
            taker,
            swap: contracts.swap,
            rangeAmountCalculator: contracts.rangeAmountCalculator,
            chainId,
        });
    });

    it('Fill range limit-order by maker asset when taker asset has different decimals', async function () {
        const { taker, maker, tokens, contracts, chainId } = await loadFixture(deployContractsAndInit);
        await fillByMakerAsset({
            makerAsset: tokens.weth,
            takerAsset: tokens.usdc,
            fillParams: {
                firstFill: { makingAmount: '2', takingAmount: '0', thresholdAmount: '6200' },
                secondFill: { makingAmount: '2', takingAmount: '0', thresholdAmount: '6600' },
            },
            maker,
            taker,
            swap: contracts.swap,
            rangeAmountCalculator: contracts.rangeAmountCalculator,
            chainId,
        });
    });

    it('Fill range limit-order by taker asset', async function () {
        const { taker, maker, tokens, contracts, chainId } = await loadFixture(deployContractsAndInit);
        await fillByTakerAsset({
            makerAsset: tokens.weth,
            takerAsset: tokens.dai,
            fillParams: {
                firstFill: { makingAmount: '0', takingAmount: '6200', thresholdAmount: '2' },
                secondFill: { makingAmount: '0', takingAmount: '6600', thresholdAmount: '2' },
            },
            maker,
            taker,
            swap: contracts.swap,
            rangeAmountCalculator: contracts.rangeAmountCalculator,
            chainId,
        });
    });

    it('Fill range limit-order by taker asset when taker asset has different decimals', async function () {
        const { taker, maker, tokens, contracts, chainId } = await loadFixture(deployContractsAndInit);
        await fillByTakerAsset({
            makerAsset: tokens.weth,
            takerAsset: tokens.usdc,
            fillParams: {
                firstFill: { makingAmount: '0', takingAmount: '6200', thresholdAmount: '2' },
                secondFill: { makingAmount: '0', takingAmount: '6600', thresholdAmount: '2' },
            },
            maker,
            taker,
            swap: contracts.swap,
            rangeAmountCalculator: contracts.rangeAmountCalculator,
            chainId,
        });
    });
});
