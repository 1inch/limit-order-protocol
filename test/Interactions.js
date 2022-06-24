const { expectRevert, ether } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const Wallet = require('ethereumjs-wallet').default;

const TokenMock = artifacts.require('TokenMock');
const WrappedTokenMock = artifacts.require('WrappedTokenMock');
const WethUnwrapper = artifacts.require('WethUnwrapper');
const WhitelistChecker = artifacts.require('WhitelistChecker');
const WhitelistRegistryMock = artifacts.require('WhitelistRegistryMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');
const RecursiveMatcher = artifacts.require('RecursiveMatcher');

const { buildOrder, signOrder, ABIOrder } = require('./helpers/orderUtils');

describe('Interactions', async function () {
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

        await this.dai.mint(wallet, ether('100'));
        await this.weth.mint(wallet, ether('100'));
        await this.dai.mint(addr1, ether('100'));
        await this.weth.mint(addr1, ether('100'));

        await this.dai.approve(this.swap.address, ether('100'));
        await this.weth.approve(this.swap.address, ether('100'));
        await this.dai.approve(this.swap.address, ether('100'), { from: wallet });
        await this.weth.approve(this.swap.address, ether('100'), { from: wallet });

        this.notificationReceiver = await WethUnwrapper.new();
        this.whitelistRegistryMock = await WhitelistRegistryMock.new();
        this.whitelistChecker = await WhitelistChecker.new(this.whitelistRegistryMock.address);
    });

    it('should fill and unwrap token', async function () {
        const amount = web3.utils.toWei('1', 'ether');
        await web3.eth.sendTransaction({ from: wallet, to: this.weth.address, value: amount });

        const order = buildOrder(
            {
                exchange: this.swap.address,
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
                exchange: this.swap.address,
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
                exchange: this.swap.address,
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

    it.only('should execute recursive swap', async function () {
        const matcher = await RecursiveMatcher.new();

        const order = buildOrder(
            {
                exchange: this.swap.address,
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                from: wallet,
            },
            {
                predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
            },
        );

        const backOrder = buildOrder(
            {
                exchange: this.swap.address,
                makerAsset: this.weth.address,
                takerAsset: this.dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                from: wallet,
            },
            {
                predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
            },
        );

        const signature = signOrder(order, this.chainId, this.swap.address, account.getPrivateKey());
        const signatureBackOrder = signOrder(backOrder, this.chainId, this.swap.address, account.getPrivateKey());

        const params = matcher.address + '01' + web3.eth.abi.encodeParameters(
            ['address[]', 'bytes[]'],
            [
                [
                    this.weth.address,
                    this.dai.address,
                ],
                [
                    this.weth.contract.methods.approve(this.swap.address, ether('0.1')).encodeABI(),
                    this.dai.contract.methods.approve(this.swap.address, ether('100')).encodeABI(),
                ],
            ],
        ).substring(2);

        const interaction = matcher.address + '00' + this.swap.contract.methods.fillOrder(
            backOrder,
            signatureBackOrder,
            params,
            ether('0.1'),
            0,
            ether('100'),
        ).encodeABI().substring(10);

        await matcher.matchOrders(this.swap.address, order, signature, interaction, ether('100'), 0, ether('0.1'));
    });
});
