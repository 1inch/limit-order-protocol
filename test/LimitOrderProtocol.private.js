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
    let addr1;

    // addr1 - 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
    const privatekey = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
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
        [addr1] = await web3.eth.getAccounts();
    });

    beforeEach(async function () {
        this.dai = await TokenMock.new('DAI', 'DAI');
        this.weth = await WrappedTokenMock.new('WETH', 'WETH');

        this.swap = await LimitOrderProtocol.new();

        // We get the chain id from the contract because Ganache (used for coverage) does not return the same chain id
        // from within the EVM as from the JSON RPC interface.
        // See https://github.com/trufflesuite/ganache-core/issues/515
        this.chainId = await this.dai.getChainId();

        await this.dai.mint(addr1, '1000000');
        await this.weth.mint(addr1, '1000000');

        await this.dai.approve(this.swap.address, '1000000');
        await this.weth.approve(this.swap.address, '1000000');
    });

    it('should fill with when taker = maker and update amounts', async function () {
        const order = buildOrder(
            this.swap, this.weth, this.dai, 1  , 1,
            addr1,
            addr1
        );

        const data = buildOrderData(this.chainId, this.swap.address, order);
        const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

        await this.swap.fillOrder(order, signature, 1, 0, 1);

        expect(account.getAddressString().toLowerCase()).to.be.equal(addr1.toLowerCase());
        expect(account.getAddressString().toLowerCase()).to.be.equal('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
        expect(addr1.toLowerCase()).to.be.equal('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');

        expect(await this.weth.balanceOf(addr1)).not.to.be.bignumber.equal('1000000');
        expect(await this.dai.balanceOf(addr1)).not.to.be.bignumber.equal('1000000');
    });
});
