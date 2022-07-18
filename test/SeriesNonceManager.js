const { addr0Wallet } = require('./helpers/utils');

const SeriesNonceManager = artifacts.require('SeriesNonceManager');

describe('SeriesNonceManager', async () => {
    const addr0 = addr0Wallet.getAddressString();

    beforeEach(async () => {
        this.seriesNonceManager = await SeriesNonceManager.new();
    });

    it('Get nonce - should return zero by default', async () => {
        const series = 0;

        const nonce = (await this.seriesNonceManager.nonce(series, addr0)).toNumber();

        expect(nonce).to.equal(0);
    });

    it('Advance nonce - should add to nonce specified amount', async () => {
        const series = 0;

        await this.seriesNonceManager.advanceNonce(series, 2);

        const nonceSeries0 = (await this.seriesNonceManager.nonce(series, addr0)).toNumber();
        const nonceSeries1 = (await this.seriesNonceManager.nonce(1, addr0)).toNumber();

        expect(nonceSeries0).to.equal(2);
        expect(nonceSeries1).to.equal(0);
    });

    it('Increase nonce - should add to nonce only 1', async () => {
        const series = 0;

        await this.seriesNonceManager.increaseNonce(series);

        const nonce = (await this.seriesNonceManager.nonce(series, addr0)).toNumber();

        expect(nonce).to.equal(1);
    });

    it('Nonce equals - should return false when nonce does not match', async () => {
        const series = 4;

        const isEquals = await this.seriesNonceManager.nonceEquals(series, addr0, 1);

        expect(isEquals).to.equal(false);
    });

    it('Nonce equals - should return true when nonce matches', async () => {
        const series = 4;

        await this.seriesNonceManager.increaseNonce(series);

        const isEquals = await this.seriesNonceManager.nonceEquals(series, addr0, 1);

        expect(isEquals).to.equal(true);
    });
});
