const { BN, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const { bufferToHex } = require('ethereumjs-util');
const ethSigUtil = require('eth-sig-util');
const Wallet = require('ethereumjs-wallet').default;

const TokenMock = artifacts.require('TokenMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');

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
    { name: 'permit', type: 'bytes' },
    { name: 'interaction', type: 'bytes' },
];

contract('LimitOrderProtocol', async function ([_, wallet]) {
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

    function buildOrder (exchange, makerAsset, takerAsset, makerAmount, takerAmount, taker = zeroAddress, predicate = '0x', permit = '0x', interaction = '0x') {
        return buildOrderWithSalt(exchange, '1', makerAsset, takerAsset, makerAmount, takerAmount, taker, predicate, permit, interaction);
    }

    function buildOrderWithSalt (exchange, salt, makerAsset, takerAsset, makerAmount, takerAmount, taker = zeroAddress, predicate = '0x', permit = '0x', interaction = '0x') {
        return {
            salt: salt,
            makerAsset: makerAsset.address,
            takerAsset: takerAsset.address,
            makerAssetData: makerAsset.contract.methods.transferFrom(wallet, taker, makerAmount).encodeABI(),
            takerAssetData: takerAsset.contract.methods.transferFrom(taker, wallet, takerAmount).encodeABI(),
            getMakerAmount: exchange.contract.methods.getMakerAmount(makerAmount, takerAmount, 0).encodeABI().substr(0, 2 + 68 * 2),
            getTakerAmount: exchange.contract.methods.getTakerAmount(makerAmount, takerAmount, 0).encodeABI().substr(0, 2 + 68 * 2),
            predicate: predicate,
            permit: permit,
            interaction: interaction,
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

    beforeEach(async function () {
        this.dai = await TokenMock.new('DAI', 'DAI');
        this.weth = await TokenMock.new('WETH', 'WETH');

        this.swap = await LimitOrderProtocol.new();

        // We get the chain id from the contract because Ganache (used for coverage) does not return the same chain id
        // from within the EVM as from the JSON RPC interface.
        // See https://github.com/trufflesuite/ganache-core/issues/515
        this.chainId = await this.dai.getChainId();

        await this.dai.mint(wallet, '1000000');
        await this.weth.mint(wallet, '1000000');
        await this.dai.mint(_, '1000000');
        await this.weth.mint(_, '1000000');

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

        it('should not swap with bad signature', async function () {
            const order = buildOrder(this.swap, this.dai, this.weth, 1, 1);
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });
            const sentOrder = buildOrder(this.swap, this.dai, this.weth, 1, 2);

            await expectRevert(
                this.swap.fillOrder(sentOrder, signature, 1, 0, 1),
                'LOP: bad signature',
            );
        });

        it('should not fill (1,1)', async function () {
            const order = buildOrder(this.swap, this.dai, this.weth, 1, 1);
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            await expectRevert(
                this.swap.fillOrder(order, signature, 1, 1, 1),
                'LOP: one of amounts should be 0',
            );
        });

        it('should not fill above threshold', async function () {
            const order = buildOrder(this.swap, this.dai, this.weth, 2, 2);
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            await expectRevert(
                this.swap.fillOrder(order, signature, 2, 0, 1),
                'LOP: taking amount too high',
            );
        });

        it('should not fill below threshold', async function () {
            const order = buildOrder(this.swap, this.dai, this.weth, 2, 2);
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            await expectRevert(
                this.swap.fillOrder(order, signature, 0, 2, 3),
                'LOP: making amount too low',
            );
        });

        it('should take all the remaining makerAssetAmount', async function () {
            const order = buildOrder(this.swap, this.dai, this.weth, 100, 1);
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(_);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(_);

            await this.swap.fillOrder(order, signature, toBN('1').shln(255).toString(), 0, 1);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(100));
            expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(100));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(1));
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

            const receipt = await this.swap.fillOrder(order, signature, 1, 0, 1);

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

            const receipt = await this.swap.fillOrder(order, signature, 1, 0, 1);

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

            await this.swap.fillOrder(order, signature, 0, 9, 1);

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
                this.swap.fillOrder(order, signature, 0, 4, 0),
                'LOP: can\'t swap 0 amount',
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

            await this.swap.fillOrder(order, signature, 4, 0, 1);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(4));
            expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(4));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(1));
        });
    });

    it('ERC20Proxy should work', async function () {
        const order = buildOrder(this.swap, this.dai, this.weth, 10, 10);
        this.makerAsset = this.swap.address;
        this.takerAsset = this.swap.address;
        this.makerAssetData = this.swap.contract.methods.func_50BkM4K(wallet, zeroAddress, 10, this.dai.address).encodeABI();
        this.takerAssetData = this.swap.contract.methods.func_50BkM4K(zeroAddress, wallet, 10, this.weth.address).encodeABI();

        const data = buildOrderData(this.chainId, this.swap.address, order);
        const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

        const makerDai = await this.dai.balanceOf(wallet);
        const takerDai = await this.dai.balanceOf(_);
        const makerWeth = await this.weth.balanceOf(wallet);
        const takerWeth = await this.weth.balanceOf(_);

        await this.swap.fillOrder(order, signature, 10, 0, 10);

        expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(10));
        expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(10));
        expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(10));
        expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(10));
    });

    describe('Amount Calculator', async function () {
        it('empty getTakerAmount should work on full fill', async function () {
            const order = buildOrder(this.swap, this.dai, this.weth, 10, 10);
            order.getTakerAmount = '0x';
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(_);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(_);

            await this.swap.fillOrder(order, signature, 10, 0, 10);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(10));
            expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(10));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(10));
            expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(10));
        });

        it('empty getTakerAmount should not work on partial fill', async function () {
            const order = buildOrder(this.swap, this.dai, this.weth, 10, 10);
            order.getTakerAmount = '0x';
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            await expectRevert(
                this.swap.fillOrder(order, signature, 5, 0, 5),
                'LOP: getTakerAmount call failed',
            );
        });

        it('empty getMakerAmount should work on full fill', async function () {
            const order = buildOrder(this.swap, this.dai, this.weth, 10, 10);
            order.getMakerAmount = '0x';
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(_);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(_);

            await this.swap.fillOrder(order, signature, 0, 10, 10);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(10));
            expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(10));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(10));
            expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(10));
        });

        it('empty getMakerAmount should not work on partial fill', async function () {
            const order = buildOrder(this.swap, this.dai, this.weth, 10, 10);
            order.getMakerAmount = '0x';
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            await expectRevert(
                this.swap.fillOrder(order, signature, 0, 5, 5),
                'LOP: getMakerAmount call failed',
            );
        });
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
                'LOP: Access denied',
            );
        });

        it('should not fill cancelled order', async function () {
            const data = buildOrderData(this.chainId, this.swap.address, this.order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            await this.swap.cancelOrder(this.order, { from: wallet });

            await expectRevert(
                this.swap.fillOrder(this.order, signature, 1, 0, 1),
                'LOP: taking > remaining',
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
                'LOP: already filled',
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

            await this.swap.fillOrder(order, signature, 1, 0, 1);

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
                this.swap.fillOrder(order, signature, 1, 0, 1),
                'LOP: private order',
            );
        });
    });

    describe('Predicate', async function () {
        it('`or` should pass', async function () {
            const ts1 = this.swap.contract.methods.timestampBelow(0xff0000).encodeABI();
            const balanceCall = this.dai.contract.methods.balanceOf(wallet).encodeABI();
            const gtCall = this.swap.contract.methods.gt('100000', this.dai.address, balanceCall).encodeABI();
            const predicate = this.swap.contract.methods.or(
                [this.swap.address, this.swap.address],
                [ts1, gtCall],
            ).encodeABI();
            const order = buildOrder(this.swap, this.dai, this.weth, 1, 1, zeroAddress, predicate);
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(_);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(_);

            await this.swap.fillOrder(order, signature, 1, 0, 1);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('`or` should fail', async function () {
            const ts1 = this.swap.contract.methods.timestampBelow(0xff0000).encodeABI();
            const balanceCall = this.dai.contract.methods.balanceOf(wallet).encodeABI();
            const gtCall = this.swap.contract.methods.lt('100000', this.dai.address, balanceCall).encodeABI();
            const predicate = this.swap.contract.methods.or(
                [this.swap.address, this.swap.address],
                [ts1, gtCall],
            ).encodeABI();
            const order = buildOrder(this.swap, this.dai, this.weth, 1, 1, zeroAddress, predicate);
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            await expectRevert(
                this.swap.fillOrder(order, signature, 1, 0, 1),
                'LOP: predicate returned false',
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
            const order = buildOrder(this.swap, this.dai, this.weth, 1, 1, zeroAddress, predicate);
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(_);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(_);

            await this.swap.fillOrder(order, signature, 1, 0, 1);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('nonce + ts example', async function () {
            const ts1 = this.swap.contract.methods.timestampBelow(0xff000000).encodeABI();
            const nonceCall = this.swap.contract.methods.nonceEquals(wallet, 0).encodeABI();
            const predicate = this.swap.contract.methods.and(
                [this.swap.address, this.swap.address],
                [ts1, nonceCall],
            ).encodeABI();
            const order = buildOrder(this.swap, this.dai, this.weth, 1, 1, zeroAddress, predicate);
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(_);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(_);

            await this.swap.fillOrder(order, signature, 1, 0, 1);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('`and` should fail', async function () {
            const ts1 = this.swap.contract.methods.timestampBelow(0xff0000).encodeABI();
            const balanceCall = this.dai.contract.methods.balanceOf(wallet).encodeABI();
            const gtCall = this.swap.contract.methods.gt('100000', this.dai.address, balanceCall).encodeABI();
            const predicate = this.swap.contract.methods.and(
                [this.swap.address, this.swap.address],
                [ts1, gtCall],
            ).encodeABI();
            const order = buildOrder(this.swap, this.dai, this.weth, 1, 1, zeroAddress, predicate);
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            await expectRevert(
                this.swap.fillOrder(order, signature, 1, 0, 1),
                'LOP: predicate returned false',
            );
        });
    });

    describe('Expiration', async function () {
        it('should fill when not expired', async function () {
            const order = buildOrder(this.swap, this.dai, this.weth, 1, 1, zeroAddress, this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI());
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(_);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(_);

            await this.swap.fillOrder(order, signature, 1, 0, 1);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should not fill when expired', async function () {
            const order = buildOrder(this.swap, this.dai, this.weth, 1, 1, zeroAddress, this.swap.contract.methods.timestampBelow(0xff0000).encodeABI());
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            await expectRevert(
                this.swap.fillOrder(order, signature, 1, 0, 1),
                'LOP: predicate returned false',
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
                'LOP: order expired',
            );
        });
    });
});
