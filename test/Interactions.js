const { expect, trim0x } = require('@1inch/solidity-utils');
const { addr0Wallet, addr1Wallet } = require('./helpers/utils');

const TokenMock = artifacts.require('TokenMock');
const WrappedTokenMock = artifacts.require('WrappedTokenMock');
const WethUnwrapper = artifacts.require('WethUnwrapper');
const WhitelistChecker = artifacts.require('WhitelistChecker');
const WhitelistRegistryMock = artifacts.require('WhitelistRegistryMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');

const { buildOrder, signOrder } = require('./helpers/orderUtils');

describe('Interactions', async function () {
    const [addr0, addr1] = [addr0Wallet.getAddressString(), addr1Wallet.getAddressString()];

    before(async function () {
        this.chainId = await web3.eth.getChainId();
    });

    beforeEach(async function () {
        this.dai = await TokenMock.new('DAI', 'DAI');
        this.weth = await WrappedTokenMock.new('WETH', 'WETH');

        this.swap = await LimitOrderProtocol.new();

        await this.dai.mint(addr1, '1000000');
        await this.weth.mint(addr1, '1000000');
        await this.dai.mint(addr0, '1000000');
        await this.weth.mint(addr0, '1000000');

        await this.dai.approve(this.swap.address, '1000000');
        await this.weth.approve(this.swap.address, '1000000');
        await this.dai.approve(this.swap.address, '1000000', { from: addr1 });
        await this.weth.approve(this.swap.address, '1000000', { from: addr1 });

        this.notificationReceiver = await WethUnwrapper.new();
        this.whitelistRegistryMock = await WhitelistRegistryMock.new();
        this.whitelistChecker = await WhitelistChecker.new(this.whitelistRegistryMock.address);
    });

    it('should fill and unwrap token', async function () {
        const amount = web3.utils.toWei('1', 'ether');
        await web3.eth.sendTransaction({ from: addr1, to: this.weth.address, value: amount });

        const order = buildOrder(
            {
                exchange: this.swap,
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 1,
                takingAmount: 1,
                from: addr1,
                receiver: this.notificationReceiver.address,
            },
            {
                predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
                postInteraction: this.notificationReceiver.address + trim0x(addr1),
            },
        );
        const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

        const makerDai = await this.dai.balanceOf(addr1);
        const takerDai = await this.dai.balanceOf(addr0);
        const makerWeth = await this.weth.balanceOf(addr1);
        const takerWeth = await this.weth.balanceOf(addr0);
        const makerEth = await web3.eth.getBalance(addr1);

        await this.swap.fillOrder(order, signature, '0x', 1, 0, 1);

        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
        expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
        expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth);
        expect(web3.utils.toBN(await web3.eth.getBalance(addr1))).to.be.bignumber.equal(web3.utils.toBN(makerEth).addn(1));
        expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
    });

    it('should check whitelist and fill and unwrap token', async function () {
        const amount = web3.utils.toWei('1', 'ether');
        await web3.eth.sendTransaction({ from: addr1, to: this.weth.address, value: amount });

        const order = buildOrder(
            {
                exchange: this.swap,
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 1,
                takingAmount: 1,
                from: addr1,
                receiver: this.notificationReceiver.address,
            },
            {
                predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
                preInteraction: this.whitelistChecker.address,
                postInteraction: this.notificationReceiver.address + trim0x(addr1),
            },
        );
        const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

        const makerDai = await this.dai.balanceOf(addr1);
        const takerDai = await this.dai.balanceOf(addr0);
        const makerWeth = await this.weth.balanceOf(addr1);
        const takerWeth = await this.weth.balanceOf(addr0);
        const makerEth = await web3.eth.getBalance(addr1);

        await this.whitelistRegistryMock.allow();
        await this.swap.fillOrder(order, signature, '0x', 1, 0, 1);

        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.subn(1));
        expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.addn(1));
        expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth);
        expect(web3.utils.toBN(await web3.eth.getBalance(addr1))).to.be.bignumber.equal(web3.utils.toBN(makerEth).addn(1));
        expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.subn(1));
    });

    it('should revert transaction when address is not allowed by whitelist', async function () {
        const amount = web3.utils.toWei('1', 'ether');
        await web3.eth.sendTransaction({ from: addr1, to: this.weth.address, value: amount });

        const preInteraction = this.whitelistChecker.address;

        const order = buildOrder(
            {
                exchange: this.swap,
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: 1,
                takingAmount: 1,
                from: addr1,
            },
            {
                predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
                preInteraction,
            },
        );
        const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

        await this.whitelistRegistryMock.ban();
        await expect(this.swap.fillOrder(order, signature, '0x', 1, 0, 1)).to.eventually.be.rejectedWith('TakerIsNotWhitelisted()');
    });
});
