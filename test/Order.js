const { expect, profileEVM, gasspectEVM } = require('@1inch/solidity-utils');
const { signOrder, buildOrderRFQ, buildConstraints, compactSignature, makeMakingAmount } = require('./helpers/orderUtils');
const { ether } = require('./helpers/utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');

describe('LimitOrderProtocol', function () {
    let addr, addr1;

    async function initContracts (dai, weth, swap) {
        await dai.mint(addr1.address, ether('1000000000000'));
        await weth.mint(addr1.address, ether('1000000000000'));
        await dai.mint(addr.address, ether('1000000000000'));
        await weth.mint(addr.address, ether('1000000000000'));
        await dai.approve(swap.address, ether('1000000000000'));
        await weth.approve(swap.address, ether('1000000000000'));
        await dai.connect(addr1).approve(swap.address, ether('1000000000000'));
        await weth.connect(addr1).approve(swap.address, ether('1000000000000'));
    };

    const deployContractsAndInit = async function () {
        const { dai, weth, swap, chainId } = await deploySwapTokens();
        await initContracts(dai, weth, swap);
        return { dai, weth, swap, chainId };
    };

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
        const { dai, weth, swap } = await deploySwapTokens();
        await initContracts(dai, weth, swap);
    });

    describe('RFQ', function () {
        it('should swap fully based on RFQ signature', async function () {
            // Order: 1 DAI => 1 WETH
            // Swap:  1 DAI => 1 WETH
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            for (const nonce of [1, 2, 3]) {
                const order = buildOrderRFQ({
                    maker: addr1.address,
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    constraints: buildConstraints({ nonce }),
                });
                const signature = await signOrder(order, chainId, swap.address, addr1);

                const makerDai = await dai.balanceOf(addr1.address);
                const takerDai = await dai.balanceOf(addr.address);
                const makerWeth = await weth.balanceOf(addr1.address);
                const takerWeth = await weth.balanceOf(addr.address);

                const { r, vs } = compactSignature(signature);
                const receipt = await swap.fillOrderRFQ(order, r, vs, 1, makeMakingAmount(1));

                expect(
                    await profileEVM(ethers.provider, receipt.hash, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE']),
                ).to.be.deep.equal([2, 1, 7, 7, 0]);

                console.log(await gasspectEVM(ethers.provider, receipt.hash));

                expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
                expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
                expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
                expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
            }
        });
    });
});
