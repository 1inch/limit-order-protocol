const hre = require('hardhat');
const { ethers } = hre;
const { expect, time, constants } = require('@1inch/solidity-utils');
const { fillWithMakingAmount, buildMakerTraits, buildOrder, signOrder, ABIOrder } = require('../helpers/orderUtils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { joinStaticCalls, ether } = require('../helpers/utils');

describe.skip('LimitOrderProtocol usage example', function () {
    let addr, addr1, addr2;
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();

    before(async function () {
        [addr, addr1, addr2] = await ethers.getSigners();
    });

    async function deploySwapTokens () {
        const TokenMock = await ethers.getContractFactory('TokenMock');
        const dai = await TokenMock.deploy('DAI', 'DAI');
        await dai.deployed();
        const WrappedTokenMock = await ethers.getContractFactory('WrappedTokenMock');
        const weth = await WrappedTokenMock.deploy('WETH', 'WETH');
        await weth.deployed();
        const inch = await TokenMock.deploy('1INCH', '1INCH');
        await inch.deployed();
        const LimitOrderProtocol = await ethers.getContractFactory('LimitOrderProtocol');
        const swap = await LimitOrderProtocol.deploy(weth.address);
        await swap.deployed();
        const TokenCustomDecimalsMock = await ethers.getContractFactory('TokenCustomDecimalsMock');
        const usdc = await TokenCustomDecimalsMock.deploy('USDC', 'USDC', '0', 6);
        await usdc.deployed();
        const chainId = (await ethers.provider.getNetwork()).chainId;
        return { dai, weth, inch, swap, chainId, usdc };
    };

    async function deployArbitraryPredicate () {
        const ArbitraryPredicateMock = await ethers.getContractFactory('ArbitraryPredicateMock');
        const arbitraryPredicate = await ArbitraryPredicateMock.deploy();
        await arbitraryPredicate.deployed();
        return { arbitraryPredicate };
    };

    async function deployAssetProxy (swap) {
        const ERC721Proxy = await ethers.getContractFactory('ERC721Proxy');
        const erc721proxy = await ERC721Proxy.deploy(swap.address);
        await erc721proxy.deployed();

        return { erc721proxy };
    };

    async function deployRangeAmountCalculator () {
        const RangeAmountCalculator = await ethers.getContractFactory('RangeAmountCalculator');
        const rangeAmountCalculator = await RangeAmountCalculator.deploy();
        await rangeAmountCalculator.deployed();
        return { rangeAmountCalculator };
    };

    async function deployInteractionsMock () {
        const InteractionMock = await ethers.getContractFactory('InteractionMock');
        const interactions = await InteractionMock.deploy();
        await interactions.deployed();
        return { interactions };
    }

    async function initContracts (dai, weth, swap, erc721proxy) {
        await dai.mint(addr1.address, ether('1000000'));
        await dai.mint(addr.address, ether('1000000'));
        await weth.deposit({ value: ether('100') });
        await weth.connect(addr1).deposit({ value: ether('100') });
        await dai.approve(swap.address, ether('1000000'));
        await dai.connect(addr1).approve(swap.address, ether('1000000'));
        await weth.approve(swap.address, ether('100'));
        await weth.connect(addr1).approve(swap.address, ether('100'));

        await dai.connect(addr1).approve(erc721proxy.address, '10');
        await weth.approve(erc721proxy.address, '10');
    };

    const deployContractsAndInit = async function () {
        const { dai, weth, swap, chainId } = await deploySwapTokens();
        const { arbitraryPredicate } = await deployArbitraryPredicate();
        const { interactions } = await deployInteractionsMock();
        const { erc721proxy } = await deployAssetProxy(swap);
        const { rangeAmountCalculator } = await deployRangeAmountCalculator();

        await initContracts(dai, weth, swap, erc721proxy);

        return { dai, weth, swap, chainId, arbitraryPredicate, interactions, erc721proxy, rangeAmountCalculator };
    };

    it('simple order example', async function () {
        const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);
        // Build final order
        const order = buildOrder(
            {
                maker: addr1.address,
                receiver: addr2.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 1,
                takingAmount: 1,
                makerTraits: buildMakerTraits({
                    allowedSender: addr.address,
                    allowPartialFill: true,
                    allowMultipleFills: true,
                    expiry: (await time.latest()) + 3600,
                    shouldCheckEpoch: true,
                    unwrapWeth: true,
                    series: 1,
                    nonce: 0,
                }),
            },
        );

        const orderCalldata = abiCoder.encode([ABIOrder], [order]);
        console.log('simple order');
        console.log(orderCalldata.substring(2).replace(/(.{8})/g, '$1 ').replace(/(.{72})/g, '$1\n'));

        const { r, _vs: vs } = ethers.utils.splitSignature(await signOrder(order, chainId, swap.address, addr1));
        const fillTx = swap.fillOrderExt(order, r, vs, 1, 1, order.extension);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
        await expect(fillTx).to.changeTokenBalance(weth, addr, -1);
        await expect(fillTx).to.changeEtherBalance(addr2, 1);
    });

    it('predicate example', async function () {
        const { dai, weth, swap, chainId, arbitraryPredicate } = await loadFixture(deployContractsAndInit);

        // Create predicate:  (arbitary call result < 15 || arbitary call result > 5)
        // call result
        const arbitaryFunction = arbitraryPredicate.interface.encodeFunctionData('copyArg', [10]);
        const arbitraryCallPredicate = swap.interface.encodeFunctionData('arbitraryStaticCall', [
            arbitraryPredicate.address,
            arbitaryFunction,
        ]);
        // call result < 15
        const comparelt = swap.interface.encodeFunctionData('lt', [15, arbitraryCallPredicate]);
        // call result > 5
        const comparegt = swap.interface.encodeFunctionData('gt', [5, arbitraryCallPredicate]);

        const { offsets, data } = joinStaticCalls([comparelt, comparegt]);

        // call result < 15 || call result > 5
        const predicate = swap.interface.encodeFunctionData('or', [offsets, data]);

        // Build final order
        const order = buildOrder(
            {
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 1,
                takingAmount: 1,
                maker: addr1.address,
            },
            {
                predicate,
            },
        );

        console.log('order', order);

        const { r, _vs: vs } = ethers.utils.splitSignature(await signOrder(order, chainId, swap.address, addr1));
        const fillTx = swap.fillOrderExt(order, r, vs, 1, 1, order.extension);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
        await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
    });

    it('interactions example', async function () {
        const { dai, weth, swap, chainId, interactions } = await loadFixture(deployContractsAndInit);

        const preInteraction = interactions.address + abiCoder.encode(['uint256'], [1]).substring(2);
        const postInteraction = interactions.address + abiCoder.encode(['uint256'], [4]).substring(2);
        const takerInteraction = interactions.address + abiCoder.encode(['uint256'], [3]).substring(2);

        // Build final order
        const order = buildOrder(
            {
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 1,
                takingAmount: 1,
                maker: addr1.address,
            },
            {
                preInteraction,
                postInteraction,
            },
        );

        console.log('order', order);

        const { r, _vs: vs } = ethers.utils.splitSignature(await signOrder(order, chainId, swap.address, addr1));
        const fillTx = swap.fillOrderToExt(order, r, vs, 1, 1, addr.address, order.extension, takerInteraction);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
        await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-4, 4]);
    });

    it('ERC721Proxy example', async function () {
        const { dai, weth, swap, chainId, erc721proxy } = await loadFixture(deployContractsAndInit);

        const makerAssetSuffix = '0x' + erc721proxy.interface.encodeFunctionData(
            'func_60iHVgK',
            // ERC721Proxy arguments (2 last passed as extra)
            // address from, address to, uint256 amount, uint256 tokenId, IERC721 token
            [addr1.address, constants.ZERO_ADDRESS, 0, 10, dai.address],
        // leave only 2 extra arguments
        ).substring(202);

        const takerAssetSuffix = '0x' + erc721proxy.interface.encodeFunctionData(
            'func_60iHVgK',
            // ERC721Proxy arguments (2 last passed as extra)
            // address from, address to, uint256 amount, uint256 tokenId, IERC721 token
            [constants.ZERO_ADDRESS, addr1.address, 0, 10, weth.address],
        // leave only 2 extra arguments
        ).substring(202);

        const order = buildOrder(
            {
                // put maker asset proxy address instead of maker asset address
                makerAsset: erc721proxy.address,
                // put taker asset proxy address instead of maker asset address
                takerAsset: erc721proxy.address,
                // making amount is not used by ERC721Proxy
                makingAmount: 1,
                // taking amount is not used by ERC721Proxy
                takingAmount: 1,
                maker: addr1.address,
            },
            {
                makerAssetSuffix,
                takerAssetSuffix,
            },
        );

        console.log('order', order);

        const { r, _vs: vs } = ethers.utils.splitSignature(await signOrder(order, chainId, swap.address, addr1));
        const fillTx = swap.fillOrderExt(order, r, vs, 10, fillWithMakingAmount(10), order.extension);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [10, -10]);
        await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-10, 10]);
    });

    it('getter example', async function () {
        const { dai, weth, swap, chainId, rangeAmountCalculator } = await loadFixture(deployContractsAndInit);

        // Order: 10 weth -> 35000 dai with price range: 3000 -> 4000
        const makingAmount = ether('10');
        const takingAmount = ether('35000');
        const startPrice = ether('3000');
        const endPrice = ether('4000');

        const makingAmountData = ethers.utils.solidityPack(
            ['address', 'uint256', 'uint256'],
            [rangeAmountCalculator.address, startPrice, endPrice],
        );

        const takingAmountData = ethers.utils.solidityPack(
            ['address', 'uint256', 'uint256'],
            [rangeAmountCalculator.address, startPrice, endPrice],
        );

        // Build final order
        const order = buildOrder(
            {
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount,
                takingAmount,
                maker: addr1.address,
                makerTraits: buildMakerTraits({ allowMultipleFills: true }),
            }, {
                makingAmountData,
                takingAmountData,
            },
        );

        console.log('order', order);

        const { r, _vs: vs } = ethers.utils.splitSignature(await signOrder(order, chainId, swap.address, addr1));
        const fillTx = swap.fillOrderExt(order, r, vs, ether('2'), fillWithMakingAmount(ether('6200')), order.extension);
        await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [ether('2'), ether('-2')]);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [ether('-6200'), ether('6200')]);
    });
});
