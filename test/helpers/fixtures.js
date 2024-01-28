const { constants } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');

async function deploySwapTokens () {
    const TokenMock = await ethers.getContractFactory('TokenMock');
    const dai = await TokenMock.deploy('DAI', 'DAI');
    await dai.waitForDeployment();
    const WrappedTokenMock = await ethers.getContractFactory('WrappedTokenMock');
    const weth = await WrappedTokenMock.deploy('WETH', 'WETH');
    await weth.waitForDeployment();
    const inch = await TokenMock.deploy('1INCH', '1INCH');
    await inch.waitForDeployment();
    const LimitOrderProtocol = await ethers.getContractFactory('LimitOrderProtocol');
    const swap = await LimitOrderProtocol.deploy(weth);
    await swap.waitForDeployment();
    const TokenCustomDecimalsMock = await ethers.getContractFactory('TokenCustomDecimalsMock');
    const usdc = await TokenCustomDecimalsMock.deploy('USDC', 'USDC', '0', 6);
    await usdc.waitForDeployment();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    return { dai, weth, inch, swap, chainId, usdc };
};

async function deploySwap () {
    const LimitOrderProtocol = await ethers.getContractFactory('LimitOrderProtocol');
    const swap = await LimitOrderProtocol.deploy(constants.ZERO_ADDRESS);
    await swap.waitForDeployment();
    return { swap };
};

async function deployUSDC () {
    const TokenMock = await ethers.getContractFactory('TokenMock');
    const usdc = await TokenMock.deploy('USDC', 'USDC');
    await usdc.waitForDeployment();
    return { usdc };
};

async function deployArbitraryPredicate () {
    const ArbitraryPredicateMock = await ethers.getContractFactory('ArbitraryPredicateMock');
    const arbitraryPredicate = await ArbitraryPredicateMock.deploy();
    await arbitraryPredicate.waitForDeployment();
    return { arbitraryPredicate };
};

async function deployUSDT () {
    const TokenMock = await ethers.getContractFactory('TokenMock');
    const usdt = await TokenMock.deploy('USDT', 'USDT');
    await usdt.waitForDeployment();
    return { usdt };
};

async function deploySeriesEpochManager () {
    const SeriesEpochManager = await ethers.getContractFactory('SeriesEpochManager');
    const seriesEpochManager = await SeriesEpochManager.deploy();
    await seriesEpochManager.waitForDeployment();
    return { seriesEpochManager };
};

async function deployRangeAmountCalculator () {
    const RangeAmountCalculator = await ethers.getContractFactory('RangeAmountCalculator');
    const rangeAmountCalculator = await RangeAmountCalculator.deploy();
    await rangeAmountCalculator.waitForDeployment();
    return { rangeAmountCalculator };
};

module.exports = {
    deploySwapTokens,
    deploySeriesEpochManager,
    deployRangeAmountCalculator,
    deployUSDT,
    deployUSDC,
    deployArbitraryPredicate,
    deploySwap,
};
