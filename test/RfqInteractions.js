const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');
const { ethers } = require('hardhat');
const { ether } = require('./helpers/utils');
const { buildOrderRFQ, signOrderRFQ, compactSignature, buildConstraints } = require('./helpers/orderUtils');
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

            const order = buildOrderRFQ(dai.address, weth.address, ether('100'), ether('0.1'));
            const backOrder = buildOrderRFQ(weth.address, dai.address, ether('0.1'), ether('100'));
            const signature = await signOrderRFQ(order, chainId, swap.address, addr);
            const signatureBackOrder = await signOrderRFQ(backOrder, chainId, swap.address, addr1);

            const matchingParams = matcher.address + '03' + abiCoder.encode(
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

            const interaction = matcher.address + '02' + swap.interface.encodeFunctionData('fillOrderRFQTo', [
                backOrder,
                compactSignature(signatureBackOrder).r,
                compactSignature(signatureBackOrder).vs,
                ether('100'),
                constants.AddressZero,
                matchingParams,
            ]).substring(10);

            const addrweth = await weth.balanceOf(addr.address);
            const addr1weth = await weth.balanceOf(addr1.address);
            const addrdai = await dai.balanceOf(addr.address);
            const addr1dai = await dai.balanceOf(addr1.address);

            const { r, vs } = compactSignature(signature);
            await matcher.matchRfqOrders(swap.address, order, r, vs, ether('0.1'), interaction);

            expect(await weth.balanceOf(addr.address)).to.equal(addrweth.add(ether('0.1')));
            expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.sub(ether('0.1')));
            expect(await dai.balanceOf(addr.address)).to.equal(addrdai.sub(ether('100')));
            expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.add(ether('100')));
        });

        it('unidirectional recursive swap', async function () {
            const { dai, weth, swap, chainId, matcher } = await loadFixture(initContracts);

            const order = buildOrderRFQ(dai.address, weth.address, ether('10'), ether('0.01'), buildConstraints({ nonce: 1 }));
            const backOrder = buildOrderRFQ(dai.address, weth.address, ether('15'), ether('0.015'), buildConstraints({ nonce: 2 }));
            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);
            const signatureBackOrder = await signOrderRFQ(backOrder, chainId, swap.address, addr1);

            const matchingParams = matcher.address + '03' + abiCoder.encode(
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

            const interaction = matcher.address + '02' + swap.interface.encodeFunctionData('fillOrderRFQTo', [
                backOrder,
                compactSignature(signatureBackOrder).r,
                compactSignature(signatureBackOrder).vs,
                ether('0.015'),
                constants.AddressZero,
                matchingParams,
            ]).substring(10);

            const addrweth = await weth.balanceOf(addr.address);
            const addr1weth = await weth.balanceOf(addr1.address);
            const addrdai = await dai.balanceOf(addr.address);
            const addr1dai = await dai.balanceOf(addr1.address);

            await weth.approve(matcher.address, ether('0.025'));
            const { r, vs } = compactSignature(signature);
            await matcher.matchRfqOrders(swap.address, order, r, vs, ether('0.01'), interaction);

            expect(await weth.balanceOf(addr.address)).to.equal(addrweth.sub(ether('0.025')));
            expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.add(ether('0.025')));
            expect(await dai.balanceOf(addr.address)).to.equal(addrdai.add(ether('25')));
            expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.sub(ether('25')));
        });

        it('triple recursive swap', async function () {
            const { dai, weth, swap, chainId, matcher } = await loadFixture(initContracts);

            const order1 = buildOrderRFQ(dai.address, weth.address, ether('10'), ether('0.01'), buildConstraints({ nonce: 1 }));
            const order2 = buildOrderRFQ(dai.address, weth.address, ether('15'), ether('0.015'), buildConstraints({ nonce: 2 }));
            const backOrder = buildOrderRFQ(weth.address, dai.address, ether('0.025'), ether('25'), buildConstraints({ nonce: 1 }));

            const signature1 = await signOrderRFQ(order1, chainId, swap.address, addr1);
            const signature2 = await signOrderRFQ(order2, chainId, swap.address, addr1);
            const signatureBackOrder = await signOrderRFQ(backOrder, chainId, swap.address, addr);

            const matchingParams = matcher.address + '03' + abiCoder.encode(
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

            const internalInteraction = matcher.address + '02' + swap.interface.encodeFunctionData('fillOrderRFQTo', [
                backOrder,
                compactSignature(signatureBackOrder).r,
                compactSignature(signatureBackOrder).vs,
                ether('25'),
                constants.AddressZero,
                matchingParams,
            ]).substring(10);

            const externalInteraction = matcher.address + '02' + swap.interface.encodeFunctionData('fillOrderRFQTo', [
                order2,
                compactSignature(signature2).r,
                compactSignature(signature2).vs,
                ether('0.015'),
                constants.AddressZero,
                internalInteraction,
            ]).substring(10);

            const addrweth = await weth.balanceOf(addr.address);
            const addr1weth = await weth.balanceOf(addr1.address);
            const addrdai = await dai.balanceOf(addr.address);
            const addr1dai = await dai.balanceOf(addr1.address);

            const { r, vs } = compactSignature(signature1);
            await matcher.matchRfqOrders(swap.address, order1, r, vs, ether('0.01'), externalInteraction);

            expect(await weth.balanceOf(addr.address)).to.equal(addrweth.sub(ether('0.025')));
            expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.add(ether('0.025')));
            expect(await dai.balanceOf(addr.address)).to.equal(addrdai.add(ether('25')));
            expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.sub(ether('25')));
        });
    });
});
