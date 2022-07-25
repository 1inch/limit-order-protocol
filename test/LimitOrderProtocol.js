const Wallet = require('ethereumjs-wallet').default;
const { TypedDataUtils } = require('@metamask/eth-sig-util');
const { expect, ether, toBN, time, constants, profileEVM, trim0x, TypedDataVersion } = require('@1inch/solidity-utils');
const { bufferToHex } = require('ethereumjs-util');
const { buildOrder, buildOrderData, signOrder } = require('./helpers/orderUtils');
const { getPermit, withTarget } = require('./helpers/eip712');
const { addr0Wallet, addr1Wallet, joinStaticCalls, cutLastArg } = require('./helpers/utils');

const TokenMock = artifacts.require('TokenMock');
const WrappedTokenMock = artifacts.require('WrappedTokenMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');
const ERC721Proxy = artifacts.require('ERC721Proxy');
const RangeAmountCalculator = artifacts.require('RangeAmountCalculator');
const TokenCustomDecimalsMock = artifacts.require('TokenCustomDecimalsMock');

describe('LimitOrderProtocol', async () => {
    const [addr0, addr1] = [addr0Wallet.getAddressString(), addr1Wallet.getAddressString()];

    before(async () => {
        this.chainId = await web3.eth.getChainId();
    });

    beforeEach(async () => {
        this.dai = await TokenMock.new('DAI', 'DAI');
        this.weth = await WrappedTokenMock.new('WETH', 'WETH');

        this.swap = await LimitOrderProtocol.new(this.weth.address);

        await this.dai.mint(addr1, ether('1000000000000'));
        await this.weth.mint(addr1, ether('1000000000000'));
        await this.dai.mint(addr0, ether('1000000000000'));
        await this.weth.mint(addr0, ether('1000000000000'));
        await this.dai.approve(this.swap.address, ether('1000000000000'));
        await this.weth.approve(this.swap.address, ether('1000000000000'));
        await this.dai.approve(this.swap.address, ether('1000000000000'), { from: addr1 });
        await this.weth.approve(this.swap.address, ether('1000000000000'), { from: addr1 });
    });

    describe('wip', async () => {
        it('transferFrom', async () => {
            await this.dai.approve(addr0, '2', { from: addr1 });
            await this.dai.transferFrom(addr1, addr0, '1', { from: addr0 });
        });

        it('should not swap with bad signature', async () => {
            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());
            const sentOrder = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 2,
                    from: addr1,
                },
            );

            await expect(
                this.swap.fillOrder(sentOrder, signature, '0x', 1, 0, 1),
            ).to.eventually.be.rejectedWith('BadSignature()');
        });

        it('should not fill (1,1)', async () => {
            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            await expect(
                this.swap.fillOrder(order, signature, '0x', 1, 1, 1),
            ).to.eventually.be.rejectedWith('OnlyOneAmountShouldBeZero()');
        });

        it('should not fill above threshold', async () => {
            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 2,
                    takingAmount: 2,
                    from: addr1,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            await expect(
                this.swap.fillOrder(order, signature, '0x', 2, 0, 1),
            ).to.eventually.be.rejectedWith('TakingAmountTooHigh()');
        });

        it('should not fill below threshold', async () => {
            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 2,
                    takingAmount: 2,
                    from: addr1,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            await expect(
                this.swap.fillOrder(order, signature, '0x', 0, 2, 3),
            ).to.eventually.be.rejectedWith('MakingAmountTooLow()');
        });

        it('should fail when both amounts are zero', async () => {
            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 100,
                    takingAmount: 1,
                    from: addr1,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            await expect(
                this.swap.fillOrder(order, signature, '0x', 0, 0, 0),
            ).to.eventually.be.rejectedWith('OnlyOneAmountShouldBeZero()');
        });

        it('should swap fully based on signature', async () => {
            // Order: 1 DAI => 1 WETH
            // Swap:  1 DAI => 1 WETH

            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            const receipt = await this.swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(
                await profileEVM(receipt.tx, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE']),
            ).to.be.deep.equal([2, 1, 7, 7, 0]);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should swap half based on signature', async () => {
            // Order: 2 DAI => 2 WETH
            // Swap:  1 DAI => 1 WETH

            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 2,
                    takingAmount: 2,
                    from: addr1,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            const receipt = await this.swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(
                await profileEVM(receipt.tx, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE']),
            ).to.be.deep.equal([2, 1, 7, 7, 0]);

            // await gasspectEVM(receipt.tx);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should floor maker amount', async () => {
            // Order: 2 DAI => 10 WETH
            // Swap:  9 WETH <= 1 DAI

            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 2,
                    takingAmount: 10,
                    from: addr1,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            await this.swap.fillOrder(order, signature, '0x', 0, 9, 1);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(9));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(9));
        });

        it('should fail on floor maker amount = 0', async () => {
            // Order: 2 DAI => 10 WETH
            // Swap:  4 WETH <= 0 DAI

            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 2,
                    takingAmount: 10,
                    from: addr1,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            await expect(
                this.swap.fillOrder(order, signature, '0x', 0, 4, 0),
            ).to.eventually.be.rejectedWith('SwapWithZeroAmount()');
        });

        it('should ceil taker amount', async () => {
            // Order: 10 DAI => 2 WETH
            // Swap:  4 DAI => 1 WETH

            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 10,
                    takingAmount: 2,
                    from: addr1,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            await this.swap.fillOrder(order, signature, '0x', 4, 0, 1);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(4));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(4));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('ERC721Proxy should work', async () => {
            const erc721proxy = await ERC721Proxy.new(this.swap.address);

            await this.dai.approve(erc721proxy.address, '10', { from: addr1 });
            await this.weth.approve(erc721proxy.address, '10');

            const order = buildOrder(
                {
                    makerAsset: erc721proxy.address,
                    takerAsset: erc721proxy.address,
                    makingAmount: 10,
                    takingAmount: 10,
                    from: addr1,
                },
                {
                    makerAssetData: '0x' + erc721proxy.contract.methods.func_60iHVgK(addr1, constants.ZERO_ADDRESS, 0, 10, this.dai.address).encodeABI().substring(202),
                    takerAssetData: '0x' + erc721proxy.contract.methods.func_60iHVgK(constants.ZERO_ADDRESS, addr1, 0, 10, this.weth.address).encodeABI().substring(202),
                },
            );

            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            await this.swap.fillOrder(order, signature, '0x', 10, 0, 10);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(10));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(10));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(10));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(10));
        });
    });

    describe('Permit', async () => {
        describe('fillOrderToWithPermit', async () => {
            beforeEach(async () => {
                this.swap = await LimitOrderProtocol.new(this.weth.address);
            });

            it('DAI => WETH', async () => {
                await this.dai.approve(this.swap.address, '1000000', { from: addr1Wallet.getAddressString() });
                const order = buildOrder(
                    {
                        makerAsset: this.dai.address,
                        takerAsset: this.weth.address,
                        makingAmount: 1,
                        takingAmount: 1,
                        from: addr1,
                    },
                );
                const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

                const permit = await getPermit(addr0, addr0Wallet.getPrivateKey(), this.weth, '1', this.chainId, this.swap.address, '1');
                const targetPermitPair = withTarget(this.weth.address, permit);

                const makerDai = await this.dai.balanceOf(addr1);
                const takerDai = await this.dai.balanceOf(addr0);
                const makerWeth = await this.weth.balanceOf(addr1);
                const takerWeth = await this.weth.balanceOf(addr0);
                const allowance = await this.weth.allowance(addr1Wallet.getAddressString(), this.swap.address);

                await this.swap.fillOrderToWithPermit(order, signature, '0x', 1, 0, 1, addr0, targetPermitPair);

                expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
                expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
                expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(1));
                expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
                expect(allowance).to.be.bignumber.eq(toBN('0'));
            });

            it('rejects reused signature', async () => {
                await this.dai.approve(this.swap.address, '1000000', { from: addr1Wallet.getAddressString() });
                const order = buildOrder(
                    {
                        makerAsset: this.dai.address,
                        takerAsset: this.weth.address,
                        makingAmount: 1,
                        takingAmount: 1,
                        from: addr1,
                    },
                );
                const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

                const permit = await getPermit(addr0, addr0Wallet.getPrivateKey(), this.weth, '1', this.chainId, this.swap.address, '1');
                const targetPermitPair = withTarget(this.weth.address, permit);
                const requestFunc = () => this.swap.fillOrderToWithPermit(order, signature, '0x', 0, 1, 1, addr0, targetPermitPair);
                await requestFunc();
                await expect(requestFunc()).to.eventually.be.rejectedWith('ERC20Permit: invalid signature');
            });

            it('rejects other signature', async () => {
                await this.dai.approve(this.swap.address, '1000000', { from: addr1Wallet.getAddressString() });
                const order = buildOrder(
                    {
                        makerAsset: this.dai.address,
                        takerAsset: this.weth.address,
                        makingAmount: 1,
                        takingAmount: 1,
                        from: addr1,
                    },
                );
                const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

                const otherWallet = Wallet.generate();
                const permit = await getPermit(addr0, otherWallet.getPrivateKey(), this.weth, '1', this.chainId, this.swap.address, '1');
                const targetPermitPair = withTarget(this.weth.address, permit);
                await expect(
                    this.swap.fillOrderToWithPermit(order, signature, '0x', 0, 1, 1, addr0, targetPermitPair),
                ).to.eventually.be.rejectedWith('ERC20Permit: invalid signature');
            });

            it('rejects expired permit', async () => {
                const deadline = (await time.latest()) - time.duration.weeks(1);
                await this.dai.approve(this.swap.address, '1000000', { from: addr1Wallet.getAddressString() });
                const order = buildOrder({
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1,
                });
                const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

                const permit = await getPermit(addr0, addr1Wallet.getPrivateKey(), this.weth, '1', this.chainId, this.swap.address, '1', deadline);
                const targetPermitPair = withTarget(this.weth.address, permit);
                await expect(
                    this.swap.fillOrderToWithPermit(order, signature, '0x', 0, 1, 1, addr0, targetPermitPair),
                ).to.eventually.be.rejectedWith('expired deadline');
            });
        });
    });

    describe('Amount Calculator', async () => {
        it('empty getTakingAmount should work on full fill', async () => {
            const order = buildOrder({
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 10,
                takingAmount: 10,
                from: addr1,
            });
            order.getTakingAmount = '0x';
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            await this.swap.fillOrder(order, signature, '0x', 10, 0, 10);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(10));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(10));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(10));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(10));
        });

        it('empty getTakingAmount should not work on partial fill', async () => {
            const order = buildOrder({
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 10,
                takingAmount: 10,
                from: addr1,
            }, {
                getTakingAmount: '', // <-- empty string turns into "x" to disable partial fill
            });
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            await expect(
                this.swap.fillOrder(order, signature, '0x', 5, 0, 5),
            ).to.eventually.be.rejectedWith('WrongAmount()');
        });

        it('empty getMakingAmount should work on full fill', async () => {
            const order = buildOrder({
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 10,
                takingAmount: 10,
                from: addr1,
            });
            order.getMakingAmount = '0x';
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            await this.swap.fillOrder(order, signature, '0x', 0, 10, 10);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(10));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(10));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(10));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(10));
        });

        it('empty getMakingAmount should not work on partial fill', async () => {
            const order = buildOrder({
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 10,
                takingAmount: 10,
                from: addr1,
            }, {
                getMakingAmount: '', // <-- empty string turns into "x" to disable partial fill
            });
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            await expect(
                this.swap.fillOrder(order, signature, '0x', 0, 5, 5),
            ).to.eventually.be.rejectedWith('WrongAmount()');
        });
    });

    describe('Order Cancelation', async () => {
        beforeEach(async () => {
            this.order = buildOrder({
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 1,
                takingAmount: 1,
                from: addr1,
            });
        });

        // TODO: need same test for RFQ
        it('should cancel own order', async () => {
            await this.swap.cancelOrder(this.order, { from: addr1 });
            const data = buildOrderData(this.chainId, this.swap.address, this.order);
            const orderHash = bufferToHex(TypedDataUtils.eip712Hash(data, TypedDataVersion));
            expect(await this.swap.remaining(orderHash)).to.be.bignumber.equal('0');
        });

        it('should not cancel foreign order', async () => {
            await expect(
                this.swap.cancelOrder(this.order),
            ).to.eventually.be.rejectedWith('AccessDenied()');
        });

        it('should not fill cancelled order', async () => {
            const signature = signOrder(this.order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            await this.swap.cancelOrder(this.order, { from: addr1 });

            await expect(
                this.swap.fillOrder(this.order, signature, '0x', 1, 0, 1),
            ).to.eventually.be.rejectedWith('RemainingAmountIsZero()');
        });
    });

    describe('Private Orders', async () => {
        it('should fill with correct taker', async () => {
            const order = buildOrder({
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 1,
                takingAmount: 1,
                from: addr1,
                allowedSender: addr0,
            });
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            await this.swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should not fill with incorrect taker', async () => {
            const order = buildOrder({
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 1,
                takingAmount: 1,
                from: addr1,
                allowedSender: addr1,
            });
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            await expect(
                this.swap.fillOrder(order, signature, '0x', 1, 0, 1),
            ).to.eventually.be.rejectedWith('PrivateOrder()');
        });
    });

    describe('Predicate', async () => {
        it('benchmark gas', async () => {
            const tsBelow = this.swap.contract.methods.timestampBelow(0xff0000).encodeABI();
            const balanceCall = this.dai.contract.methods.balanceOf(addr1).encodeABI();
            const gtBalance = this.swap.contract.methods.gt(
                '100000',
                this.swap.contract.methods.arbitraryStaticCall(this.dai.address, balanceCall).encodeABI(),
            ).encodeABI();

            const { offsets, data } = joinStaticCalls([tsBelow, gtBalance]);
            await this.swap.contract.methods.or(offsets, data).send({ from: addr1 });
        });

        it('benchmark gas real case', async () => {
            const tsBelow = this.swap.contract.methods.timestampBelow(0x70000000).encodeABI();
            const eqNonce = this.swap.contract.methods.nonceEquals(addr1, 0).encodeABI();

            const { offsets, data } = joinStaticCalls([tsBelow, eqNonce]);
            await this.swap.contract.methods.and(offsets, data).send({ from: addr1 });
        });

        it('benchmark gas real case (optimized)', async () => {
            const timestamp = toBN(0x70000000);
            const nonce = toBN(0);

            await this.swap.contract.methods.timestampBelowAndNonceEquals(
                toBN(trim0x(addr1), 'hex')
                    .or(nonce.shln(160))
                    .or(timestamp.shln(208)),
            ).send({ from: addr1 });
        });

        it('`or` should pass', async () => {
            const tsBelow = this.swap.contract.methods.timestampBelow(0xff0000).encodeABI();
            const eqNonce = this.swap.contract.methods.nonceEquals(addr1, 0).encodeABI();
            const { offsets, data } = joinStaticCalls([tsBelow, eqNonce]);
            const predicate = this.swap.contract.methods.or(offsets, data).encodeABI();

            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1,
                },
                {
                    predicate,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            await this.swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('`or` should fail', async () => {
            const tsBelow = this.swap.contract.methods.timestampBelow(0xff0000).encodeABI();
            const eqNonce = this.swap.contract.methods.nonceEquals(addr1, 1).encodeABI();
            const { offsets, data } = joinStaticCalls([tsBelow, eqNonce]);
            const predicate = this.swap.contract.methods.or(offsets, data).encodeABI();
            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1,
                },
                {
                    predicate,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            await expect(
                this.swap.fillOrder(order, signature, '0x', 1, 0, 1),
            ).to.eventually.be.rejectedWith('PredicateIsNotTrue()');
        });

        it('`and` should pass', async () => {
            const tsBelow = this.swap.contract.methods.timestampBelow(0xff000000).encodeABI();
            const eqNonce = this.swap.contract.methods.nonceEquals(addr1, 0).encodeABI();
            const { offsets, data } = joinStaticCalls([tsBelow, eqNonce]);
            const predicate = this.swap.contract.methods.and(offsets, data).encodeABI();
            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1,
                },
                {
                    predicate,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            await this.swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('nonce + ts example', async () => {
            const tsBelow = this.swap.contract.methods.timestampBelow(0xff000000).encodeABI();
            const nonceCall = this.swap.contract.methods.nonceEquals(addr1, 0).encodeABI();
            const { offsets, data } = joinStaticCalls([tsBelow, nonceCall]);
            const predicate = this.swap.contract.methods.and(offsets, data).encodeABI();
            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1,
                },
                {
                    predicate,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            await this.swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('advance nonce', async () => {
            await this.swap.increaseNonce();
            expect(await this.swap.nonce(addr0)).to.be.bignumber.equal('1');
        });

        it('`and` should fail', async () => {
            const tsBelow = this.swap.contract.methods.timestampBelow(0xff0000).encodeABI();
            const eqNonce = this.swap.contract.methods.nonceEquals(addr1, 0).encodeABI();
            const { offsets, data } = joinStaticCalls([tsBelow, eqNonce]);
            const predicate = this.swap.contract.methods.and(offsets, data).encodeABI();
            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1,
                },
                {
                    predicate,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            await expect(
                this.swap.fillOrder(order, signature, '0x', 1, 0, 1),
            ).to.eventually.be.rejectedWith('PredicateIsNotTrue()');
        });
    });

    describe('Expiration', async () => {
        it('should fill when not expired', async () => {
            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1,
                },
                {
                    predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            await this.swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should not fill when expired', async () => {
            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: addr1,
                },
                {
                    predicate: this.swap.contract.methods.timestampBelow(0xff0000).encodeABI(),
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            await expect(
                this.swap.fillOrder(order, signature, '0x', 1, 0, 1),
            ).to.eventually.be.rejectedWith('PredicateIsNotTrue()');
        });

        it('should fill partially if not enough coins (taker)', async () => {
            const order = buildOrder({
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 2,
                takingAmount: 2,
                from: addr1,
            });
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            await this.swap.fillOrder(order, signature, '0x', 0, 3, 2);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(2));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(2));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(2));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(2));
        });

        it('should fill partially if not enough coins (maker)', async () => {
            const order = buildOrder({
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 2,
                takingAmount: 2,
                from: addr1,
            });
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            await this.swap.fillOrder(order, signature, '0x', 3, 0, 3);

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(2));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(2));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(2));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(2));
        });
    });

    describe('ETH fill', async () => {
        it('should fill with ETH', async () => {
            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 900,
                    takingAmount: 3,
                    from: addr1,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            await this.swap.fillOrder(order, signature, '0x', 900, 0, 3, { value: 3 });

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(900));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(900));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.addn(3));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth);
        });

        it('should reverted with takerAsset WETH and incorrect msg.value', async () => {
            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 900,
                    takingAmount: 3,
                    from: addr1,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            await expect(
                this.swap.fillOrder(order, signature, '0x', 900, 0, 3, { value: 2 }),
            ).to.eventually.be.rejectedWith('InvalidMsgValue()');
            await expect(
                this.swap.fillOrder(order, signature, '0x', 900, 0, 3, { value: 4 }),
            ).to.eventually.be.rejectedWith('InvalidMsgValue()');
        });

        it('should reverted with takerAsset non-WETH and msg.value greater than 0', async () => {
            const usdc = await TokenMock.new('USDC', 'USDC');
            await usdc.mint(addr0, '1000000');
            await usdc.approve(this.swap.address, '1000000');
            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: usdc.address,
                    makingAmount: 900,
                    takingAmount: 900,
                    from: addr1,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            await expect(
                this.swap.fillOrder(order, signature, '0x', 900, 0, 900, { value: 1 }),
            ).to.eventually.be.rejectedWith('InvalidMsgValue()');
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
    describe('Range limit orders', async () => {
        const maker = addr1;
        const taker = addr0;

        const e6 = (value) => ether(value).div(toBN('1000000000000'));

        before(async () => {
            this.rangeAmountCalculator = await RangeAmountCalculator.new();
        });

        beforeEach(async () => {
            this.usdc = await TokenCustomDecimalsMock.new('USDC', 'USDC', '0', 6);
            await this.usdc.mint(maker, e6('1000000000000'));
            await this.usdc.mint(taker, e6('1000000000000'));
            await this.usdc.approve(this.swap.address, e6('1000000000000'));
            await this.usdc.approve(this.swap.address, e6('1000000000000'), { from: addr1 });
        });

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
        const fillRangeLimitOrder = async (makerAsset, takerAsset, fillOrderParams, isByMakerAsset) => {
            const getRangeAmount = (isByMakerAsset ? this.rangeAmountCalculator.getRangeTakerAmount : this.rangeAmountCalculator.getRangeMakerAmount);

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
                    getMakingAmount: this.rangeAmountCalculator.address + trim0x(cutLastArg(
                        this.rangeAmountCalculator.contract.methods.getRangeMakerAmount(startPrice, endPrice, makingAmount, 0, 0).encodeABI(),
                        64,
                    )),
                    getTakingAmount: this.rangeAmountCalculator.address + trim0x(cutLastArg(
                        this.rangeAmountCalculator.contract.methods.getRangeTakerAmount(startPrice, endPrice, makingAmount, 0, 0).encodeABI(),
                        64,
                    )),
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerTABalance = await takerAsset.asset.balanceOf(maker); // maker's takerAsset balance
            const takerTABalance = await takerAsset.asset.balanceOf(taker); // taker's takerAsset balance
            const makerMABalance = await makerAsset.asset.balanceOf(maker); // maker's makerAsset balance
            const takerMABalance = await makerAsset.asset.balanceOf(taker); // taker's makerAsset balance

            // Buy fillOrderParams[0].makingAmount tokens of makerAsset,
            // price should be fillOrderParams[0].takingAmount tokens of takerAsset
            await this.swap.fillOrder(
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
                makerAsset.ether('0'),
            );
            if (isByMakerAsset) {
                expect(await takerAsset.asset.balanceOf(maker)).to.be.bignumber.equals(toBN(makerTABalance).add(rangeAmount1));
                expect(await makerAsset.asset.balanceOf(maker)).to.be.bignumber.equals(toBN(makerMABalance).sub(makerAsset.ether(fillOrderParams[0].makingAmount)));
                expect(await takerAsset.asset.balanceOf(taker)).to.be.bignumber.equals(toBN(takerTABalance).sub(rangeAmount1));
                expect(await makerAsset.asset.balanceOf(taker)).to.be.bignumber.equals(toBN(takerMABalance).add(makerAsset.ether(fillOrderParams[0].makingAmount)));
            } else {
                expect(await takerAsset.asset.balanceOf(maker)).to.be.bignumber.equals(toBN(makerTABalance).add(takerAsset.ether(fillOrderParams[0].takingAmount)));
                expect(await makerAsset.asset.balanceOf(maker)).to.be.bignumber.equals(toBN(makerMABalance).sub(rangeAmount1));
                expect(await takerAsset.asset.balanceOf(taker)).to.be.bignumber.equals(toBN(takerTABalance).sub(takerAsset.ether(fillOrderParams[0].takingAmount)));
                expect(await makerAsset.asset.balanceOf(taker)).to.be.bignumber.equals(toBN(takerMABalance).add(rangeAmount1));
            }

            // Buy fillOrderParams[1].makingAmount tokens of makerAsset more,
            // price should be fillOrderParams[1].takingAmount tokens of takerAsset
            await this.swap.fillOrder(
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
                isByMakerAsset ? makerAsset.ether(fillOrderParams[0].makingAmount) : rangeAmount1,
            );
            if (isByMakerAsset) {
                expect(await takerAsset.asset.balanceOf(maker)).to.be.bignumber.equals(toBN(makerTABalance).add(rangeAmount1).add(rangeAmount2));
                expect(await makerAsset.asset.balanceOf(maker)).to.be.bignumber.equals(
                    toBN(makerMABalance)
                        .sub(makerAsset.ether(fillOrderParams[0].makingAmount))
                        .sub(makerAsset.ether(fillOrderParams[1].makingAmount)),
                );
                expect(await takerAsset.asset.balanceOf(taker)).to.be.bignumber.equals(toBN(takerTABalance).sub(rangeAmount1).sub(rangeAmount2));
                expect(await makerAsset.asset.balanceOf(taker)).to.be.bignumber.equals(
                    toBN(takerMABalance)
                        .add(makerAsset.ether(fillOrderParams[0].makingAmount))
                        .add(makerAsset.ether(fillOrderParams[1].makingAmount)),
                );
            } else {
                expect(await takerAsset.asset.balanceOf(maker)).to.be.bignumber.equals(
                    toBN(makerTABalance)
                        .add(takerAsset.ether(fillOrderParams[0].takingAmount))
                        .add(takerAsset.ether(fillOrderParams[1].takingAmount)),
                );
                expect(await makerAsset.asset.balanceOf(maker)).to.be.bignumber.equals(toBN(makerMABalance).sub(rangeAmount1).sub(rangeAmount2));
                expect(await takerAsset.asset.balanceOf(taker)).to.be.bignumber.equals(
                    toBN(takerTABalance)
                        .sub(takerAsset.ether(fillOrderParams[0].takingAmount))
                        .sub(takerAsset.ether(fillOrderParams[1].takingAmount)),
                );
                expect(await makerAsset.asset.balanceOf(taker)).to.be.bignumber.equals(toBN(takerMABalance).add(rangeAmount1).add(rangeAmount2));
            }
        };

        it('Fill range limit-order by maker asset', async () => {
            await fillRangeLimitOrder(
                { asset: this.weth, ether },
                { asset: this.dai, ether },
                [
                    { makingAmount: '2', takingAmount: '0', thresholdAmount: '6200' },
                    { makingAmount: '2', takingAmount: '0', thresholdAmount: '6600' },
                ],
                true,
            );
        });

        it('Fill range limit-order by maker asset when taker asset has different decimals', async () => {
            await fillRangeLimitOrder(
                { asset: this.weth, ether },
                { asset: this.usdc, ether: e6 },
                [
                    { makingAmount: '2', takingAmount: '0', thresholdAmount: '6200' },
                    { makingAmount: '2', takingAmount: '0', thresholdAmount: '6600' },
                ],
                true,
            );
        });

        it('Fill range limit-order by taker asset', async () => {
            await fillRangeLimitOrder(
                { asset: this.weth, ether },
                { asset: this.dai, ether },
                [
                    { makingAmount: '0', takingAmount: '6200', thresholdAmount: '2' },
                    { makingAmount: '0', takingAmount: '6600', thresholdAmount: '2' },
                ],
                false,
            );
        });

        it('Fill range limit-order by taker asset when taker asset has different decimals', async () => {
            await fillRangeLimitOrder(
                { asset: this.weth, ether },
                { asset: this.usdc, ether: e6 },
                [
                    { makingAmount: '0', takingAmount: '6200', thresholdAmount: '2' },
                    { makingAmount: '0', takingAmount: '6600', thresholdAmount: '2' },
                ],
                false,
            );
        });
    });
});
