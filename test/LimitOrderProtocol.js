const hre = require('hardhat');
const { ethers, tracer } = hre;
const { expect, time, constants, getPermit2, permit2Contract } = require('@1inch/solidity-utils');
const { fillWithMakingAmount, unwrapWethTaker, buildMakerTraits, buildMakerTraitsRFQ, buildOrder, signOrder, buildOrderData, buildTakerTraits } = require('./helpers/orderUtils');
const { getPermit, withTarget } = require('./helpers/eip712');
const { joinStaticCalls, ether, findTrace, countAllItems } = require('./helpers/utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens, deployArbitraryPredicate } = require('./helpers/fixtures');

describe('LimitOrderProtocol', function () {
    let addr, addr1, addr2;

    before(async function () {
        [addr, addr1, addr2] = await ethers.getSigners();
    });

    async function deployContractsAndInit () {
        const { dai, weth, usdc, swap, chainId } = await deploySwapTokens();
        const tokens = { dai, weth, usdc };
        const contracts = { swap };

        await dai.mint(addr1, ether('1000000'));
        await dai.mint(addr, ether('1000000'));
        await weth.deposit({ value: ether('100') });
        await weth.connect(addr1).deposit({ value: ether('100') });
        await dai.approve(swap, ether('1000000'));
        await dai.connect(addr1).approve(swap, ether('1000000'));
        await weth.approve(swap, ether('100'));
        await weth.connect(addr1).approve(swap, ether('100'));

        const ETHOrders = await ethers.getContractFactory('ETHOrders');
        contracts.ethOrders = await ETHOrders.deploy(weth, swap);
        await contracts.ethOrders.waitForDeployment();
        const orderLibFactory = await ethers.getContractFactory('OrderLib');

        const { arbitraryPredicate } = await deployArbitraryPredicate();
        contracts.arbitraryPredicate = arbitraryPredicate;

        const permits = { taker: {}, maker: {} };
        // Taker permit
        permits.taker.order = buildOrder({
            makerAsset: await dai.getAddress(),
            takerAsset: await weth.getAddress(),
            makingAmount: 1,
            takingAmount: 1,
            maker: addr1.address,
        });
        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(permits.taker.order, chainId, await swap.getAddress(), addr1));
        permits.taker.signature = { r, vs };

        // Maker permit
        const deadline = (await time.latest()) + time.duration.weeks(1);
        const permit = withTarget(
            await weth.getAddress(),
            await getPermit(addr.address, addr, weth, '1', chainId, await swap.getAddress(), '1', deadline),
        );
        const permit2 = withTarget(
            await weth.getAddress(),
            await getPermit2(addr, await weth.getAddress(), chainId, await swap.getAddress(), 1, false, constants.MAX_UINT48, deadline),
        );
        permits.maker.permit = permit;
        permits.maker.permit2 = permit2;
        permits.maker.order = buildOrder(
            {
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: 1,
                takingAmount: 1,
                maker: addr.address,
            },
            {
                permit,
            },
        );

        permits.maker.orderPermit2 = buildOrder(
            {
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: 1,
                takingAmount: 1,
                maker: addr.address,
                makerTraits: buildMakerTraits({ usePermit2: true }),
            },
            {
                permit: permit2,
            },
        );
        contracts.permit2Contract = await permit2Contract();
        await weth.approve(contracts.permit2Contract, 1);
        const { r: r1, yParityAndS: vs1 } = ethers.Signature.from(await signOrder(permits.maker.order, chainId, await swap.getAddress(), addr));
        const { r: r2, yParityAndS: vs2 } = ethers.Signature.from(await signOrder(permits.maker.orderPermit2, chainId, await swap.getAddress(), addr));
        permits.maker.signature = { r: r1, vs: vs1 };
        permits.maker.signaturePermit2 = { r: r2, vs: vs2 };

        return { tokens, contracts, chainId, orderLibFactory, permits, deadline };
    };

    describe('wip', function () {
        it('transferFrom', async function () {
            const { tokens: { dai } } = await loadFixture(deployContractsAndInit);

            await dai.connect(addr1).approve(addr, '2');
            await dai.transferFrom(addr1, addr, '1');
        });

        it('should not swap with bad signature', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 1,
                takingAmount: 1,
                maker: addr1.address,
            });

            const fakeOrder = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 1,
                takingAmount: 2,
                maker: addr1.address,
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            await expect(swap.fillOrder(fakeOrder, r, vs, 1, fillWithMakingAmount(1)))
                .to.be.revertedWithCustomError(swap, 'BadSignature');
        });

        it('should not fill above threshold', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 2,
                takingAmount: 2,
                maker: addr1.address,
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            await expect(swap.fillOrder(order, r, vs, 2, fillWithMakingAmount(1)))
                .to.be.revertedWithCustomError(swap, 'TakingAmountTooHigh');
        });

        it('should not fill above threshold, making amount > remaining making amount', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 2,
                takingAmount: 2,
                maker: addr1.address,
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            await expect(swap.fillOrder(order, r, vs, 3, fillWithMakingAmount(1)))
                .to.be.revertedWithCustomError(swap, 'TakingAmountTooHigh');
        });

        it('should not fill below threshold, making amount > remaining making amount', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 2,
                takingAmount: 2,
                maker: addr1.address,
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            await expect(swap.fillOrder(order, r, vs, 3, 4))
                .to.be.revertedWithCustomError(swap, 'MakingAmountTooLow');
        });

        it('should not fill below threshold', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 2,
                takingAmount: 2,
                maker: addr1.address,
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            await expect(swap.fillOrder(order, r, vs, 2, 3))
                .to.be.revertedWithCustomError(swap, 'MakingAmountTooLow');
        });

        it('should fill without checks with threshold == 0', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 2,
                takingAmount: 10,
                maker: addr1.address,
                makerTraits: buildMakerTraits({ allowMultipleFills: true }),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));

            const swapWithoutThreshold = await swap.fillOrder(order, r, vs, 5, 0);
            const gasUsedWithoutThreshold = (await swapWithoutThreshold.wait()).gasUsed;
            await loadFixture(deployContractsAndInit);
            const swapWithThreshold = await swap.fillOrder(order, r, vs, 5, 1);
            expect((await swapWithThreshold.wait()).gasUsed).to.gt(gasUsedWithoutThreshold);
        });

        it('should fail when amount is zero', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 100,
                takingAmount: 1,
                maker: addr1.address,
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            await expect(swap.fillOrder(order, r, vs, 0, 0))
                .to.be.revertedWithCustomError(swap, 'SwapWithZeroAmount');
        });

        it('should swap fully based on signature', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);
            // Order: 1 DAI => 1 WETH
            // Swap:  1 DAI => 1 WETH

            for (const nonce of [0, 1]) {
                const order = buildOrder({
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: 1,
                    takingAmount: 1,
                    maker: addr1.address,
                    makerTraits: buildMakerTraitsRFQ({ nonce }),
                });

                const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
                const fillTx = swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1));
                await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
                await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);

                if (hre.__SOLIDITY_COVERAGE_RUNNING === undefined) {
                    const trace = findTrace(tracer, 'CALL', await swap.getAddress());
                    const opcodes = trace.children.map(item => item.opcode);
                    expect(countAllItems(opcodes)).to.deep.equal({ STATICCALL: 1, CALL: 2, SLOAD: 2, SSTORE: 1, LOG1: 1, MSTORE: 29, MLOAD: 10, SHA3: 5 });
                }
            }
        });

        it('should swap half based on signature', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);
            // Order: 2 DAI => 2 WETH
            // Swap:  1 DAI => 1 WETH

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 2,
                takingAmount: 2,
                maker: addr1.address,
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const fillTx = swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1));
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);

            if (hre.__SOLIDITY_COVERAGE_RUNNING === undefined) {
                const trace = findTrace(tracer, 'CALL', await swap.getAddress());
                const opcodes = trace.children.map(item => item.opcode);
                expect(countAllItems(opcodes)).to.deep.equal({ STATICCALL: 1, CALL: 2, SLOAD: 2, SSTORE: 1, LOG1: 1, MSTORE: 31, MLOAD: 10, SHA3: 6 });
            }
        });

        it('should floor maker amount', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);
            // Order: 2 DAI => 10 WETH
            // Swap:  9 WETH <= 1 DAI

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 2,
                takingAmount: 10,
                maker: addr1.address,
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const fillTx = swap.fillOrder(order, r, vs, 9, 1);
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-9, 9]);
        });

        it('should fail on floor maker amount = 0', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);
            // Order: 2 DAI => 10 WETH
            // Swap:  4 WETH <= 0 DAI

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 2,
                takingAmount: 10,
                maker: addr1.address,
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            await expect(swap.fillOrder(order, r, vs, 4, 0))
                .to.be.revertedWithCustomError(swap, 'SwapWithZeroAmount');
        });

        it('should ceil taker amount', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);
            // Order: 10 DAI => 2 WETH
            // Swap:  4 DAI => 1 WETH

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 10,
                takingAmount: 2,
                maker: addr1.address,
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const fillTx = swap.fillOrder(order, r, vs, 4, fillWithMakingAmount(1));
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [4, -4]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
        });

        it('should unwrap weth', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);
            // Order: 10 DAI => 2 WETH
            // Swap:  4 DAI => 1 WETH

            const order = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('2'),
                takingAmount: ether('10'),
                maker: addr1.address,
            });

            await weth.connect(addr1).deposit({ value: ether('2') });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const fillTx = swap.fillOrder(order, r, vs, ether('5'), unwrapWethTaker(ether('1')));
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [ether('-5'), ether('5')]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [ether('0'), ether('-1')]);
            await expect(fillTx).to.changeEtherBalance(addr, ether('1'));
        });

        it('ERC721Proxy should work', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const ERC721Proxy = await ethers.getContractFactory('ERC721Proxy');
            const erc721proxy = await ERC721Proxy.deploy(await swap.getAddress());
            await erc721proxy.waitForDeployment();

            await dai.connect(addr1).approve(erc721proxy, '10');
            await weth.approve(erc721proxy, '10');

            const order = buildOrder(
                {
                    makerAsset: await erc721proxy.getAddress(),
                    takerAsset: await erc721proxy.getAddress(),
                    // making and taking amounts are not used by ERC721Proxy
                    makingAmount: 1,
                    takingAmount: 1,
                    maker: addr1.address,
                },
                {
                    makerAssetSuffix: '0x' + erc721proxy.interface.encodeFunctionData('func_60iHVgK', [addr1.address, constants.ZERO_ADDRESS, 0, 10, await dai.getAddress()]).substring(202),
                    takerAssetSuffix: '0x' + erc721proxy.interface.encodeFunctionData('func_60iHVgK', [constants.ZERO_ADDRESS, addr1.address, 0, 10, await weth.getAddress()]).substring(202),
                },
            );

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const takerTraits = buildTakerTraits({
                threshold: 10n,
                makingAmount: true,
                extension: order.extension,
            });
            const fillTx = swap.fillOrderArgs(order, r, vs, 10, takerTraits.traits, takerTraits.args);
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [10, -10]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-10, 10]);
        });
    });

    describe('MakerTraits', function () {
        it('disallow multiple fills', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);
            // Order: 10 DAI => 2 WETH
            // Swap:  4 DAI => 1 WETH

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 10,
                takingAmount: 2,
                maker: addr1.address,
                makerTraits: buildMakerTraits({ allowMultipleFills: false }),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const fillTx = swap.fillOrder(order, r, vs, 4, fillWithMakingAmount(1));
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [4, -4]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);

            await expect(swap.fillOrder(order, r, vs, 4, fillWithMakingAmount(1)))
                .to.be.revertedWithCustomError(swap, 'BitInvalidatedOrder');
        });

        it('need epoch manager, success', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);
            // Order: 10 DAI => 2 WETH
            // Swap:  4 DAI => 1 WETH

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 10,
                takingAmount: 2,
                maker: addr1.address,
                makerTraits: buildMakerTraits({ shouldCheckEpoch: true }),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const fillTx = swap.fillOrder(order, r, vs, 4, fillWithMakingAmount(1));
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [4, -4]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
        });

        it('need epoch manager, fail', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);
            // Order: 10 DAI => 2 WETH
            // Swap:  4 DAI => 1 WETH

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 10,
                takingAmount: 2,
                maker: addr1.address,
                makerTraits: buildMakerTraits({ shouldCheckEpoch: true, nonce: 1 }),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            await expect(swap.fillOrder(order, r, vs, 4, fillWithMakingAmount(1)))
                .to.be.revertedWithCustomError(swap, 'WrongSeriesNonce');
        });

        it('unwrap weth for maker', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);
            // Order: 10 DAI => 2 WETH
            // Swap:  10 DAI => 2 ETH

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 10,
                takingAmount: 2,
                maker: addr1.address,
                makerTraits: buildMakerTraits({ unwrapWeth: true }),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const fillTx = swap.fillOrder(order, r, vs, 10, fillWithMakingAmount(2));
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [10, -10]);
            await expect(fillTx).to.changeTokenBalance(weth, addr, -2);
            await expect(fillTx).to.changeEtherBalance(addr1, 2);
        });
    });

    describe('TakerTraits', function () {
        it('DAI => WETH, send WETH to address different from msg.sender when fill', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const otherAddress = addr2;
            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 1800,
                takingAmount: 1,
                maker: addr1.address,
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const takerTraits = buildTakerTraits({
                target: otherAddress.address,
            });

            const fillTx = swap.fillOrderArgs(order, r, vs, 1, takerTraits.traits, takerTraits.args);

            await expect(fillTx).to.changeTokenBalance(dai, addr1, -1800);
            await expect(fillTx).to.changeTokenBalance(weth, addr, -1);

            // Pay out happened to otherAddress, specified in taker traits
            await expect(fillTx).to.changeTokenBalance(dai, otherAddress, 1800);
        });
    });

    describe('Permit', function () {
        describe('Taker Permit', function () {
            // tests that marked + are implemened
            //            | ok allowance | no allowance |
            // ok permit  |      -       |     +        |
            // bad permit |      +       |     +        |

            it('DAI => WETH, no allowance', async function () {
                const {
                    tokens: { dai, weth }, contracts: { swap }, chainId, permits: { taker: { order, signature: { r, vs } } },
                } = await loadFixture(deployContractsAndInit);

                const permit = await getPermit(addr.address, addr, weth, '1', chainId, await swap.getAddress(), '1');
                const takerTraits = buildTakerTraits({
                    threshold: 1n,
                    makingAmount: true,
                });

                await weth.approve(swap, '0');
                const fillTx = swap.permitAndCall(
                    ethers.solidityPacked(
                        ['address', 'bytes'],
                        [await weth.getAddress(), permit],
                    ),
                    swap.interface.encodeFunctionData('fillOrderArgs', [
                        order, r, vs, 1, takerTraits.traits, takerTraits.args,
                    ]),
                );
                await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
                await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
            });

            it('skips expired permit if allowance is enough', async function () {
                const {
                    tokens: { dai, weth }, contracts: { swap }, chainId, permits: { taker: { order, signature: { r, vs } } },
                } = await loadFixture(deployContractsAndInit);

                const deadline = (await time.latest()) - time.duration.weeks(1);
                const permit = await getPermit(addr.address, addr, weth, '1', chainId, await swap.getAddress(), '1', deadline);

                const takerTraits = buildTakerTraits({ threshold: 1n });
                const fillTx = swap.permitAndCall(
                    ethers.solidityPacked(
                        ['address', 'bytes'],
                        [await weth.getAddress(), permit],
                    ),
                    swap.interface.encodeFunctionData('fillOrderArgs', [
                        order, r, vs, 1, takerTraits.traits, takerTraits.args,
                    ]),
                );
                await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
                await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
            });

            it('rejects expired permit when allowance is not enough', async function () {
                const {
                    tokens: { weth }, contracts: { swap }, chainId, permits: { taker: { order, signature: { r, vs } } },
                } = await loadFixture(deployContractsAndInit);

                const deadline = (await time.latest()) - time.duration.weeks(1);
                const permit = await getPermit(addr.address, addr, weth, '1', chainId, await swap.getAddress(), '1', deadline);

                await weth.approve(swap, '0');
                const takerTraits = buildTakerTraits({ threshold: 1n });
                await expect(swap.permitAndCall(
                    ethers.solidityPacked(
                        ['address', 'bytes'],
                        [await weth.getAddress(), permit],
                    ),
                    swap.interface.encodeFunctionData('fillOrderArgs', [
                        order, r, vs, 1, takerTraits.traits, takerTraits.args,
                    ]),
                )).to.be.revertedWithCustomError(swap, 'TransferFromTakerToMakerFailed');
            });
        });

        describe('Maker Permit', function () {
            // tests that marked + are implemened
            //            | ok allowance | no allowance |
            // ok permit  |      -       |     +        |
            // bad permit |      +       |     +        |

            it('Maker permit works, no allowance', async function () {
                const {
                    tokens: { dai, weth }, contracts: { swap }, permits: { maker: { order, signature: { r, vs } } },
                } = await loadFixture(deployContractsAndInit);

                const takerTraits = buildTakerTraits({
                    threshold: 1n,
                    makingAmount: true,
                    extension: order.extension,
                });
                await weth.approve(swap, '0');
                const fillTx = swap.connect(addr1).fillOrderArgs(order, r, vs, 1, takerTraits.traits, takerTraits.args);
                await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
                await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
            });

            it('skips expired permit if allowance is enough', async function () {
                const {
                    tokens: { dai, weth }, contracts: { swap }, permits: { maker: { order, signature: { r, vs } } }, deadline,
                } = await loadFixture(deployContractsAndInit);

                await time.increaseTo(deadline + 1);

                const takerTraits = buildTakerTraits({
                    threshold: 1n,
                    makingAmount: true,
                    extension: order.extension,
                });
                const fillTx = swap.connect(addr1).fillOrderArgs(order, r, vs, 1, takerTraits.traits, takerTraits.args);
                await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
                await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
            });

            it('rejects expired permit when allowance is not enough', async function () {
                const {
                    tokens: { weth }, contracts: { swap }, permits: { maker: { order, signature: { r, vs } } }, deadline,
                } = await loadFixture(deployContractsAndInit);

                await weth.approve(swap, '0');
                await time.increaseTo(deadline + 1);

                const takerTraits = buildTakerTraits({
                    threshold: 1n,
                    makingAmount: true,
                    extension: order.extension,
                });
                await expect(swap.connect(addr1).fillOrderArgs(
                    order, r, vs, 1, takerTraits.traits, takerTraits.args,
                )).to.be.revertedWithCustomError(swap, 'TransferFromMakerToTakerFailed');
            });

            it('skips order permit flag', async function () {
                const {
                    tokens: { dai, weth }, contracts: { swap }, permits: { maker: { order, signature: { r, vs }, permit } },
                } = await loadFixture(deployContractsAndInit);

                await weth.approve(swap, '0');
                await addr1.sendTransaction({ to: await weth.getAddress(), data: '0xd505accf' + permit.substring(42) });
                const takerTraits = buildTakerTraits({
                    threshold: 0n,
                    skipMakerPermit: true,
                    extension: order.extension,
                });
                const fillTx = swap.connect(addr1).fillOrderArgs(order, r, vs, 1, takerTraits.traits, takerTraits.args);
                await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
                await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
            });
        });
    });

    describe('Permit2', function () {
        describe('Taker Permit', function () {
            // tests that marked + are implemened
            //            | ok allowance | no allowance |
            // ok permit  |      -       |     +        |
            // bad permit |      +       |     +        |
            it('DAI => WETH, no allowance', async function () {
                const {
                    tokens: { dai, weth }, contracts: { swap }, chainId, permits: { taker: { order, signature: { r, vs } } },
                } = await loadFixture(deployContractsAndInit);

                const permit = await getPermit2(addr, await weth.getAddress(), chainId, await swap.getAddress(), 1);

                const takerTraits = buildTakerTraits({
                    threshold: 1n,
                    makingAmount: true,
                    usePermit2: true,
                });
                await weth.approve(swap, '0');
                const fillTx = swap.permitAndCall(
                    ethers.solidityPacked(
                        ['address', 'bytes'],
                        [await weth.getAddress(), permit],
                    ),
                    swap.interface.encodeFunctionData('fillOrderArgs', [
                        order, r, vs, 1, takerTraits.traits, takerTraits.args,
                    ]),
                );
                await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
                await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
            });

            it('Skips expired permit if allowance is enough', async function () {
                const {
                    tokens: { dai, weth }, contracts: { swap, permit2Contract }, chainId, permits: { taker: { order, signature: { r, vs } } }, deadline,
                } = await loadFixture(deployContractsAndInit);

                const permit = await getPermit2(addr, await weth.getAddress(), chainId, await swap.getAddress(), 1);

                const tx = {
                    from: addr,
                    to: permit2Contract,
                    data: permit2Contract.interface.getFunction('permit').selector + permit.substring(2),
                };
                await addr.sendTransaction(tx);

                const permitExpired = await getPermit2(addr, await weth.getAddress(), chainId, await swap.getAddress(), 1, false, constants.MAX_UINT48, deadline);

                const takerTraits = buildTakerTraits({
                    threshold: 1n,
                    makingAmount: true,
                    usePermit2: true,
                });
                const fillTx = swap.permitAndCall(
                    ethers.solidityPacked(
                        ['address', 'bytes'],
                        [await weth.getAddress(), permitExpired],
                    ),
                    swap.interface.encodeFunctionData('fillOrderArgs', [
                        order, r, vs, 1, takerTraits.traits, takerTraits.args,
                    ]),
                );
                await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
                await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
            });

            it('Fails with expired permit if allowance is not enough', async function () {
                const {
                    tokens: { weth }, contracts: { swap }, chainId, permits: { taker: { order, signature: { r, vs } } },
                } = await loadFixture(deployContractsAndInit);

                const deadline = BigInt((await time.latest()) - time.duration.weeks(1));
                const permit = await getPermit2(addr, await weth.getAddress(), chainId, await swap.getAddress(), 1, false, constants.MAX_UINT48, deadline);

                const takerTraits = buildTakerTraits({
                    threshold: 1n,
                    makingAmount: true,
                    usePermit2: true,
                });
                await expect(swap.permitAndCall(
                    ethers.solidityPacked(
                        ['address', 'bytes'],
                        [await weth.getAddress(), permit],
                    ),
                    swap.interface.encodeFunctionData('fillOrderArgs', [
                        order, r, vs, 1, takerTraits.traits, takerTraits.args,
                    ]),
                )).to.be.revertedWithCustomError(swap, 'SafeTransferFromFailed');
            });

            it('Fails with unexpected takerAssetSuffix', async function () {
                const { tokens: { weth, dai }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

                const order = buildOrder(
                    {
                        makerAsset: await dai.getAddress(),
                        takerAsset: await weth.getAddress(),
                        makingAmount: 1,
                        takingAmount: 1,
                        maker: addr1.address,
                        makerTraits: buildMakerTraits({ }),
                    },
                    {
                        takerAssetSuffix: await weth.getAddress(),
                    },
                );

                const permit = await getPermit2(addr, await weth.getAddress(), chainId, await swap.getAddress(), 1);
                const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));

                const takerTraits = buildTakerTraits({
                    threshold: 1n,
                    makingAmount: true,
                    usePermit2: true,
                    extension: order.extension,
                });
                await expect(swap.permitAndCall(
                    ethers.solidityPacked(
                        ['address', 'bytes'],
                        [await weth.getAddress(), permit],
                    ),
                    swap.interface.encodeFunctionData('fillOrderArgs', [
                        order, r, vs, 1, takerTraits.traits, takerTraits.args,
                    ]),
                )).to.be.revertedWithCustomError(swap, 'InvalidPermit2Transfer');
            });
        });

        describe('Maker Permit', function () {
            // tests that marked + are implemened
            //            | ok allowance | no allowance |
            // ok permit  |      -       |     +        |
            // bad permit |      +       |     +        |
            it('Maker permit works', async function () {
                const {
                    tokens: { dai, weth }, contracts: { swap }, permits: { maker: { orderPermit2: order, signaturePermit2: { r, vs } } },
                } = await loadFixture(deployContractsAndInit);

                const takerTraits = buildTakerTraits({
                    threshold: 1n,
                    makingAmount: true,
                    extension: order.extension,
                });
                const fillTx = swap.connect(addr1).fillOrderArgs(order, r, vs, 1, takerTraits.traits, takerTraits.args);
                await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
                await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
            });

            it('Skips expired permit if allowance is enough', async function () {
                const {
                    tokens: { dai, weth }, contracts: { swap, permit2Contract }, chainId, permits: { maker: { orderPermit2: order, signaturePermit2: { r, vs } } }, deadline,
                } = await loadFixture(deployContractsAndInit);

                const permit = await getPermit2(addr, await weth.getAddress(), chainId, await swap.getAddress(), 1);
                const tx = {
                    from: addr,
                    to: permit2Contract,
                    data: permit2Contract.interface.getFunction('permit').selector + permit.substring(2),
                };
                await addr.sendTransaction(tx);

                await time.increaseTo(deadline + 1);

                const takerTraits = buildTakerTraits({
                    threshold: 1n,
                    makingAmount: true,
                    extension: order.extension,
                });
                const fillTx = swap.connect(addr1).fillOrderArgs(order, r, vs, 1, takerTraits.traits, takerTraits.args);
                await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
                await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
            });

            it('Fails with expired permit if allowance is not enough', async function () {
                const {
                    contracts: { swap }, permits: { maker: { orderPermit2: order, signaturePermit2: { r, vs } } }, deadline,
                } = await loadFixture(deployContractsAndInit);

                await time.increaseTo(deadline + 1);

                const takerTraits = buildTakerTraits({
                    threshold: 1n,
                    makingAmount: true,
                    extension: order.extension,
                });
                await expect(swap.connect(addr1).fillOrderArgs(
                    order, r, vs, 1, takerTraits.traits, takerTraits.args,
                )).to.be.revertedWithCustomError(swap, 'SafeTransferFromFailed');
            });

            it('Fails with unexpected makerAssetSuffix', async function () {
                const { tokens: { dai, weth }, contracts: { swap }, chainId, deadline } = await loadFixture(deployContractsAndInit);
                const permit = withTarget(
                    await weth.getAddress(),
                    await getPermit2(addr, await weth.getAddress(), chainId, await swap.getAddress(), 1, false, constants.MAX_UINT48, deadline),
                );

                const order = buildOrder(
                    {
                        makerAsset: await weth.getAddress(),
                        takerAsset: await dai.getAddress(),
                        makingAmount: 1,
                        takingAmount: 1,
                        maker: addr.address,
                        makerTraits: buildMakerTraits({ usePermit2: true }),
                    },
                    {
                        permit,
                        makerAssetSuffix: await weth.getAddress(),
                    },
                );
                const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr));

                const takerTraits = buildTakerTraits({
                    threshold: 1n,
                    makingAmount: true,
                    extension: order.extension,
                });
                await expect(swap.connect(addr1).fillOrderArgs(
                    order, r, vs, 1, takerTraits.traits, takerTraits.args,
                )).to.be.revertedWithCustomError(swap, 'InvalidPermit2Transfer');
            });
        });
    });

    describe('Amount Calculator', function () {
        it('empty takingAmountData should work on full fill', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                maker: addr1.address,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 10,
                takingAmount: 10,
                makerTraits: buildMakerTraits({ allowPartialFill: false }),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const fillTx = swap.fillOrder(order, r, vs, 10, fillWithMakingAmount(10));
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [10, -10]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-10, 10]);
        });

        it('empty takingAmountData should revert on partial fill', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                maker: addr1.address,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 10,
                takingAmount: 10,
                makerTraits: buildMakerTraits({ allowPartialFill: false }),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            await expect(swap.fillOrder(order, r, vs, 5, fillWithMakingAmount(5)))
                .to.be.revertedWithCustomError(swap, 'PartialFillNotAllowed');
        });

        it('empty makingAmountData should revert on partial fill', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                maker: addr1.address,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 10,
                takingAmount: 10,
                makerTraits: buildMakerTraits({ allowPartialFill: false }),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            await expect(swap.fillOrder(order, r, vs, 5, 5))
                .to.be.revertedWithCustomError(swap, 'PartialFillNotAllowed');
        });

        it('empty makingAmountData should work on full fill', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                maker: addr1.address,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 10,
                takingAmount: 10,
                makerTraits: buildMakerTraits({ allowPartialFill: false }),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const fillTx = swap.fillOrder(order, r, vs, 10, 10);
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [10, -10]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-10, 10]);
        });
    });

    describe('ETH Maker Orders', function () {
        it('Partial fill', async function () {
            const { tokens: { dai, weth }, contracts: { swap, ethOrders }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder(
                {
                    maker: await ethOrders.getAddress(),
                    receiver: addr1.address,
                    makerAsset: await weth.getAddress(),
                    takerAsset: await dai.getAddress(),
                    makingAmount: ether('0.3'),
                    takingAmount: ether('300'),
                },
                {
                    postInteraction: await ethOrders.getAddress(),
                },
            );
            const orderHash = await swap.hashOrder(order);

            const deposittx = ethOrders.connect(addr1).ethOrderDeposit(order, order.extension, { value: ether('0.3') });
            await expect(deposittx).to.changeEtherBalance(addr1, ether('-0.3'));
            await expect(deposittx).to.changeTokenBalance(weth, ethOrders, ether('0.3'));

            let orderMakerBalance = await ethOrders.ordersMakersBalances(orderHash);
            expect(orderMakerBalance.balance).to.equal(ether('0.3'));
            expect(orderMakerBalance.maker).to.equal(addr1.address);

            const ethOrdersBatch = await ethOrders.ethOrdersBatch([orderHash]);
            expect(ethOrdersBatch[0].balance).to.equal(ether('0.3'));
            expect(ethOrdersBatch[0].maker).to.equal(addr1.address);

            const signature = await signOrder(order, chainId, await swap.getAddress(), addr1);

            /// Partial fill
            const takerTraits1 = buildTakerTraits({
                threshold: ether('0.2'),
                extension: order.extension,
            });
            const fillTx1 = swap.fillContractOrderArgs(order, signature, ether('200'), takerTraits1.traits, takerTraits1.args);
            await expect(fillTx1).to.changeTokenBalances(dai, [addr, ethOrders, addr1], [ether('-200'), '0', ether('200')]);
            await expect(fillTx1).to.changeTokenBalances(weth, [addr, ethOrders, addr1], [ether('0.2'), ether('-0.2'), '0']);

            /// Remaining fill
            const takerTraits2 = buildTakerTraits({
                threshold: ether('0.1'),
                extension: order.extension,
            });
            const fillTx2 = swap.fillContractOrderArgs(order, signature, ether('100'), takerTraits2.traits, takerTraits2.args);
            await expect(fillTx2).to.changeTokenBalances(dai, [addr, ethOrders, addr1], [ether('-100'), '0', ether('100')]);
            await expect(fillTx2).to.changeTokenBalances(weth, [addr, ethOrders, addr1], [ether('0.1'), ether('-0.1'), '0']);

            orderMakerBalance = await ethOrders.ordersMakersBalances(orderHash);
            expect(orderMakerBalance.balance).to.equal(0);
            expect(orderMakerBalance.maker).to.equal(addr1.address);
        });

        it('Partial fill -> cancel -> refund maker -> fail to fill', async function () {
            const { tokens: { dai, weth }, contracts: { swap, ethOrders }, chainId } = await loadFixture(deployContractsAndInit);
            const order = buildOrder(
                {
                    maker: await ethOrders.getAddress(),
                    receiver: addr1.address,
                    makerAsset: await weth.getAddress(),
                    takerAsset: await dai.getAddress(),
                    makingAmount: ether('0.3'),
                    takingAmount: ether('300'),
                },
                {
                    postInteraction: await ethOrders.getAddress(),
                },
            );
            const orderHash = await swap.hashOrder(order);

            const deposittx = ethOrders.connect(addr1).ethOrderDeposit(order, order.extension, { value: ether('0.3') });
            await expect(deposittx).to.changeEtherBalance(addr1, ether('-0.3'));
            await expect(deposittx).to.changeTokenBalance(weth, ethOrders, ether('0.3'));

            const signature = await signOrder(order, chainId, await swap.getAddress(), addr1);

            /// Partial fill
            const fillTakerTraits = buildTakerTraits({
                threshold: ether('0.2'),
                extension: order.extension,
            });
            const fillTx = swap.fillContractOrderArgs(order, signature, ether('200'), fillTakerTraits.traits, fillTakerTraits.args);
            await expect(fillTx).to.changeTokenBalances(dai, [addr, ethOrders, addr1], [ether('-200'), '0', ether('200')]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, ethOrders, addr1], [ether('0.2'), ether('-0.2'), '0']);

            /// Cancel order
            const canceltx = ethOrders.connect(addr1).cancelOrder(order.makerTraits, orderHash);
            await expect(canceltx).to.changeTokenBalance(weth, ethOrders, ether('-0.1'));
            await expect(canceltx).to.changeEtherBalance(addr1, ether('0.1'));

            /// Remaining fill failure
            const takerTraits = buildTakerTraits({
                threshold: ether('0.1'),
                extension: order.extension,
            });
            await expect(swap.fillContractOrderArgs(order, signature, ether('100'), takerTraits.traits, takerTraits.args))
                .to.be.revertedWithCustomError(swap, 'InvalidatedOrder');
        });

        it('Invalid order (missing post-interaction)', async function () {
            const { tokens: { dai, weth }, contracts: { ethOrders } } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                maker: await ethOrders.getAddress(),
                receiver: addr1.address,
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('0.3'),
                takingAmount: ether('300'),
            });

            await expect(ethOrders.connect(addr1).ethOrderDeposit(order, order.extension, { value: ether('0.3') }))
                .to.be.revertedWithCustomError(ethOrders, 'InvalidOrder');
        });

        it('Invalid extension (empty extension)', async function () {
            const { tokens: { dai, weth }, contracts: { ethOrders }, orderLibFactory } = await loadFixture(deployContractsAndInit);

            const order = buildOrder(
                {
                    maker: await ethOrders.getAddress(),
                    receiver: addr1.address,
                    makerAsset: await weth.getAddress(),
                    takerAsset: await dai.getAddress(),
                    makingAmount: ether('0.3'),
                    takingAmount: ether('300'),
                },
                {
                    postInteraction: await ethOrders.getAddress(),
                },
            );

            await expect(ethOrders.connect(addr1).ethOrderDeposit(order, '0x', { value: ether('0.3') }))
                .to.be.revertedWithCustomError(orderLibFactory, 'MissingOrderExtension');
        });

        it('Invalid extension (mismatched extension)', async function () {
            const { tokens: { dai, weth }, contracts: { ethOrders }, orderLibFactory } = await loadFixture(deployContractsAndInit);

            const order = buildOrder(
                {
                    maker: await ethOrders.getAddress(),
                    receiver: addr1.address,
                    makerAsset: await weth.getAddress(),
                    takerAsset: await dai.getAddress(),
                    makingAmount: ether('0.3'),
                    takingAmount: ether('300'),
                },
                {
                    postInteraction: await ethOrders.getAddress(),
                },
            );

            await expect(ethOrders.connect(addr1).ethOrderDeposit(order, order.extension.slice(0, -6), { value: ether('0.3') }))
                .to.be.revertedWithCustomError(orderLibFactory, 'InvalidExtensionHash');
        });

        it('Invalid signature', async function () {
            const { tokens: { dai, weth }, contracts: { ethOrders, swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder(
                {
                    maker: await ethOrders.getAddress(),
                    receiver: addr1.address,
                    makerAsset: await weth.getAddress(),
                    takerAsset: await dai.getAddress(),
                    makingAmount: ether('0.3'),
                    takingAmount: ether('300'),
                },
                {
                    postInteraction: await ethOrders.getAddress(),
                },
            );
            const orderHash = await swap.hashOrder(order);

            const deposittx = ethOrders.connect(addr1).ethOrderDeposit(order, order.extension, { value: ether('0.3') });
            await expect(deposittx).to.changeEtherBalance(addr1, ether('-0.3'));
            await expect(deposittx).to.changeTokenBalance(weth, ethOrders, ether('0.3'));

            let orderMakerBalance = await ethOrders.ordersMakersBalances(orderHash);
            expect(orderMakerBalance.balance).to.equal(ether('0.3'));
            expect(orderMakerBalance.maker).to.equal(addr1.address);

            const ethOrdersBatch = await ethOrders.ethOrdersBatch([orderHash]);
            expect(ethOrdersBatch[0].balance).to.equal(ether('0.3'));
            expect(ethOrdersBatch[0].maker).to.equal(addr1.address);

            const signature = await signOrder(order, chainId, await swap.getAddress(), addr);

            const takerTraits1 = buildTakerTraits({
                threshold: ether('0.2'),
                extension: order.extension,
            });
            await expect(
                swap.fillContractOrderArgs(order, signature, ether('200'), takerTraits1.traits, takerTraits1.args),
            ).to.be.revertedWithCustomError(swap, 'BadSignature');

            orderMakerBalance = await ethOrders.ordersMakersBalances(orderHash);
            expect(orderMakerBalance.balance).to.equal(ether('0.3'));
            expect(orderMakerBalance.maker).to.equal(addr1.address);
        });
    });

    describe('Remaining invalidator', function () {
        const orderCancelationInit = async function () {
            const { tokens, contracts, chainId } = await deployContractsAndInit();
            const order = buildOrder({
                makerAsset: await tokens.dai.getAddress(),
                takerAsset: await tokens.weth.getAddress(),
                makingAmount: 2,
                takingAmount: 2,
                maker: addr1.address,
                makerTraits: buildMakerTraits({ allowMultipleFills: true }),
            });
            return { tokens, contracts, chainId, order };
        };

        it('should revert for new order', async function () {
            const { contracts: { swap }, chainId, order } = await loadFixture(orderCancelationInit);
            const data = buildOrderData(chainId, await swap.getAddress(), order);
            const orderHash = ethers.TypedDataEncoder.hash(data.domain, data.types, data.value);
            await expect(swap.remainingInvalidatorForOrder(addr1.address, orderHash)).to.be.revertedWithCustomError(swap, 'RemainingInvalidatedOrder');
        });

        it('should return correct remaining for partially filled order', async function () {
            const { contracts: { swap }, chainId, order } = await loadFixture(orderCancelationInit);
            const signature = await signOrder(order, chainId, await swap.getAddress(), addr1);
            const { r, yParityAndS: vs } = ethers.Signature.from(signature);
            const data = buildOrderData(chainId, await swap.getAddress(), order);
            const orderHash = ethers.TypedDataEncoder.hash(data.domain, data.types, data.value);

            await swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1));

            expect(await swap.remainingInvalidatorForOrder(addr1.address, orderHash)).to.equal('1');
        });

        it('should return zero remaining for filled order', async function () {
            const { contracts: { swap }, chainId, order } = await loadFixture(orderCancelationInit);
            const signature = await signOrder(order, chainId, await swap.getAddress(), addr1);
            const { r, yParityAndS: vs } = ethers.Signature.from(signature);
            const data = buildOrderData(chainId, await swap.getAddress(), order);
            const orderHash = ethers.TypedDataEncoder.hash(data.domain, data.types, data.value);

            await swap.fillOrder(order, r, vs, 2, fillWithMakingAmount(2));

            expect(await swap.remainingInvalidatorForOrder(addr1.address, orderHash)).to.equal('0');
        });

        it('should return zero remaining for cancelled order', async function () {
            const { contracts: { swap }, chainId, order } = await loadFixture(orderCancelationInit);
            const data = buildOrderData(chainId, await swap.getAddress(), order);
            const orderHash = ethers.TypedDataEncoder.hash(data.domain, data.types, data.value);

            await swap.connect(addr1).cancelOrder(order.makerTraits, orderHash);

            expect(await swap.remainingInvalidatorForOrder(addr1.address, orderHash)).to.equal('0');
        });
    });

    describe('Order Cancelation', function () {
        const orderCancelationInit = async function () {
            const { tokens, contracts, chainId } = await deployContractsAndInit();
            const order = buildOrder({
                makerAsset: await tokens.dai.getAddress(),
                takerAsset: await tokens.weth.getAddress(),
                makingAmount: 1,
                takingAmount: 1,
                maker: addr1.address,
                makerTraits: buildMakerTraits({ allowMultipleFills: true }),
            });
            return { tokens, contracts, chainId, order };
        };

        const orderWithEpochInit = async function () {
            const { tokens, contracts, chainId } = await deployContractsAndInit();
            const order = buildOrder({
                makerAsset: await tokens.dai.getAddress(),
                takerAsset: await tokens.weth.getAddress(),
                makingAmount: 2,
                takingAmount: 2,
                maker: addr1.address,
                makerTraits: buildMakerTraits({ allowMultipleFills: true, shouldCheckEpoch: true, nonce: 0, series: 1 }),
            });
            return { tokens, contracts, chainId, order };
        };

        // TODO: it could be canceled with another makerTraits, 1n << ALLOW_MUTIPLE_FILLS_FLAG (254n) for example
        it('should cancel own order', async function () {
            const { contracts: { swap }, chainId, order } = await loadFixture(orderCancelationInit);
            const data = buildOrderData(chainId, await swap.getAddress(), order);
            const orderHash = ethers.TypedDataEncoder.hash(data.domain, data.types, data.value);
            await swap.connect(addr1).cancelOrder(order.makerTraits, orderHash);
            expect(await swap.remainingInvalidatorForOrder(addr1.address, orderHash)).to.equal('0');
        });

        it('should cancel own order with massInvalidate', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const orderNonce = 0;
            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 1,
                takingAmount: 1,
                maker: addr1.address,
                makerTraits: buildMakerTraitsRFQ({ nonce: orderNonce }),
            });
            const data = buildOrderData(chainId, await swap.getAddress(), order);
            const orderHash = ethers.TypedDataEncoder.hash(data.domain, data.types, data.value);

            await swap.connect(addr1).cancelOrder(order.makerTraits, orderHash);
            const invalidator = await swap.bitInvalidatorForOrder(addr1.address, orderNonce);
            expect(invalidator).to.equal('1');
        });

        it('should cancel own order with massInvalidate, huge nonce', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const orderNonce = 1023;
            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 1,
                takingAmount: 1,
                maker: addr1.address,
                makerTraits: buildMakerTraitsRFQ({ nonce: orderNonce }),
            });
            const data = buildOrderData(chainId, await swap.getAddress(), order);
            const orderHash = ethers.TypedDataEncoder.hash(data.domain, data.types, data.value);

            await swap.connect(addr1).cancelOrder(order.makerTraits, orderHash);
            const invalidator = await swap.bitInvalidatorForOrder(addr1.address, orderNonce);
            expect(invalidator).to.equal(1n << 255n);
        });

        it('should cancel any hash', async function () {
            const { contracts: { swap }, order } = await loadFixture(orderCancelationInit);
            await swap.connect(addr1).cancelOrder(order.makerTraits, '0x0000000000000000000000000000000000000000000000000000000000000001');
            expect(await swap.remainingInvalidatorForOrder(addr1.address, '0x0000000000000000000000000000000000000000000000000000000000000001')).to.equal('0');
        });

        it('can simulate the failure of bitsInvalidateForOrder', async function () {
            const { contracts: { swap }, order } = await loadFixture(orderCancelationInit);

            const calldata = swap.interface.encodeFunctionData('bitsInvalidateForOrder', [
                order.makerTraits,
                0,
            ]);

            const cancelationSimulate = swap.simulate(swap, calldata);
            await expect(cancelationSimulate)
                .to.be.revertedWithCustomError(swap, 'SimulationResults')
                .withArgs(false, swap.interface.getError('OrderIsNotSuitableForMassInvalidation').selector);
        });

        it('should cancel several orders by hash', async function () {
            const { contracts: { swap }, order } = await loadFixture(orderCancelationInit);

            const firstOrder = order;
            const secondOrder = order;

            const firstOrderFakeHash = '0x0000000000000000000000000000000000000000000000000000000000000001';
            const secondOrderFakeHash = '0x0000000000000000000000000000000000000000000000000000000000000002';

            await swap.connect(addr1).cancelOrders(
                [firstOrder.makerTraits, secondOrder.makerTraits],
                [firstOrderFakeHash, secondOrderFakeHash],
            );

            expect(await swap.remainingInvalidatorForOrder(addr1.address, firstOrderFakeHash)).to.equal('0');
            expect(await swap.remainingInvalidatorForOrder(addr1.address, secondOrderFakeHash)).to.equal('0');
        });

        it('should revert when cancel several orders by hash and mismathed number of traits', async function () {
            const { contracts: { swap }, order } = await loadFixture(orderCancelationInit);

            const firstOrder = order;

            const firstOrderFakeHash = '0x0000000000000000000000000000000000000000000000000000000000000001';
            const secondOrderFakeHash = '0x0000000000000000000000000000000000000000000000000000000000000002';

            await expect(swap.connect(addr1).cancelOrders(
                [firstOrder.makerTraits],
                [firstOrderFakeHash, secondOrderFakeHash],
            )).to.be.revertedWithCustomError(swap, 'MismatchArraysLengths');
        });

        it('rawRemainingInvalidatorForOrder returns method works', async function () {
            const { contracts: { swap }, order } = await loadFixture(orderCancelationInit);
            const orderFakeHash = '0x0000000000000000000000000000000000000000000000000000000000000001';

            expect(await swap.rawRemainingInvalidatorForOrder(addr1.address, orderFakeHash)).to.equal('0');

            await swap.connect(addr1).cancelOrder(order.makerTraits, orderFakeHash);

            const minusOne = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';
            expect(await swap.rawRemainingInvalidatorForOrder(addr1.address, orderFakeHash)).to.equal(minusOne);
        });

        it('should not fill cancelled order', async function () {
            const { contracts: { swap }, chainId, order } = await loadFixture(orderCancelationInit);
            const signature = await signOrder(order, chainId, await swap.getAddress(), addr1);
            const { r, yParityAndS: vs } = ethers.Signature.from(signature);
            const data = buildOrderData(chainId, await swap.getAddress(), order);
            const orderHash = ethers.TypedDataEncoder.hash(data.domain, data.types, data.value);

            await swap.connect(addr1).cancelOrder(order.makerTraits, orderHash);

            await expect(swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1)))
                .to.be.revertedWithCustomError(swap, 'InvalidatedOrder');
        });

        it('should not fill cancelled order, massInvalidate', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(orderCancelationInit);

            const orderNonce = 0;
            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 1,
                takingAmount: 1,
                maker: addr1.address,
                makerTraits: buildMakerTraitsRFQ({ nonce: orderNonce }),
            });
            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const data = buildOrderData(chainId, await swap.getAddress(), order);
            const orderHash = ethers.TypedDataEncoder.hash(data.domain, data.types, data.value);

            await swap.connect(addr1).cancelOrder(order.makerTraits, orderHash);

            await expect(swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1)))
                .to.be.revertedWithCustomError(swap, 'BitInvalidatedOrder');
        });

        it('epoch change, order should fail', async function () {
            const { contracts: { swap }, chainId, order } = await loadFixture(orderWithEpochInit);

            await swap.connect(addr1).increaseEpoch(1);

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            await expect(swap.fillOrder(order, r, vs, 2, fillWithMakingAmount(2)))
                .to.be.revertedWithCustomError(swap, 'WrongSeriesNonce');
        });

        it('epoch change should not affect other addresses', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId, order } = await loadFixture(orderWithEpochInit);

            await swap.connect(addr2).increaseEpoch(1);

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const fillTx = swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1));
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
        });

        it('epoch change, partially filled order should fail', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId, order } = await loadFixture(orderWithEpochInit);

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const fillTx = swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1));
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);

            await swap.connect(addr1).increaseEpoch(1);

            await expect(swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1)))
                .to.be.revertedWithCustomError(swap, 'WrongSeriesNonce');
        });

        it('advance nonce', async function () {
            const { contracts: { swap } } = await loadFixture(deployContractsAndInit);
            await swap.increaseEpoch(0);
            expect(await swap.epoch(addr.address, 0)).to.equal('1');
        });
    });

    describe('Private Orders', function () {
        it('should fill with correct taker', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 1,
                takingAmount: 1,
                maker: addr1.address,
                makerTraits: buildMakerTraits({ allowedSender: addr.address }),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const fillTx = swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1));
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
        });

        it('should not fill with incorrect taker', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 1,
                takingAmount: 1,
                maker: addr1.address,
                makerTraits: buildMakerTraits({ allowedSender: addr1.address }),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            await expect(swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1)))
                .to.be.revertedWithCustomError(swap, 'PrivateOrder');
        });
    });

    describe('Predicate', function () {
        it('arbitrary call predicate should pass', async function () {
            const { tokens: { dai, weth }, contracts: { swap, arbitraryPredicate }, chainId } = await loadFixture(deployContractsAndInit);

            const arbitraryCall = swap.interface.encodeFunctionData('arbitraryStaticCall', [
                await arbitraryPredicate.getAddress(),
                arbitraryPredicate.interface.encodeFunctionData('copyArg', [1]),
            ]);
            const predicate = swap.interface.encodeFunctionData('lt', [10, arbitraryCall]);

            const order = buildOrder(
                {
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: 1,
                    takingAmount: 1,
                    maker: addr1.address,
                },
                {
                    predicate,
                },
            );

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const takerTraits = buildTakerTraits({
                threshold: 1n,
                extension: order.extension,
            });
            const fillTx = swap.fillOrderArgs(order, r, vs, 1, takerTraits.traits, takerTraits.args);
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
        });

        it('arbitrary call predicate should fail', async function () {
            const { tokens: { dai, weth }, contracts: { swap, arbitraryPredicate }, chainId } = await loadFixture(deployContractsAndInit);

            const arbitraryCall = swap.interface.encodeFunctionData('arbitraryStaticCall', [
                await arbitraryPredicate.getAddress(),
                arbitraryPredicate.interface.encodeFunctionData('copyArg', [1]),
            ]);
            const predicate = swap.interface.encodeFunctionData('gt', [10, arbitraryCall]);

            const order = buildOrder(
                {
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: 1,
                    takingAmount: 1,
                    maker: addr1.address,
                },
                {
                    predicate,
                },
            );

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const takerTraits = buildTakerTraits({
                threshold: 1n,
                extension: order.extension,
            });
            await expect(swap.fillOrderArgs(order, r, vs, 1, takerTraits.traits, takerTraits.args))
                .to.be.revertedWithCustomError(swap, 'PredicateIsNotTrue');
        });

        it('`or` should pass', async function () {
            const { tokens: { dai, weth }, contracts: { swap, arbitraryPredicate }, chainId } = await loadFixture(deployContractsAndInit);

            const arbitraryCallPredicate = swap.interface.encodeFunctionData('arbitraryStaticCall', [
                await arbitraryPredicate.getAddress(),
                arbitraryPredicate.interface.encodeFunctionData('copyArg', [10]),
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
                {
                    predicate,
                },
            );

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const takerTraits = buildTakerTraits({
                threshold: 1n,
                extension: order.extension,
            });
            const fillTx = swap.fillOrderArgs(order, r, vs, 1, takerTraits.traits, takerTraits.args);
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
        });

        it('`or` should fail', async function () {
            const { tokens: { dai, weth }, contracts: { swap, arbitraryPredicate }, chainId } = await loadFixture(deployContractsAndInit);

            const arbitraryCallPredicate = swap.interface.encodeFunctionData('arbitraryStaticCall', [
                await arbitraryPredicate.getAddress(),
                arbitraryPredicate.interface.encodeFunctionData('copyArg', [10]),
            ]);
            const comparelt = swap.interface.encodeFunctionData('lt', [5, arbitraryCallPredicate]);
            const comparegt = swap.interface.encodeFunctionData('gt', [15, arbitraryCallPredicate]);

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
                {
                    predicate,
                },
            );

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const takerTraits = buildTakerTraits({
                threshold: 1n,
                extension: order.extension,
            });
            await expect(swap.fillOrderArgs(order, r, vs, 1, takerTraits.traits, takerTraits.args))
                .to.be.revertedWithCustomError(swap, 'PredicateIsNotTrue');
        });

        it('`and` should pass', async function () {
            const { tokens: { dai, weth }, contracts: { swap, arbitraryPredicate }, chainId } = await loadFixture(deployContractsAndInit);

            const arbitraryCallPredicate = swap.interface.encodeFunctionData('arbitraryStaticCall', [
                await arbitraryPredicate.getAddress(),
                arbitraryPredicate.interface.encodeFunctionData('copyArg', [10]),
            ]);
            const comparelt = swap.interface.encodeFunctionData('lt', [15, arbitraryCallPredicate]);
            const comparegt = swap.interface.encodeFunctionData('gt', [5, arbitraryCallPredicate]);

            const { offsets, data } = joinStaticCalls([comparelt, comparegt]);
            const predicate = swap.interface.encodeFunctionData('and', [offsets, data]);

            const order = buildOrder(
                {
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: 1,
                    takingAmount: 1,
                    maker: addr1.address,
                },
                {
                    predicate,
                },
            );

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const takerTraits = buildTakerTraits({
                threshold: 1n,
                extension: order.extension,
            });
            const fillTx = swap.fillOrderArgs(order, r, vs, 1, takerTraits.traits, takerTraits.args);
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
        });

        it('`and` should fail', async function () {
            const { tokens: { dai, weth }, contracts: { swap, arbitraryPredicate }, chainId } = await loadFixture(deployContractsAndInit);

            const arbitraryCallPredicate = swap.interface.encodeFunctionData('arbitraryStaticCall', [
                await arbitraryPredicate.getAddress(),
                arbitraryPredicate.interface.encodeFunctionData('copyArg', [10]),
            ]);
            const comparelt = swap.interface.encodeFunctionData('lt', [5, arbitraryCallPredicate]);
            const comparegt = swap.interface.encodeFunctionData('gt', [15, arbitraryCallPredicate]);

            const { offsets, data } = joinStaticCalls([comparelt, comparegt]);
            const predicate = swap.interface.encodeFunctionData('and', [offsets, data]);

            const order = buildOrder(
                {
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: 1,
                    takingAmount: 1,
                    maker: addr1.address,
                },
                {
                    predicate,
                },
            );

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const takerTraits = buildTakerTraits({
                threshold: 1n,
                extension: order.extension,
            });
            await expect(swap.fillOrderArgs(order, r, vs, 1, takerTraits.traits, takerTraits.args))
                .to.be.revertedWithCustomError(swap, 'PredicateIsNotTrue');
        });

        it('should fail with invalid extension (empty extension)', async function () {
            const {
                tokens: { dai, weth }, contracts: { swap, arbitraryPredicate }, chainId, orderLibFactory,
            } = await loadFixture(deployContractsAndInit);

            const arbitraryCall = swap.interface.encodeFunctionData('arbitraryStaticCall', [
                await arbitraryPredicate.getAddress(),
                arbitraryPredicate.interface.encodeFunctionData('copyArg', [1]),
            ]);
            const predicate = swap.interface.encodeFunctionData('lt', [10, arbitraryCall]);

            const order = buildOrder(
                {
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: 1,
                    takingAmount: 1,
                    maker: addr1.address,
                },
                {
                    predicate,
                },
            );

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const takerTraits = buildTakerTraits({
                threshold: 1n,
            });
            await expect(swap.fillOrderArgs(order, r, vs, 1, takerTraits.traits, takerTraits.args))
                .to.be.revertedWithCustomError(orderLibFactory, 'MissingOrderExtension');
        });

        it('should fail with invalid extension (mismatched extension)', async function () {
            const {
                tokens: { dai, weth }, contracts: { swap, arbitraryPredicate }, chainId, orderLibFactory,
            } = await loadFixture(deployContractsAndInit);

            const arbitraryCall = swap.interface.encodeFunctionData('arbitraryStaticCall', [
                await arbitraryPredicate.getAddress(),
                arbitraryPredicate.interface.encodeFunctionData('copyArg', [1]),
            ]);
            const predicate = swap.interface.encodeFunctionData('lt', [10, arbitraryCall]);

            const order = buildOrder(
                {
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: 1,
                    takingAmount: 1,
                    maker: addr1.address,
                },
                {
                    predicate,
                },
            );

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const takerTraits = buildTakerTraits({
                threshold: 1n,
                extension: order.extension + '0011223344',
            });
            await expect(swap.fillOrderArgs(order, r, vs, 1, takerTraits.traits, takerTraits.args))
                .to.be.revertedWithCustomError(orderLibFactory, 'InvalidExtensionHash');
        });

        it('should fail with invalid extension (unexpected extension)', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId, orderLibFactory } = await loadFixture(deployContractsAndInit);

            const order = buildOrder(
                {
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: 1,
                    takingAmount: 1,
                    maker: addr1.address,
                },
            );

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const takerTraits = buildTakerTraits({
                threshold: 1n,
                extension: '0xabacabac',
            });
            await expect(swap.fillOrderArgs(order, r, vs, 1, takerTraits.traits, takerTraits.args))
                .to.be.revertedWithCustomError(orderLibFactory, 'UnexpectedOrderExtension');
        });
    });

    describe('Expiration', function () {
        it('should fill when not expired', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 1,
                takingAmount: 1,
                maker: addr1.address,
                makerTraits: buildMakerTraits({ expiry: (await time.latest()) + 3600 }),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const fillTx = swap.fillOrder(order, r, vs, fillWithMakingAmount(1), 1);
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);
        });

        it('should not fill when expired', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 1,
                takingAmount: 1,
                maker: addr1.address,
                makerTraits: buildMakerTraits({ expiry: 0xff0000n }),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            await expect(swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1)))
                .to.be.revertedWithCustomError(swap, 'OrderExpired');
        });

        it('should not partially fill when expired', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 10,
                takingAmount: 2,
                maker: addr1.address,
                makerTraits: buildMakerTraits({ expiry: await time.latest() }),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            await expect(swap.fillOrder(order, r, vs, 4, fillWithMakingAmount(1)))
                .to.be.revertedWithCustomError(swap, 'OrderExpired');
        });

        it('should not fill partially filled order after expiration', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 10,
                takingAmount: 2,
                maker: addr1.address,
                makerTraits: buildMakerTraits({ expiry: await time.latest() + 1800 }),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const fillTx = swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1));
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [1, -1]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-1, 1]);

            await time.increase(3600);

            await expect(swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1)))
                .to.be.revertedWithCustomError(swap, 'OrderExpired');
        });

        it('should fill partially if not enough coins (taker)', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 2,
                takingAmount: 2,
                maker: addr1.address,
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const fillTx = swap.fillOrder(order, r, vs, 3, 2);
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [2, -2]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-2, 2]);
        });

        it('should fill partially if not enough coins (maker)', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 2,
                takingAmount: 2,
                maker: addr1.address,
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const fillTx = swap.fillOrder(order, r, vs, 3, fillWithMakingAmount(3));
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [2, -2]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-2, 2]);
        });
    });

    describe('ETH fill', function () {
        it('should fill with ETH', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 900,
                takingAmount: 3,
                maker: addr1.address,
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const fillTx = swap.fillOrder(order, r, vs, 900, fillWithMakingAmount(3), { value: 3 });
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [900, -900]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [0, 3]);
            await expect(fillTx).to.changeEtherBalance(addr, -3);
        });

        it('should revert with takerAsset WETH and not enough msg.value', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 900,
                takingAmount: 3,
                maker: addr1.address,
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            await expect(swap.fillOrder(order, r, vs, 900, fillWithMakingAmount(3), { value: 2 }))
                .to.be.revertedWithCustomError(swap, 'InvalidMsgValue');
        });

        it('should pass with takerAsset WETH and correct msg.value', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 900,
                takingAmount: 3,
                maker: addr1.address,
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const fillTx = swap.fillOrder(order, r, vs, 900, fillWithMakingAmount(3), { value: 4 });
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [900, -900]);
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [0, 3]);
            await expect(fillTx).to.changeEtherBalance(addr, -3);
        });

        it('should pass with takerAsset WETH and correct msg.value and unwrap flag is set', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 900,
                takingAmount: 3,
                maker: addr1.address,
                makerTraits: buildMakerTraits({
                    unwrapWeth: true,
                }),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            const fillTx = swap.fillOrder(order, r, vs, 900, fillWithMakingAmount(3), { value: 4 });
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [900, -900]);
            await expect(fillTx).to.changeEtherBalance(addr, -3);
            await expect(fillTx).to.changeEtherBalance(addr1, 3);
        });

        it('should revert with takerAsset WETH, unwrap flag is set and receiver unable to receive ETH', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 900,
                takingAmount: 3,
                maker: addr1.address,
                makerTraits: buildMakerTraits({
                    unwrapWeth: true,
                }),
                receiver: await swap.getAddress(),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            await expect(
                swap.fillOrder(order, r, vs, 900, fillWithMakingAmount(3), { value: 4 },
                )).to.be.revertedWithCustomError(swap, 'ETHTransferFailed');
        });

        it('should be reverted with takerAsset non-WETH and msg.value greater than 0', async function () {
            const { tokens: { dai, usdc }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            await usdc.mint(addr, '1000000');
            await usdc.approve(swap, '1000000');

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await usdc.getAddress(),
                makingAmount: 900,
                takingAmount: 900,
                maker: addr1.address,
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            await expect(swap.fillOrder(order, r, vs, 900, fillWithMakingAmount(900), { value: 1 }))
                .to.be.revertedWithCustomError(swap, 'InvalidMsgValue');
        });

        it('should revert with takerAsset WETH, unwrap flag is set and taker unable to receive excessive ETH', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            const TakerContract = await ethers.getContractFactory('TakerContract');
            const taker = await TakerContract.deploy(swap);
            await taker.waitForDeployment();

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 900,
                takingAmount: 3,
                maker: addr1.address,
                makerTraits: buildMakerTraits({
                    unwrapWeth: true,
                }),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            await expect(
                taker.fillOrder(order, r, vs, 900, fillWithMakingAmount(3), { value: 4 },
                )).to.be.revertedWithCustomError(swap, 'ETHTransferFailed');
        });
    });

    describe('Pause', function () {
        it('Paused contract should not work', async function () {
            const { tokens: { dai, weth }, contracts: { swap }, chainId } = await loadFixture(deployContractsAndInit);

            await swap.pause();

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: 1,
                takingAmount: 1,
                maker: addr1.address,
                makerTraits: buildMakerTraits(),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
            await expect(swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1))).to.be.revertedWithCustomError(swap, 'EnforcedPause');
        });

        it('pause and unpause can only be called by owner', async function () {
            const { contracts: { swap } } = await loadFixture(deployContractsAndInit);
            await expect(swap.connect(addr2).pause()).to.be.revertedWithCustomError(swap, 'OwnableUnauthorizedAccount', addr2.address);
            await expect(swap.connect(addr2).unpause()).to.be.revertedWithCustomError(swap, 'OwnableUnauthorizedAccount', addr2.address);
        });

        it('unpause should work', async function () {
            const { contracts: { swap } } = await loadFixture(deployContractsAndInit);
            await swap.pause();
            await swap.unpause();
            expect(await swap.paused()).to.be.false;
        });
    });
});
