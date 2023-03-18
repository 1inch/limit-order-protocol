const { expect, trim0x, time } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { cutLastArg, ether, roughlyEqualValues } = require('./helpers/utils');
const { deploySwapTokens } = require('./helpers/fixtures');
const { fillWithMakingAmount, compactSignature, buildOrder, signOrder } = require('./helpers/orderUtils');
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
                makingAmountGetter: dutchAuctionCalculator.address + cutLastArg(trim0x(dutchAuctionCalculator.interface.encodeFunctionData('getMakingAmount',
                    [startEndTs.toString(), ether('0.1'), ether('0.05'), ether('100'), 0],
                )), 64),
                takingAmountGetter: dutchAuctionCalculator.address + cutLastArg(trim0x(dutchAuctionCalculator.interface.encodeFunctionData('getTakingAmount',
                    [startEndTs.toString(), ether('0.1'), ether('0.05'), ether('100'), 0],
                )), 64),
            },
        );
        const signature = await signOrder(order, chainId, swap.address, addr);

        return { dai, weth, swap, ts, order, signature };
    };

    it('swap with makingAmount 50% time passed', async function () {
        const { dai, weth, swap, ts, order, signature } = await loadFixture(deployAndBuildOrder);

        await time.increaseTo(ts + 43200n); // 50% auction time

        const { r, vs } = compactSignature(signature);
        const tx = await swap.connect(addr1).fillOrderExt(order, r, vs, ether('100'), fillWithMakingAmount(ether('0.08')), order.extension);
        expect(tx).to.changeTokenBalances(dai, [addr.address, addr1.address], [-ether('100'), ether('100')]);
        expect(tx).to.changeTokenBalances(weth, [addr.address, addr1.address], [
            (actual) => roughlyEqualValues(ether('0.075'), actual, 1e-4),
            (actual) => roughlyEqualValues(-ether('0.075'), actual, 1e-4),
        ]);
    });

    it('swap with takingAmount 50% time passed', async function () {
        const { dai, weth, swap, ts, order, signature } = await loadFixture(deployAndBuildOrder);

        await time.increaseTo(ts + 43200n); // 50% auction time

        const { r, vs } = compactSignature(signature);
        const tx = await swap.connect(addr1).fillOrderExt(order, r, vs, ether('0.075'), ether('100'), order.extension);
        expect(tx).to.changeTokenBalances(dai, [addr.address, addr1.address], [-ether('100'), ether('100')]);
        expect(tx).to.changeTokenBalances(weth, [addr.address, addr1.address], [
            (actual) => roughlyEqualValues(ether('0.075'), actual, 1e-4),
            (actual) => roughlyEqualValues(-ether('0.075'), actual, 1e-4),
        ]);
    });

    it('swap with makingAmount 0% time passed', async function () {
        const { dai, weth, swap, order, signature } = await loadFixture(deployAndBuildOrder);

        const { r, vs } = compactSignature(signature);
        const tx = await swap.connect(addr1).fillOrderExt(order, r, vs, ether('100'), fillWithMakingAmount(ether('0.1')), order.extension);
        expect(tx).to.changeTokenBalances(dai, [addr.address, addr1.address], [-ether('100'), ether('100')]);
        expect(tx).to.changeTokenBalances(weth, [addr.address, addr1.address], [
            (actual) => roughlyEqualValues(ether('0.1'), actual, 1e-4),
            (actual) => roughlyEqualValues(-ether('0.1'), actual, 1e-4),
        ]);
    });

    it('swap with takingAmount 0% time passed', async function () {
        const { dai, weth, swap, order, signature } = await loadFixture(deployAndBuildOrder);

        const { r, vs } = compactSignature(signature);
        const tx = await swap.connect(addr1).fillOrderExt(order, r, vs, ether('0.1'), ether('100'), order.extension);
        expect(tx).to.changeTokenBalances(dai, [addr.address, addr1.address], [-ether('100'), ether('100')]);
        expect(tx).to.changeTokenBalances(weth, [addr.address, addr1.address], [
            (actual) => roughlyEqualValues(ether('0.1'), actual, 1e-4),
            (actual) => roughlyEqualValues(-ether('0.1'), actual, 1e-4),
        ]);
    });

    it('swap with makingAmount 100% time passed', async function () {
        const { dai, weth, swap, ts, order, signature } = await loadFixture(deployAndBuildOrder);

        await time.increaseTo(ts + 86500n); // >100% auction time

        const { r, vs } = compactSignature(signature);
        const tx = await swap.connect(addr1).fillOrderExt(order, r, vs, ether('100'), fillWithMakingAmount(ether('0.05')), order.extension);
        expect(tx).to.changeTokenBalances(dai, [addr.address, addr1.address], [-ether('100'), ether('100')]);
        expect(tx).to.changeTokenBalances(weth, [addr.address, addr1.address], [
            (actual) => roughlyEqualValues(ether('0.05'), actual, 1e-4),
            (actual) => roughlyEqualValues(-ether('0.05'), actual, 1e-4),
        ]);
    });

    it('swap with takingAmount 100% time passed', async function () {
        const { dai, weth, swap, ts, order, signature } = await loadFixture(deployAndBuildOrder);

        await time.increaseTo(ts + 86500n); // >100% auction time

        const { r, vs } = compactSignature(signature);
        const tx = await swap.connect(addr1).fillOrderExt(order, r, vs, ether('0.05'), ether('100'), order.extension);
        expect(tx).to.changeTokenBalances(dai, [addr.address, addr1.address], [-ether('100'), ether('100')]);
        expect(tx).to.changeTokenBalances(weth, [addr.address, addr1.address], [
            (actual) => roughlyEqualValues(ether('0.05'), actual, 1e-4),
            (actual) => roughlyEqualValues(-ether('0.05'), actual, 1e-4),
        ]);
    });
});
