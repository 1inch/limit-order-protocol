const hre = require('hardhat');
const { ethers } = hre;
const { expect, time, constants } = require('@1inch/solidity-utils');
const { buildMakerTraits, buildOrder, buildTakerTraits, signOrder, ABIOrder } = require('../helpers/orderUtils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens, deployArbitraryPredicate, deployRangeAmountCalculator } = require('../helpers/fixtures');
const { joinStaticCalls, ether } = require('../helpers/utils');

// Worked examples of building and filling orders. These double as the
// integrator-facing reference for the current API.
//
// History, because it explains the state this file was in. It was disabled
// with `describe.skip` in commit 245d4df ("clean up examples", 2023-09-04),
// and the diff shows the modifier was changed from `describe.only` rather
// than removed - a stray `.only` from local development was swapped for
// `.skip` instead of being deleted. Nobody decided these examples should
// stop running.
//
// Two years unexecuted left them calling an API that no longer exists:
// `fillOrderExt` and `fillOrderToExt` predate the v4 TakerTraits interface,
// and the file still used ethers v5 (`.deployed()`, `.address`,
// `ethers.utils.*`). Re-enabling therefore meant rewriting every call site
// against `fillOrderArgs` and ethers v6, and replacing the file's duplicated
// fixtures with the shared ones in ../helpers/fixtures.
//
// Recorded as GAP-Q02 / proposal P-04 in the reconstruction audit.

describe('LimitOrderProtocol usage example', function () {
    let addr, addr1, addr2;
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();

    before(async function () {
        [addr, addr1, addr2] = await ethers.getSigners();
    });

    async function deployAssetProxy (swap) {
        const ERC721Proxy = await ethers.getContractFactory('ERC721Proxy');
        const erc721proxy = await ERC721Proxy.deploy(await swap.getAddress());
        await erc721proxy.waitForDeployment();
        return { erc721proxy };
    }

    async function deployInteractionsMock () {
        const InteractionMock = await ethers.getContractFactory('InteractionMock');
        const interactions = await InteractionMock.deploy();
        await interactions.waitForDeployment();
        return { interactions };
    }

    async function initContracts (dai, weth, swap, erc721proxy) {
        await dai.mint(addr1, ether('1000000'));
        await dai.mint(addr, ether('1000000'));
        await weth.deposit({ value: ether('100') });
        await weth.connect(addr1).deposit({ value: ether('100') });
        await dai.approve(swap, ether('1000000'));
        await dai.connect(addr1).approve(swap, ether('1000000'));
        await weth.approve(swap, ether('100'));
        await weth.connect(addr1).approve(swap, ether('100'));

        await dai.connect(addr1).approve(erc721proxy, '10');
        await weth.approve(erc721proxy, '10');
    }

    async function deployContractsAndInit () {
        const { dai, weth, swap, chainId } = await deploySwapTokens();
        const { arbitraryPredicate } = await deployArbitraryPredicate();
        const { interactions } = await deployInteractionsMock();
        const { erc721proxy } = await deployAssetProxy(swap);
        const { rangeAmountCalculator } = await deployRangeAmountCalculator();

        await initContracts(dai, weth, swap, erc721proxy);

        return { dai, weth, swap, chainId, arbitraryPredicate, interactions, erc721proxy, rangeAmountCalculator };
    }

    it('simple order example', async function () {
        const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

        // Every basic maker option in one order: a private order for `addr`,
        // paying a third-party receiver in unwrapped ETH, expiring in an hour,
        // and checked against the maker's epoch for series 1.
        const order = buildOrder({
            maker: addr1.address,
            receiver: addr2.address,
            makerAsset: await dai.getAddress(),
            takerAsset: await weth.getAddress(),
            makingAmount: 1,
            takingAmount: 1,
            makerTraits: buildMakerTraits({
                allowedSender: addr.address,
                allowPartialFill: true,
                allowMultipleFills: true,
                expiry: BigInt(await time.latest()) + 3600n,
                shouldCheckEpoch: true,
                unwrapWeth: true,
                series: 1,
                nonce: 0,
            }),
        });

        const orderCalldata = abiCoder.encode([ABIOrder], [order]);
        console.log('simple order');
        console.log(orderCalldata.substring(2).replace(/(.{8})/g, '$1 ').replace(/(.{72})/g, '$1\n'));

        const { r, yParityAndS: vs } = ethers.Signature.from(
            await signOrder(order, chainId, await swap.getAddress(), addr1),
        );
        const takerTraits = buildTakerTraits({ threshold: 1n });

        const fillTx = swap.fillOrderArgs(order, r, vs, 1, takerTraits.traits, takerTraits.args);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
        await expect(fillTx).to.changeTokenBalance(weth, addr, -1);
        // unwrapWeth on the maker side pays the receiver in native ETH.
        await expect(fillTx).to.changeEtherBalance(addr2, 1);
    });

    it('predicate example', async function () {
        const { dai, weth, swap, chainId, arbitraryPredicate } = await loadFixture(deployContractsAndInit);

        // Build (call result < 15 || call result > 5) from primitives.
        const arbitraryFunction = arbitraryPredicate.interface.encodeFunctionData('copyArg', [10]);
        const arbitraryCallPredicate = swap.interface.encodeFunctionData('arbitraryStaticCall', [
            await arbitraryPredicate.getAddress(),
            arbitraryFunction,
        ]);
        const comparelt = swap.interface.encodeFunctionData('lt', [15, arbitraryCallPredicate]);
        const comparegt = swap.interface.encodeFunctionData('gt', [5, arbitraryCallPredicate]);

        const { offsets, data } = joinStaticCalls([comparelt, comparegt]);
        const predicate = swap.interface.encodeFunctionData('or', [offsets, data]);

        const order = buildOrder(
            {
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 1,
                takingAmount: 1,
                maker: addr1.address,
            },
            { predicate },
        );

        console.log('order with predicate', order);

        const { r, yParityAndS: vs } = ethers.Signature.from(
            await signOrder(order, chainId, await swap.getAddress(), addr1),
        );
        // A predicate lives in the extension, so the extension must be passed
        // back at fill time and is bound to the order by its salt.
        const takerTraits = buildTakerTraits({ extension: order.extension, threshold: 1n });

        const fillTx = swap.fillOrderArgs(order, r, vs, 1, takerTraits.traits, takerTraits.args);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
        await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
    });

    it('interactions example', async function () {
        const { dai, weth, swap, chainId, interactions } = await loadFixture(deployContractsAndInit);

        // Maker interactions are 20 bytes of target followed by extra data.
        //
        // InteractionMock is an assertion mock rather than a value-moving one:
        // its preInteraction reverts unless the taking amount equals the extra
        // data, and its postInteraction reverts unless the taking amount is at
        // most the extra data. So the values below are a required equality of
        // 1 and an upper bound of 4.
        //
        // It implements IPreInteraction and IPostInteraction only, not
        // ITakerInteraction, so this example covers the maker's two callbacks.
        // A taker interaction has the same 20-byte-target shape but is passed
        // through takerTraits at fill time.
        const interactionsAddress = await interactions.getAddress();
        const preInteraction = interactionsAddress + abiCoder.encode(['uint256'], [1]).substring(2);
        const postInteraction = interactionsAddress + abiCoder.encode(['uint256'], [4]).substring(2);

        const order = buildOrder(
            {
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 1,
                takingAmount: 1,
                maker: addr1.address,
            },
            { preInteraction, postInteraction },
        );

        console.log('order with interactions', order);

        const { r, yParityAndS: vs } = ethers.Signature.from(
            await signOrder(order, chainId, await swap.getAddress(), addr1),
        );
        const takerTraits = buildTakerTraits({
            target: addr.address,
            extension: order.extension,
            // Filling by taking amount, so the threshold is the MINIMUM making
            // amount the taker will accept - it bounds what they receive, not
            // what they pay.
            threshold: 1n,
        });

        // Both callbacks run and both assertions hold, so the fill settles at
        // the order's own amounts.
        const fillTx = swap.fillOrderArgs(order, r, vs, 1, takerTraits.traits, takerTraits.args);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
        await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
    });

    it('ERC721Proxy example', async function () {
        const { dai, weth, swap, chainId, erc721proxy } = await loadFixture(deployContractsAndInit);

        // A non-ERC20 asset trades through a proxy whose function selector is
        // ground to match IERC20.transferFrom. The extra arguments travel in
        // the asset suffix; the first 202 characters (selector plus the three
        // standard transferFrom words) are cut off.
        const makerAssetSuffix = '0x' + erc721proxy.interface.encodeFunctionData(
            'func_60iHVgK',
            // address from, address to, uint256 amount, uint256 tokenId, IERC721 token
            [addr1.address, constants.ZERO_ADDRESS, 0, 10, await dai.getAddress()],
        ).substring(202);

        const takerAssetSuffix = '0x' + erc721proxy.interface.encodeFunctionData(
            'func_60iHVgK',
            [constants.ZERO_ADDRESS, addr1.address, 0, 10, await weth.getAddress()],
        ).substring(202);

        const order = buildOrder(
            {
                // The proxy stands in for the asset on both sides.
                makerAsset: await erc721proxy.getAddress(),
                takerAsset: await erc721proxy.getAddress(),
                // Amounts are unused by ERC721Proxy, which ignores them
                // deliberately so a partial fill cannot sell an NFT.
                makingAmount: 1,
                takingAmount: 1,
                maker: addr1.address,
            },
            { makerAssetSuffix, takerAssetSuffix },
        );

        console.log('order with ERC721 proxy', order);

        const { r, yParityAndS: vs } = ethers.Signature.from(
            await signOrder(order, chainId, await swap.getAddress(), addr1),
        );
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
            threshold: 10n,
        });

        const fillTx = swap.fillOrderArgs(order, r, vs, 10, takerTraits.traits, takerTraits.args);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [10, -10]);
        await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-10, 10]);
    });

    it('getter example', async function () {
        const { dai, weth, swap, chainId, rangeAmountCalculator } = await loadFixture(deployContractsAndInit);

        // Order: 10 weth -> 35000 dai priced along a 3000 -> 4000 range.
        const makingAmount = ether('10');
        const takingAmount = ether('35000');
        const startPrice = ether('3000');
        const endPrice = ether('4000');

        // An amount getter is 20 bytes of address followed by its own extra data.
        const rangeAddress = await rangeAmountCalculator.getAddress();
        const makingAmountData = ethers.solidityPacked(
            ['address', 'uint256', 'uint256'],
            [rangeAddress, startPrice, endPrice],
        );
        const takingAmountData = ethers.solidityPacked(
            ['address', 'uint256', 'uint256'],
            [rangeAddress, startPrice, endPrice],
        );

        const order = buildOrder(
            {
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount,
                takingAmount,
                maker: addr1.address,
                makerTraits: buildMakerTraits({ allowMultipleFills: true }),
            },
            { makingAmountData, takingAmountData },
        );

        console.log('order with range getter', order);

        const { r, yParityAndS: vs } = ethers.Signature.from(
            await signOrder(order, chainId, await swap.getAddress(), addr1),
        );
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
            threshold: ether('6200'),
        });

        // Filling the first 2 of 10 WETH costs 6200 DAI: the average of the
        // curve over the first fifth of the range.
        const fillTx = swap.fillOrderArgs(order, r, vs, ether('2'), takerTraits.traits, takerTraits.args);
        await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [ether('2'), ether('-2')]);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [ether('-6200'), ether('6200')]);
    });
});
