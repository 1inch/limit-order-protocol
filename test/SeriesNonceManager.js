const { expect } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySeriesNonceManager } = require('./helpers/fixtures');

describe('SeriesNonceManager', function () {
    let addr;

    before(async function () {
        [addr] = await ethers.getSigners();
    });

    it('Get nonce - should return zero by default', async () => {
        const { seriesNonceManager } = await loadFixture(deploySeriesNonceManager);
        const series = 0;
        const nonce = await seriesNonceManager.nonce(series, addr.address);
        expect(nonce).to.equal(0);
    });

    it('Advance nonce - should add to nonce specified amount', async () => {
        const { seriesNonceManager } = await loadFixture(deploySeriesNonceManager);
        const series = 0;
        await seriesNonceManager.advanceNonce(series, 2);
        const nonceSeries0 = await seriesNonceManager.nonce(series, addr.address);
        const nonceSeries1 = await seriesNonceManager.nonce(1, addr.address);
        expect(nonceSeries0).to.equal(2);
        expect(nonceSeries1).to.equal(0);
    });

    it('Advance nonce - should not advance by 256', async () => {
        const { seriesNonceManager } = await loadFixture(deploySeriesNonceManager);
        await expect(seriesNonceManager.advanceNonce(0, 256)).to.be.revertedWithCustomError(seriesNonceManager, 'AdvanceNonceFailed');
    });

    it('Increase nonce - should add to nonce only 1', async () => {
        const { seriesNonceManager } = await loadFixture(deploySeriesNonceManager);
        const series = 0;
        await seriesNonceManager.increaseNonce(series);
        const nonce = await seriesNonceManager.nonce(series, addr.address);
        expect(nonce).to.equal(1);
    });

    it('Nonce equals - should return false when nonce does not match', async () => {
        const { seriesNonceManager } = await loadFixture(deploySeriesNonceManager);
        const series = 4;
        const isEquals = await seriesNonceManager.nonceEquals(series, addr.address, 1);
        expect(isEquals).to.equal(false);
    });

    it('Nonce equals - should return true when nonce matches', async () => {
        const { seriesNonceManager } = await loadFixture(deploySeriesNonceManager);
        const series = 4;
        await seriesNonceManager.increaseNonce(series);
        const isEquals = await seriesNonceManager.nonceEquals(series, addr.address, 1);
        expect(isEquals).to.equal(true);
    });
});
