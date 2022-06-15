const { expectRevert, BN, time, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const { bufferToHex } = require('ethereumjs-util');
const ethSigUtil = require('eth-sig-util');
const Wallet = require('ethereumjs-wallet').default;

const TokenMock = artifacts.require('TokenMock');
const WrappedTokenMock = artifacts.require('WrappedTokenMock');
const WethUnwrapper = artifacts.require('WethUnwrapper');
const WhitelistChecker = artifacts.require('WhitelistChecker');
const WhitelistRegistryMock = artifacts.require('WhitelistRegistryMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');
const ERC721Proxy = artifacts.require('ERC721Proxy');

const { profileEVM, gasspectEVM } = require('./helpers/profileEVM');
const { buildOrder, buildOrderRFQ, buildOrderData, signOrder, signOrderRFQ, compressSignature } = require('./helpers/orderUtils');
const { getPermit, withTarget } = require('./helpers/eip712');
const { addr1PrivateKey, toBN } = require('./helpers/utils');

describe('LimitOrderProtocol', async function () {
    let addr1, wallet;

    const privatekey = '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
    const account = Wallet.fromPrivateKey(Buffer.from(privatekey, 'hex'));

    before(async function () {
        [addr1, wallet] = await web3.eth.getAccounts();
        this.chainId = await web3.eth.getChainId();
    });

    beforeEach(async function () {
        this.dai = await TokenMock.new('DAI', 'DAI');
        this.weth = await WrappedTokenMock.new('WETH', 'WETH');

        this.swap = await LimitOrderProtocol.new();

        await this.dai.mint(wallet, '1000000');
        await this.weth.mint(wallet, '1000000');
        await this.dai.mint(addr1, '1000000');
        await this.weth.mint(addr1, '1000000');

        await this.dai.approve(this.swap.address, '1000000');
        await this.weth.approve(this.swap.address, '1000000');
        await this.dai.approve(this.swap.address, '1000000', { from: wallet });
        await this.weth.approve(this.swap.address, '1000000', { from: wallet });
    });

    describe('wip', async function () {
        it('transferFrom', async function () {
            await this.dai.approve(addr1, '2', { from: wallet });
            await this.dai.transferFrom(wallet, addr1, '1', { from: addr1 });
        });

        it('should not swap with bad signature', async function () {
            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: wallet,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());
            const sentOrder = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 2,
                    from: wallet,
                },
            );

            await expectRevert(
                this.swap.fillOrder(sentOrder, signature, '0x', 1, 0, 1),
                'LOP: bad signature',
            );
        });

        it('should not fill (1,1)', async function () {
            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: wallet,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            await expectRevert(
                this.swap.fillOrder(order, signature, '0x', 1, 1, 1),
                'LOP: only one amount should be 0',
            );
        });

        it('should not fill above threshold', async function () {
            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 2,
                    takingAmount: 2,
                    from: wallet,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            await expectRevert(
                this.swap.fillOrder(order, signature, '0x', 2, 0, 1),
                'LOP: taking amount too high',
            );
        });

        it('should not fill below threshold', async function () {
            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 2,
                    takingAmount: 2,
                    from: wallet,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            await expectRevert(
                this.swap.fillOrder(order, signature, '0x', 0, 2, 3),
                'LOP: making amount too low',
            );
        });

        it('should fail when both amounts are zero', async function () {
            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 100,
                    takingAmount: 1,
                    from: wallet,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            await expectRevert(
                this.swap.fillOrder(order, signature, '0x', 0, 0, 0),
                'LOP: only one amount should be 0',
            );
        });

        it('should swap fully based on signature', async function () {
            // Order: 1 DAI => 1 WETH
            // Swap:  1 DAI => 1 WETH

            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: wallet,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            const receipt = await this.swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(
                await profileEVM(receipt.tx, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE']),
            ).to.be.deep.equal([2, 2, 7, 7, 0]);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should swap fully based on RFQ signature', async function () {
            // Order: 1 DAI => 1 WETH
            // Swap:  1 DAI => 1 WETH

            for (const salt of ['000000000000000000000001', '000000000000000000000002']) {
                const order = buildOrderRFQ(salt, this.dai.address, this.weth.address, 1, 1, wallet);
                const signature = signOrderRFQ(order, this.chainId, this.swap.address, account.getPrivateKey());

                const makerDai = await this.dai.balanceOf(wallet);
                const takerDai = await this.dai.balanceOf(addr1);
                const makerWeth = await this.weth.balanceOf(wallet);
                const takerWeth = await this.weth.balanceOf(addr1);

                const receipt = await this.swap.fillOrderRFQ(order, signature, 1, 0);

                expect(
                    await profileEVM(receipt.tx, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE']),
                ).to.be.deep.equal([2, 1, 7, 7, 0]);

                await gasspectEVM(receipt.tx);

                expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
                expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
                expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
                expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
            }
        });

        it('should swap fully based on RFQ signature (compact)', async function () {
            // Order: 1 DAI => 1 WETH
            // Swap:  1 DAI => 1 WETH

            for (const salt of ['000000000000000000000001', '000000000000000000000002']) {
                const order = buildOrderRFQ(salt, this.dai.address, this.weth.address, 1, 1, wallet);
                const signature = signOrderRFQ(order, this.chainId, this.swap.address, account.getPrivateKey());

                const makerDai = await this.dai.balanceOf(wallet);
                const takerDai = await this.dai.balanceOf(addr1);
                const makerWeth = await this.weth.balanceOf(wallet);
                const takerWeth = await this.weth.balanceOf(addr1);

                const { r, vs } = compressSignature(signature);
                const receipt = await this.swap.fillOrderRFQCompact(order, r, vs, 1, 0);

                expect(
                    await profileEVM(receipt.tx, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE']),
                ).to.be.deep.equal([2, 1, 7, 7, 0]);

                await gasspectEVM(receipt.tx);

                expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
                expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
                expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
                expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
            }
        });

        it('should swap half based on signature', async function () {
            // Order: 2 DAI => 2 WETH
            // Swap:  1 DAI => 1 WETH

            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 2,
                    takingAmount: 2,
                    from: wallet,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            const receipt = await this.swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(
                await profileEVM(receipt.tx, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE']),
            ).to.be.deep.equal([2, 2, 7, 7, 0]);

            // await gasspectEVM(receipt.tx);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should floor maker amount', async function () {
            // Order: 2 DAI => 10 WETH
            // Swap:  9 WETH <= 1 DAI

            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 2,
                    takingAmount: 10,
                    from: wallet,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            await this.swap.fillOrder(order, signature, '0x', 0, 9, 1);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(9));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(9));
        });

        it('should fail on floor maker amount = 0', async function () {
            // Order: 2 DAI => 10 WETH
            // Swap:  4 WETH <= 0 DAI

            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 2,
                    takingAmount: 10,
                    from: wallet,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            await expectRevert(
                this.swap.fillOrder(order, signature, '0x', 0, 4, 0),
                'LOP: can\'t swap 0 amount',
            );
        });

        it('should ceil taker amount', async function () {
            // Order: 10 DAI => 2 WETH
            // Swap:  4 DAI => 1 WETH

            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 10,
                    takingAmount: 2,
                    from: wallet,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            await this.swap.fillOrder(order, signature, '0x', 4, 0, 1);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(4));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(4));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
        });
    });

    it('ERC721Proxy should work', async function () {
        const erc721proxy = await ERC721Proxy.new(this.swap.address);

        await this.dai.approve(erc721proxy.address, '10', { from: wallet });
        await this.weth.approve(erc721proxy.address, '10');

        const order = buildOrder(
            {
                exchange: this.swap,
                makerAsset: erc721proxy.address,
                takerAsset: erc721proxy.address,
                makingAmount: 10,
                takingAmount: 10,
                from: wallet,
            },
            {
                makerAssetData: '0x' + erc721proxy.contract.methods.func_60iHVgK(wallet, constants.ZERO_ADDRESS, 0, 10, this.dai.address).encodeABI().substring(202),
                takerAssetData: '0x' + erc721proxy.contract.methods.func_60iHVgK(constants.ZERO_ADDRESS, wallet, 0, 10, this.weth.address).encodeABI().substring(202),
            },
        );

        const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

        const makerDai = await this.dai.balanceOf(wallet);
        const takerDai = await this.dai.balanceOf(addr1);
        const makerWeth = await this.weth.balanceOf(wallet);
        const takerWeth = await this.weth.balanceOf(addr1);

        await this.swap.fillOrder(order, signature, '0x', 10, 0, 10);

        expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(10));
        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(10));
        expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(10));
        expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(10));
    });

    describe('Permit', function () {
        describe('fillOrderToWithPermit', function () {
            it('DAI => WETH', async function () {
                const swap = await LimitOrderProtocol.new();
                await this.dai.approve(swap.address, '1000000', { from: account.getAddressString() });
                const order = buildOrder(
                    {
                        exchange: swap,
                        makerAsset: this.dai.address,
                        takerAsset: this.weth.address,
                        makingAmount: 1,
                        takingAmount: 1,
                        from: wallet,
                    },
                );
                const signature = signOrder(order, this.chainId, swap.address, account.getPrivateKey());

                const permit = await getPermit(addr1, addr1PrivateKey, this.weth, '1', this.chainId, swap.address, '1');
                const targetPermitPair = withTarget(this.weth.address, permit);

                const makerDai = await this.dai.balanceOf(wallet);
                const takerDai = await this.dai.balanceOf(addr1);
                const makerWeth = await this.weth.balanceOf(wallet);
                const takerWeth = await this.weth.balanceOf(addr1);
                const allowance = await this.weth.allowance(account.getAddressString(), swap.address);

                await swap.fillOrderToWithPermit(order, signature, '0x', 1, 0, 1, addr1, targetPermitPair);

                expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
                expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
                expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
                expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
                expect(allowance).to.be.bignumber.eq(new BN('0'));
            });

            it('rejects reused signature', async function () {
                const swap = await LimitOrderProtocol.new();
                await this.dai.approve(swap.address, '1000000', { from: account.getAddressString() });
                const order = buildOrder(
                    {
                        exchange: swap,
                        makerAsset: this.dai.address,
                        takerAsset: this.weth.address,
                        makingAmount: 1,
                        takingAmount: 1,
                        from: wallet,
                    },
                );
                const signature = signOrder(order, this.chainId, swap.address, account.getPrivateKey());

                const permit = await getPermit(addr1, addr1PrivateKey, this.weth, '1', this.chainId, swap.address, '1');
                const targetPermitPair = withTarget(this.weth.address, permit);
                const requestFunc = () => swap.fillOrderToWithPermit(order, signature, '0x', 0, 1, 1, addr1, targetPermitPair);
                await requestFunc();
                await expectRevert(
                    requestFunc(),
                    'ERC20Permit: invalid signature',
                );
            });

            it('rejects other signature', async function () {
                const swap = await LimitOrderProtocol.new();
                await this.dai.approve(swap.address, '1000000', { from: account.getAddressString() });
                const order = buildOrder(
                    {
                        exchange: swap,
                        makerAsset: this.dai.address,
                        takerAsset: this.weth.address,
                        makingAmount: 1,
                        takingAmount: 1,
                        from: wallet,
                    },
                );
                const signature = signOrder(order, this.chainId, swap.address, account.getPrivateKey());

                const otherWallet = Wallet.generate();
                const permit = await getPermit(addr1, otherWallet.getPrivateKey(), this.weth, '1', this.chainId, swap.address, '1');
                const targetPermitPair = withTarget(this.weth.address, permit);
                const requestFunc = () => swap.fillOrderToWithPermit(order, signature, '0x', 0, 1, 1, addr1, targetPermitPair);
                await expectRevert(
                    requestFunc(), // TODO: why we need requestFunc? O_o
                    'ERC20Permit: invalid signature',
                );
            });

            it('rejects expired permit', async function () {
                const deadline = (await time.latest()) - time.duration.weeks(1);
                const swap = await LimitOrderProtocol.new();
                await this.dai.approve(swap.address, '1000000', { from: account.getAddressString() });
                const order = buildOrder({
                    exchange: swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: wallet,
                });
                const signature = signOrder(order, this.chainId, swap.address, account.getPrivateKey());

                const permit = await getPermit(addr1, addr1PrivateKey, this.weth, '1', this.chainId, swap.address, '1', deadline);
                const targetPermitPair = withTarget(this.weth.address, permit);
                const requestFunc = () => swap.fillOrderToWithPermit(order, signature, '0x', 0, 1, 1, addr1, targetPermitPair);
                await expectRevert(
                    requestFunc(), // TODO: Why we need requestFunc? O_o
                    'expired deadline',
                );
            });
        });

        describe('fillOrderRFQToWithPermit', function () {
            it('DAI => WETH', async function () {
                const swap = await LimitOrderProtocol.new();
                await this.dai.approve(swap.address, '1000000', { from: account.getAddressString() });
                const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 1, 1, wallet);
                const signature = signOrderRFQ(order, this.chainId, swap.address, account.getPrivateKey());

                const permit = await getPermit(addr1, addr1PrivateKey, this.weth, '1', this.chainId, swap.address, '1');

                const makerDai = await this.dai.balanceOf(wallet);
                const takerDai = await this.dai.balanceOf(addr1);
                const makerWeth = await this.weth.balanceOf(wallet);
                const takerWeth = await this.weth.balanceOf(addr1);
                const allowance = await this.weth.allowance(account.getAddressString(), swap.address);

                await swap.fillOrderRFQToWithPermit(order, signature, 1, 0, addr1, permit);

                expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
                expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
                expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
                expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
                expect(allowance).to.be.bignumber.eq(new BN('0'));
            });

            it('rejects reused signature', async function () {
                const swap = await LimitOrderProtocol.new();
                await this.dai.approve(swap.address, '1000000', { from: account.getAddressString() });
                const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 1, 1, wallet);
                const signature = signOrderRFQ(order, this.chainId, swap.address, account.getPrivateKey());

                const permit = await getPermit(addr1, addr1PrivateKey, this.weth, '1', this.chainId, swap.address, '1');
                const requestFunc = () => swap.fillOrderRFQToWithPermit(order, signature, 0, 1, addr1, permit);
                await requestFunc();
                await expectRevert(
                    requestFunc(),
                    'ERC20Permit: invalid signature',
                );
            });

            it('rejects other signature', async function () {
                const swap = await LimitOrderProtocol.new();
                await this.dai.approve(swap.address, '1000000', { from: account.getAddressString() });
                const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 1, 1, wallet);
                const signature = signOrderRFQ(order, this.chainId, swap.address, account.getPrivateKey());

                const otherWallet = Wallet.generate();
                const permit = await getPermit(addr1, otherWallet.getPrivateKey(), this.weth, '1', this.chainId, swap.address, '1');
                const requestFunc = () => swap.fillOrderRFQToWithPermit(order, signature, 0, 1, addr1, permit);
                await expectRevert(
                    requestFunc(),
                    'ERC20Permit: invalid signature',
                );
            });

            it('rejects expired permit', async function () {
                const deadline = (await time.latest()) - time.duration.weeks(1);
                const swap = await LimitOrderProtocol.new();
                await this.dai.approve(swap.address, '1000000', { from: account.getAddressString() });
                const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 1, 1, wallet);
                const signature = signOrderRFQ(order, this.chainId, swap.address, account.getPrivateKey());

                const permit = await getPermit(addr1, addr1PrivateKey, this.weth, '1', this.chainId, swap.address, '1', deadline);
                const requestFunc = () => swap.fillOrderRFQToWithPermit(order, signature, 0, 1, addr1, permit);
                await expectRevert(
                    requestFunc(),
                    'expired deadline',
                );
            });
        });
    });

    describe('Amount Calculator', async function () {
        it('empty getTakingAmount should work on full fill', async function () {
            const order = buildOrder({
                exchange: this.swap,
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 10,
                takingAmount: 10,
                from: wallet,
            });
            order.getTakingAmount = '0x';
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            await this.swap.fillOrder(order, signature, '0x', 10, 0, 10);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(10));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(10));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(10));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(10));
        });

        it('empty getTakingAmount should not work on partial fill', async function () {
            const order = buildOrder({
                exchange: this.swap,
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 10,
                takingAmount: 10,
                from: wallet,
            }, {
                getTakingAmount: '0x',
            });
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            await expectRevert(
                this.swap.fillOrder(order, signature, '0x', 5, 0, 5),
                'LOP: wrong amount',
            );
        });

        it('empty getMakingAmount should work on full fill', async function () {
            const order = buildOrder({
                exchange: this.swap,
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 10,
                takingAmount: 10,
                from: wallet,
            });
            order.getMakingAmount = '0x';
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            await this.swap.fillOrder(order, signature, '0x', 0, 10, 10);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(10));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(10));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(10));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(10));
        });

        it('empty getMakingAmount should not work on partial fill', async function () {
            const order = buildOrder({
                exchange: this.swap,
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 10,
                takingAmount: 10,
                from: wallet,
            }, {
                getMakingAmount: '0x',
            });
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            await expectRevert(
                this.swap.fillOrder(order, signature, '0x', 0, 5, 5),
                'LOP: wrong amount',
            );
        });
    });

    describe('Order Cancelation', async function () {
        beforeEach(async function () {
            this.order = buildOrder({
                exchange: this.swap,
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 1,
                takingAmount: 1,
                from: wallet,
            });
        });

        // TODO: need same test for RFQ
        it('should cancel own order', async function () {
            await this.swap.cancelOrder(this.order, { from: wallet });
            const data = buildOrderData(this.chainId, this.swap.address, this.order);
            const orderHash = bufferToHex(ethSigUtil.TypedDataUtils.sign(data));
            expect(await this.swap.remaining(orderHash)).to.be.bignumber.equal('0');
        });

        it('should not cancel foreign order', async function () {
            await expectRevert(
                this.swap.cancelOrder(this.order),
                'LOP: Access denied',
            );
        });

        it('should not fill cancelled order', async function () {
            const signature = signOrder(this.order, this.chainId, this.swap.address, account.getPrivateKey());

            await this.swap.cancelOrder(this.order, { from: wallet });

            await expectRevert(
                this.swap.fillOrder(this.order, signature, '0x', 1, 0, 1),
                'LOP: remaining amount is 0',
            );
        });
    });

    describe('OrderRFQ Cancelation', async function () {
        it('should cancel own order', async function () {
            await this.swap.cancelOrderRFQ('1');
            const invalidator = await this.swap.invalidatorForOrderRFQ(addr1, '0');
            expect(invalidator).to.be.bignumber.equal(toBN('2'));
        });

        it('should cancel own order with huge number', async function () {
            await this.swap.cancelOrderRFQ('1023');
            const invalidator = await this.swap.invalidatorForOrderRFQ(addr1, '3');
            expect(invalidator).to.be.bignumber.equal(toBN('1').shln(255));
        });

        it('should not fill cancelled order', async function () {
            const order = buildOrderRFQ('1', this.dai.address, this.weth.address, 1, 1, wallet);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, account.getPrivateKey());

            await this.swap.cancelOrderRFQ('1', { from: wallet });

            await expectRevert(
                this.swap.fillOrderRFQ(order, signature, 1, 0),
                'LOP: invalidated order',
            );
        });

        it('should not fill cancelled order (compact)', async function () {
            const order = buildOrderRFQ('1', this.dai.address, this.weth.address, 1, 1, wallet);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, account.getPrivateKey());

            await this.swap.cancelOrderRFQ('1', { from: wallet });

            const { r, vs } = compressSignature(signature);
            await expectRevert(
                this.swap.fillOrderRFQCompact(order, r, vs, 1, 0),
                'LOP: invalidated order',
            );
        });
    });

    describe('Private Orders', async function () {
        it('should fill with correct taker', async function () {
            const order = buildOrder({
                exchange: this.swap,
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 1,
                takingAmount: 1,
                from: wallet,
                allowedSender: addr1,
            });
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            await this.swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should not fill with incorrect taker', async function () {
            const order = buildOrder({
                exchange: this.swap,
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 1,
                takingAmount: 1,
                from: wallet,
                allowedSender: wallet,
            });
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            await expectRevert(
                this.swap.fillOrder(order, signature, '0x', 1, 0, 1),
                'LOP: private order',
            );
        });
    });

    describe('Predicate', async function () {
        it('benchmark gas', async function () {
            const ts1 = this.swap.contract.methods.timestampBelow(0xff0000).encodeABI();
            const balanceCall = this.dai.contract.methods.balanceOf(wallet).encodeABI();
            const gtCall = this.swap.contract.methods.gt('100000', this.dai.address, balanceCall).encodeABI();
            await this.swap.contract.methods.or(
                [this.swap.address, this.swap.address],
                [ts1, gtCall],
            ).send({ from: wallet });
        });

        it('`or` should pass', async function () {
            const ts1 = this.swap.contract.methods.timestampBelow(0xff0000).encodeABI();
            const balanceCall = this.dai.contract.methods.balanceOf(wallet).encodeABI();
            const gtCall = this.swap.contract.methods.gt('100000', this.dai.address, balanceCall).encodeABI();
            const predicate = this.swap.contract.methods.or(
                [this.swap.address, this.swap.address],
                [ts1, gtCall],
            ).encodeABI();

            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: wallet,
                },
                {
                    predicate,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            await this.swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('`or` should fail', async function () {
            const ts1 = this.swap.contract.methods.timestampBelow(0xff0000).encodeABI();
            const balanceCall = this.dai.contract.methods.balanceOf(wallet).encodeABI();
            const gtCall = this.swap.contract.methods.lt('100000', this.dai.address, balanceCall).encodeABI();
            const predicate = this.swap.contract.methods.or(
                [this.swap.address, this.swap.address],
                [ts1, gtCall],
            ).encodeABI();
            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: wallet,
                },
                {
                    predicate,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            await expectRevert(
                this.swap.fillOrder(order, signature, '0x', 1, 0, 1),
                'LOP: predicate is not true',
            );
        });

        it('`and` should pass', async function () {
            const ts1 = this.swap.contract.methods.timestampBelow(0xff000000).encodeABI();
            const balanceCall = this.dai.contract.methods.balanceOf(wallet).encodeABI();
            const gtCall = this.swap.contract.methods.eq('1000000', this.dai.address, balanceCall).encodeABI();
            const predicate = this.swap.contract.methods.and(
                [this.swap.address, this.swap.address],
                [ts1, gtCall],
            ).encodeABI();
            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: wallet,
                },
                {
                    predicate,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            await this.swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('nonce + ts example', async function () {
            const ts1 = this.swap.contract.methods.timestampBelow(0xff000000).encodeABI();
            const nonceCall = this.swap.contract.methods.nonceEquals(wallet, 0).encodeABI();
            const predicate = this.swap.contract.methods.and(
                [this.swap.address, this.swap.address],
                [ts1, nonceCall],
            ).encodeABI();
            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: wallet,
                },
                {
                    predicate,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            await this.swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('advance nonce', async function () {
            await this.swap.increaseNonce();
            expect(await this.swap.nonce(addr1)).to.be.bignumber.equal('1');
        });

        it('`and` should fail', async function () {
            const ts1 = this.swap.contract.methods.timestampBelow(0xff0000).encodeABI();
            const balanceCall = this.dai.contract.methods.balanceOf(wallet).encodeABI();
            const gtCall = this.swap.contract.methods.gt('100000', this.dai.address, balanceCall).encodeABI();
            const predicate = this.swap.contract.methods.and(
                [this.swap.address, this.swap.address],
                [ts1, gtCall],
            ).encodeABI();
            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: wallet,
                },
                {
                    predicate,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            await expectRevert(
                this.swap.fillOrder(order, signature, '0x', 1, 0, 1),
                'LOP: predicate is not true',
            );
        });
    });

    describe('Expiration', async function () {
        it('should fill when not expired', async function () {
            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: wallet,
                },
                {
                    predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            await this.swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should not fill when expired', async function () {
            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: wallet,
                },
                {
                    predicate: this.swap.contract.methods.timestampBelow(0xff0000).encodeABI(),
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            await expectRevert(
                this.swap.fillOrder(order, signature, '0x', 1, 0, 1),
                'LOP: predicate is not true',
            );
        });

        it('should fill RFQ order when not expired', async function () {
            const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 1, 1, wallet);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            await this.swap.fillOrderRFQ(order, signature, 1, 0);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should fill RFQ order when not expired (compact)', async function () {
            const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 1, 1, wallet);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            const { r, vs } = compressSignature(signature);
            console.log('signature', signature);
            console.log('r', r);
            console.log('vs', vs);
            await this.swap.fillOrderRFQCompact(order, r, vs, 1, 0);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should partial fill RFQ order', async function () {
            const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 2, 2, wallet);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            await this.swap.fillOrderRFQ(order, signature, 1, 0);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should partial fill RFQ order (compact)', async function () {
            const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 2, 2, wallet);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            const { r, vs } = compressSignature(signature);
            await this.swap.fillOrderRFQCompact(order, r, vs, 1, 0);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should fully fill RFQ order', async function () {
            const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 1, 1, wallet);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            await this.swap.fillOrderRFQ(order, signature, 0, 0);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should fully fill RFQ order wih (compact)', async function () {
            const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 1, 1, wallet);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            const { r, vs } = compressSignature(signature);
            await this.swap.fillOrderRFQCompact(order, r, vs, 0, 0);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should not partial fill RFQ order when 0', async function () {
            const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 5, 10, wallet);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, account.getPrivateKey());

            await expectRevert(
                this.swap.fillOrderRFQ(order, signature, 0, 1),
                'LOP: can\'t swap 0 amount',
            );
        });

        it('should not partial fill RFQ order when 0 (compact)', async function () {
            const order = buildOrderRFQ('0xFF000000000000000000000001', this.dai.address, this.weth.address, 5, 10, wallet);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, account.getPrivateKey());

            const { r, vs } = compressSignature(signature);
            await expectRevert(
                this.swap.fillOrderRFQCompact(order, r, vs, 0, 1),
                'LOP: can\'t swap 0 amount',
            );
        });

        it('should not fill RFQ order when expired', async function () {
            const order = buildOrderRFQ('308276084001730439550074881', this.dai.address, this.weth.address, 1, 1, wallet);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, account.getPrivateKey());

            await expectRevert(
                this.swap.fillOrderRFQ(order, signature, 1, 0),
                'LOP: order expired',
            );
        });

        it('should not fill RFQ order when expired (compact)', async function () {
            const order = buildOrderRFQ('308276084001730439550074881', this.dai.address, this.weth.address, 1, 1, wallet);
            const signature = signOrderRFQ(order, this.chainId, this.swap.address, account.getPrivateKey());

            const { r, vs } = compressSignature(signature);
            await expectRevert(
                this.swap.fillOrderRFQCompact(order, r, vs, 1, 0),
                'LOP: order expired',
            );
        });

        it('should fill partially if not enough coins (taker)', async function () {
            const order = buildOrder({
                exchange: this.swap,
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 2,
                takingAmount: 2,
                from: wallet,
            });
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            await this.swap.fillOrder(order, signature, '0x', 0, 3, 2);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(2));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(2));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(2));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(2));
        });

        it('should fill partially if not enough coins (maker)', async function () {
            const order = buildOrder({
                exchange: this.swap,
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 2,
                takingAmount: 2,
                from: wallet,
            });
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            await this.swap.fillOrder(order, signature, '0x', 3, 0, 3);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(2));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(2));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(2));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(2));
        });
    });

    describe('Interaction', async function () {
        beforeEach(async function () {
            this.notificationReceiver = await WethUnwrapper.new();

            this.whitelistRegistryMock = await WhitelistRegistryMock.new();
            this.whitelistChecker = await WhitelistChecker.new(this.whitelistRegistryMock.address);
        });

        it('should fill and unwrap token', async function () {
            const amount = web3.utils.toWei('1', 'ether');
            await web3.eth.sendTransaction({ from: wallet, to: this.weth.address, value: amount });

            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: wallet,
                    receiver: this.notificationReceiver.address,
                },
                {
                    predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
                    postInteraction: this.notificationReceiver.address + wallet.substring(2),
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);
            const makerEth = await web3.eth.getBalance(wallet);

            await this.swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth);
            expect(web3.utils.toBN(await web3.eth.getBalance(wallet))).to.be.bignumber.equal(web3.utils.toBN(makerEth).addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should check whitelist and fill and unwrap token', async function () {
            const amount = web3.utils.toWei('1', 'ether');
            await web3.eth.sendTransaction({ from: wallet, to: this.weth.address, value: amount });

            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: wallet,
                    receiver: this.notificationReceiver.address,
                },
                {
                    predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
                    preInteraction: this.whitelistChecker.address,
                    postInteraction: this.notificationReceiver.address + wallet.substring(2),
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);
            const makerEth = await web3.eth.getBalance(wallet);

            await this.whitelistRegistryMock.allow();
            await this.swap.fillOrder(order, signature, '0x', 1, 0, 1);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth);
            expect(web3.utils.toBN(await web3.eth.getBalance(wallet))).to.be.bignumber.equal(web3.utils.toBN(makerEth).addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should revert transaction when address is not allowed by whitelist', async function () {
            const amount = web3.utils.toWei('1', 'ether');
            await web3.eth.sendTransaction({ from: wallet, to: this.weth.address, value: amount });

            const preInteraction = this.whitelistChecker.address;

            const order = buildOrder(
                {
                    exchange: this.swap,
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: 1,
                    takingAmount: 1,
                    from: wallet,
                },
                {
                    predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
                    preInteraction,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());

            await this.whitelistRegistryMock.ban();
            await expectRevert(
                this.swap.fillOrder(order, signature, '0x', 1, 0, 1),
                'TakerIsNotWhitelisted()',
            );
        });
    });
});
