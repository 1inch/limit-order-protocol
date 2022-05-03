const NonceManager = artifacts.require('NonceManager');

describe('NonceManager', async function () {
    let currentAddress;

    beforeEach(async function () {
        this.nonceManager = await NonceManager.new();
    });

    before(async function () {
        [currentAddress] = await web3.eth.getAccounts();
    });

    it('Get nonce - should return zero by default', async function () {
        const nonce = (await this.nonceManager.nonce(currentAddress)).toNumber();
        expect(nonce).to.equal(0);
    });

    it('Advance nonce - should add to nonce specified amount', async function () {
        await this.nonceManager.advanceNonce(5);
        const nonce = (await this.nonceManager.nonce(currentAddress)).toNumber();
        expect(nonce).to.equal(5);
    });

    it('Increase nonce - should add to nonce only 1', async function () {
        await this.nonceManager.increaseNonce();
        const nonce = (await this.nonceManager.nonce(currentAddress)).toNumber();
        expect(nonce).to.equal(1);
    });

    it('Nonce equals - should return false when nonce does not match', async function () {
        const isEquals = await this.nonceManager.nonceEquals(currentAddress, 1);
        expect(isEquals).to.equal(false);
    });

    it('Nonce equals - should return true when nonce matches', async function () {

        await this.nonceManager.advanceNonce(4);
        const isEquals = await this.nonceManager.nonceEquals(currentAddress, 4);
        expect(isEquals).to.equal(true);
    });
});
