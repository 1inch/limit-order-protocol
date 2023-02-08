const { expect } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySeriesNonceManager } = require('./helpers/fixtures');

describe('SeriesNonceManager', function () {
    let addr;

    before(async function () {
        [addr] = await ethers.getSigners();
    });

    it('Get nonce - should return zero by default', async function () {
        const { seriesNonceManager } = await loadFixture(deploySeriesNonceManager);
        const series = 0;
        const nonce = await seriesNonceManager.nonce(addr.address, series);
        expect(nonce).to.equal(0);
    });

    it('Advance nonce - should add to nonce specified amount', async function () {
        const { seriesNonceManager } = await loadFixture(deploySeriesNonceManager);
        const series0 = 0;
        const series1 = 1;
        await seriesNonceManager.advanceNonce(series0, 2);
        const nonceSeries0 = await seriesNonceManager.nonce(addr.address, series0);
        const nonceSeries1 = await seriesNonceManager.nonce(addr.address, series1);
        expect(nonceSeries0).to.equal(2);
        expect(nonceSeries1).to.equal(0);
    });

    it('Advance nonce - should not advance by 256', async function () {
        const { seriesNonceManager } = await loadFixture(deploySeriesNonceManager);
        await expect(seriesNonceManager.advanceNonce(0, 256)).to.be.revertedWithCustomError(seriesNonceManager, 'AdvanceNonceFailed');
    });

    it('Increase nonce - should add to nonce only 1', async function () {
        const { seriesNonceManager } = await loadFixture(deploySeriesNonceManager);
        const series = 0;
        await seriesNonceManager.increaseNonce(series);
        expect(await seriesNonceManager.nonce(addr.address, series)).to.equal(1);
    });

    it('Nonce equals - should return false when nonce does not match', async function () {
        const { seriesNonceManager } = await loadFixture(deploySeriesNonceManager);
        const series = 4;
        expect(await seriesNonceManager.nonceEquals(addr.address, series, 1)).to.be.false;
    });

    it('Nonce equals - should return true when nonce matches', async function () {
        const { seriesNonceManager } = await loadFixture(deploySeriesNonceManager);
        const series = 4;
        await seriesNonceManager.increaseNonce(series);
        expect(await seriesNonceManager.nonceEquals(addr.address, series, 1)).to.be.true;
    });
});
