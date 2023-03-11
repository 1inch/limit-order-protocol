const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');
const { ethers } = require('hardhat');
const { ether } = require('./helpers/utils');
const { buildOrderRFQ, signOrder, compactSignature, buildMakerTraits } = require('./helpers/orderUtils');
const { constants } = require('ethers');

describe('RfqInteractions', function () {
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

        const RecursiveMatcher = await ethers.getContractFactory('RecursiveMatcher');
        const matcher = await RecursiveMatcher.deploy();
        await matcher.deployed();

        return { dai, weth, swap, chainId, matcher };
    };

    describe('recursive swap rfq orders', function () {
        it('opposite direction recursive swap', async function () {
            const { dai, weth, swap, chainId, matcher } = await loadFixture(initContracts);

            const order = buildOrderRFQ({
                maker: addr.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
            });
            const backOrder = buildOrderRFQ({
                maker: addr1.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
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
                ether('100'),
                ether('0.1'),
                constants.AddressZero,
                matchingParams,
            ]).substring(10);

            const { r, vs } = compactSignature(signature);
            await expect(matcher.matchOrders(swap.address, order, r, vs, ether('0.1'), ether('100'), interaction))
                .to.changeTokenBalances(dai, [addr.address, addr1.address], [-ether('100'), ether('100')])
                .to.changeTokenBalances(weth, [addr.address, addr1.address], [ether('0.1'), -ether('0.1')]);
        });

        it('unidirectional recursive swap', async function () {
            const { dai, weth, swap, chainId, matcher } = await loadFixture(initContracts);

            const order = buildOrderRFQ({
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                makerTraits: buildMakerTraits({ nonce: 1 }),
            });
            const backOrder = buildOrderRFQ({
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                makerTraits: buildMakerTraits({ nonce: 2 }),
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
                ether('0.015'),
                ether('15'),
                constants.AddressZero,
                matchingParams,
            ]).substring(10);

            await weth.approve(matcher.address, ether('0.025'));
            const { r, vs } = compactSignature(signature);
            await expect(matcher.matchOrders(swap.address, order, r, vs, ether('0.01'), ether('10'), interaction))
                .to.changeTokenBalances(dai, [addr.address, addr1.address], [ether('25'), -ether('25')])
                .to.changeTokenBalances(weth, [addr.address, addr1.address], [-ether('0.025'), ether('0.025')]);
        });

        it('triple recursive swap', async function () {
            const { dai, weth, swap, chainId, matcher } = await loadFixture(initContracts);

            const order1 = buildOrderRFQ({
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                makerTraits: buildMakerTraits({ nonce: 1 }),
            });
            const order2 = buildOrderRFQ({
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                makerTraits: buildMakerTraits({ nonce: 2 }),
            });
            const backOrder = buildOrderRFQ({
                maker: addr.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.025'),
                takingAmount: ether('25'),
                makerTraits: buildMakerTraits({ nonce: 1 }),
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
                ether('25'),
                ether('0.025'),
                constants.AddressZero,
                matchingParams,
            ]).substring(10);

            const externalInteraction = matcher.address + '00' + swap.interface.encodeFunctionData('fillOrderTo', [
                order2,
                compactSignature(signature2).r,
                compactSignature(signature2).vs,
                ether('0.015'),
                ether('15'),
                constants.AddressZero,
                internalInteraction,
            ]).substring(10);

            const { r, vs } = compactSignature(signature1);
            await expect(matcher.matchOrders(swap.address, order1, r, vs, ether('0.01'), ether('10'), externalInteraction))
                .to.changeTokenBalances(dai, [addr.address, addr1.address], [ether('25'), -ether('25')])
                .to.changeTokenBalances(weth, [addr.address, addr1.address], [-ether('0.025'), ether('0.025')]);
        });
    });
});
