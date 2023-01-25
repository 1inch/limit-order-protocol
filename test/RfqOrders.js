const { expect, time, profileEVM, getPermit2 } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { buildOrderRFQ, signOrderRFQ, compactSignature, makingAmount, takingAmount, unwrapWeth } = require('./helpers/orderUtils');
const { getPermit } = require('./helpers/eip712');
const { ethers } = require('hardhat');
const { deploySwapTokens } = require('./helpers/fixtures');

describe('RFQ Orders in LimitOrderProtocol', function () {
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

            for (const salt of ['000000000000000000000001', '000000000000000000000002']) {
                const order = buildOrderRFQ(salt, dai.address, weth.address, 1, 1, addr1.address);
                const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

                const makerDai = await dai.balanceOf(addr1.address);
                const takerDai = await dai.balanceOf(addr.address);
                const makerWeth = await weth.balanceOf(addr1.address);
                const takerWeth = await weth.balanceOf(addr.address);

                const receipt = await swap.fillOrderRFQ(order, signature, makingAmount(1));

                expect(
                    await profileEVM(ethers.provider, receipt.hash, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE']),
                ).to.be.deep.equal([2, 1, 7, 7, 0]);

                // await gasspectEVM(receipt.hash);

                expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
                expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
                expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
                expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
            }
        });

        it('should swap fully based on RFQ signature (compact)', async function () {
            // Order: 1 DAI => 1 WETH
            // Swap:  1 DAI => 1 WETH
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);

            for (const salt of ['000000000000000000000001', '000000000000000000000002']) {
                const order = buildOrderRFQ(salt, dai.address, weth.address, 1, 1, addr1.address);
                const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

                const makerDai = await dai.balanceOf(addr1.address);
                const takerDai = await dai.balanceOf(addr.address);
                const makerWeth = await weth.balanceOf(addr1.address);
                const takerWeth = await weth.balanceOf(addr.address);

                const { r, vs } = compactSignature(signature);
                const receipt = await swap.fillOrderRFQCompact(order, r, vs, 1);

                expect(
                    await profileEVM(ethers.provider, receipt.hash, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE']),
                ).to.be.deep.equal([2, 1, 7, 7, 0]);

                // await gasspectEVM(receipt.hash);

                expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
                expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
                expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
                expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
            }
        });
    });

    describe('Permit', function () {
        describe('fillOrderRFQToWithPermit', function () {
            it('DAI => WETH', async function () {
                const { dai, weth, swap, chainId } = await loadFixture(initContracts);
                const order = buildOrderRFQ('0xFF000000000000000000000001', dai.address, weth.address, 1, 1, addr1.address);
                const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

                const permit = await getPermit(addr.address, addr, weth, '1', chainId, swap.address, '1');

                const makerDai = await dai.balanceOf(addr1.address);
                const takerDai = await dai.balanceOf(addr.address);
                const makerWeth = await weth.balanceOf(addr1.address);
                const takerWeth = await weth.balanceOf(addr.address);

                await swap.fillOrderRFQToWithPermit(order, signature, makingAmount(1), addr.address, permit);

                expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
                expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
                expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
                expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
            });

            it('DAI => WETH, permit2', async function () {
                const { dai, weth, swap, chainId } = await loadFixture(initContracts);
                const order = buildOrderRFQ('0xFF000000000000000000000001', dai.address, weth.address, 1, 1, addr1.address);
                const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

                const permit = await getPermit2(addr, weth.address, chainId, swap.address, '1');

                const makerDai = await dai.balanceOf(addr1.address);
                const takerDai = await dai.balanceOf(addr.address);
                const makerWeth = await weth.balanceOf(addr1.address);
                const takerWeth = await weth.balanceOf(addr.address);

                await swap.fillOrderRFQToWithPermit(order, signature, makingAmount(1), addr.address, permit);

                expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
                expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
                expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
                expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
            });

            it('rejects reused signature', async function () {
                const { dai, weth, swap, chainId } = await loadFixture(initContracts);
                const order = buildOrderRFQ('0xFF000000000000000000000001', dai.address, weth.address, 1, 1, addr1.address);
                const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

                const permit = await getPermit(addr.address, addr, weth, '1', chainId, swap.address, '1');
                const requestFunc = () => swap.fillOrderRFQToWithPermit(order, signature, takingAmount(1), addr.address, permit);
                await requestFunc();
                await expect(requestFunc()).to.be.revertedWith('ERC20Permit: invalid signature');
            });

            it('rejects other signature', async function () {
                const { dai, weth, swap, chainId } = await loadFixture(initContracts);
                const order = buildOrderRFQ('0xFF000000000000000000000001', dai.address, weth.address, 1, 1, addr1.address);
                const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

                const permit = await getPermit(addr.address, addr2, weth, '1', chainId, swap.address, '1');
                const requestFunc = () => swap.fillOrderRFQToWithPermit(order, signature, takingAmount(1), addr.address, permit);
                await expect(requestFunc()).to.be.revertedWith('ERC20Permit: invalid signature');
            });

            it('rejects expired permit', async function () {
                const deadline = (await time.latest()) - time.duration.weeks(1);
                const { dai, weth, swap, chainId } = await loadFixture(initContracts);
                const order = buildOrderRFQ('0xFF000000000000000000000001', dai.address, weth.address, 1, 1, addr1.address);
                const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

                const permit = await getPermit(addr.address, addr1, weth, '1', chainId, swap.address, '1', deadline);
                const requestFunc = () => swap.fillOrderRFQToWithPermit(order, signature, takingAmount(1), addr.address, permit);
                await expect(requestFunc()).to.be.revertedWith('ERC20Permit: expired deadline');
            });
        });
    });

    describe('OrderRFQ Cancelation', function () {
        it('should cancel own order', async function () {
            const { swap } = await loadFixture(initContracts);
            await swap.functions['cancelOrderRFQ(uint256)']('1');
            const invalidator = await swap.invalidatorForOrderRFQ(addr.address, '0');
            expect(invalidator).to.equal('2');
        });

        it('should cancel own order with huge number', async function () {
            const { swap } = await loadFixture(initContracts);
            await swap.functions['cancelOrderRFQ(uint256)']('1023');
            const invalidator = await swap.invalidatorForOrderRFQ(addr.address, '3');
            expect(invalidator).to.equal(1n << 255n);
        });

        it('should not fill cancelled order', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ('1', dai.address, weth.address, 1, 1, addr1.address);

            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);
            await swap.connect(addr1).functions['cancelOrderRFQ(uint256)']('1');

            await expect(
                swap.fillOrderRFQ(order, signature, makingAmount(1)),
            ).to.be.revertedWithCustomError(swap, 'InvalidatedOrder');
        });

        it('should not fill cancelled order (compact)', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ('1', dai.address, weth.address, 1, 1, addr1.address);
            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

            await swap.connect(addr1).functions['cancelOrderRFQ(uint256)']('1');

            const { r, vs } = compactSignature(signature);
            await expect(
                swap.fillOrderRFQCompact(order, r, vs, 1),
            ).to.be.revertedWithCustomError(swap, 'InvalidatedOrder');
        });
    });

    describe('Expiration', function () {
        it('should fill RFQ order when not expired', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ('0xFF000000000000000000000001', dai.address, weth.address, 1, 1, addr1.address);
            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await swap.fillOrderRFQ(order, signature, makingAmount(1));

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
        });

        it('should fill RFQ order when not expired (compact)', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ('0xFF000000000000000000000001', dai.address, weth.address, 1, 1, addr1.address);
            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            const { r, vs } = compactSignature(signature);
            await swap.fillOrderRFQCompact(order, r, vs, takingAmount(1));

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
        });

        it('should partial fill RFQ order', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ('0xFF000000000000000000000001', dai.address, weth.address, 2, 2, addr1.address);
            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await swap.fillOrderRFQ(order, signature, makingAmount(1));

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
        });

        it('should partial fill RFQ order (compact)', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ('0xFF000000000000000000000001', dai.address, weth.address, 2, 2, addr1.address);
            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            const { r, vs } = compactSignature(signature);
            await swap.fillOrderRFQCompact(order, r, vs, takingAmount(1));

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
        });

        it('should fully fill RFQ order', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ('0xFF000000000000000000000001', dai.address, weth.address, 1, 1, addr1.address);
            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await swap.fillOrderRFQ(order, signature, 0);

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
        });

        it('should fully fill RFQ order wih (compact)', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ('0xFF000000000000000000000001', dai.address, weth.address, 1, 1, addr1.address);
            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            const { r, vs } = compactSignature(signature);
            await swap.fillOrderRFQCompact(order, r, vs, 0);

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
        });

        it('should not partial fill RFQ order when 0', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ('0xFF000000000000000000000001', dai.address, weth.address, 5, 10, addr1.address);
            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

            await expect(
                swap.fillOrderRFQ(order, signature, takingAmount(1)),
            ).to.be.revertedWithCustomError(swap, 'RFQSwapWithZeroAmount');
        });

        it('should not partial fill RFQ order when 0 (compact)', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ('0xFF000000000000000000000001', dai.address, weth.address, 5, 10, addr1.address);
            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

            const { r, vs } = compactSignature(signature);
            await expect(
                swap.fillOrderRFQCompact(order, r, vs, takingAmount(1)),
            ).to.be.revertedWithCustomError(swap, 'RFQSwapWithZeroAmount');
        });

        it('should not fill RFQ order when expired', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ('308276084001730439550074881', dai.address, weth.address, 1, 1, addr1.address);
            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

            await expect(
                swap.fillOrderRFQ(order, signature, makingAmount(1)),
            ).to.be.revertedWithCustomError(swap, 'OrderExpired');
        });

        it('should not fill RFQ order when expired (compact)', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ('308276084001730439550074881', dai.address, weth.address, 1, 1, addr1.address);
            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

            const { r, vs } = compactSignature(signature);
            await expect(
                swap.fillOrderRFQCompact(order, r, vs, takingAmount(1)),
            ).to.be.revertedWithCustomError(swap, 'OrderExpired');
        });
    });

    describe('ETH fill', function () {
        it('should fill with ETH', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ('0xFF000000000000000000000001', dai.address, weth.address, 900, 3, addr1.address);
            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await swap.fillOrderRFQ(order, signature, takingAmount(3), { value: 3 });

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(900));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(900));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(3));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth);
        });

        it('should receive ETH after fill', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ('0xFF000000000000000000000001', weth.address, dai.address, 3, 900, addr1.address);
            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await swap.fillOrderRFQ(order, signature, unwrapWeth(makingAmount(3)));

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.add(900));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.sub(900));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.sub(3));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth);
        });

        it('should reverted with takerAsset WETH and incorrect msg.value', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(initContracts);
            const order = buildOrderRFQ('0xFF000000000000000000000001', dai.address, weth.address, 900, 3, addr1.address);
            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

            await expect(
                swap.fillOrderRFQ(order, signature, makingAmount(900), { value: 2 }),
            ).to.be.revertedWithCustomError(swap, 'InvalidMsgValue');
            await expect(
                swap.fillOrderRFQ(order, signature, makingAmount(900), { value: 4 }),
            ).to.be.revertedWithCustomError(swap, 'InvalidMsgValue');
        });

        it('should reverted with takerAsset non-WETH and msg.value greater than 0', async function () {
            const { dai, swap, chainId, usdc } = await loadFixture(initContracts);

            const order = buildOrderRFQ('0xFF000000000000000000000001', dai.address, usdc.address, 900, 900, addr1.address);
            const signature = await signOrderRFQ(order, chainId, swap.address, addr1);

            await expect(
                swap.fillOrderRFQ(order, signature, makingAmount(900), { value: 1 }),
            ).to.be.revertedWithCustomError(swap, 'InvalidMsgValue');
        });
    });
});
