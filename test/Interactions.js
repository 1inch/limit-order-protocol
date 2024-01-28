const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');
const { ethers } = require('hardhat');
const { ether } = require('./helpers/utils');
const { signOrder, buildOrder, buildMakerTraits, buildTakerTraits } = require('./helpers/orderUtils');

describe('Interactions', function () {
    let addr, addr1;
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
    });

    async function initContracts () {
        const { dai, weth, swap, chainId } = await deploySwapTokens();

        await dai.mint(addr, ether('100'));
        await dai.mint(addr1, ether('100'));
        await weth.deposit({ value: ether('1') });
        await weth.connect(addr1).deposit({ value: ether('1') });

        await dai.approve(swap, ether('100'));
        await dai.connect(addr1).approve(swap, ether('100'));
        await weth.approve(swap, ether('1'));
        await weth.connect(addr1).approve(swap, ether('1'));

        return { dai, weth, swap, chainId };
    };

    describe('recursive swap', function () {
        async function initContractsWithRecursiveMatcher () {
            const { dai, weth, swap, chainId } = await initContracts();

            const RecursiveMatcher = await ethers.getContractFactory('RecursiveMatcher');
            const matcher = await RecursiveMatcher.deploy();
            await matcher.waitForDeployment();

            return { dai, weth, swap, chainId, matcher };
        }

        it('opposite direction recursive swap', async function () {
            const { dai, weth, swap, chainId, matcher } = await loadFixture(initContractsWithRecursiveMatcher);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                maker: addr.address,
            });

            const backOrder = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                maker: addr1.address,
            });

            const signature = await signOrder(order, chainId, await swap.getAddress(), addr);
            const signatureBackOrder = await signOrder(backOrder, chainId, await swap.getAddress(), addr1);

            const matchingParams = await matcher.getAddress() + '01' + abiCoder.encode(
                ['address[]', 'bytes[]'],
                [
                    [
                        await weth.getAddress(),
                        await dai.getAddress(),
                    ],
                    [
                        weth.interface.encodeFunctionData('approve', [await swap.getAddress(), ether('0.1')]),
                        dai.interface.encodeFunctionData('approve', [await swap.getAddress(), ether('100')]),
                    ],
                ],
            ).substring(2);

            const { r: backOrderR, yParityAndS: backOrderVs } = ethers.Signature.from(signatureBackOrder);
            const takerTraits = buildTakerTraits({
                interaction: matchingParams,
                makingAmount: true,
                threshold: ether('100'),
            });
            const interaction = await matcher.getAddress() + '00' + swap.interface.encodeFunctionData('fillOrderArgs', [
                backOrder,
                backOrderR,
                backOrderVs,
                ether('0.1'),
                takerTraits.traits,
                takerTraits.args,
            ]).substring(10);

            const addrweth = await weth.balanceOf(addr);
            const addr1weth = await weth.balanceOf(addr1);
            const addrdai = await dai.balanceOf(addr);
            const addr1dai = await dai.balanceOf(addr1);

            const { r, yParityAndS: vs } = ethers.Signature.from(signature);
            const matcherTraits = buildTakerTraits({
                interaction,
                makingAmount: true,
                threshold: ether('0.1'),
            });
            await matcher.matchOrders(await swap.getAddress(), order, r, vs, ether('100'), matcherTraits.traits, matcherTraits.args);

            expect(await weth.balanceOf(addr)).to.equal(addrweth + ether('0.1'));
            expect(await weth.balanceOf(addr1)).to.equal(addr1weth - ether('0.1'));
            expect(await dai.balanceOf(addr)).to.equal(addrdai - ether('100'));
            expect(await dai.balanceOf(addr1)).to.equal(addr1dai + ether('100'));
        });

        it('unidirectional recursive swap', async function () {
            const { dai, weth, swap, chainId, matcher } = await loadFixture(initContractsWithRecursiveMatcher);

            const order = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                maker: addr1.address,
                makerTraits: buildMakerTraits({ nonce: 0 }),
            });

            const backOrder = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                maker: addr1.address,
                makerTraits: buildMakerTraits({ nonce: 0 }),
            });

            const signature = await signOrder(order, chainId, await swap.getAddress(), addr1);
            const signatureBackOrder = await signOrder(backOrder, chainId, await swap.getAddress(), addr1);

            const matchingParams = await matcher.getAddress() + '01' + abiCoder.encode(
                ['address[]', 'bytes[]'],
                [
                    [
                        await weth.getAddress(),
                        await weth.getAddress(),
                        await dai.getAddress(),
                    ],
                    [
                        weth.interface.encodeFunctionData('transferFrom', [addr.address, await matcher.getAddress(), ether('0.025')]),
                        weth.interface.encodeFunctionData('approve', [await swap.getAddress(), ether('0.025')]),
                        dai.interface.encodeFunctionData('transfer', [addr.address, ether('25')]),
                    ],
                ],
            ).substring(2);

            const { r: backOrderR, yParityAndS: backOrderVs } = ethers.Signature.from(signatureBackOrder);
            const takerTraits = buildTakerTraits({
                interaction: matchingParams,
                makingAmount: true,
                threshold: ether('0.015'),
            });
            const interaction = await matcher.getAddress() + '00' + swap.interface.encodeFunctionData('fillOrderArgs', [
                backOrder,
                backOrderR,
                backOrderVs,
                ether('15'),
                takerTraits.traits,
                takerTraits.args,
            ]).substring(10);

            const addrweth = await weth.balanceOf(addr);
            const addr1weth = await weth.balanceOf(addr1);
            const addrdai = await dai.balanceOf(addr);
            const addr1dai = await dai.balanceOf(addr1);

            await weth.approve(matcher, ether('0.025'));
            const { r, yParityAndS: vs } = ethers.Signature.from(signature);
            const matcherTraits = buildTakerTraits({
                interaction,
                makingAmount: true,
                threshold: ether('0.01'),
            });
            await matcher.matchOrders(await swap.getAddress(), order, r, vs, ether('10'), matcherTraits.traits, matcherTraits.args);

            expect(await weth.balanceOf(addr)).to.equal(addrweth - ether('0.025'));
            expect(await weth.balanceOf(addr1)).to.equal(addr1weth + ether('0.025'));
            expect(await dai.balanceOf(addr)).to.equal(addrdai + ether('25'));
            expect(await dai.balanceOf(addr1)).to.equal(addr1dai - ether('25'));
        });

        it('triple recursive swap', async function () {
            const { dai, weth, swap, chainId, matcher } = await loadFixture(initContractsWithRecursiveMatcher);

            const order1 = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                maker: addr1.address,
                makerTraits: buildMakerTraits({ nonce: 0 }),
            });

            const order2 = buildOrder({
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                maker: addr1.address,
                makerTraits: buildMakerTraits({ nonce: 0 }),
            });

            const backOrder = buildOrder({
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('0.025'),
                takingAmount: ether('25'),
                maker: addr.address,
                makerTraits: buildMakerTraits({ nonce: 0 }),
            });

            const signature1 = await signOrder(order1, chainId, await swap.getAddress(), addr1);
            const signature2 = await signOrder(order2, chainId, await swap.getAddress(), addr1);
            const signatureBackOrder = await signOrder(backOrder, chainId, await swap.getAddress(), addr);

            const matchingParams = await matcher.getAddress() + '01' + abiCoder.encode(
                ['address[]', 'bytes[]'],
                [
                    [
                        await weth.getAddress(),
                        await dai.getAddress(),
                    ],
                    [
                        weth.interface.encodeFunctionData('approve', [await swap.getAddress(), ether('0.025')]),
                        dai.interface.encodeFunctionData('approve', [await swap.getAddress(), ether('25')]),
                    ],
                ],
            ).substring(2);

            const { r: backOrderR, yParityAndS: backOrderVs } = ethers.Signature.from(signatureBackOrder);
            const internalTakerTraits = buildTakerTraits({
                interaction: matchingParams,
                makingAmount: true,
                threshold: ether('25'),
            });
            const internalInteraction = await matcher.getAddress() + '00' + swap.interface.encodeFunctionData('fillOrderArgs', [
                backOrder,
                backOrderR,
                backOrderVs,
                ether('0.025'),
                internalTakerTraits.traits,
                internalTakerTraits.args,
            ]).substring(10);

            const { r: order2R, yParityAndS: order2Vs } = ethers.Signature.from(signature2);
            const externalTakerTraits = buildTakerTraits({
                interaction: internalInteraction,
                makingAmount: true,
                threshold: ether('25'),
            });
            const externalInteraction = await matcher.getAddress() + '00' + swap.interface.encodeFunctionData('fillOrderArgs', [
                order2,
                order2R,
                order2Vs,
                ether('15'),
                externalTakerTraits.traits,
                externalTakerTraits.args,
            ]).substring(10);

            const addrweth = await weth.balanceOf(addr);
            const addr1weth = await weth.balanceOf(addr1);
            const addrdai = await dai.balanceOf(addr);
            const addr1dai = await dai.balanceOf(addr1);

            const { r, yParityAndS: vs } = ethers.Signature.from(signature1);
            const matcherTraits = buildTakerTraits({
                interaction: externalInteraction,
                makingAmount: true,
                threshold: ether('0.01'),
            });
            await matcher.matchOrders(await swap.getAddress(), order1, r, vs, ether('10'), matcherTraits.traits, matcherTraits.args);

            expect(await weth.balanceOf(addr)).to.equal(addrweth - ether('0.025'));
            expect(await weth.balanceOf(addr1)).to.equal(addr1weth + ether('0.025'));
            expect(await dai.balanceOf(addr)).to.equal(addrdai + ether('25'));
            expect(await dai.balanceOf(addr1)).to.equal(addr1dai - ether('25'));
        });
    });

    describe('check hash', function () {
        async function initContractsWithHashChecker () {
            const { dai, weth, swap, chainId } = await initContracts();

            const [owner] = await ethers.getSigners();
            const HashChecker = await ethers.getContractFactory('HashChecker');
            const hashChecker = await HashChecker.deploy(swap, owner);
            await hashChecker.waitForDeployment();

            return { dai, weth, swap, chainId, hashChecker };
        }

        it('should check hash and fill', async function () {
            const { dai, weth, swap, chainId, hashChecker } = await loadFixture(initContractsWithHashChecker);

            const order = buildOrder(
                {
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    maker: addr1.address,
                    makerTraits: buildMakerTraits(),
                },
                {
                    preInteraction: await hashChecker.getAddress(),
                },
            );
            const signature = await signOrder(order, chainId, await swap.getAddress(), addr1);

            const makerDai = await dai.balanceOf(addr1);
            const takerDai = await dai.balanceOf(addr);
            const makerWeth = await weth.balanceOf(addr1);
            const takerWeth = await weth.balanceOf(addr);

            await hashChecker.setHashOrderStatus(order, true);

            const { r, yParityAndS: vs } = ethers.Signature.from(signature);
            const takerTraits = buildTakerTraits({
                threshold: ether('0.1'),
                makingAmount: true,
                extension: order.extension,
            });
            await swap.fillOrderArgs(order, r, vs, ether('100'), takerTraits.traits, takerTraits.args);

            expect(await dai.balanceOf(addr1)).to.equal(makerDai - ether('100'));
            expect(await dai.balanceOf(addr)).to.equal(takerDai + ether('100'));
            expect(await weth.balanceOf(addr1)).to.equal(makerWeth + ether('0.1'));
            expect(await weth.balanceOf(addr)).to.equal(takerWeth - ether('0.1'));
        });

        it('should revert transaction when orderHash not equal target', async function () {
            const { dai, weth, swap, chainId, hashChecker } = await loadFixture(initContractsWithHashChecker);

            const order = buildOrder(
                {
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    maker: addr1.address,
                    makerTraits: buildMakerTraits(),
                },
                {
                    preInteraction: await hashChecker.getAddress(),
                },
            );

            const signature = await signOrder(order, chainId, await swap.getAddress(), addr1);

            const { r, yParityAndS: vs } = ethers.Signature.from(signature);
            const takerTraits = buildTakerTraits({
                threshold: ether('0.1'),
                makingAmount: true,
                extension: order.extension,
            });
            await expect(swap.fillOrderArgs(order, r, vs, ether('100'), takerTraits.traits, takerTraits.args))
                .to.be.revertedWithCustomError(hashChecker, 'IncorrectOrderHash');
        });
    });

    describe('order id validation', function () {
        async function initContractsWithIdInvalidator () {
            const { dai, weth, swap, chainId } = await initContracts();

            const OrderIdInvalidator = await ethers.getContractFactory('OrderIdInvalidator');
            const orderIdInvalidator = await OrderIdInvalidator.deploy(swap);
            await orderIdInvalidator.waitForDeployment();

            return { dai, weth, swap, chainId, orderIdInvalidator };
        }

        it('should execute order with 2 partial fills', async function () {
            const { dai, weth, swap, chainId, orderIdInvalidator } = await loadFixture(initContractsWithIdInvalidator);
            const orderId = 13341n;

            const order = buildOrder(
                {
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    maker: addr.address,
                    makerTraits: buildMakerTraits({ allowMultipleFills: true }),
                },
                {
                    preInteraction: await orderIdInvalidator.getAddress() + orderId.toString(16).padStart(8, '0'),
                },
            );
            const signature = await signOrder(order, chainId, await swap.getAddress(), addr);

            const addrweth = await weth.balanceOf(addr);
            const addr1weth = await weth.balanceOf(addr1);
            const addrdai = await dai.balanceOf(addr);
            const addr1dai = await dai.balanceOf(addr1);

            const { r, yParityAndS: vs } = ethers.Signature.from(signature);
            const takerTraits = buildTakerTraits({
                threshold: ether('0.1'),
                makingAmount: true,
                extension: order.extension,
            });
            await swap.connect(addr1).fillOrderArgs(order, r, vs, ether('50'), takerTraits.traits, takerTraits.args);

            expect(await weth.balanceOf(addr)).to.equal(addrweth + ether('0.05'));
            expect(await weth.balanceOf(addr1)).to.equal(addr1weth - ether('0.05'));
            expect(await dai.balanceOf(addr)).to.equal(addrdai - ether('50'));
            expect(await dai.balanceOf(addr1)).to.equal(addr1dai + ether('50'));

            const takerTraits2 = buildTakerTraits({
                threshold: ether('0.1'),
                makingAmount: true,
                extension: order.extension,
            });
            await swap.connect(addr1).fillOrderArgs(order, r, vs, ether('50'), takerTraits2.traits, takerTraits2.args);

            expect(await weth.balanceOf(addr)).to.equal(addrweth + ether('0.1'));
            expect(await weth.balanceOf(addr1)).to.equal(addr1weth - ether('0.1'));
            expect(await dai.balanceOf(addr)).to.equal(addrdai - ether('100'));
            expect(await dai.balanceOf(addr1)).to.equal(addr1dai + ether('100'));
        });

        it('should fail to execute order with same orderId, but with different orderHash', async function () {
            const { dai, weth, swap, chainId, orderIdInvalidator } = await loadFixture(initContractsWithIdInvalidator);
            const orderId = 13341n;
            const preInteraction = await orderIdInvalidator.getAddress() + orderId.toString(16).padStart(8, '0');

            const order = buildOrder(
                {
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    maker: addr.address,
                    makerTraits: buildMakerTraits(),
                },
                {
                    preInteraction,
                },
            );

            const partialOrder = buildOrder(
                {
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount: ether('50'),
                    takingAmount: ether('0.05'),
                    maker: addr.address,
                    makerTraits: buildMakerTraits(),
                },
                {
                    preInteraction,
                },
            );

            const signature = await signOrder(order, chainId, await swap.getAddress(), addr);
            const signaturePartial = await signOrder(partialOrder, chainId, await swap.getAddress(), addr);

            const addrweth = await weth.balanceOf(addr);
            const addr1weth = await weth.balanceOf(addr1);
            const addrdai = await dai.balanceOf(addr);
            const addr1dai = await dai.balanceOf(addr1);

            const { r, yParityAndS: vs } = ethers.Signature.from(signature);
            const takerTraits = buildTakerTraits({
                threshold: ether('0.1'),
                makingAmount: true,
                extension: order.extension,
            });
            await swap.connect(addr1).fillOrderArgs(order, r, vs, ether('50'), takerTraits.traits, takerTraits.args);

            expect(await weth.balanceOf(addr)).to.equal(addrweth + ether('0.05'));
            expect(await weth.balanceOf(addr1)).to.equal(addr1weth - ether('0.05'));
            expect(await dai.balanceOf(addr)).to.equal(addrdai - ether('50'));
            expect(await dai.balanceOf(addr1)).to.equal(addr1dai + ether('50'));

            const { r: r2, yParityAndS: vs2 } = ethers.Signature.from(signaturePartial);
            const takerTraits2 = buildTakerTraits({
                threshold: ether('0.1'),
                makingAmount: true,
                extension: order.extension,
            });
            await expect(swap.connect(addr1).fillOrderArgs(partialOrder, r2, vs2, ether('50'), takerTraits2.traits, takerTraits2.args))
                .to.be.revertedWithCustomError(orderIdInvalidator, 'InvalidOrderHash');
        });
    });
});
