const hre = require('hardhat');
const { ethers } = hre;
const { expect, time, profileEVM, trackReceivedTokenAndTx, getPermit2, permit2Contract } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { buildOrderRFQ, signOrder, compactSignature, fillWithMakingAmount, unwrapWethTaker, buildMakerTraits, buildOrderData } = require('./helpers/orderUtils');
const { getPermit } = require('./helpers/eip712');
const { deploySwapTokens } = require('./helpers/fixtures');
const { constants } = require('ethers');

describe('RFQ Orders in LimitOrderProtocol', function () {
    const emptyInteraction = '0x';
    let addr, addr1, addr2;

    before(async function () {
        [addr, addr1, addr2] = await ethers.getSigners();
    });

    const initContracts = async function () {
        const { dai, weth, swap, chainId, usdc } = await loadFixture(deploySwapTokens);

        await dai.mint(addr.address, '1000000');
        await dai.mint(addr1.address, '1000000');
        await weth.deposit({ value: '1000000' });
        await weth.connect(addr1).deposit({ value: '1000000' });

        await dai.approve(swap.address, '1000000');
        await weth.approve(swap.address, '1000000');
        await dai.connect(addr1).approve(swap.address, '1000000');
        await weth.connect(addr1).approve(swap.address, '1000000');

        await usdc.mint(addr.address, '1000000');
        await usdc.approve(swap.address, '1000000');

        return { dai, weth, swap, chainId, usdc };
    };

    describe('wip', function () {
        it('should swap fully based on RFQ signature', async function () {
            // Order: 1 DAI => 1 WETH
            // Swap:  1 DAI => 1 WETH
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);

            for (const nonce of [1, 2]) {
                const order = buildOrderRFQ({
                    maker: addr1.address,
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    makerTraits: buildMakerTraits({ nonce }),
                });
                const signature = await signOrder(order, chainId, swap.address, addr1);

                const makerDai = await dai.balanceOf(addr1.address);
                const takerDai = await dai.balanceOf(addr.address);
                const makerWeth = await weth.balanceOf(addr1.address);
                const takerWeth = await weth.balanceOf(addr.address);

                const { r, vs } = compactSignature(signature);
                const receipt = await swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1));

                if (hre.__SOLIDITY_COVERAGE_RUNNING === undefined) {
                    expect(
                        await profileEVM(ethers.provider, receipt.hash, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE']),
                    ).to.be.deep.equal([2, 1, 7, 7, 0]);
                }

                expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
                expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
                expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
                expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
            }
        });
    });

    describe('Permit', function () {
        describe('fillOrderToWithPermit', function () {
            it('DAI => WETH', async function () {
                const { dai, weth, swap, chainId } = await loadFixture(initContracts);
                const order = buildOrderRFQ({
                    maker: addr1.address,
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    makerTraits: buildMakerTraits({ nonce: 1 }),
                });
                const signature = await signOrder(order, chainId, swap.address, addr1);

                const permit = await getPermit(addr.address, addr, weth, '1', chainId, swap.address, '1');

                const makerDai = await dai.balanceOf(addr1.address);
                const takerDai = await dai.balanceOf(addr.address);
                const makerWeth = await weth.balanceOf(addr1.address);
                const takerWeth = await weth.balanceOf(addr.address);

                const { r, vs } = compactSignature(signature);
                await swap.fillOrderToWithPermit(order, r, vs, 1, fillWithMakingAmount(1), addr.address, emptyInteraction, permit);

                expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
                expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
                expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
                expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
            });

            it('DAI => WETH, permit2', async function () {
                const { dai, weth, swap, chainId } = await loadFixture(initContracts);
                const order = buildOrderRFQ({
                    maker: addr1.address,
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    makerTraits: buildMakerTraits({ nonce: 1, usePermit2: true }),
                });
                const signature = await signOrder(order, chainId, swap.address, addr1);

                const permit2 = await permit2Contract();
                await dai.connect(addr1).approve(permit2.address, 1);
                const permit = await getPermit2(addr1, dai.address, chainId, swap.address, 1);

                const makerDai = await dai.balanceOf(addr1.address);
                const takerDai = await dai.balanceOf(addr.address);
                const makerWeth = await weth.balanceOf(addr1.address);
                const takerWeth = await weth.balanceOf(addr.address);

                const { r, vs } = compactSignature(signature);
                await swap.fillOrderToWithPermit(order, r, vs, 1, fillWithMakingAmount(1), addr.address, emptyInteraction, permit);

                expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
                expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
                expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
                expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
            });

            it('rejects reused signature', async function () {
                const { dai, weth, swap, chainId } = await loadFixture(initContracts);
                const order = buildOrderRFQ({
                    maker: addr1.address,
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    makerTraits: buildMakerTraits({ nonce: 1 }),
                });
                const signature = await signOrder(order, chainId, swap.address, addr1);

                const permit = await getPermit(addr.address, addr, weth, '1', chainId, swap.address, '1');
                const { r, vs } = compactSignature(signature);
                const requestFunc = () => swap.fillOrderToWithPermit(order, r, vs, 1, 1, addr.address, emptyInteraction, permit);
                await requestFunc();
                await expect(requestFunc()).to.be.revertedWith('ERC20Permit: invalid signature');
            });

            it('rejects other signature', async function () {
                const { dai, weth, swap, chainId } = await loadFixture(initContracts);
                const order = buildOrderRFQ({
                    maker: addr1.address,
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    makerTraits: buildMakerTraits({ nonce: 1 }),
                });
                const signature = await signOrder(order, chainId, swap.address, addr1);

                const permit = await getPermit(addr.address, addr2, weth, '1', chainId, swap.address, '1');
                const { r, vs } = compactSignature(signature);
                await expect(swap.fillOrderToWithPermit(order, r, vs, 1, 1, addr.address, emptyInteraction, permit)).to.be.revertedWith('ERC20Permit: invalid signature');
            });

            it('rejects expired permit', async function () {
                const deadline = (await time.latest()) - time.duration.weeks(1);
                const { dai, weth, swap, chainId } = await loadFixture(initContracts);
                const order = buildOrderRFQ({
                    maker: addr1.address,
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    makerTraits: buildMakerTraits({ nonce: 1 }),
                });
                const signature = await signOrder(order, chainId, swap.address, addr1);

                const permit = await getPermit(addr.address, addr1, weth, '1', chainId, swap.address, '1', deadline);
                const { r, vs } = compactSignature(signature);
                await expect(swap.fillOrderToWithPermit(order, r, vs, 1, 1, addr.address, emptyInteraction, permit)).to.be.revertedWith('ERC20Permit: expired deadline');
            });
        });
    });

    describe('Order Cancelation', function () {
        it('should cancel own order', async function () {
            const { swap, dai, weth, chainId } = await loadFixture(initContracts);

            const orderNonce = 1;
            const order = buildOrderRFQ({
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 1,
                takingAmount: 1,
                makerTraits: buildMakerTraits({ nonce: orderNonce, allowMultipleFills: false }),
            });
            const data = buildOrderData(chainId, swap.address, order);
            const orderHash = ethers.utils._TypedDataEncoder.hash(data.domain, data.types, data.value);

            await swap.cancelOrder(order.makerTraits, orderHash);
            const invalidator = await swap.bitInvalidatorForOrder(addr.address, orderNonce);
            expect(invalidator).to.equal('2');
        });

        it('should cancel own order with huge number', async function () {
            const { swap, dai, weth, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ({
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 1,
                takingAmount: 1,
                makerTraits: buildMakerTraits({ nonce: 1023, allowMultipleFills: false }),
            });
            const data = buildOrderData(chainId, swap.address, order);
            const orderHash = ethers.utils._TypedDataEncoder.hash(data.domain, data.types, data.value);

            await swap.cancelOrder(order.makerTraits, orderHash);
            const invalidator = await swap.bitInvalidatorForOrder(addr.address, '1023');
            expect(invalidator).to.equal(1n << 255n);
        });

        it('should not fill cancelled order', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ({
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 1,
                takingAmount: 1,
                makerTraits: buildMakerTraits({ nonce: 1, allowMultipleFills: false }),
            });
            const data = buildOrderData(chainId, swap.address, order);
            const orderHash = ethers.utils._TypedDataEncoder.hash(data.domain, data.types, data.value);

            const signature = await signOrder(order, chainId, swap.address, addr1);
            await swap.connect(addr1).cancelOrder(order.makerTraits, orderHash);

            const { r, vs } = compactSignature(signature);
            await expect(
                swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1)),
            ).to.be.revertedWithCustomError(swap, 'BitInvalidatedOrder');
        });
    });

    describe('Expiration', function () {
        it('should fill RFQ order when not expired', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ({
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 1,
                takingAmount: 1,
                makerTraits: buildMakerTraits({ nonce: 1 }),
            });
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            const { r, vs } = compactSignature(signature);
            await swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1));

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
        });

        it('should partial fill RFQ order', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ({
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 2,
                takingAmount: 2,
                makerTraits: buildMakerTraits({ nonce: 1 }),
            });
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            const { r, vs } = compactSignature(signature);
            await swap.fillOrder(order, r, vs, 1, fillWithMakingAmount(1));

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
        });

        it('should fully fill RFQ order', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ({
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 1,
                takingAmount: 1,
                makerTraits: buildMakerTraits({ nonce: 1 }),
            });
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            const { r, vs } = compactSignature(signature);
            await swap.fillOrder(order, r, vs, 1, 1);

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
        });

        it('should not partial fill RFQ order when 0', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ({
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 5,
                takingAmount: 10,
                makerTraits: buildMakerTraits({ nonce: 1 }),
            });
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const { r, vs } = compactSignature(signature);
            await expect(
                swap.fillOrder(order, r, vs, 1, 0),
            ).to.be.revertedWithCustomError(swap, 'SwapWithZeroAmount');
        });

        it('should not fill RFQ order when expired', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ({
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 1,
                takingAmount: 1,
                makerTraits: buildMakerTraits({ expiry: await time.latest() }),
            });
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const { r, vs } = compactSignature(signature);
            await expect(
                swap.fillOrder(order, r, vs, fillWithMakingAmount(1), 1),
            ).to.be.revertedWithCustomError(swap, 'OrderExpired');
        });
    });

    describe('ETH fill', function () {
        it('should fill with ETH', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ({
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 900,
                takingAmount: 3,
                makerTraits: buildMakerTraits({ nonce: 1 }),
            });

            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            const { r, vs } = compactSignature(signature);
            await swap.fillOrder(order, r, vs, 3, 900, { value: 3 });

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(900));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(900));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(3));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth);
        });

        it('should receive ETH after fill', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ({
                maker: addr1.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: 3,
                takingAmount: 900,
                makerTraits: buildMakerTraits({ nonce: 1 }),
            });
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            const { r, vs } = compactSignature(signature);
            await swap.fillOrder(order, r, vs, 3, unwrapWethTaker(fillWithMakingAmount(900)));

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.add(900));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.sub(900));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.sub(3));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth);
        });

        it('should revert if taker provided insufficient ETH', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ({
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 900,
                takingAmount: 3,
                makerTraits: buildMakerTraits({ nonce: 1 }),
            });
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const { r, vs } = compactSignature(signature);
            await expect(
                swap.fillOrder(order, r, vs, 900, fillWithMakingAmount(3), { value: 2 }),
            ).to.be.revertedWithCustomError(swap, 'InvalidMsgValue');
        });

        it('should refund taker with exceeding ETH', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ({
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 900,
                takingAmount: 3,
                makerTraits: buildMakerTraits({ nonce: 1 }),
            });
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const { r, vs } = compactSignature(signature);
            const promise = () => swap.fillOrder(order, r, vs, 900, fillWithMakingAmount(3), { value: 4 });
            const [ethDiff] = await trackReceivedTokenAndTx(ethers.provider, { address: constants.AddressZero }, addr.address, promise);
            expect(ethDiff).to.equal(-3n);
        });

        it('should reverted with takerAsset non-WETH and msg.value greater than 0', async function () {
            const { dai, swap, chainId, usdc } = await loadFixture(initContracts);

            const order = buildOrderRFQ({
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: usdc.address,
                makingAmount: 900,
                takingAmount: 900,
                makerTraits: buildMakerTraits({ nonce: 1 }),
            });
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const { r, vs } = compactSignature(signature);
            await expect(
                swap.fillOrder(order, r, vs, 900, fillWithMakingAmount(900), { value: 1 }),
            ).to.be.revertedWithCustomError(swap, 'InvalidMsgValue');
        });
    });
});
