const { domainSeparator } = require('./helpers/eip712');
const { name, version } = require('./helpers/orderUtils');

const TokenMock = artifacts.require('TokenMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');

contract('LimitOrderProtocol', async function () {
    beforeEach(async function () {
        this.dai = await TokenMock.new('DAI', 'DAI');
        this.swap = await LimitOrderProtocol.new();

        // We get the chain id from the contract because Ganache (used for coverage) does not return the same chain id
        // from within the EVM as from the JSON RPC interface.
        // See https://github.com/trufflesuite/ganache-core/issues/515
        this.chainId = await this.dai.getChainId();
    });

    it('domain separator', async function () {
        expect(
            await this.swap.DOMAIN_SEPARATOR(),
        ).to.equal(
            await domainSeparator(name, version, this.chainId, this.swap.address),
        );
    });
});
