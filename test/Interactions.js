const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');
const { ethers } = require('hardhat');
const { ether } = require('./helpers/utils');
const { buildOrder, signOrder } = require('./helpers/orderUtils');

describe('Interactions', async () => {
    const [addr, addr1] = await ethers.getSigners();
    const abiCoder = ethers.utils.defaultAbiCoder;

    const initContracts = async () => {
        const { dai, weth, swap, chainId } = await loadFixture(deploySwapTokens);

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

        return { dai, weth, swap, chainId, matcher, hashChecker };
    };

    describe('recursive swap', async () => {
        it('opposite direction recursive swap', async () => {
            const { dai, weth, swap, chainId, matcher } = await loadFixture(initContracts);

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    from: addr.address,
                },
                {
                    predicate: swap.interface.encodeFunctionData('timestampBelow', [0xff00000000]),
                },
            );

            const backOrder = buildOrder(
                {
                    makerAsset: weth.address,
                    takerAsset: dai.address,
                    makingAmount: ether('0.1'),
                    takingAmount: ether('100'),
                    from: addr1.address,
                },
                {
                    predicate: swap.interface.encodeFunctionData('timestampBelow', [0xff00000000]),
                },
            );

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

            const interaction = matcher.address + '00' + swap.interface.encodeFunctionData('fillOrder', [
                backOrder,
                signatureBackOrder,
                matchingParams,
                ether('0.1'),
                '0',
                ether('100'),
            ]).substring(10);

            const addrweth = await weth.balanceOf(addr.address);
            const addr1weth = await weth.balanceOf(addr1.address);
            const addrdai = await dai.balanceOf(addr.address);
            const addr1dai = await dai.balanceOf(addr1.address);

            await matcher.matchOrders(swap.address, order, signature, interaction, ether('100'), 0, ether('0.1'));

            expect(await weth.balanceOf(addr.address)).to.equal(addrweth.add(ether('0.1')));
            expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.sub(ether('0.1')));
            expect(await dai.balanceOf(addr.address)).to.equal(addrdai.sub(ether('100')));
            expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.add(ether('100')));
        });

        it('unidirectional recursive swap', async () => {
            const { dai, weth, swap, chainId, matcher } = await loadFixture(initContracts);

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('10'),
                    takingAmount: ether('0.01'),
                    from: addr1.address,
                },
                {
                    predicate: swap.interface.encodeFunctionData('timestampBelow', [0xff00000000]),
                },
            );

            const backOrder = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('15'),
                    takingAmount: ether('0.015'),
                    from: addr1.address,
                },
                {
                    predicate: swap.interface.encodeFunctionData('timestampBelow', [0xff00000000]),
                },
            );

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

            const interaction = matcher.address + '00' + swap.interface.encodeFunctionData('fillOrder', [
                backOrder,
                signatureBackOrder,
                matchingParams,
                ether('15'),
                0,
                ether('0.015'),
            ]).substring(10);

            const addrweth = await weth.balanceOf(addr.address);
            const addr1weth = await weth.balanceOf(addr1.address);
            const addrdai = await dai.balanceOf(addr.address);
            const addr1dai = await dai.balanceOf(addr1.address);

            await weth.approve(matcher.address, ether('0.025'));
            await matcher.matchOrders(swap.address, order, signature, interaction, ether('10'), 0, ether('0.01'));

            expect(await weth.balanceOf(addr.address)).to.equal(addrweth.sub(ether('0.025')));
            expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.add(ether('0.025')));
            expect(await dai.balanceOf(addr.address)).to.equal(addrdai.add(ether('25')));
            expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.sub(ether('25')));
        });

        it('triple recursive swap', async () => {
            const { dai, weth, swap, chainId, matcher } = await loadFixture(initContracts);

            const order1 = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('10'),
                    takingAmount: ether('0.01'),
                    from: addr1.address,
                },
                {
                    predicate: swap.interface.encodeFunctionData('timestampBelow', [0xff00000000]),
                },
            );

            const order2 = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('15'),
                    takingAmount: ether('0.015'),
                    from: addr1.address,
                },
                {
                    predicate: swap.interface.encodeFunctionData('timestampBelow', [0xff00000000]),
                },
            );

            const backOrder = buildOrder(
                {
                    makerAsset: weth.address,
                    takerAsset: dai.address,
                    makingAmount: ether('0.025'),
                    takingAmount: ether('25'),
                    from: addr.address,
                },
                {
                    predicate: swap.interface.encodeFunctionData('timestampBelow', [0xff00000000]),
                },
            );

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

            const internalInteraction = matcher.address + '00' + swap.interface.encodeFunctionData('fillOrder', [
                backOrder,
                signatureBackOrder,
                matchingParams,
                ether('0.025'),
                0,
                ether('25'),
            ]).substring(10);

            const externalInteraction = matcher.address + '00' + swap.interface.encodeFunctionData('fillOrder', [
                order2,
                signature2,
                internalInteraction,
                ether('15'),
                0,
                ether('0.015'),
            ]).substring(10);

            const addrweth = await weth.balanceOf(addr.address);
            const addr1weth = await weth.balanceOf(addr1.address);
            const addrdai = await dai.balanceOf(addr.address);
            const addr1dai = await dai.balanceOf(addr1.address);

            await matcher.matchOrders(swap.address, order1, signature1, externalInteraction, ether('10'), 0, ether('0.01'));

            expect(await weth.balanceOf(addr.address)).to.equal(addrweth.sub(ether('0.025')));
            expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.add(ether('0.025')));
            expect(await dai.balanceOf(addr.address)).to.equal(addrdai.add(ether('25')));
            expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.sub(ether('25')));
        });
    });

    describe('check hash', async () => {
        it('should check hash and fill', async () => {
            const { dai, weth, swap, chainId, hashChecker } = await loadFixture(initContracts);

            const preInteraction = hashChecker.address;

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    from: addr1.address,
                },
                {
                    preInteraction,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await hashChecker.setHashOrderStatus(order, true);
            await swap.fillOrder(order, signature, '0x', ether('100'), 0, ether('0.1'));

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(ether('100')));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(ether('100')));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(ether('0.1')));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(ether('0.1')));
        });

        it('should revert transaction when orderHash not equal target', async () => {
            const { dai, weth, swap, chainId, hashChecker } = await loadFixture(initContracts);

            const preInteraction = hashChecker.address;

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    from: addr1.address,
                },
                {
                    preInteraction,
                },
            );

            const signature = await signOrder(order, chainId, swap.address, addr1);

            await expect(swap.fillOrder(order, signature, '0x', ether('100'), 0, ether('0.1'))).to.be.revertedWithCustomError(hashChecker, 'IncorrectOrderHash');
        });
    });
});
