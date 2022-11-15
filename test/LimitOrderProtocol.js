const { expect, time, constants, profileEVM, trim0x } = require('@1inch/solidity-utils');
const { buildOrder, buildOrderData, signOrder } = require('./helpers/orderUtils');
const { getPermit, withTarget } = require('./helpers/eip712');
const { joinStaticCalls, cutLastArg, ether, setn } = require('./helpers/utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');

describe('LimitOrderProtocol', function () {
    let addr, addr1, addr2;

    before(async function () {
        [addr, addr1, addr2] = await ethers.getSigners();
    });

    async function initContracts (dai, weth, swap) {
        await dai.mint(addr1.address, ether('1000000000000'));
        await weth.mint(addr1.address, ether('1000000000000'));
        await dai.mint(addr.address, ether('1000000000000'));
        await weth.mint(addr.address, ether('1000000000000'));
        await dai.approve(swap.address, ether('1000000000000'));
        await weth.approve(swap.address, ether('1000000000000'));
        await dai.connect(addr1).approve(swap.address, ether('1000000000000'));
        await weth.connect(addr1).approve(swap.address, ether('1000000000000'));
    };

    describe('wip', function () {
        const deployContractsAndInit = async function () {
            const { dai, weth, swap, chainId } = await deploySwapTokens();
            await initContracts(dai, weth, swap);
            return { dai, weth, swap, chainId };
        };

        it('transferFrom', async function () {
            const { dai } = await loadFixture(deployContractsAndInit);

            await dai.connect(addr1).approve(addr.address, '2');
            await dai.transferFrom(addr1.address, addr.address, '1');
        });

        it('should not swap with bad signature', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1.address,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);
            const sentOrder = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 1,
                    takingAmount: 2,
                    from: addr1.address,
                },
            );

            await expect(
                swap.fillOrder(sentOrder, signature, '0x', 1, 0, 1),
            ).to.be.revertedWithCustomError(swap, 'BadSignature');
        });

        it('should not fill (1,1)', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1.address,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            await expect(
                swap.fillOrder(order, signature, '0x', 1, 1, 1),
            ).to.be.revertedWithCustomError(swap, 'OnlyOneAmountShouldBeZero');
        });

        it('should not fill above threshold', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 2,
                    takingAmount: 2,
                    from: addr1.address,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            await expect(
                swap.fillOrder(order, signature, '0x', 2, 0, 1),
            ).to.be.revertedWithCustomError(swap, 'TakingAmountTooHigh');
        });

        it('should not fill below threshold', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 2,
                    takingAmount: 2,
                    from: addr1.address,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            await expect(
                swap.fillOrder(order, signature, '0x', 0, 2, 3),
            ).to.be.revertedWithCustomError(swap, 'MakingAmountTooLow');
        });

        it('should fail when both amounts are zero', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 100,
                    takingAmount: 1,
                    from: addr1.address,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            await expect(
                swap.fillOrder(order, signature, '0x', 0, 0, 0),
            ).to.be.revertedWithCustomError(swap, 'OnlyOneAmountShouldBeZero');
        });

        it('should swap fully based on signature', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);
            // Order: 1 DAI => 1 WETH
            // Swap:  1 DAI => 1 WETH

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1.address,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            const receipt = await swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(
                await profileEVM(receipt.hash, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE']),
            ).to.be.deep.equal([2, 1, 7, 7, 0]);

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
        });

        it('should swap half based on signature', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);
            // Order: 2 DAI => 2 WETH
            // Swap:  1 DAI => 1 WETH

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 2,
                    takingAmount: 2,
                    from: addr1.address,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            const receipt = await swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(
                await profileEVM(receipt.hash, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE']),
            ).to.be.deep.equal([2, 1, 7, 7, 0]);

            // await gasspectEVM(receipt.hash);

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
        });

        it('should floor maker amount', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);
            // Order: 2 DAI => 10 WETH
            // Swap:  9 WETH <= 1 DAI

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 2,
                    takingAmount: 10,
                    from: addr1.address,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await swap.fillOrder(order, signature, '0x', 0, 9, 1);

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(9));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(9));
        });

        it('should fail on floor maker amount = 0', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);
            // Order: 2 DAI => 10 WETH
            // Swap:  4 WETH <= 0 DAI

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 2,
                    takingAmount: 10,
                    from: addr1.address,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            await expect(
                swap.fillOrder(order, signature, '0x', 0, 4, 0),
            ).to.be.revertedWithCustomError(swap, 'SwapWithZeroAmount');
        });

        it('should ceil taker amount', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);
            // Order: 10 DAI => 2 WETH
            // Swap:  4 DAI => 1 WETH

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 10,
                    takingAmount: 2,
                    from: addr1.address,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await swap.fillOrder(order, signature, '0x', 4, 0, 1);

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(4));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(4));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
        });

        it('ERC721Proxy should work', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const ERC721Proxy = await ethers.getContractFactory('ERC721Proxy');
            const erc721proxy = await ERC721Proxy.deploy(swap.address);
            await erc721proxy.deployed();

            await dai.connect(addr1).approve(erc721proxy.address, '10');
            await weth.approve(erc721proxy.address, '10');

            const order = buildOrder(
                {
                    makerAsset: erc721proxy.address,
                    takerAsset: erc721proxy.address,
                    makingAmount: 10,
                    takingAmount: 10,
                    from: addr1.address,
                },
                {
                    makerAssetData: '0x' + erc721proxy.interface.encodeFunctionData('func_60iHVgK', [addr1.address, constants.ZERO_ADDRESS, 0, 10, dai.address]).substring(202),
                    takerAssetData: '0x' + erc721proxy.interface.encodeFunctionData('func_60iHVgK', [constants.ZERO_ADDRESS, addr1.address, 0, 10, weth.address]).substring(202),
                },
            );

            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await swap.fillOrder(order, signature, '0x', 10, 0, 10);

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(10));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(10));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(10));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(10));
        });
    });

    describe('Permit', function () {
        describe('fillOrderToWithPermit', function () {
            const deployContractsAndInitPermit = async function () {
                const { dai, weth, swap, chainId } = await deploySwapTokens();
                await initContracts(dai, weth, swap);

                const order = buildOrder({
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1.address,
                });
                const signature = await signOrder(order, chainId, swap.address, addr1);

                return { dai, weth, swap, chainId, order, signature };
            };

            it('DAI => WETH', async function () {
                const { dai, weth, swap, chainId, order, signature } = await loadFixture(deployContractsAndInitPermit);

                const permit = await getPermit(addr.address, addr, weth, '1', chainId, swap.address, '1');
                const targetPermitPair = withTarget(weth.address, permit);

                const makerDai = await dai.balanceOf(addr1.address);
                const takerDai = await dai.balanceOf(addr.address);
                const makerWeth = await weth.balanceOf(addr1.address);
                const takerWeth = await weth.balanceOf(addr.address);

                await swap.fillOrderToWithPermit(order, signature, '0x', 1, 0, 1, addr.address, targetPermitPair);

                expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
                expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
                expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
                expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
            });

            it('rejects reused signature', async function () {
                const { weth, swap, chainId, order, signature } = await loadFixture(deployContractsAndInitPermit);

                const permit = await getPermit(addr.address, addr, weth, '1', chainId, swap.address, '1');
                const targetPermitPair = withTarget(weth.address, permit);
                const requestFunc = () => swap.fillOrderToWithPermit(order, signature, '0x', 0, 1, 1, addr.address, targetPermitPair);
                await requestFunc();
                await expect(requestFunc()).to.be.revertedWith('ERC20Permit: invalid signature');
            });

            it('rejects other signature', async function () {
                const { weth, swap, chainId, order, signature } = await loadFixture(deployContractsAndInitPermit);

                const permit = await getPermit(addr.address, addr2, weth, '1', chainId, swap.address, '1');
                const targetPermitPair = withTarget(weth.address, permit);
                await expect(
                    swap.fillOrderToWithPermit(order, signature, '0x', 0, 1, 1, addr.address, targetPermitPair),
                ).to.be.revertedWith('ERC20Permit: invalid signature');
            });

            it('rejects expired permit', async function () {
                const { weth, swap, chainId, order, signature } = await loadFixture(deployContractsAndInitPermit);

                const deadline = (await time.latest()) - time.duration.weeks(1);
                const permit = await getPermit(addr.address, addr1, weth, '1', chainId, swap.address, '1', deadline);
                const targetPermitPair = withTarget(weth.address, permit);
                await expect(
                    swap.fillOrderToWithPermit(order, signature, '0x', 0, 1, 1, addr.address, targetPermitPair),
                ).to.be.revertedWith('ERC20Permit: expired deadline');
            });
        });

        describe('maker permit', function () {
            const deployContractsAndInitPermit = async function () {
                const { dai, weth, swap, chainId } = await deploySwapTokens();
                await initContracts(dai, weth, swap);

                const permit = withTarget(
                    weth.address,
                    await getPermit(addr.address, addr, weth, '1', chainId, swap.address, '1'),
                );

                const order = buildOrder(
                    {
                        makerAsset: weth.address,
                        takerAsset: dai.address,
                        makingAmount: 1,
                        takingAmount: 1,
                        from: addr.address,
                    },
                    {
                        permit,
                    },
                );
                order.permit = permit;
                const signature = await signOrder(order, chainId, swap.address, addr);

                return { dai, weth, swap, order, signature, permit };
            };

            it('maker permit works', async function () {
                const { dai, weth, swap, order, signature } = await loadFixture(deployContractsAndInitPermit);

                const makerDai = await dai.balanceOf(addr.address);
                const takerDai = await dai.balanceOf(addr1.address);
                const makerWeth = await weth.balanceOf(addr.address);
                const takerWeth = await weth.balanceOf(addr1.address);

                await swap.connect(addr1).fillOrder(order, signature, '0x', 1, 0, 1);

                expect(await dai.balanceOf(addr.address)).to.equal(makerDai.add(1));
                expect(await dai.balanceOf(addr1.address)).to.equal(takerDai.sub(1));
                expect(await weth.balanceOf(addr.address)).to.equal(makerWeth.sub(1));
                expect(await weth.balanceOf(addr1.address)).to.equal(takerWeth.add(1));
            });

            it('skips permit with taker flag', async function () {
                const { dai, weth, swap, order, signature, permit } = await loadFixture(deployContractsAndInitPermit);

                const makerDai = await dai.balanceOf(addr1.address);
                const takerDai = await dai.balanceOf(addr.address);
                const makerWeth = await weth.balanceOf(addr1.address);
                const takerWeth = await weth.balanceOf(addr.address);

                await addr1.sendTransaction({ to: weth.address, data: '0xd505accf' + permit.substring(42) });
                await swap.connect(addr1).fillOrder(order, signature, '0x', 1, 0, setn(1, 255, true).toString());

                expect(await dai.balanceOf(addr.address)).to.equal(makerDai.add(1));
                expect(await dai.balanceOf(addr1.address)).to.equal(takerDai.sub(1));
                expect(await weth.balanceOf(addr.address)).to.equal(makerWeth.sub(1));
                expect(await weth.balanceOf(addr1.address)).to.equal(takerWeth.add(1));
            });
        });
    });

    describe('Amount Calculator', function () {
        const deployContractsAndInit = async function () {
            const { dai, weth, swap, chainId } = await deploySwapTokens();
            await initContracts(dai, weth, swap);
            return { dai, weth, swap, chainId };
        };

        it('empty getTakingAmount should work on full fill', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 10,
                takingAmount: 10,
                from: addr1.address,
            });
            order.getTakingAmount = '0x';
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await swap.fillOrder(order, signature, '0x', 10, 0, 10);

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(10));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(10));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(10));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(10));
        });

        it('empty getTakingAmount should not work on partial fill', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 10,
                takingAmount: 10,
                from: addr1.address,
            }, {
                getTakingAmount: '', // <-- empty string turns into "x" to disable partial fill
            });
            const signature = await signOrder(order, chainId, swap.address, addr1);

            await expect(
                swap.fillOrder(order, signature, '0x', 5, 0, 5),
            ).to.be.revertedWithCustomError(swap, 'WrongAmount');
        });

        it('empty getMakingAmount should work on full fill', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 10,
                takingAmount: 10,
                from: addr1.address,
            });
            order.getMakingAmount = '0x';
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await swap.fillOrder(order, signature, '0x', 0, 10, 10);

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(10));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(10));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(10));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(10));
        });

        it('empty getMakingAmount should not work on partial fill', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 10,
                takingAmount: 10,
                from: addr1.address,
            }, {
                getMakingAmount: '', // <-- empty string turns into "x" to disable partial fill
            });
            const signature = await signOrder(order, chainId, swap.address, addr1);

            await expect(
                swap.fillOrder(order, signature, '0x', 0, 5, 5),
            ).to.be.revertedWithCustomError(swap, 'WrongAmount');
        });
    });

    describe('Order Cancelation', function () {
        const deployContractsAndInit = async function () {
            const { dai, weth, swap, chainId } = await deploySwapTokens();
            await initContracts(dai, weth, swap);
            return { dai, weth, swap, chainId };
        };

        const orderCancelationInit = async function () {
            const { dai, weth, swap, chainId } = await deployContractsAndInit();
            const order = buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 1,
                takingAmount: 1,
                from: addr1.address,
            });
            return { dai, weth, swap, chainId, order };
        };

        // TODO: need same test for RFQ
        it('should cancel own order', async function () {
            const { swap, chainId, order } = await loadFixture(orderCancelationInit);
            const data = buildOrderData(chainId, swap.address, order);
            const orderHash = ethers.utils._TypedDataEncoder.hash(data.domain, data.types, data.value);

            await swap.connect(addr1).cancelOrder(orderHash);
            expect(await swap.remaining(addr1.address, orderHash)).to.equal('0');
        });

        it('should not fill cancelled order', async function () {
            const { swap, chainId, order } = await loadFixture(orderCancelationInit);
            const signature = await signOrder(order, chainId, swap.address, addr1);
            const data = buildOrderData(chainId, swap.address, order);
            const orderHash = ethers.utils._TypedDataEncoder.hash(data.domain, data.types, data.value);

            await swap.connect(addr1).cancelOrder(orderHash);

            await expect(
                swap.fillOrder(order, signature, '0x', 1, 0, 1),
            ).to.be.revertedWithCustomError(swap, 'RemainingAmountIsZero');
        });
    });

    describe('Private Orders', function () {
        const deployContractsAndInit = async function () {
            const { dai, weth, swap, chainId } = await deploySwapTokens();
            await initContracts(dai, weth, swap);
            return { dai, weth, swap, chainId };
        };

        it('should fill with correct taker', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 1,
                takingAmount: 1,
                from: addr1.address,
                allowedSender: addr.address,
            });
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
        });

        it('should not fill with incorrect taker', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 1,
                takingAmount: 1,
                from: addr1.address,
                allowedSender: addr1.address,
            });
            const signature = await signOrder(order, chainId, swap.address, addr1);

            await expect(
                swap.fillOrder(order, signature, '0x', 1, 0, 1),
            ).to.be.revertedWithCustomError(swap, 'PrivateOrder');
        });
    });

    describe('Predicate', function () {
        const deployContractsAndInit = async function () {
            const { dai, weth, swap, chainId } = await deploySwapTokens();
            await initContracts(dai, weth, swap);
            return { dai, weth, swap, chainId };
        };

        it('benchmark gas', async function () {
            const { dai, swap } = await loadFixture(deployContractsAndInit);
            const tsBelow = swap.interface.encodeFunctionData('timestampBelow', [0xff0000n]);
            const balanceCall = dai.interface.encodeFunctionData('balanceOf', [addr1.address]);
            const gtBalance = swap.interface.encodeFunctionData('gt', [
                100000n,
                swap.interface.encodeFunctionData('arbitraryStaticCall', [dai.address, balanceCall]),
            ]);

            const { offsets, data } = joinStaticCalls([tsBelow, gtBalance]);
            await swap.connect(addr1).or(offsets, data);
        });

        it('benchmark gas real case', async function () {
            const { swap } = await loadFixture(deployContractsAndInit);
            const tsBelow = swap.interface.encodeFunctionData('timestampBelow', [0x70000000n]);
            const eqNonce = swap.interface.encodeFunctionData('nonceEquals', [addr1.address, 0]);

            const { offsets, data } = joinStaticCalls([tsBelow, eqNonce]);
            await swap.connect(addr1).and(offsets, data);
        });

        it('benchmark gas real case (optimized)', async function () {
            const { swap } = await loadFixture(deployContractsAndInit);
            const timestamp = 0x70000000n;
            const nonce = 0n;

            await swap.connect(addr1).timestampBelowAndNonceEquals(BigInt(addr1.address) | (nonce << 160n) | (timestamp << 208n));
        });

        it('`or` should pass', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const tsBelow = swap.interface.encodeFunctionData('timestampBelow', ['0xff0000']);
            const eqNonce = swap.interface.encodeFunctionData('nonceEquals', [addr1.address, 0]);
            const { offsets, data } = joinStaticCalls([tsBelow, eqNonce]);
            const predicate = swap.interface.encodeFunctionData('or', [offsets, data]);

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1.address,
                },
                {
                    predicate,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
        });

        it('`or` should fail', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const tsBelow = swap.interface.encodeFunctionData('timestampBelow', [0xff0000n]);
            const eqNonce = swap.interface.encodeFunctionData('nonceEquals', [addr1.address, 1]);
            const { offsets, data } = joinStaticCalls([tsBelow, eqNonce]);
            const predicate = swap.interface.encodeFunctionData('or', [offsets, data]);
            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1.address,
                },
                {
                    predicate,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            await expect(
                swap.fillOrder(order, signature, '0x', 1, 0, 1),
            ).to.be.revertedWithCustomError(swap, 'PredicateIsNotTrue');
        });

        it('`and` should pass', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const tsBelow = swap.interface.encodeFunctionData('timestampBelow', [0xff000000n]);
            const eqNonce = swap.interface.encodeFunctionData('nonceEquals', [addr1.address, 0]);
            const { offsets, data } = joinStaticCalls([tsBelow, eqNonce]);
            const predicate = swap.interface.encodeFunctionData('and', [offsets, data]);
            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1.address,
                },
                {
                    predicate,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
        });

        it('nonce + ts example', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const tsBelow = swap.interface.encodeFunctionData('timestampBelow', [0xff000000n]);
            const nonceCall = swap.interface.encodeFunctionData('nonceEquals', [addr1.address, 0]);
            const { offsets, data } = joinStaticCalls([tsBelow, nonceCall]);
            const predicate = swap.interface.encodeFunctionData('and', [offsets, data]);
            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1.address,
                },
                {
                    predicate,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
        });

        it('advance nonce', async function () {
            const { swap } = await loadFixture(deployContractsAndInit);
            await swap.increaseNonce();
            expect(await swap.nonce(addr.address)).to.equal('1');
        });

        it('`and` should fail', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const tsBelow = swap.interface.encodeFunctionData('timestampBelow', [0xff0000n]);
            const eqNonce = swap.interface.encodeFunctionData('nonceEquals', [addr1.address, 0]);
            const { offsets, data } = joinStaticCalls([tsBelow, eqNonce]);
            const predicate = swap.interface.encodeFunctionData('and', [offsets, data]);
            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1.address,
                },
                {
                    predicate,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            await expect(
                swap.fillOrder(order, signature, '0x', 1, 0, 1),
            ).to.be.revertedWithCustomError(swap, 'PredicateIsNotTrue');
        });
    });

    describe('Expiration', function () {
        const deployContractsAndInit = async function () {
            const { dai, weth, swap, chainId } = await deploySwapTokens();
            await initContracts(dai, weth, swap);
            return { dai, weth, swap, chainId };
        };

        it('should fill when not expired', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1.address,
                },
                {
                    predicate: swap.interface.encodeFunctionData('timestampBelow', ['0xff00000000']),
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(1));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(1));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(1));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(1));
        });

        it('should not fill when expired', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1.address,
                },
                {
                    predicate: swap.interface.encodeFunctionData('timestampBelow', ['0xff0000']),
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            await expect(
                swap.fillOrder(order, signature, '0x', 1, 0, 1),
            ).to.be.revertedWithCustomError(swap, 'PredicateIsNotTrue');
        });

        it('should fill partially if not enough coins (taker)', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 2,
                takingAmount: 2,
                from: addr1.address,
            });
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await swap.fillOrder(order, signature, '0x', 0, 3, 2);

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(2));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(2));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(2));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(2));
        });

        it('should fill partially if not enough coins (maker)', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: 2,
                takingAmount: 2,
                from: addr1.address,
            });
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await swap.fillOrder(order, signature, '0x', 3, 0, 3);

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(2));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(2));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(2));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth.sub(2));
        });
    });

    describe('ETH fill', function () {
        const deployContractsAndInit = async function () {
            const { dai, weth, swap, chainId, usdc } = await deploySwapTokens();
            await initContracts(dai, weth, swap);
            return { dai, weth, swap, chainId, usdc };
        };

        it('should fill with ETH', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 900,
                    takingAmount: 3,
                    from: addr1.address,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerDai = await dai.balanceOf(addr1.address);
            const takerDai = await dai.balanceOf(addr.address);
            const makerWeth = await weth.balanceOf(addr1.address);
            const takerWeth = await weth.balanceOf(addr.address);

            await swap.fillOrder(order, signature, '0x', 900, 0, 3, { value: 3 });

            expect(await dai.balanceOf(addr1.address)).to.equal(makerDai.sub(900));
            expect(await dai.balanceOf(addr.address)).to.equal(takerDai.add(900));
            expect(await weth.balanceOf(addr1.address)).to.equal(makerWeth.add(3));
            expect(await weth.balanceOf(addr.address)).to.equal(takerWeth);
        });

        it('should revert with takerAsset WETH and not enough msg.value', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 900,
                    takingAmount: 3,
                    from: addr1.address,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            await expect(
                swap.fillOrder(order, signature, '0x', 900, 0, 3, { value: 2 }),
            ).to.be.revertedWithCustomError(swap, 'InvalidMsgValue');
        });

        it('should pass with takerAsset WETH and correct msg.value', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: 900,
                    takingAmount: 3,
                    from: addr1.address,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            await swap.fillOrder(order, signature, '0x', 900, 0, 3, { value: 4 });
        });

        it('should reverted with takerAsset non-WETH and msg.value greater than 0', async function () {
            const { dai, swap, chainId, usdc } = await loadFixture(deployContractsAndInit);
            await usdc.mint(addr.address, '1000000');
            await usdc.approve(swap.address, '1000000');
            const order = buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: usdc.address,
                    makingAmount: 900,
                    takingAmount: 900,
                    from: addr1.address,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            await expect(
                swap.fillOrder(order, signature, '0x', 900, 0, 900, { value: 1 }),
            ).to.be.revertedWithCustomError(swap, 'InvalidMsgValue');
        });
    });

    /**
     * Range limit order is used to sell an asset within a given price range.
     * For example, right now ETH is worth 3000 DAI and you believe that within the next week the price of ETH will rise and reach at least 4000 DAI.
     * In this case, you can create an ETH -> DAI limit order with a price range of 3000 -> 4000.
     * Let's say you created a similar order for the amount of 10 ETH.
     * Someone can file the entire limit at once at an average price of 3500 DAI.
     * But it is also possible that the limit-order will be filed in parts.
     * First, someone buys 1 ETH at the price of 3050 DAI, then another 1 ETH at the price of 3150 DAI, and so on.
     */
    describe('Range limit orders', function () {
        let maker, taker;

        const e6 = (value) => ether(value).div(1000000000000n);

        before(async function () {
            maker = addr1.address;
            taker = addr.address;
        });

        const deployContractsAndInit = async function () {
            const { dai, weth, swap, chainId } = await deploySwapTokens();
            await initContracts(dai, weth, swap);

            const TokenCustomDecimalsMock = await ethers.getContractFactory('TokenCustomDecimalsMock');
            const usdc = await TokenCustomDecimalsMock.deploy('USDC', 'USDC', '0', 6);
            await usdc.deployed();
            await usdc.mint(maker, e6('1000000000000'));
            await usdc.mint(taker, e6('1000000000000'));
            await usdc.approve(swap.address, e6('1000000000000'));
            await usdc.connect(addr1).approve(swap.address, e6('1000000000000'));

            const RangeAmountCalculator = await ethers.getContractFactory('RangeAmountCalculator');
            const rangeAmountCalculator = await RangeAmountCalculator.deploy();
            await rangeAmountCalculator.deployed();

            return { dai, weth, swap, chainId, usdc, rangeAmountCalculator };
        };

        /**
         * @param makerAsset assetObject
         * @param takerAsset assetObject
         * @param fillOrderParams array of objects with params for fillOrder methods
         * @param isByMakerAsset flag shows to fill range order by maker asset
         *
         * assetObject = {
         *      asset: IERC20
         *      ether: function(amount) => amount * assetDecimals
         * }
         *
         * fillOrderParams = [{
         *      makingAmount: uint256
         *      takingAmount: uint256
         *      thresholdAmount: uint256
         * }]
         */
        async function fillRangeLimitOrder (makerAsset, takerAsset, fillOrderParams, isByMakerAsset, swap, rangeAmountCalculator, chainId) {
            const getRangeAmount = (isByMakerAsset ? rangeAmountCalculator.getRangeTakerAmount : rangeAmountCalculator.getRangeMakerAmount);

            // Order: 10 MA -> 35000 TA with price range: 3000 -> 4000 TA
            const makingAmount = makerAsset.ether('10');
            const takingAmount = takerAsset.ether('35000');
            const startPrice = takerAsset.ether('3000');
            const endPrice = takerAsset.ether('4000');
            const order = buildOrder(
                {
                    makerAsset: makerAsset.asset.address,
                    takerAsset: takerAsset.asset.address,
                    makingAmount,
                    takingAmount,
                    from: maker,
                },
                {
                    getMakingAmount: rangeAmountCalculator.address + trim0x(cutLastArg(cutLastArg(
                        rangeAmountCalculator.interface.encodeFunctionData('getRangeMakerAmount', [startPrice, endPrice, makingAmount, 0, 0],
                            64,
                        )))),
                    getTakingAmount: rangeAmountCalculator.address + trim0x(cutLastArg(cutLastArg(
                        rangeAmountCalculator.interface.encodeFunctionData('getRangeTakerAmount', [startPrice, endPrice, makingAmount, 0, 0],
                            64,
                        )))),
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            const makerTABalance = await takerAsset.asset.balanceOf(maker); // maker's takerAsset balance
            const takerTABalance = await takerAsset.asset.balanceOf(taker); // taker's takerAsset balance
            const makerMABalance = await makerAsset.asset.balanceOf(maker); // maker's makerAsset balance
            const takerMABalance = await makerAsset.asset.balanceOf(taker); // taker's makerAsset balance

            // Buy fillOrderParams[0].makingAmount tokens of makerAsset,
            // price should be fillOrderParams[0].takingAmount tokens of takerAsset
            await swap.fillOrder(
                order, signature, '0x',
                makerAsset.ether(fillOrderParams[0].makingAmount),
                takerAsset.ether(fillOrderParams[0].takingAmount),
                isByMakerAsset ? takerAsset.ether(fillOrderParams[0].thresholdAmount) : makerAsset.ether(fillOrderParams[0].thresholdAmount),
            );
            const rangeAmount1 = await getRangeAmount(
                startPrice,
                endPrice,
                makingAmount,
                isByMakerAsset ? makerAsset.ether(fillOrderParams[0].makingAmount) : takerAsset.ether(fillOrderParams[0].takingAmount),
                makingAmount,
            );
            if (isByMakerAsset) {
                expect(await takerAsset.asset.balanceOf(maker)).to.equal(makerTABalance.add(rangeAmount1));
                expect(await makerAsset.asset.balanceOf(maker)).to.equal(makerMABalance.sub(makerAsset.ether(fillOrderParams[0].makingAmount)));
                expect(await takerAsset.asset.balanceOf(taker)).to.equal(takerTABalance.sub(rangeAmount1));
                expect(await makerAsset.asset.balanceOf(taker)).to.equal(takerMABalance.add(makerAsset.ether(fillOrderParams[0].makingAmount)));
            } else {
                expect(await takerAsset.asset.balanceOf(maker)).to.equal(makerTABalance.add(takerAsset.ether(fillOrderParams[0].takingAmount)));
                expect(await makerAsset.asset.balanceOf(maker)).to.equal(makerMABalance.sub(rangeAmount1));
                expect(await takerAsset.asset.balanceOf(taker)).to.equal(takerTABalance.sub(takerAsset.ether(fillOrderParams[0].takingAmount)));
                expect(await makerAsset.asset.balanceOf(taker)).to.equal(takerMABalance.add(rangeAmount1));
            }

            // Buy fillOrderParams[1].makingAmount tokens of makerAsset more,
            // price should be fillOrderParams[1].takingAmount tokens of takerAsset
            await swap.fillOrder(
                order, signature, '0x',
                makerAsset.ether(fillOrderParams[1].makingAmount),
                takerAsset.ether(fillOrderParams[1].takingAmount),
                takerAsset.ether(fillOrderParams[1].thresholdAmount),
            );
            const rangeAmount2 = await getRangeAmount(
                startPrice,
                endPrice,
                makingAmount,
                isByMakerAsset ? makerAsset.ether(fillOrderParams[1].makingAmount) : takerAsset.ether(fillOrderParams[1].takingAmount),
                isByMakerAsset ? makingAmount.sub(makerAsset.ether(fillOrderParams[0].makingAmount)) : makingAmount.sub(rangeAmount1),
            );
            if (isByMakerAsset) {
                expect(await takerAsset.asset.balanceOf(maker)).to.equal(makerTABalance.add(rangeAmount1).add(rangeAmount2));
                expect(await makerAsset.asset.balanceOf(maker)).to.equal(
                    makerMABalance
                        .sub(makerAsset.ether(fillOrderParams[0].makingAmount))
                        .sub(makerAsset.ether(fillOrderParams[1].makingAmount)),
                );
                expect(await takerAsset.asset.balanceOf(taker)).to.equal(takerTABalance.sub(rangeAmount1).sub(rangeAmount2));
                expect(await makerAsset.asset.balanceOf(taker)).to.equal(
                    takerMABalance
                        .add(makerAsset.ether(fillOrderParams[0].makingAmount))
                        .add(makerAsset.ether(fillOrderParams[1].makingAmount)),
                );
            } else {
                expect(await takerAsset.asset.balanceOf(maker)).to.equal(
                    makerTABalance
                        .add(takerAsset.ether(fillOrderParams[0].takingAmount))
                        .add(takerAsset.ether(fillOrderParams[1].takingAmount)),
                );
                expect(await makerAsset.asset.balanceOf(maker)).to.equal(makerMABalance.sub(rangeAmount1).sub(rangeAmount2));
                expect(await takerAsset.asset.balanceOf(taker)).to.equal(
                    takerTABalance
                        .sub(takerAsset.ether(fillOrderParams[0].takingAmount))
                        .sub(takerAsset.ether(fillOrderParams[1].takingAmount)),
                );
                expect(await makerAsset.asset.balanceOf(taker)).to.equal(takerMABalance.add(rangeAmount1).add(rangeAmount2));
            }
        };

        it('Fill range limit-order by maker asset', async function () {
            const { dai, weth, swap, chainId, rangeAmountCalculator } = await loadFixture(deployContractsAndInit);
            await fillRangeLimitOrder(
                { asset: weth, ether },
                { asset: dai, ether },
                [
                    { makingAmount: '2', takingAmount: '0', thresholdAmount: '6200' },
                    { makingAmount: '2', takingAmount: '0', thresholdAmount: '6600' },
                ],
                true,
                swap,
                rangeAmountCalculator,
                chainId,
            );
        });

        it('Fill range limit-order by maker asset when taker asset has different decimals', async function () {
            const { usdc, weth, swap, chainId, rangeAmountCalculator } = await loadFixture(deployContractsAndInit);
            await fillRangeLimitOrder(
                { asset: weth, ether },
                { asset: usdc, ether: e6 },
                [
                    { makingAmount: '2', takingAmount: '0', thresholdAmount: '6200' },
                    { makingAmount: '2', takingAmount: '0', thresholdAmount: '6600' },
                ],
                true,
                swap,
                rangeAmountCalculator,
                chainId,
            );
        });

        it('Fill range limit-order by taker asset', async function () {
            const { dai, weth, swap, rangeAmountCalculator, chainId } = await loadFixture(deployContractsAndInit);
            await fillRangeLimitOrder(
                { asset: weth, ether },
                { asset: dai, ether },
                [
                    { makingAmount: '0', takingAmount: '6200', thresholdAmount: '2' },
                    { makingAmount: '0', takingAmount: '6600', thresholdAmount: '2' },
                ],
                false,
                swap,
                rangeAmountCalculator,
                chainId,
            );
        });

        it('Fill range limit-order by taker asset when taker asset has different decimals', async function () {
            const { usdc, weth, swap, rangeAmountCalculator, chainId } = await loadFixture(deployContractsAndInit);
            await fillRangeLimitOrder(
                { asset: weth, ether },
                { asset: usdc, ether: e6 },
                [
                    { makingAmount: '0', takingAmount: '6200', thresholdAmount: '2' },
                    { makingAmount: '0', takingAmount: '6600', thresholdAmount: '2' },
                ],
                false,
                swap,
                rangeAmountCalculator,
                chainId,
            );
        });
    });
});
