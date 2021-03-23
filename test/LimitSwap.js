// const { expectRevert } = require('openzeppelin-test-helpers');

const ethSigUtil = require('eth-sig-util');
const Wallet = require('ethereumjs-wallet').default;

const TokenMock = artifacts.require('TokenMock');
const LimitSwap = artifacts.require('LimitSwap');

const { EIP712Domain, domainSeparator } = require('./helpers/eip712');
const { profileEVM } = require('./helpers/profileEVM')

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
                this.dai.contract.methods.transferFrom(wallet, zeroAddress, 1).encodeABI(),
                this.weth.contract.methods.transferFrom(zeroAddress, wallet, 1).encodeABI(),
                (
                    '0x000000000000000000000000' + this.swap.address.substr(2) +
                    '0000000000000000000000000000000000000000000000000000000000000040' +
                    '0000000000000000000000000000000000000000000000000000000000000084' +
                    this.swap.contract.methods.getMakerAmount(1, 1, 0).encodeABI().substr(2, 68)
                ),
                (
                    '0x000000000000000000000000' + this.swap.address.substr(2) +
                    '0000000000000000000000000000000000000000000000000000000000000040' +
                    '0000000000000000000000000000000000000000000000000000000000000084' +
                    this.swap.contract.methods.getTakerAmount(1, 1, 0).encodeABI().substr(2, 68)
                ),
                "0x",
                "0x"
            );

            const signature = ethSigUtil.signTypedMessage(account.getPrivateKey(), { data });

            const receipt = await this.swap.fillOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makerAssetData: this.dai.contract.methods.transferFrom(wallet, zeroAddress, 1).encodeABI(),
                    takerAssetData: this.weth.contract.methods.transferFrom(zeroAddress, wallet, 1).encodeABI(),
                    getMakerAmount: (
                        '0x000000000000000000000000' + this.swap.address.substr(2) +
                        '0000000000000000000000000000000000000000000000000000000000000040' +
                        '0000000000000000000000000000000000000000000000000000000000000084' +
                        this.swap.contract.methods.getMakerAmount(1, 1, 0).encodeABI().substr(2, 68)
                    ),
                    getTakerAmount: (
                        '0x000000000000000000000000' + this.swap.address.substr(2) +
                        '0000000000000000000000000000000000000000000000000000000000000040' +
                        '0000000000000000000000000000000000000000000000000000000000000084' +
                        this.swap.contract.methods.getTakerAmount(1, 1, 0).encodeABI().substr(2, 68)
                    ),
                    predicate: "0x",
                    permitData: "0x"
                },
                signature,
                1,
                0,
                false,
                "0x"
            );

            expect(
                await profileEVM(receipt.tx, ['CALL', 'STATICCALL', 'SSTORE', 'SLOAD'])
            ).to.be.deep.equal([2, 1, 7, 7]);

            // expect(await this.token.nonces(owner)).to.be.bignumber.equal('1');
            // expect(await this.token.allowance(owner, spender)).to.be.bignumber.equal(value);
        });
    });
});
