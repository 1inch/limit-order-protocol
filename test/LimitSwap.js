const { BN, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const ethSigUtil = require('eth-sig-util');
const Wallet = require('ethereumjs-wallet').default;

const TokenMock = artifacts.require('TokenMock');
const LimitSwap = artifacts.require('LimitSwap');

const { EIP712Domain, domainSeparator } = require('./helpers/eip712');
const { profileEVM, gasspectEVM } = require('./helpers/profileEVM');

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
        }
    }

    function buildOrderRFQData (chainId, verifyingContract, order) {
        return {
            primaryType: 'OrderRFQ',
            types: { EIP712Domain, OrderRFQ },
            domain: { name, version, chainId, verifyingContract },
            message: order,
        }
    }

    function buildOrder(exchange, makerAsset, takerAsset, makerAmount, takerAmount, predicate, permit) {
        return buildOrderWithSalt(exchange, '1', makerAsset, takerAsset, makerAmount, takerAmount, predicate, permit);
    }

    function buildOrderWithSalt(exchange, salt, makerAsset, takerAsset, makerAmount, takerAmount, predicate, permit) {
        return {
            salt: salt,
            makerAsset: makerAsset.address,
            takerAsset: takerAsset.address,
            makerAssetData: makerAsset.contract.methods.transferFrom(wallet, zeroAddress, makerAmount).encodeABI(),
            takerAssetData: takerAsset.contract.methods.transferFrom(zeroAddress, wallet, takerAmount).encodeABI(),
            getMakerAmount: exchange.contract.methods.getMakerAmount(makerAmount, takerAmount, 0).encodeABI().substr(0, 2 + 68*2),
            getTakerAmount: exchange.contract.methods.getTakerAmount(makerAmount, takerAmount, 0).encodeABI().substr(0, 2 + 68*2),
            predicate: predicate,
            permitData: permit,
        };
    }

    function buildOrderRFQ(info, makerAsset, takerAsset, makerAmount, takerAmount) {
        return {
            info: info,
            makerAsset: makerAsset.address,
            takerAsset: takerAsset.address,
            makerAssetData: makerAsset.contract.methods.transferFrom(wallet, zeroAddress, makerAmount).encodeABI(),
            takerAssetData: takerAsset.contract.methods.transferFrom(zeroAddress, wallet, takerAmount).encodeABI(),
        };
    }

    before(async function () {
        this.dai = await TokenMock.new("DAI", "DAI");
        this.weth = await TokenMock.new("WETH", "WETH");

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

    describe('LimitSwap', async function () {
        it('transferFrom', async function () {
            await this.dai.approve(_, '2', { from: wallet });
            await this.dai.transferFrom(wallet, _, '1', { from: _ });
        });

        it('should swap fully based on signature', async function () {
            // Order: 1 DAI => 1 WETH
            // Swap:  1 DAI => 1 WETH

            const order = buildOrder(this.swap, this.dai, this.weth, 1, 1, "0x", "0x");
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(_);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(_);

            const receipt = await this.swap.fillOrder(order, signature, 1, 0, "0x");

            expect(
                await profileEVM(receipt.tx, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE'])
            ).to.be.deep.equal([2, 1, 7, 7, 0]);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(1));
        });

        it('should swap fully based on RFQ signature', async function () {
            // Order: 1 DAI => 1 WETH
            // Swap:  1 DAI => 1 WETH

            for (let saltSuffix of ['000000000000000000000001', '000000000000000000000002']) {
                const salt = wallet + saltSuffix;
                const order = buildOrderRFQ(salt, this.dai, this.weth, 1, 1);
                const data = buildOrderRFQData(this.chainId, this.swap.address, order);
                const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

                const makerDai = await this.dai.balanceOf(wallet);
                const takerDai = await this.dai.balanceOf(_);
                const makerWeth = await this.weth.balanceOf(wallet);
                const takerWeth = await this.weth.balanceOf(_);

                const receipt = await this.swap.fillOrderRFQ(order, signature);

                expect(
                    await profileEVM(receipt.tx, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE'])
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

            const order = buildOrder(this.swap, this.dai, this.weth, 2, 2, "0x", "0x");
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(_);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(_);

            const receipt = await this.swap.fillOrder(order, signature, 1, 0, "0x");

            expect(
                await profileEVM(receipt.tx, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD', 'EXTCODESIZE'])
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

            const order = buildOrder(this.swap, this.dai, this.weth, 2, 10, "0x", "0x");
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(_);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(_);

            await this.swap.fillOrder(order, signature, 0, 9, "0x");

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(9));
            expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(9));
        });

        it('should fail on floor maker amount = 0', async function () {
            // Order: 2 DAI => 10 WETH
            // Swap:  4 WETH <= 0 DAI

            const order = buildOrder(this.swap, this.dai, this.weth, 2, 10, "0x", "0x");
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            await expectRevert(
                this.swap.fillOrder(order, signature, 0, 4, "0x"),
                "LimitSwap: can't swap 0 amount"
            );
        });

        it('should ceil taker amount', async function () {
            // Order: 10 DAI => 2 WETH
            // Swap:  4 DAI => 1 WETH

            const order = buildOrder(this.swap, this.dai, this.weth, 10, 2, "0x", "0x");
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(_);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(_);

            await this.swap.fillOrder(order, signature, 4, 0, "0x");

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(4));
            expect(await this.dai.balanceOf(_)).to.be.bignumber.equal(takerDai.addn(4));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(_)).to.be.bignumber.equal(takerWeth.subn(1));
        });
    });
});
