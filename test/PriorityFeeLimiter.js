const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ether } = require('./helpers/utils');
const { signOrder, buildOrder, buildTakerTraits } = require('./helpers/orderUtils');
const { deploySwapTokens } = require('./helpers/fixtures');
const hre = require('hardhat');
const { ethers, network } = hre;

describe('PriorityFeeLimiter', function () {
    let addr, addr1;

    before(async function () {
        if (hre.__SOLIDITY_COVERAGE_RUNNING) { this.skip(); }
        [addr, addr1] = await ethers.getSigners();
    });

    async function deployContractsAndInit () {
        const { dai, weth, swap, chainId } = await deploySwapTokens();

        await dai.mint(addr, ether('2000'));
        await weth.connect(addr1).deposit({ value: ether('1') });

        await dai.approve(swap, ether('2000'));
        await weth.connect(addr1).approve(swap, ether('1'));

        const PriorityFeeLimiter = await ethers.getContractFactory('PriorityFeeLimiter');
        const priorityFeeLimiter = await PriorityFeeLimiter.deploy();
        await priorityFeeLimiter.waitForDeployment();

        const order = buildOrder(
            {
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('2000'),
                maker: addr1.address,
            },
            {
                predicate: swap.interface.encodeFunctionData('arbitraryStaticCall', [
                    await priorityFeeLimiter.getAddress(),
                    priorityFeeLimiter.interface.encodeFunctionData('isPriorityFeeValid'),
                ]),
            },
        );
        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
            threshold: order.takingAmount,
        });

        return { dai, weth, swap, order, r, vs, takerTraits };
    };

    it('8 gwei base, 4 gwei priority should work', async function () {
        const { swap, order, r, vs, takerTraits } = await loadFixture(deployContractsAndInit);

        await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x1dcd65000']); // 8 gwei

        await swap.fillOrderArgs(order, r, vs, order.makingAmount, takerTraits.traits, takerTraits.args, { maxPriorityFeePerGas: 4000000000 });
    });

    it('8 gwei base, 6 gwei priority should not work', async function () {
        const { swap, order, r, vs, takerTraits } = await loadFixture(deployContractsAndInit);

        await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x1dcd65000']); // 8 gwei

        const fillTx = swap.fillOrderArgs(order, r, vs, order.makingAmount, takerTraits.traits, takerTraits.args, { maxPriorityFeePerGas: 6000000000 });
        await expect(fillTx).to.revertedWithCustomError(swap, 'PredicateIsNotTrue');
    });

    it('50 gwei base, 25 gwei priority should work', async function () {
        const { swap, order, r, vs, takerTraits } = await loadFixture(deployContractsAndInit);

        await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0xba43b7400']); // 50 gwei

        await swap.fillOrderArgs(order, r, vs, order.makingAmount, takerTraits.traits, takerTraits.args, { maxPriorityFeePerGas: 25000000000 });
    });

    it('50 gwei base, 26 gwei priority should not work', async function () {
        const { swap, order, r, vs, takerTraits } = await loadFixture(deployContractsAndInit);

        await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0xba43b7400']); // 50 gwei

        const fillTx = swap.fillOrderArgs(order, r, vs, order.makingAmount, takerTraits.traits, takerTraits.args, { maxPriorityFeePerGas: 26000000000 });
        await expect(fillTx).to.revertedWithCustomError(swap, 'PredicateIsNotTrue');
    });

    it('150 gwei base, 90 gwei priority should work', async function () {
        const { swap, order, r, vs, takerTraits } = await loadFixture(deployContractsAndInit);

        await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x22ecb25c00']); // 150 gwei

        await swap.fillOrderArgs(order, r, vs, order.makingAmount, takerTraits.traits, takerTraits.args, { maxPriorityFeePerGas: 90000000000 });
    });

    it('150 gwei base, 100 gwei priority should not work', async function () {
        const { swap, order, r, vs, takerTraits } = await loadFixture(deployContractsAndInit);

        await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x22ecb25c00']); // 150 gwei

        const fillTx = swap.fillOrderArgs(order, r, vs, order.makingAmount, takerTraits.traits, takerTraits.args, { maxPriorityFeePerGas: 100000000000 });
        await expect(fillTx).to.revertedWithCustomError(swap, 'PredicateIsNotTrue');
    });
});
