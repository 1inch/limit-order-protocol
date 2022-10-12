const { domainSeparator } = require('./helpers/eip712');
const { name, version } = require('./helpers/orderUtils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');

describe('LimitOrderProtocol', async () => {
    it('domain separator', async () => {
        const { swap, chainId } = await loadFixture(deploySwapTokens);
        expect(
            await swap.DOMAIN_SEPARATOR(),
        ).to.equal(
            await domainSeparator(name, version, chainId, swap.address),
        );
    });
});
