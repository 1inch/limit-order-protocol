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

        await dai.mint(addr.address, ether('100'));
        await dai.mint(addr1.address, ether('100'));
        await weth.deposit({ value: ether('1') });
        await weth.connect(addr1).deposit({ value: ether('1') });

        await dai.approve(swap.address, ether('100'));
        await dai.connect(addr1).approve(swap.address, ether('100'));
        await weth.approve(swap.address, ether('1'));
        await weth.connect(addr1).approve(swap.address, ether('1'));

        const DutchAuctionCalculator = await ethers.getContractFactory('DutchAuctionCalculator');
        const dutchAuctionCalculator = await DutchAuctionCalculator.deploy();
        await dutchAuctionCalculator.deployed();

        const ts = BigInt(await time.latest());
        const startEndTs = (ts << 128n) | (ts + 86400n);
        const order = buildOrder(
            {
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                maker: addr.address,
            },
            {
                makingAmountData: ethers.utils.solidityPack(
                    ['address', 'uint256', 'uint256', 'uint256'],
                    [dutchAuctionCalculator.address, startEndTs.toString(), ether('0.1'), ether('0.05')],
                ),
                takingAmountData: ethers.utils.solidityPack(
                    ['address', 'uint256', 'uint256', 'uint256'],
                    [dutchAuctionCalculator.address, startEndTs.toString(), ether('0.1'), ether('0.05')],
                ),
            },
        );
        const signature = await signOrder(order, chainId, swap.address, addr);

        const makerDaiBefore = await dai.balanceOf(addr.address);
        const takerDaiBefore = await dai.balanceOf(addr1.address);
        const makerWethBefore = await weth.balanceOf(addr.address);
        const takerWethBefore = await weth.balanceOf(addr1.address);
        return { dai, weth, swap, ts, order, signature, makerDaiBefore, takerDaiBefore, makerWethBefore, takerWethBefore };
    };

    it('swap with makingAmount 50% time passed', async function () {
        const { dai, weth, swap, ts, order, signature, makerDaiBefore, takerDaiBefore, makerWethBefore, takerWethBefore } = await loadFixture(deployAndBuildOrder);

        await time.increaseTo(ts + 43200n); // 50% auction time

        const { r, _vs: vs } = ethers.utils.splitSignature(signature);
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
            minReturn: ether('0.08'),
        });
        await swap.connect(addr1).fillOrderArgs(order, r, vs, ether('100'), takerTraits.traits, takerTraits.args);

        expect(await dai.balanceOf(addr.address)).to.equal(makerDaiBefore.sub(ether('100')));
        expect(await dai.balanceOf(addr1.address)).to.equal(takerDaiBefore.add(ether('100')));
        assertRoughlyEqualValues(await weth.balanceOf(addr.address), makerWethBefore.add(ether('0.075')), 1e-6);
        assertRoughlyEqualValues(await weth.balanceOf(addr1.address), takerWethBefore.sub(ether('0.075')), 1e-6);
    });

    it('swap with takingAmount 50% time passed', async function () {
        const { dai, weth, swap, ts, order, signature, makerDaiBefore, takerDaiBefore, makerWethBefore, takerWethBefore } = await loadFixture(deployAndBuildOrder);

        await time.increaseTo(ts + 43200n); // 50% auction time

        const { r, _vs: vs } = ethers.utils.splitSignature(signature);
        const takerTraits = buildTakerTraits({
            extension: order.extension,
            minReturn: ether('100'),
        });
        await swap.connect(addr1).fillOrderArgs(order, r, vs, ether('0.075'), takerTraits.traits, takerTraits.args);

        expect(await dai.balanceOf(addr.address)).to.equal(makerDaiBefore.sub(ether('100')));
        expect(await dai.balanceOf(addr1.address)).to.equal(takerDaiBefore.add(ether('100')));
        assertRoughlyEqualValues(await weth.balanceOf(addr.address), makerWethBefore.add(ether('0.075')), 1e-6);
        assertRoughlyEqualValues(await weth.balanceOf(addr1.address), takerWethBefore.sub(ether('0.075')), 1e-6);
    });

    it('swap with makingAmount 0% time passed', async function () {
        const { dai, weth, swap, order, signature, makerDaiBefore, takerDaiBefore, makerWethBefore, takerWethBefore } = await loadFixture(deployAndBuildOrder);

        const { r, _vs: vs } = ethers.utils.splitSignature(signature);
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
            minReturn: ether('0.1'),
        });
        await swap.connect(addr1).fillOrderArgs(order, r, vs, ether('100'), takerTraits.traits, takerTraits.args);

        expect(await dai.balanceOf(addr.address)).to.equal(makerDaiBefore.sub(ether('100')));
        expect(await dai.balanceOf(addr1.address)).to.equal(takerDaiBefore.add(ether('100')));
        assertRoughlyEqualValues(await weth.balanceOf(addr.address), makerWethBefore.add(ether('0.1')), 1e-6);
        assertRoughlyEqualValues(await weth.balanceOf(addr1.address), takerWethBefore.sub(ether('0.1')), 1e-6);
    });

    it('swap with takingAmount 0% time passed', async function () {
        const { dai, weth, swap, order, signature, makerDaiBefore, takerDaiBefore, makerWethBefore, takerWethBefore } = await loadFixture(deployAndBuildOrder);

        const { r, _vs: vs } = ethers.utils.splitSignature(signature);
        const takerTraits = buildTakerTraits({
            extension: order.extension,
            minReturn: ether('100'),
        });
        await swap.connect(addr1).fillOrderArgs(order, r, vs, ether('0.1'), takerTraits.traits, takerTraits.args);

        expect(await dai.balanceOf(addr.address)).to.equal(makerDaiBefore.sub(ether('100')));
        expect(await dai.balanceOf(addr1.address)).to.equal(takerDaiBefore.add(ether('100')));
        assertRoughlyEqualValues(await weth.balanceOf(addr.address), makerWethBefore.add(ether('0.1')), 1e-6);
        assertRoughlyEqualValues(await weth.balanceOf(addr1.address), takerWethBefore.sub(ether('0.1')), 1e-6);
    });

    it('swap with makingAmount 100% time passed', async function () {
        const { dai, weth, swap, ts, order, signature, makerDaiBefore, takerDaiBefore, makerWethBefore, takerWethBefore } = await loadFixture(deployAndBuildOrder);

        await time.increaseTo(ts + 86500n); // >100% auction time

        const { r, _vs: vs } = ethers.utils.splitSignature(signature);
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
            minReturn: ether('0.05'),
        });
        await swap.connect(addr1).fillOrderArgs(order, r, vs, ether('100'), takerTraits.traits, takerTraits.args);

        expect(await dai.balanceOf(addr.address)).to.equal(makerDaiBefore.sub(ether('100')));
        expect(await dai.balanceOf(addr1.address)).to.equal(takerDaiBefore.add(ether('100')));
        assertRoughlyEqualValues(await weth.balanceOf(addr.address), makerWethBefore.add(ether('0.05')), 1e-6);
        assertRoughlyEqualValues(await weth.balanceOf(addr1.address), takerWethBefore.sub(ether('0.05')), 1e-6);
    });

    it('swap with takingAmount 100% time passed', async function () {
        const { dai, weth, swap, ts, order, signature, makerDaiBefore, takerDaiBefore, makerWethBefore, takerWethBefore } = await loadFixture(deployAndBuildOrder);

        await time.increaseTo(ts + 86500n); // >100% auction time

        const { r, _vs: vs } = ethers.utils.splitSignature(signature);
        const takerTraits = buildTakerTraits({
            extension: order.extension,
            minReturn: ether('100'),
        });
        await swap.connect(addr1).fillOrderArgs(order, r, vs, ether('0.05'), takerTraits.traits, takerTraits.args);

        expect(await dai.balanceOf(addr.address)).to.equal(makerDaiBefore.sub(ether('100')));
        expect(await dai.balanceOf(addr1.address)).to.equal(takerDaiBefore.add(ether('100')));
        assertRoughlyEqualValues(await weth.balanceOf(addr.address), makerWethBefore.add(ether('0.05')), 1e-6);
        assertRoughlyEqualValues(await weth.balanceOf(addr1.address), takerWethBefore.sub(ether('0.05')), 1e-6);
    });
});
