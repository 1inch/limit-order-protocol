const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');
const { ethers } = require('hardhat');
const { ether } = require('./helpers/utils');
const { makeMakingAmount, signOrder, buildOrder, compactSignature, buildConstraints } = require('./helpers/orderUtils');

describe('Interactions', function () {
    let addr, addr1;
    const abiCoder = ethers.utils.defaultAbiCoder;

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
    });

    async function initContracts () {
        const { dai, weth, swap, chainId } = await deploySwapTokens();

        await dai.mint(addr.address, ether('100'));
        await dai.mint(addr1.address, ether('100'));
        await weth.deposit({ value: ether('1') });
        await weth.connect(addr1).deposit({ value: ether('1') });

        await dai.approve(swap.address, ether('100'));
        await dai.connect(addr1).approve(swap.address, ether('100'));
        await weth.approve(swap.address, ether('1'));
        await weth.connect(addr1).approve(swap.address, ether('1'));

        return { dai, weth, swap, chainId };
    };

    describe('recursive swap', function () {
        async function initContractsWithRecursiveMatcher () {
            const { dai, weth, swap, chainId } = await initContracts();

            const RecursiveMatcher = await ethers.getContractFactory('RecursiveMatcher');
            const matcher = await RecursiveMatcher.deploy();
            await matcher.deployed();

            return { dai, weth, swap, chainId, matcher };
        }

        it('opposite direction recursive swap', async function () {
            const { dai, weth, swap, chainId, matcher } = await loadFixture(initContractsWithRecursiveMatcher);

            const order = buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                maker: addr.address,
            });

            const backOrder = buildOrder({
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                maker: addr1.address,
            });

            const signature = await signOrder(order, chainId, swap.address, addr);
            const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr1);

            const matchingParams = matcher.address + '01' + abiCoder.encode(
                ['address[]', 'bytes[]'],
                [
                    [
                        weth.address,
                        dai.address,
                    ],
                    [
                        weth.interface.encodeFunctionData('approve', [swap.address, ether('0.1')]),
                        dai.interface.encodeFunctionData('approve', [swap.address, ether('100')]),
                    ],
                ],
            ).substring(2);

            const interaction = matcher.address + '00' + swap.interface.encodeFunctionData('fillOrderTo', [
                backOrder,
                compactSignature(signatureBackOrder).r,
                compactSignature(signatureBackOrder).vs,
                ether('0.1'),
                makeMakingAmount(ether('100')),
                matcher.address,
                matchingParams,
            ]).substring(10);

            const { r, vs } = compactSignature(signature);
            await expect(matcher.matchOrders(swap.address, order, r, vs, ether('100'), makeMakingAmount(ether('0.1')), interaction))
                .to.changeTokenBalances(dai, [addr.address, addr1.address], [-ether('100'), ether('100')])
                .to.changeTokenBalances(weth, [addr.address, addr1.address], [ether('0.1'), -ether('0.1')]);
        });

        it('unidirectional recursive swap', async function () {
            const { dai, weth, swap, chainId, matcher } = await loadFixture(initContractsWithRecursiveMatcher);

            const order = buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                maker: addr1.address,
                constraints: buildConstraints({ nonce: 0 }),
            });

            const backOrder = buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                maker: addr1.address,
                constraints: buildConstraints({ nonce: 0 }),
            });

            const signature = await signOrder(order, chainId, swap.address, addr1);
            const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr1);

            const matchingParams = matcher.address + '01' + abiCoder.encode(
                ['address[]', 'bytes[]'],
                [
                    [
                        weth.address,
                        weth.address,
                        dai.address,
                    ],
                    [
                        weth.interface.encodeFunctionData('transferFrom', [addr.address, matcher.address, ether('0.025')]),
                        dai.interface.encodeFunctionData('approve', [swap.address, ether('0.025')]),
                        weth.interface.encodeFunctionData('transfer', [addr.address, ether('25')]),
                    ],
                ],
            ).substring(2);

            const interaction = matcher.address + '00' + swap.interface.encodeFunctionData('fillOrderTo', [
                backOrder,
                compactSignature(signatureBackOrder).r,
                compactSignature(signatureBackOrder).vs,
                ether('15'),
                makeMakingAmount(ether('0.015')),
                matcher.address,
                matchingParams,
            ]).substring(10);

            await weth.approve(matcher.address, ether('0.025'));
            const { r, vs } = compactSignature(signature);
            await expect(matcher.matchOrders(swap.address, order, r, vs, ether('10'), makeMakingAmount(ether('0.01')), interaction))
                .to.changeTokenBalances(dai, [addr.address, addr1.address], [ether('25'), -ether('25')])
                .to.changeTokenBalances(weth, [addr.address, addr1.address], [-ether('0.025'), ether('0.025')]);
        });

        it('triple recursive swap', async function () {
            const { dai, weth, swap, chainId, matcher } = await loadFixture(initContractsWithRecursiveMatcher);

            const order1 = buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                maker: addr1.address,
                constraints: buildConstraints({ nonce: 0 }),
            });

            const order2 = buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                maker: addr1.address,
                constraints: buildConstraints({ nonce: 0 }),
            });

            const backOrder = buildOrder({
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.025'),
                takingAmount: ether('25'),
                maker: addr.address,
                constraints: buildConstraints({ nonce: 0 }),
            });

            const signature1 = await signOrder(order1, chainId, swap.address, addr1);
            const signature2 = await signOrder(order2, chainId, swap.address, addr1);
            const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr);

            const matchingParams = matcher.address + '01' + abiCoder.encode(
                ['address[]', 'bytes[]'],
                [
                    [
                        weth.address,
                        dai.address,
                    ],
                    [
                        weth.interface.encodeFunctionData('approve', [swap.address, ether('0.025')]),
                        dai.interface.encodeFunctionData('approve', [swap.address, ether('25')]),
                    ],
                ],
            ).substring(2);

            const internalInteraction = matcher.address + '00' + swap.interface.encodeFunctionData('fillOrderTo', [
                backOrder,
                compactSignature(signatureBackOrder).r,
                compactSignature(signatureBackOrder).vs,
                ether('0.025'),
                makeMakingAmount(ether('25')),
                matcher.address,
                matchingParams,
            ]).substring(10);

            const externalInteraction = matcher.address + '00' + swap.interface.encodeFunctionData('fillOrderTo', [
                order2,
                compactSignature(signature2).r,
                compactSignature(signature2).vs,
                ether('15'),
                makeMakingAmount(ether('0.015')),
                matcher.address,
                internalInteraction,
            ]).substring(10);

            const { r, vs } = compactSignature(signature1);
            await expect(matcher.matchOrders(swap.address, order1, r, vs, ether('10'), makeMakingAmount(ether('0.01')), externalInteraction))
                .to.changeTokenBalances(dai, [addr.address, addr1.address], [ether('25'), -ether('25')])
                .to.changeTokenBalances(weth, [addr.address, addr1.address], [-ether('0.025'), ether('0.025')]);
        });
    });

    describe('check hash', function () {
        async function initContractsWithHashChecker () {
            const { dai, weth, swap, chainId } = await initContracts();

            const HashChecker = await ethers.getContractFactory('HashChecker');
            const hashChecker = await HashChecker.deploy(swap.address);
            await hashChecker.deployed();

            return { dai, weth, swap, chainId, hashChecker };
        }

        it('should check hash and fill', async function () {
            const { dai, weth, swap, chainId, hashChecker } = await loadFixture(initContractsWithHashChecker);

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    maker: addr1.address,
                    constraints: buildConstraints(),
                },
                {
                    preInteraction: hashChecker.address,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            await hashChecker.setHashOrderStatus(order, true);

            const { r, vs } = compactSignature(signature);
            await expect(swap.fillOrderExt(order, r, vs, ether('100'), makeMakingAmount(ether('0.1')), order.extension))
                .to.changeTokenBalances(dai, [addr.address, addr1.address], [ether('100'), -ether('100')])
                .to.changeTokenBalances(weth, [addr.address, addr1.address], [-ether('0.1'), ether('0.1')]);
        });

        it('should revert transaction when orderHash not equal target', async function () {
            const { dai, weth, swap, chainId, hashChecker } = await loadFixture(initContractsWithHashChecker);

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    maker: addr1.address,
                    constraints: buildConstraints(),
                },
                {
                    preInteraction: hashChecker.address,
                },
            );

            const signature = await signOrder(order, chainId, swap.address, addr1);

            const { r, vs } = compactSignature(signature);
            await expect(swap.fillOrderExt(order, r, vs, ether('100'), makeMakingAmount(ether('0.1')), order.extension))
                .to.be.revertedWithCustomError(hashChecker, 'IncorrectOrderHash');
        });
    });

    describe('order id validation', function () {
        async function initContractsWithIdInvalidator () {
            const { dai, weth, swap, chainId } = await initContracts();

            const OrderIdInvalidator = await ethers.getContractFactory('OrderIdInvalidator');
            const orderIdInvalidator = await OrderIdInvalidator.deploy(swap.address);
            await orderIdInvalidator.deployed();

            return { dai, weth, swap, chainId, orderIdInvalidator };
        }

        it('should execute order with 2 partial fills', async function () {
            const { dai, weth, swap, chainId, orderIdInvalidator } = await loadFixture(initContractsWithIdInvalidator);
            const orderId = 13341n;

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    maker: addr.address,
                    constraints: buildConstraints({ allowMultipleFills: true }),
                },
                {
                    preInteraction: orderIdInvalidator.address + orderId.toString(16).padStart(8, '0'),
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr);

            const { r, vs } = compactSignature(signature);
            await expect(swap.connect(addr1).fillOrderExt(order, r, vs, ether('50'), makeMakingAmount(ether('0.1')), order.extension))
                .to.changeTokenBalances(dai, [addr.address, addr1.address], [-ether('50'), ether('50')])
                .to.changeTokenBalances(weth, [addr.address, addr1.address], [ether('0.05'), -ether('0.05')]);

            await expect(swap.connect(addr1).fillOrderExt(order, r, vs, ether('50'), makeMakingAmount(ether('0.1')), order.extension))
                .to.changeTokenBalances(dai, [addr.address, addr1.address], [-ether('50'), ether('50')])
                .to.changeTokenBalances(weth, [addr.address, addr1.address], [ether('0.05'), -ether('0.05')]);
        });

        it('should fail to execute order with same orderId, but with different orderHash', async function () {
            const { dai, weth, swap, chainId, orderIdInvalidator } = await loadFixture(initContractsWithIdInvalidator);
            const orderId = 13341n;
            const preInteraction = orderIdInvalidator.address + orderId.toString(16).padStart(8, '0');

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    maker: addr.address,
                    constraints: buildConstraints(),
                },
                {
                    preInteraction,
                },
            );

            const partialOrder = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('50'),
                    takingAmount: ether('0.05'),
                    maker: addr.address,
                    constraints: buildConstraints(),
                },
                {
                    preInteraction,
                },
            );

            const signature = await signOrder(order, chainId, swap.address, addr);
            const signaturePartial = await signOrder(partialOrder, chainId, swap.address, addr);

            const { r, vs } = compactSignature(signature);
            await expect(swap.connect(addr1).fillOrderExt(order, r, vs, ether('50'), makeMakingAmount(ether('0.1')), order.extension))
                .to.changeTokenBalances(dai, [addr.address, addr1.address], [-ether('50'), ether('50')])
                .to.changeTokenBalances(weth, [addr.address, addr1.address], [ether('0.05'), -ether('0.05')]);

            const { r: r2, vs: vs2 } = compactSignature(signaturePartial);
            await expect(swap.connect(addr1).fillOrderExt(partialOrder, r2, vs2, ether('50'), makeMakingAmount(ether('0.1')), order.extension))
                .to.be.revertedWithCustomError(orderIdInvalidator, 'InvalidOrderHash');
        });
    });

    it('check the possibility of a dutch auction', async function () {
        const { dai, weth, swap, chainId } = await initContracts();

        const TakerIncreaser = await ethers.getContractFactory('TakerIncreaser');
        const takerIncreaser = await TakerIncreaser.deploy();
        await takerIncreaser.deployed();

        const order = buildOrder({
            makerAsset: weth.address,
            takerAsset: dai.address,
            makingAmount: ether('0.1'),
            takingAmount: ether('50'),
            maker: addr1.address,
            constraints: buildConstraints({ expiry: 0xff00000000 }),
        });

        const signature = await signOrder(order, chainId, swap.address, addr1);
        const { r, vs } = compactSignature(signature);

        const interaction = takerIncreaser.address + abiCoder.encode(
            ['address[]', 'bytes[]'],
            [
                [
                    dai.address,
                    dai.address,
                ],
                [
                    dai.interface.encodeFunctionData('transferFrom', [addr.address, takerIncreaser.address, ether('75')]),
                    dai.interface.encodeFunctionData('approve', [swap.address, ether('75')]),
                ],
            ],
        ).substring(2);
        await dai.approve(takerIncreaser.address, ether('75'));

        await expect(takerIncreaser.fillOrderTo(swap.address, order, r, vs, ether('0.1'), makeMakingAmount(ether('50')), addr.address, interaction))
            .to.changeTokenBalances(dai, [addr.address, addr1.address], [-ether('75'), ether('75')])
            .to.changeTokenBalances(weth, [addr.address, addr1.address], [ether('0.1'), -ether('0.1')]);
    });
});
