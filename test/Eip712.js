const { expect } = require('chai');
const { domainSeparator } = require('./helpers/eip712');
const { name, version } = require('./helpers/orderUtils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');

describe('LimitOrderProtocol', function () {
    it('domain separator', async function () {
        const { swap, chainId } = await loadFixture(deploySwapTokens);
        expect(
            await swap.DOMAIN_SEPARATOR(),
        ).to.equal(
            domainSeparator(name, version, chainId, await swap.getAddress()),
        );
    });
});
