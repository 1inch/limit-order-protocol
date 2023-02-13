const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');
const { ethers } = require('hardhat');
const { ether } = require('./helpers/utils');
const { makeMakingAmount, signOrderRFQ, buildOrderRFQ, compactSignature, buildConstraints } = require('./helpers/orderUtils');

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

        const HashChecker = await ethers.getContractFactory('HashChecker');
        const hashChecker = await HashChecker.deploy(swap.address);
        await hashChecker.deployed();

        const RecursiveMatcher = await ethers.getContractFactory('RecursiveMatcher');
        const matcher = await RecursiveMatcher.deploy();
        await matcher.deployed();

        const OrderIdInvalidator = await ethers.getContractFactory('OrderIdInvalidator');
        const orderIdInvalidator = await OrderIdInvalidator.deploy(swap.address);
        await orderIdInvalidator.deployed();

        return { dai, weth, swap, chainId, matcher, hashChecker, orderIdInvalidator };
    };

    describe('recursive swap', function () {
        it('opposite direction recursive swap', async function () {
            const { dai, weth, swap, chainId, matcher } = await loadFixture(initContracts);

            const order = buildOrderRFQ({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                maker: addr.address,
            });

            const backOrder = buildOrderRFQ({
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                maker: addr1.address,
            });

            const signature = await signOrderRFQ(order, chainId, swap.address, addr);
            const signatureBackOrder = await signOrderRFQ(backOrder, chainId, swap.address, addr1);

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

            const interaction = matcher.address + '00' + swap.interface.encodeFunctionData('fillOrderRFQTo', [
                backOrder,
                compactSignature(signatureBackOrder).r,
                compactSignature(signatureBackOrder).vs,
                makeMakingAmount(ether('0.1')),
                ether('100'),
                matcher.address,
                matchingParams,
            ]).substring(10);

            const addrweth = await weth.balanceOf(addr.address);
            const addr1weth = await weth.balanceOf(addr1.address);
            const addrdai = await dai.balanceOf(addr.address);
            const addr1dai = await dai.balanceOf(addr1.address);

            const { r, vs } = compactSignature(signature);
            await matcher.matchOrdersRFQ(swap.address, order, r, vs, makeMakingAmount(ether('100')), ether('0.1'), interaction);

            expect(await weth.balanceOf(addr.address)).to.equal(addrweth.add(ether('0.1')));
            expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.sub(ether('0.1')));
            expect(await dai.balanceOf(addr.address)).to.equal(addrdai.sub(ether('100')));
            expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.add(ether('100')));
        });

        it('unidirectional recursive swap', async function () {
            const { dai, weth, swap, chainId, matcher } = await loadFixture(initContracts);

            const order = buildOrderRFQ({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                maker: addr1.address,
                constraints: buildConstraints({ nonce: 0 }),
            });

            const backOrder = buildOrderRFQ({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                maker: addr1.address,
                constraints: buildConstraints({ nonce: 1 }),
            });

            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);
            const signatureBackOrder = await signOrderRFQ(backOrder, chainId, swap.address, addr1);

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

            const interaction = matcher.address + '00' + swap.interface.encodeFunctionData('fillOrderRFQTo', [
                backOrder,
                compactSignature(signatureBackOrder).r,
                compactSignature(signatureBackOrder).vs,
                makeMakingAmount(ether('15')),
                ether('0.015'),
                matcher.address,
                matchingParams,
            ]).substring(10);

            const addrweth = await weth.balanceOf(addr.address);
            const addr1weth = await weth.balanceOf(addr1.address);
            const addrdai = await dai.balanceOf(addr.address);
            const addr1dai = await dai.balanceOf(addr1.address);

            await weth.approve(matcher.address, ether('0.025'));
            const { r, vs } = compactSignature(signature);
            await matcher.matchOrdersRFQ(swap.address, order, r, vs, makeMakingAmount(ether('10')), ether('0.01'), interaction);

            expect(await weth.balanceOf(addr.address)).to.equal(addrweth.sub(ether('0.025')));
            expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.add(ether('0.025')));
            expect(await dai.balanceOf(addr.address)).to.equal(addrdai.add(ether('25')));
            expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.sub(ether('25')));
        });

        it('triple recursive swap', async function () {
            const { dai, weth, swap, chainId, matcher } = await loadFixture(initContracts);

            const order1 = buildOrderRFQ({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                maker: addr1.address,
                constraints: buildConstraints({ nonce: 0 }),
            });

            const order2 = buildOrderRFQ({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                maker: addr1.address,
                constraints: buildConstraints({ nonce: 1 }),
            });

            const backOrder = buildOrderRFQ({
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.025'),
                takingAmount: ether('25'),
                maker: addr.address,
            });

            const signature1 = await signOrderRFQ(order1, chainId, swap.address, addr1);
            const signature2 = await signOrderRFQ(order2, chainId, swap.address, addr1);
            const signatureBackOrder = await signOrderRFQ(backOrder, chainId, swap.address, addr);

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

            const internalInteraction = matcher.address + '00' + swap.interface.encodeFunctionData('fillOrderRFQTo', [
                backOrder,
                compactSignature(signatureBackOrder).r,
                compactSignature(signatureBackOrder).vs,
                makeMakingAmount(ether('0.025')),
                ether('25'),
                matcher.address,
                matchingParams,
            ]).substring(10);

            const externalInteraction = matcher.address + '00' + swap.interface.encodeFunctionData('fillOrderRFQTo', [
                order2,
                compactSignature(signature2).r,
                compactSignature(signature2).vs,
                makeMakingAmount(ether('15')),
                ether('0.015'),
                matcher.address,
                internalInteraction,
            ]).substring(10);

            const addrweth = await weth.balanceOf(addr.address);
            const addr1weth = await weth.balanceOf(addr1.address);
            const addrdai = await dai.balanceOf(addr.address);
            const addr1dai = await dai.balanceOf(addr1.address);

            const { r, vs } = compactSignature(signature1);
            await matcher.matchOrdersRFQ(swap.address, order1, r, vs, makeMakingAmount(ether('10')), ether('0.01'), externalInteraction);

            expect(await weth.balanceOf(addr.address)).to.equal(addrweth.sub(ether('0.025')));
            expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.add(ether('0.025')));
            expect(await dai.balanceOf(addr.address)).to.equal(addrdai.add(ether('25')));
            expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.sub(ether('25')));
        });
    });

    describe('check hash', function () {
        it('should check hash and fill', async function () {
            const { dai, weth, swap, chainId, hashChecker } = await loadFixture(initContracts);

            const order = buildOrderRFQ(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    maker: addr1.address,
                },
                {
                    preInteraction: hashChecker.address,
                },
            );
            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await hashChecker.setHashOrderStatus(order, true);

            const { r, vs } = compactSignature(signature);
            await swap.fillOrderRFQExt(order, r, vs, makeMakingAmount(ether('100')), ether('0.1'), order.extension);

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(ether('100')));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(ether('100')));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(ether('0.1')));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(ether('0.1')));
        });

        it('should revert transaction when orderHash not equal target', async function () {
            const { dai, weth, swap, chainId, hashChecker } = await loadFixture(initContracts);

            const order = buildOrderRFQ(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    maker: addr1.address,
                },
                {
                    preInteraction: hashChecker.address,
                },
            );

            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

            const { r, vs } = compactSignature(signature);
            await expect(swap.fillOrderRFQExt(order, r, vs, makeMakingAmount(ether('100')), ether('0.1'), order.extension))
                .to.be.revertedWithCustomError(hashChecker, 'IncorrectOrderHash');
        });
    });

    describe('order id validation', function () {
        it('should execute order with 2 partial fills', async function () {
            const { dai, weth, swap, chainId, orderIdInvalidator } = await loadFixture(initContracts);
            const orderId = 13341n;

            const order = buildOrderRFQ(
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
            const signature = await signOrderRFQ(order, chainId, swap.address, addr);

            const addrweth = await weth.balanceOf(addr.address);
            const addr1weth = await weth.balanceOf(addr1.address);
            const addrdai = await dai.balanceOf(addr.address);
            const addr1dai = await dai.balanceOf(addr1.address);

            const { r, vs } = compactSignature(signature);
            await swap.connect(addr1).fillOrderRFQExt(order, r, vs, makeMakingAmount(ether('50')), ether('0.1'), order.extension);

            expect(await weth.balanceOf(addr.address)).to.equal(addrweth.add(ether('0.05')));
            expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.sub(ether('0.05')));
            expect(await dai.balanceOf(addr.address)).to.equal(addrdai.sub(ether('50')));
            expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.add(ether('50')));

            await swap.connect(addr1).fillOrderRFQExt(order, r, vs, makeMakingAmount(ether('50')), ether('0.1'), order.extension);

            expect(await weth.balanceOf(addr.address)).to.equal(addrweth.add(ether('0.1')));
            expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.sub(ether('0.1')));
            expect(await dai.balanceOf(addr.address)).to.equal(addrdai.sub(ether('100')));
            expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.add(ether('100')));
        });

        it('should fail to execute order with same orderId, but with different orderHash', async function () {
            const { dai, weth, swap, chainId, orderIdInvalidator } = await loadFixture(initContracts);
            const orderId = 13341n;

            const order = buildOrderRFQ(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    maker: addr.address,
                    constraints: buildConstraints({ nonce: 0 }),
                },
                {
                    preInteraction: orderIdInvalidator.address + orderId.toString(16).padStart(8, '0'),
                },
            );

            const partialOrder = buildOrderRFQ(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('50'),
                    takingAmount: ether('0.05'),
                    maker: addr.address,
                    constraints: buildConstraints({ nonce: 1 }),
                },
                {
                    preInteraction: orderIdInvalidator.address + orderId.toString(16).padStart(8, '0'),
                },
            );

            const signature = await signOrderRFQ(order, chainId, swap.address, addr);
            const signaturePartial = await signOrderRFQ(partialOrder, chainId, swap.address, addr);

            const addrweth = await weth.balanceOf(addr.address);
            const addr1weth = await weth.balanceOf(addr1.address);
            const addrdai = await dai.balanceOf(addr.address);
            const addr1dai = await dai.balanceOf(addr1.address);

            const { r, vs } = compactSignature(signature);
            await swap.connect(addr1).fillOrderRFQExt(order, r, vs, makeMakingAmount(ether('50')), ether('0.1'), order.extension);

            expect(await weth.balanceOf(addr.address)).to.equal(addrweth.add(ether('0.05')));
            expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.sub(ether('0.05')));
            expect(await dai.balanceOf(addr.address)).to.equal(addrdai.sub(ether('50')));
            expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.add(ether('50')));

            const { r: r2, vs: vs2 } = compactSignature(signaturePartial);
            await expect(swap.connect(addr1).fillOrderRFQExt(partialOrder, r2, vs2, makeMakingAmount(ether('50')), ether('0.1'), order.extension))
                .to.be.revertedWithCustomError(orderIdInvalidator, 'InvalidOrderHash');
        });
    });
});
