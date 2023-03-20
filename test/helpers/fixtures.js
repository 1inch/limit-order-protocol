const { constants } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');

async function deploySwapTokens () {
    const TokenMock = await ethers.getContractFactory('TokenMock');
    const dai = await TokenMock.deploy('DAI', 'DAI');
    await dai.deployed();
    const WrappedTokenMock = await ethers.getContractFactory('WrappedTokenMock');
    const weth = await WrappedTokenMock.deploy('WETH', 'WETH');
    await weth.deployed();
    const inch = await TokenMock.deploy('1INCH', '1INCH');
    await inch.deployed();
    const LimitOrderProtocol = await ethers.getContractFactory('LimitOrderProtocol');
    const swap = await LimitOrderProtocol.deploy(weth.address);
    await swap.deployed();
    const TokenCustomDecimalsMock = await ethers.getContractFactory('TokenCustomDecimalsMock');
    const usdc = await TokenCustomDecimalsMock.deploy('USDC', 'USDC', '0', 6);
    await usdc.deployed();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    return { dai, weth, inch, swap, chainId, usdc };
};

async function deploySwap () {
    const LimitOrderProtocol = await ethers.getContractFactory('LimitOrderProtocol');
    const swap = await LimitOrderProtocol.deploy(constants.ZERO_ADDRESS);
    await swap.deployed();
    return { swap };
};

async function deployUSDC () {
    const TokenMock = await ethers.getContractFactory('TokenMock');
    const usdc = await TokenMock.deploy('USDC', 'USDC');
    await usdc.deployed();
    return { usdc };
};

async function deployUSDT () {
    const TokenMock = await ethers.getContractFactory('TokenMock');
    const usdt = await TokenMock.deploy('USDT', 'USDT');
    await usdt.deployed();
    return { usdt };
};

async function deploySeriesEpochManager () {
    const SeriesEpochManager = await ethers.getContractFactory('SeriesEpochManager');
    const seriesNonceManager = await SeriesEpochManager.deploy();
    await seriesNonceManager.deployed();
    return { seriesNonceManager };
};

async function deployRangeAmountCalculator () {
    const RangeAmountCalculator = await ethers.getContractFactory('RangeAmountCalculator');
    const rangeAmountCalculator = await RangeAmountCalculator.deploy();
    await rangeAmountCalculator.deployed();
    return { rangeAmountCalculator };
};

module.exports = {
    deploySwapTokens,
    deploySeriesEpochManager,
    deployRangeAmountCalculator,
    deployUSDT,
    deployUSDC,
    deploySwap,
};
