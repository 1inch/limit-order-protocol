const { domainSeparator } = require('./helpers/eip712');
const { name, version } = require('./helpers/orderUtils');

const TokenMock = artifacts.require('TokenMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');

describe('LimitOrderProtocol', async function () {
    before(async function () {
        this.chainId = await web3.eth.getChainId();
    });

    beforeEach(async function () {
        this.dai = await TokenMock.new('DAI', 'DAI');
        this.swap = await LimitOrderProtocol.new();
    });

    it('domain separator', async function () {
        expect(
            await this.swap.DOMAIN_SEPARATOR(),
        ).to.equal(
            await domainSeparator(name, version, this.chainId, this.swap.address),
        );
    });
});
