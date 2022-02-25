const { expectRevert, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const ethSigUtil = require('eth-sig-util');
const Wallet = require('ethereumjs-wallet').default;

const TokenMock = artifacts.require('TokenMock');
const WrappedTokenMock = artifacts.require('WrappedTokenMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');

const { buildOrderData } = require('./helpers/orderUtils');
const { cutLastArg } = require('./helpers/utils');

describe('LimitOrderProtocol', async function () {
    let addr1, wallet, addr3;

    const privatekey = '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
    const account = Wallet.fromPrivateKey(Buffer.from(privatekey, 'hex'));

    function buildOrder (
        exchange,
        makerAsset,
        takerAsset,
        makingAmount,
        takingAmount,

        makerWallet,
        takerWallet = constants.ZERO_ADDRESS,

        predicate = '0x',
        permit = '0x',
        interaction = '0x',
        receiver = constants.ZERO_ADDRESS,
    ) {
        return {
            salt: 1,
            makerAsset: makerAsset.address,
            takerAsset: takerAsset.address,
            maker: makerWallet,
            receiver,
            allowedSender: takerWallet,
            makingAmount,
            takingAmount,
            makerAssetData: '0x',
            takerAssetData: '0x',
            getMakerAmount: cutLastArg(exchange.contract.methods.getMakerAmount(makingAmount, takingAmount, 0).encodeABI()),
            getTakerAmount: cutLastArg(exchange.contract.methods.getTakerAmount(makingAmount, takingAmount, 0).encodeABI()),
            predicate: predicate,
            permit: permit,
            interaction: interaction,
        };
    }

    before(async function () {
        [addr1, wallet, walle3] = await web3.eth.getAccounts();
    });

    beforeEach(async function () {
        this.dai = await TokenMock.new('DAI', 'DAI');
        this.weth = await WrappedTokenMock.new('WETH', 'WETH');

        this.swap = await LimitOrderProtocol.new();

        // We get the chain id from the contract because Ganache (used for coverage) does not return the same chain id
        // from within the EVM as from the JSON RPC interface.
        // See https://github.com/trufflesuite/ganache-core/issues/515
        this.chainId = await this.dai.getChainId();

        await this.dai.mint(wallet, '1000000');
        await this.weth.mint(wallet, '1000000');
        await this.dai.mint(addr1, '1000000');
        await this.weth.mint(addr1, '1000000');

        await this.dai.approve(this.swap.address, '1000000');
        await this.weth.approve(this.swap.address, '1000000');
        await this.dai.approve(this.swap.address, '1000000', { from: wallet });
        await this.weth.approve(this.swap.address, '1000000', { from: wallet });
    });

    // addr1 - msg.sender - 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266

    describe('Private Orders', async function () {
        it('should fill with correct taker', async function () {
            const order = buildOrder(this.swap, this.dai, this.weth, 1, 1, wallet, addr1);
            const data = buildOrderData(this.chainId, this.swap.address, order);
            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            const makerDai = await this.dai.balanceOf(wallet);
            const takerDai = await this.dai.balanceOf(addr1);
            const makerWeth = await this.weth.balanceOf(wallet);
            const takerWeth = await this.weth.balanceOf(addr1);

            await this.swap.fillOrder(order, signature, 1, 0, 1);

            expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
            expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
        });
    });

    it('should fill with when taker = maker', async function () {
        const order = buildOrder(this.swap, this.dai, this.weth, 1, 1, addr1, addr1);
        const data = buildOrderData(this.chainId, this.swap.address, order);
        const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

        const makerDai = await this.dai.balanceOf(wallet);
        const takerDai = await this.dai.balanceOf(addr1);
        const makerWeth = await this.weth.balanceOf(wallet);
        const takerWeth = await this.weth.balanceOf(addr1);

        await this.swap.fillOrder(order, signature, 1, 0, 1);

        expect(await this.dai.balanceOf(wallet)).to.be.bignumber.equal(makerDai.subn(1));
        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(takerDai.addn(1));
        expect(await this.weth.balanceOf(wallet)).to.be.bignumber.equal(makerWeth.addn(1));
        expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(takerWeth.subn(1));
    });


    it('should not fill with incorrect taker', async function () {
        const order = buildOrder(this.swap, this.dai, this.weth, 1, 1, addr1, wallet);
        const data = buildOrderData(this.chainId, this.swap.address, order);
        const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

        await expectRevert(
            this.swap.fillOrder(order, signature, 1, 0, 1),
            'LOP: private order',
        );
    });
});
