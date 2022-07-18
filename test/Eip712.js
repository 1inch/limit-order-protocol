const { constants } = require('@1inch/solidity-utils');
const { domainSeparator } = require('./helpers/eip712');
const { name, version } = require('./helpers/orderUtils');

const TokenMock = artifacts.require('TokenMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');

describe('LimitOrderProtocol', async () => {
    before(async () => {
        this.chainId = await web3.eth.getChainId();
    });

    beforeEach(async () => {
        this.dai = await TokenMock.new('DAI', 'DAI');
        this.swap = await LimitOrderProtocol.new(constants.ZERO_ADDRESS);
    });

    it('domain separator', async () => {
        expect(
            await this.swap.DOMAIN_SEPARATOR(),
        ).to.equal(
            await domainSeparator(name, version, this.chainId, this.swap.address),
        );
    });
});
