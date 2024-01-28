const { expect } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySeriesEpochManager } = require('./helpers/fixtures');

describe('SeriesEpochManager', function () {
    let addr;

    before(async function () {
        [addr] = await ethers.getSigners();
    });

    it('Get nonce - should return zero by default', async function () {
        const { seriesEpochManager } = await loadFixture(deploySeriesEpochManager);
        const series = 0;
        const nonce = await seriesEpochManager.epoch(addr, series);
        expect(nonce).to.equal(0);
    });

    it('Advance nonce - should add to nonce specified amount', async function () {
        const { seriesEpochManager } = await loadFixture(deploySeriesEpochManager);
        const series0 = 0;
        const series1 = 1;
        await seriesEpochManager.advanceEpoch(series0, 2);
        const nonceSeries0 = await seriesEpochManager.epoch(addr, series0);
        const nonceSeries1 = await seriesEpochManager.epoch(addr, series1);
        expect(nonceSeries0).to.equal(2);
        expect(nonceSeries1).to.equal(0);
    });

    it('Advance nonce - should not advance by 256', async function () {
        const { seriesEpochManager } = await loadFixture(deploySeriesEpochManager);
        await expect(seriesEpochManager.advanceEpoch(0, 256)).to.be.revertedWithCustomError(seriesEpochManager, 'AdvanceEpochFailed');
    });

    it('Increase nonce - should add to nonce only 1', async function () {
        const { seriesEpochManager } = await loadFixture(deploySeriesEpochManager);
        const series = 0;
        await seriesEpochManager.increaseEpoch(series);
        expect(await seriesEpochManager.epoch(addr, series)).to.equal(1);
    });

    it('Nonce equals - should return false when nonce does not match', async function () {
        const { seriesEpochManager } = await loadFixture(deploySeriesEpochManager);
        const series = 4;
        expect(await seriesEpochManager.epochEquals(addr, series, 1)).to.be.false;
    });

    it('Nonce equals - should return true when nonce matches', async function () {
        const { seriesEpochManager } = await loadFixture(deploySeriesEpochManager);
        const series = 4;
        await seriesEpochManager.increaseEpoch(series);
        expect(await seriesEpochManager.epochEquals(addr, series, 1)).to.be.true;
    });
});
