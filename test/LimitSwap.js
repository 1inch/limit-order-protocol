// const { expectRevert } = require('openzeppelin-test-helpers');
// const { expect } = require('chai');

const { fromRpcSig } = require('ethereumjs-util');
const ethSigUtil = require('eth-sig-util');
const Wallet = require('ethereumjs-wallet').default;

const TokenMock = artifacts.require('TokenMock');
const LimitSwap = artifacts.require('LimitSwap');

const { EIP712Domain, domainSeparator } = require('./helpers/eip712');

const Order = [
    { name: 'makerAsset', type: 'address' },
    { name: 'takerAsset', type: 'address' },
    { name: 'makerAssetData', type: 'bytes' },
    { name: 'takerAssetData', type: 'bytes' },
    { name: 'getMakerAmount', type: 'bytes' },
    { name: 'getTakerAmount', type: 'bytes' },
    { name: 'predicate', type: 'bytes' },
    { name: 'permitData', type: 'bytes' },
];

function hexToBuffer (hex) {
    return hex; //Buffer.from(hex.substr(hex.startsWith('0x') ? 2 : 0), 'hex');
}

contract('LimitSwap', async function ([_, wallet]) {
    const privatekey = '2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501201';
    const account = Wallet.fromPrivateKey(Buffer.from(privatekey, 'hex'));

    const zeroAddress = '0x0000000000000000000000000000000000000000';
    const name = '1inch Limit Order Protocol';
    const version = '1';
    const buildData = (chainId, verifyingContract, makerAsset, takerAsset, makerAssetData, takerAssetData, getMakerAmount, getTakerAmount, predicate, permitData) => ({
        primaryType: 'Order',
        types: { EIP712Domain, Order },
        domain: { name, version, chainId, verifyingContract },
        message: { makerAsset, takerAsset, makerAssetData, takerAssetData, getMakerAmount, getTakerAmount, predicate, permitData },
    });

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
        it('accepts owner signature', async function () {
            const data = buildData(
                this.chainId,
                this.swap.address,
                this.dai.address,
                this.weth.address,
                hexToBuffer(this.dai.contract.methods.transferFrom(wallet, zeroAddress, 1).encodeABI()),
                hexToBuffer(this.weth.contract.methods.transferFrom(zeroAddress, wallet, 1).encodeABI()),
                hexToBuffer(
                    '0x000000000000000000000000' + this.swap.address.substr(2) +
                    '0000000000000000000000000000000000000000000000000000000000000040' +
                    '0000000000000000000000000000000000000000000000000000000000000084' +
                    this.swap.contract.methods.getMakerAmount(1, 1, 0).encodeABI().substr(2, 68)
                ),
                hexToBuffer(
                    '0x000000000000000000000000' + this.swap.address.substr(2) +
                    '0000000000000000000000000000000000000000000000000000000000000040' +
                    '0000000000000000000000000000000000000000000000000000000000000084' +
                    this.swap.contract.methods.getTakerAmount(1, 1, 0).encodeABI().substr(2, 68)
                ),
                hexToBuffer("0x"),
                hexToBuffer("0x")
            );

            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });
            console.log('signature', signature);

            const receipt = await this.swap.fillOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makerAssetData: hexToBuffer(this.dai.contract.methods.transferFrom(wallet, zeroAddress, 1).encodeABI()),
                    takerAssetData: hexToBuffer(this.weth.contract.methods.transferFrom(zeroAddress, wallet, 1).encodeABI()),
                    getMakerAmount: hexToBuffer(
                        '0x000000000000000000000000' + this.swap.address.substr(2) +
                        '0000000000000000000000000000000000000000000000000000000000000040' +
                        '0000000000000000000000000000000000000000000000000000000000000084' +
                        this.swap.contract.methods.getMakerAmount(1, 1, 0).encodeABI().substr(2, 68)
                    ),
                    getTakerAmount: hexToBuffer(
                        '0x000000000000000000000000' + this.swap.address.substr(2) +
                        '0000000000000000000000000000000000000000000000000000000000000040' +
                        '0000000000000000000000000000000000000000000000000000000000000084' +
                        this.swap.contract.methods.getTakerAmount(1, 1, 0).encodeABI().substr(2, 68)
                    ),
                    predicate: hexToBuffer("0x"),
                    permitData: hexToBuffer("0x")
                },
                signature,
                1,
                0,
                false,
                "0x"
            );

            // expect(await this.token.nonces(owner)).to.be.bignumber.equal('1');
            // expect(await this.token.allowance(owner, spender)).to.be.bignumber.equal(value);
        });
    });
});
