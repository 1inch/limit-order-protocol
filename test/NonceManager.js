const { expect } = require('@1inch/solidity-utils');
const { addr0Wallet } = require('./helpers/utils');

const NonceManager = artifacts.require('NonceManager');

describe('NonceManager', async () => {
    const addr0 = addr0Wallet.getAddressString();

    beforeEach(async () => {
        this.nonceManager = await NonceManager.new();
    });

    it('Get nonce - should return zero by default', async () => {
        const nonce = (await this.nonceManager.nonce(addr0)).toNumber();
        expect(nonce).to.equal(0);
    });

    it('Advance nonce - should add to nonce specified amount', async () => {
        await this.nonceManager.advanceNonce(5);
        const nonce = (await this.nonceManager.nonce(addr0)).toNumber();
        expect(nonce).to.equal(5);
    });

    it('Advance nonce - should not advance by 256', async () => {
        await expect(this.nonceManager.advanceNonce(256)).to.eventually.be.rejectedWith('AdvanceNonceFailed()');
    });

    it('Increase nonce - should add to nonce only 1', async () => {
        await this.nonceManager.increaseNonce();
        const nonce = (await this.nonceManager.nonce(addr0)).toNumber();
        expect(nonce).to.equal(1);
    });

    it('Nonce equals - should return false when nonce does not match', async () => {
        const isEquals = await this.nonceManager.nonceEquals(addr0, 1);
        expect(isEquals).to.equal(false);
    });

    it('Nonce equals - should return true when nonce matches', async () => {
        await this.nonceManager.advanceNonce(4);
        const isEquals = await this.nonceManager.nonceEquals(addr0, 4);
        expect(isEquals).to.equal(true);
    });
});
