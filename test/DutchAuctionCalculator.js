const { expect, time, assertRoughlyEqualValues } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ether } = require('./helpers/utils');
const { deploySwapTokens } = require('./helpers/fixtures');
const { buildOrder, signOrder, buildTakerTraits } = require('./helpers/orderUtils');
const { ethers } = require('hardhat');

describe('Dutch auction', function () {
    let addr, addr1;

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
    });

    async function deployAndBuildOrder () {
        const { dai, weth, swap, chainId } = await deploySwapTokens();

        await dai.mint(addr, ether('100'));
        await dai.mint(addr1, ether('100'));
        await weth.deposit({ value: ether('1') });
        await weth.connect(addr1).deposit({ value: ether('1') });

        await dai.approve(swap, ether('100'));
        await dai.connect(addr1).approve(swap, ether('100'));
        await weth.approve(swap, ether('1'));
        await weth.connect(addr1).approve(swap, ether('1'));

        const DutchAuctionCalculator = await ethers.getContractFactory('DutchAuctionCalculator');
        const dutchAuctionCalculator = await DutchAuctionCalculator.deploy();
        await dutchAuctionCalculator.waitForDeployment();

        const ts = BigInt(await time.latest());
        const startEndTs = (ts << 128n) | (ts + 86400n);
        const order = buildOrder(
            {
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                maker: addr.address,
            },
            {
                makingAmountData: ethers.solidityPacked(
                    ['address', 'uint256', 'uint256', 'uint256'],
                    [await dutchAuctionCalculator.getAddress(), startEndTs.toString(), ether('0.1'), ether('0.05')],
                ),
                takingAmountData: ethers.solidityPacked(
                    ['address', 'uint256', 'uint256', 'uint256'],
                    [await dutchAuctionCalculator.getAddress(), startEndTs.toString(), ether('0.1'), ether('0.05')],
                ),
            },
        );
        const signature = await signOrder(order, chainId, await swap.getAddress(), addr);

        const makerDaiBefore = await dai.balanceOf(addr);
        const takerDaiBefore = await dai.balanceOf(addr1);
        const makerWethBefore = await weth.balanceOf(addr);
        const takerWethBefore = await weth.balanceOf(addr1);
        return { dai, weth, swap, ts, order, signature, makerDaiBefore, takerDaiBefore, makerWethBefore, takerWethBefore };
    };

    it('swap with makingAmount 50% time passed', async function () {
        const { dai, weth, swap, ts, order, signature, makerDaiBefore, takerDaiBefore, makerWethBefore, takerWethBefore } = await loadFixture(deployAndBuildOrder);

        await time.increaseTo(ts + 43200n); // 50% auction time

        const { r, yParityAndS: vs } = ethers.Signature.from(signature);
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
            threshold: ether('0.08'),
        });
        await swap.connect(addr1).fillOrderArgs(order, r, vs, ether('100'), takerTraits.traits, takerTraits.args);

        expect(await dai.balanceOf(addr)).to.equal(makerDaiBefore - ether('100'));
        expect(await dai.balanceOf(addr1)).to.equal(takerDaiBefore + ether('100'));
        assertRoughlyEqualValues(await weth.balanceOf(addr), makerWethBefore + ether('0.075'), 1e-6);
        assertRoughlyEqualValues(await weth.balanceOf(addr1), takerWethBefore - ether('0.075'), 1e-6);
    });

    it('swap with takingAmount 50% time passed', async function () {
        const { dai, weth, swap, ts, order, signature, makerDaiBefore, takerDaiBefore, makerWethBefore, takerWethBefore } = await loadFixture(deployAndBuildOrder);

        await time.increaseTo(ts + 43200n); // 50% auction time

        const { r, yParityAndS: vs } = ethers.Signature.from(signature);
        const takerTraits = buildTakerTraits({
            extension: order.extension,
            threshold: ether('100'),
        });
        await swap.connect(addr1).fillOrderArgs(order, r, vs, ether('0.075'), takerTraits.traits, takerTraits.args);

        expect(await dai.balanceOf(addr)).to.equal(makerDaiBefore - ether('100'));
        expect(await dai.balanceOf(addr1)).to.equal(takerDaiBefore + ether('100'));
        assertRoughlyEqualValues(await weth.balanceOf(addr), makerWethBefore + ether('0.075'), 1e-6);
        assertRoughlyEqualValues(await weth.balanceOf(addr1), takerWethBefore - ether('0.075'), 1e-6);
    });

    it('swap with makingAmount 0% time passed', async function () {
        const { dai, weth, swap, order, signature, makerDaiBefore, takerDaiBefore, makerWethBefore, takerWethBefore } = await loadFixture(deployAndBuildOrder);

        const { r, yParityAndS: vs } = ethers.Signature.from(signature);
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
            threshold: ether('0.1'),
        });
        await swap.connect(addr1).fillOrderArgs(order, r, vs, ether('100'), takerTraits.traits, takerTraits.args);

        expect(await dai.balanceOf(addr)).to.equal(makerDaiBefore - ether('100'));
        expect(await dai.balanceOf(addr1)).to.equal(takerDaiBefore + ether('100'));
        assertRoughlyEqualValues(await weth.balanceOf(addr), makerWethBefore + ether('0.1'), 1e-6);
        assertRoughlyEqualValues(await weth.balanceOf(addr1), takerWethBefore - ether('0.1'), 1e-6);
    });

    it('swap with takingAmount 0% time passed', async function () {
        const { dai, weth, swap, order, signature, makerDaiBefore, takerDaiBefore, makerWethBefore, takerWethBefore } = await loadFixture(deployAndBuildOrder);

        const { r, yParityAndS: vs } = ethers.Signature.from(signature);
        const takerTraits = buildTakerTraits({
            extension: order.extension,
            threshold: ether('100'),
        });
        await swap.connect(addr1).fillOrderArgs(order, r, vs, ether('0.1'), takerTraits.traits, takerTraits.args);

        expect(await dai.balanceOf(addr)).to.equal(makerDaiBefore - ether('100'));
        expect(await dai.balanceOf(addr1)).to.equal(takerDaiBefore + ether('100'));
        assertRoughlyEqualValues(await weth.balanceOf(addr), makerWethBefore + ether('0.1'), 1e-6);
        assertRoughlyEqualValues(await weth.balanceOf(addr1), takerWethBefore - ether('0.1'), 1e-6);
    });

    it('swap with makingAmount 100% time passed', async function () {
        const { dai, weth, swap, ts, order, signature, makerDaiBefore, takerDaiBefore, makerWethBefore, takerWethBefore } = await loadFixture(deployAndBuildOrder);

        await time.increaseTo(ts + 86500n); // >100% auction time

        const { r, yParityAndS: vs } = ethers.Signature.from(signature);
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
            threshold: ether('0.05'),
        });
        await swap.connect(addr1).fillOrderArgs(order, r, vs, ether('100'), takerTraits.traits, takerTraits.args);

        expect(await dai.balanceOf(addr)).to.equal(makerDaiBefore - ether('100'));
        expect(await dai.balanceOf(addr1)).to.equal(takerDaiBefore + ether('100'));
        assertRoughlyEqualValues(await weth.balanceOf(addr), makerWethBefore + ether('0.05'), 1e-6);
        assertRoughlyEqualValues(await weth.balanceOf(addr1), takerWethBefore - ether('0.05'), 1e-6);
    });

    it('swap with takingAmount 100% time passed', async function () {
        const { dai, weth, swap, ts, order, signature, makerDaiBefore, takerDaiBefore, makerWethBefore, takerWethBefore } = await loadFixture(deployAndBuildOrder);

        await time.increaseTo(ts + 86500n); // >100% auction time

        const { r, yParityAndS: vs } = ethers.Signature.from(signature);
        const takerTraits = buildTakerTraits({
            extension: order.extension,
            threshold: ether('100'),
        });
        await swap.connect(addr1).fillOrderArgs(order, r, vs, ether('0.05'), takerTraits.traits, takerTraits.args);

        expect(await dai.balanceOf(addr)).to.equal(makerDaiBefore - ether('100'));
        expect(await dai.balanceOf(addr1)).to.equal(takerDaiBefore + ether('100'));
        assertRoughlyEqualValues(await weth.balanceOf(addr), makerWethBefore + ether('0.05'), 1e-6);
        assertRoughlyEqualValues(await weth.balanceOf(addr1), takerWethBefore - ether('0.05'), 1e-6);
    });
});
