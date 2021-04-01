const { BN, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const { bufferToHex } = require('ethereumjs-util');
const ethSigUtil = require('eth-sig-util');
const Wallet = require('ethereumjs-wallet').default;

const TokenMock = artifacts.require('TokenMock');
const LimitSwap = artifacts.require('LimitSwap');

const { EIP712Domain, domainSeparator } = require('./helpers/eip712');
const { profileEVM, gasspectEVM } = require('./helpers/profileEVM');

function toBN (num) {
    return new BN(num);
}

const OrderRFQ = [
    { name: 'info', type: 'uint256' },
    { name: 'makerAsset', type: 'address' },
    { name: 'takerAsset', type: 'address' },
    { name: 'makerAssetData', type: 'bytes' },
    { name: 'takerAssetData', type: 'bytes' },
];

const Order = [
    { name: 'salt', type: 'uint256' },
    { name: 'makerAsset', type: 'address' },
    { name: 'takerAsset', type: 'address' },
    { name: 'makerAssetData', type: 'bytes' },
    { name: 'takerAssetData', type: 'bytes' },
    { name: 'getMakerAmount', type: 'bytes' },
    { name: 'getTakerAmount', type: 'bytes' },
    { name: 'predicate', type: 'bytes' },
    { name: 'permitData', type: 'bytes' },
];

contract('LimitSwap', async function ([_, wallet]) {
    const privatekey = '2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501201';
    const account = Wallet.fromPrivateKey(Buffer.from(privatekey, 'hex'));

    const zeroAddress = '0x0000000000000000000000000000000000000000';
    const name = '1inch Limit Order Protocol';
    const version = '1';

    function buildOrderData (chainId, verifyingContract, order) {
        return {
            primaryType: 'Order',
            types: { EIP712Domain, Order },
            domain: { name, version, chainId, verifyingContract },
            message: order,
        };
    }

    function buildOrderRFQData (chainId, verifyingContract, order) {
        return {
            primaryType: 'OrderRFQ',
            types: { EIP712Domain, OrderRFQ },
            domain: { name, version, chainId, verifyingContract },
            message: order,
        };
    }

    function buildOrder (exchange, makerAsset, takerAsset, makerAmount, takerAmount, taker = zeroAddress, predicate = '0x', permit = '0x') {
        return buildOrderWithSalt(exchange, '1', makerAsset, takerAsset, makerAmount, takerAmount, taker, predicate, permit);
    }

    function buildOrderWithSalt (exchange, salt, makerAsset, takerAsset, makerAmount, takerAmount, taker = zeroAddress, predicate = '0x', permit = '0x') {
        return {
            salt: salt,
            makerAsset: makerAsset.address,
            takerAsset: takerAsset.address,
            makerAssetData: makerAsset.contract.methods.transferFrom(wallet, taker, makerAmount).encodeABI(),
            takerAssetData: takerAsset.contract.methods.transferFrom(taker, wallet, takerAmount).encodeABI(),
            getMakerAmount: exchange.contract.methods.getMakerAmount(makerAmount, takerAmount, 0).encodeABI().substr(0, 2 + 68 * 2),
            getTakerAmount: exchange.contract.methods.getTakerAmount(makerAmount, takerAmount, 0).encodeABI().substr(0, 2 + 68 * 2),
            predicate: predicate,
            permitData: permit,
        };
    }

    function buildOrderRFQ (info, makerAsset, takerAsset, makerAmount, takerAmount, taker = zeroAddress) {
        return {
            info: info,
            makerAsset: makerAsset.address,
            takerAsset: takerAsset.address,
            makerAssetData: makerAsset.contract.methods.transferFrom(wallet, taker, makerAmount).encodeABI(),
            takerAssetData: takerAsset.contract.methods.transferFrom(taker, wallet, takerAmount).encodeABI(),
        };
    }

    before(async function () {
        this.dai = await TokenMock.new('DAI', 'DAI');
        this.weth = await TokenMock.new('WETH', 'WETH');

        // We get the chain id from the contract because Ganache (used for coverage) does not return the same chain id
        // from within the EVM as from the JSON RPC interface.
        // See https://github.com/trufflesuite/ganache-core/issues/515
        this.chainId = await this.dai.getChainId();

        await this.dai.mint(wallet, '1000000');
        await this.weth.mint(wallet, '1000000');
        await this.dai.mint(_, '1000000');
        await this.weth.mint(_, '1000000');
    });

    beforeEach(async function () {
        this.swap = await LimitSwap.new();

        await this.dai.approve(this.swap.address, '1000000');
        await this.weth.approve(this.swap.address, '1000000');
        await this.dai.approve(this.swap.address, '1000000', { from: wallet });
        await this.weth.approve(this.swap.address, '1000000', { from: wallet });
    });

    it('domain separator', async function () {
        expect(
            await this.swap.DOMAIN_SEPARATOR(),
        ).to.equal(
            await domainSeparator(name, version, this.chainId, this.swap.address),
        );
    });

    describe('wip', async function () {
        it('transferFrom', async function () {
            await this.dai.approve(_, '2', { from: wallet });
            await this.dai.transferFrom(wallet, _, '1', { from: _ });
        });

        it('should swap fully based on signature', async function () {
            // Order: 1 DAI => 1 WETH
            // Swap:  1 DAI => 1 WETH

            const order = buildOrder(this.swap, this.dai, this.weth, 1, 1);
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(_);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(_);

            const receipt = await this.swap.fillOrder(order, signature, 1, 0, '0x');

            expect(
                await profileEVM(receipt.tx, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE']),
            ).to.be.deep.equal([2, 1, 7, 7, 0]);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should swap fully based on RFQ signature', async function () {
            // Order: 1 DAI => 1 WETH
            // Swap:  1 DAI => 1 WETH

            for (const salt of ['000000000000000000000001', '000000000000000000000002']) {
                const order = buildOrderRFQ(salt, this.dai, this.weth, 1, 1);
                const data = buildOrderRFQData(this.chainId, this.swap.address, order);
                const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

                const makerDai = await this.dai.balanceOf(wallet);
                const takerDai = await this.dai.balanceOf(_);
                const makerWeth = await this.weth.balanceOf(wallet);
                const takerWeth = await this.weth.balanceOf(_);

                const receipt = await this.swap.fillOrderRFQ(order, signature);

                expect(
                    await profileEVM(receipt.tx, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE']),
                ).to.be.deep.equal([2, 1, 7, 7, 0]);

                await gasspectEVM(receipt.tx);

                expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
                expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(1));
                expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
                expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(1));
            }
        });

        it('should swap half based on signature', async function () {
            // Order: 2 DAI => 2 WETH
            // Swap:  1 DAI => 1 WETH

            const order = buildOrder(this.swap, this.dai, this.weth, 2, 2);
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(_);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(_);

            const receipt = await this.swap.fillOrder(order, signature, 1, 0, '0x');

            expect(
                await profileEVM(receipt.tx, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE']),
            ).to.be.deep.equal([2, 2, 7, 7, 0]);

            // await gasspectEVM(receipt.tx);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should floor maker amount', async function () {
            // Order: 2 DAI => 10 WETH
            // Swap:  9 WETH <= 1 DAI

            const order = buildOrder(this.swap, this.dai, this.weth, 2, 10);
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(_);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(_);

            await this.swap.fillOrder(order, signature, 0, 9, '0x');

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(9));
            expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(9));
        });

        it('should fail on floor maker amount = 0', async function () {
            // Order: 2 DAI => 10 WETH
            // Swap:  4 WETH <= 0 DAI

            const order = buildOrder(this.swap, this.dai, this.weth, 2, 10);
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            await expectRevert(
                this.swap.fillOrder(order, signature, 0, 4, '0x'),
                'LS: can\'t swap 0 amount',
            );
        });

        it('should ceil taker amount', async function () {
            // Order: 10 DAI => 2 WETH
            // Swap:  4 DAI => 1 WETH

            const order = buildOrder(this.swap, this.dai, this.weth, 10, 2);
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(_);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(_);

            await this.swap.fillOrder(order, signature, 4, 0, '0x');

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(4));
            expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(4));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        describe('Order Cancelation', async function () {
            beforeEach(async function () {
                this.order = buildOrder(this.swap, this.dai, this.weth, 1, 1);
            });

            it('should cancel own order', async function () {
                await this.swap.cancelOrder(this.order, { from: wallet });
                const data = buildOrderData(this.chainId, this.swap.address, this.order);
                const orderHash = bufferToHex(ethSigUtil.TypedDataUtils.sign(data));
                expect(await this.swap.remaining(orderHash)).to.be.bignumber.equal('0');
            });

            it('should not cancel foreign order', async function () {
                await expectRevert(
                    this.swap.cancelOrder(this.order),
                    'LS: Access denied',
                );
            });

            it('should not fill cancelled order', async function () {
                const data = buildOrderData(this.chainId, this.swap.address, this.order);
                const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

                await this.swap.cancelOrder(this.order, { from: wallet });

                await expectRevert(
                    this.swap.fillOrder(this.order, signature, 1, 0, '0x'),
                    'LS: taking > remaining',
                );
            });
        });

        describe('OrderRFQ Cancelation', async function () {
            it('should cancel own order', async function () {
                await this.swap.cancelOrderRFQ('1');
                const invalidator = await this.swap.invalidatorForOrderRFQ(_, '0');
                expect(invalidator).to.be.bignumber.equal(toBN('2'));
            });

            it('should cancel own order with huge number', async function () {
                await this.swap.cancelOrderRFQ('1023');
                const invalidator = await this.swap.invalidatorForOrderRFQ(_, '3');
                expect(invalidator).to.be.bignumber.equal(toBN('1').shln(255));
            });

            it('should not fill cancelled order', async function () {
                const order = buildOrderRFQ('1', this.dai, this.weth, 1, 1);
                const data = buildOrderRFQData(this.chainId, this.swap.address, order);
                const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

                await this.swap.cancelOrderRFQ('1', { from: wallet });

                await expectRevert(
                    this.swap.fillOrderRFQ(order, signature),
                    'LS: already filled',
                );
            });
        });

        describe('Private Orders', async function () {
            it('should fill with correct taker', async function () {
                const order = buildOrder(this.swap, this.dai, this.weth, 1, 1, _);
                const data = buildOrderData(this.chainId, this.swap.address, order);
                const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

                const makerDai = await this.dai.balanceOf(wallet);
                const takerDai = await this.dai.balanceOf(_);
                const makerWeth = await this.weth.balanceOf(wallet);
                const takerWeth = await this.weth.balanceOf(_);

                await this.swap.fillOrder(order, signature, 1, 0, '0x');

                expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
                expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(1));
                expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
                expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(1));
            });

            it('should not fill with incorrect taker', async function () {
                const order = buildOrder(this.swap, this.dai, this.weth, 1, 1, wallet);
                const data = buildOrderData(this.chainId, this.swap.address, order);
                const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

                await expectRevert(
                    this.swap.fillOrder(order, signature, 1, 0, '0x'),
                    'LS: private order',
                );
            });
        });

        describe('Expiration', async function () {
            it('should fill when not expired', async function () {
                const order = buildOrder(this.swap, this.dai, this.weth, 1, 1, _, this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI());
                const data = buildOrderData(this.chainId, this.swap.address, order);
                const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

                const makerDai = await this.dai.balanceOf(wallet);
                const takerDai = await this.dai.balanceOf(_);
                const makerWeth = await this.weth.balanceOf(wallet);
                const takerWeth = await this.weth.balanceOf(_);

                await this.swap.fillOrder(order, signature, 1, 0, '0x');

                expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
                expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(1));
                expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
                expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(1));
            });

            it('should not fill when expired', async function () {
                const order = buildOrder(this.swap, this.dai, this.weth, 1, 1, _, this.swap.contract.methods.timestampBelow(0xff0000).encodeABI());
                const data = buildOrderData(this.chainId, this.swap.address, order);
                const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

                await expectRevert(
                    this.swap.fillOrder(order, signature, 1, 0, '0x'),
                    'LS: predicate returned false',
                );
            });

            it('should fill RFQ order when not expired', async function () {
                const order = buildOrderRFQ('20203181441137406086353707335681', this.dai, this.weth, 1, 1);
                const data = buildOrderRFQData(this.chainId, this.swap.address, order);
                const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

                const makerDai = await this.dai.balanceOf(wallet);
                const takerDai = await this.dai.balanceOf(_);
                const makerWeth = await this.weth.balanceOf(wallet);
                const takerWeth = await this.weth.balanceOf(_);

                await this.swap.fillOrderRFQ(order, signature);

                expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
                expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(1));
                expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
                expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(1));
            });

            it('should not fill RFQ order when expired', async function () {
                const order = buildOrderRFQ('308276084001730439550074881', this.dai, this.weth, 1, 1);
                const data = buildOrderRFQData(this.chainId, this.swap.address, order);
                const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

                await expectRevert(
                    this.swap.fillOrderRFQ(order, signature),
                    'LS: order expired',
                );
            });
        });
    });
});
