const { expect, trim0x, ether, time } = require('@1inch/solidity-utils');
const { addr0Wallet, addr1Wallet } = require('./helpers/utils');

const TokenMock = artifacts.require('TokenMock');
const WrappedTokenMock = artifacts.require('WrappedTokenMock');
const WethUnwrapper = artifacts.require('WethUnwrapper');
const WhitelistChecker = artifacts.require('WhitelistChecker');
const WhitelistRegistryMock = artifacts.require('WhitelistRegistryMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');
const RecursiveMatcher = artifacts.require('RecursiveMatcher');
const DutchAuction = artifacts.require('DutchAuction');
const HashChecker = artifacts.require('HashChecker');

const { buildOrder, signOrder } = require('./helpers/orderUtils');

describe('Interactions', async () => {
    const [addr0, addr1] = [addr0Wallet.getAddressString(), addr1Wallet.getAddressString()];

    before(async () => {
        this.chainId = await web3.eth.getChainId();
    });

    beforeEach(async () => {
        this.dai = await TokenMock.new('DAI', 'DAI');
        this.weth = await WrappedTokenMock.new('WETH', 'WETH');

        this.swap = await LimitOrderProtocol.new(this.weth.address);

        await this.dai.mint(addr0, ether('100'));
        await this.dai.mint(addr1, ether('100'));
        await this.weth.deposit({ from: addr0, value: ether('1') });
        await this.weth.deposit({ from: addr1, value: ether('1') });

        await this.dai.approve(this.swap.address, ether('100'));
        await this.dai.approve(this.swap.address, ether('100'), { from: addr1 });
        await this.weth.approve(this.swap.address, ether('1'));
        await this.weth.approve(this.swap.address, ether('1'), { from: addr1 });
    });

    describe('whitelist', async () => {
        beforeEach(async () => {
            this.notificationReceiver = await WethUnwrapper.new(this.weth.address);
            this.whitelistRegistryMock = await WhitelistRegistryMock.new();
            this.whitelistChecker = await WhitelistChecker.new(this.whitelistRegistryMock.address);
        });

        it('should fill and unwrap token', async () => {
            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
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

            await this.swap.fillOrder(order, signature, '0x', ether('100'), 0, ether('0.1'));

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.sub(ether('100')));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.add(ether('100')));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth);
            expect(web3.utils.toBN(await web3.eth.getBalance(addr1))).to.be.bignumber.equal(web3.utils.toBN(makerEth).add(ether('0.1')));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.sub(ether('0.1')));
        });

        it('should check whitelist and fill and unwrap token', async () => {
            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
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
            await this.swap.fillOrder(order, signature, '0x', ether('100'), 0, ether('0.1'));

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.sub(ether('100')));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.add(ether('100')));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth);
            expect(web3.utils.toBN(await web3.eth.getBalance(addr1))).to.be.bignumber.equal(web3.utils.toBN(makerEth).add(ether('0.1')));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.sub(ether('0.1')));
        });

        it('should revert transaction when address is not allowed by whitelist', async () => {
            const preInteraction = this.whitelistChecker.address;

            const order = buildOrder(
                {
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
    describe('dutch auction', async () => {
        beforeEach(async () => {
            this.dutchAuction = await DutchAuction.new();
        });

        it.only('swap with makingAmount', async () => {
            const ts = await time.latest();
            const auctionParams = trim0x(web3.eth.abi.encodeParameters(
                ['uint32', 'uint32', 'uint256', 'uint256'],
                [
                    ts,
                    ts.addn(86400),
                    ether('100'),
                    ether('50'),
                ],
            ));

            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    from: addr0,
                },
                {
                    getMakingAmount: this.dutchAuction.address + trim0x(web3.eth.abi.encodeFunctionSignature('getMakingAmount(bytes,uint256,uint256,bytes32)')) + auctionParams,
                    getTakingAmount: this.dutchAuction.address + trim0x(web3.eth.abi.encodeFunctionSignature('getTakingAmount(bytes,uint256,uint256,bytes32)')) + auctionParams,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr0Wallet.getPrivateKey());
            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);
            const makerEth = await web3.eth.getBalance(addr1);

            await time.increaseTo(ts.addn(43200)); // 50% auction time
            await this.swap.fillOrder(order, signature, '0x', ether('100'), 0, ether('0.1'));

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.sub(ether('100')));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.add(ether('100')));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth);
            expect(web3.utils.toBN(await web3.eth.getBalance(addr1))).to.be.bignumber.equal(web3.utils.toBN(makerEth).add(ether('0.075')));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.sub(ether('0.075')));
        });
    });

    describe('recursive swap', async () => {
        beforeEach(async () => {
            this.matcher = await RecursiveMatcher.new();
        });

        it('opposite direction recursive swap', async () => {
            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    from: addr0,
                },
                {
                    predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
                },
            );

            const backOrder = buildOrder(
                {
                    makerAsset: this.weth.address,
                    takerAsset: this.dai.address,
                    makingAmount: ether('0.1'),
                    takingAmount: ether('100'),
                    from: addr1,
                },
                {
                    predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
                },
            );

            const signature = signOrder(order, this.chainId, this.swap.address, addr0Wallet.getPrivateKey());
            const signatureBackOrder = signOrder(backOrder, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const matchingParams = this.matcher.address + '01' + web3.eth.abi.encodeParameters(
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

            const interaction = this.matcher.address + '00' + this.swap.contract.methods.fillOrder(
                backOrder,
                signatureBackOrder,
                matchingParams,
                ether('0.1'),
                0,
                ether('100'),
            ).encodeABI().substring(10);

            const addr0weth = await this.weth.balanceOf(addr0);
            const addr1weth = await this.weth.balanceOf(addr1);
            const addr0dai = await this.dai.balanceOf(addr0);
            const addr1dai = await this.dai.balanceOf(addr1);

            await this.matcher.matchOrders(this.swap.address, order, signature, interaction, ether('100'), 0, ether('0.1'));

            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(addr0weth.add(ether('0.1')));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(addr1weth.sub(ether('0.1')));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(addr0dai.sub(ether('100')));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(addr1dai.add(ether('100')));
        });

        it('unidirectional recursive swap', async () => {
            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: ether('10'),
                    takingAmount: ether('0.01'),
                    from: addr1,
                },
                {
                    predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
                },
            );

            const backOrder = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: ether('15'),
                    takingAmount: ether('0.015'),
                    from: addr1,
                },
                {
                    predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
                },
            );

            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());
            const signatureBackOrder = signOrder(backOrder, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const matchingParams = this.matcher.address + '01' + web3.eth.abi.encodeParameters(
                ['address[]', 'bytes[]'],
                [
                    [
                        this.weth.address,
                        this.weth.address,
                        this.dai.address,
                    ],
                    [
                        this.weth.contract.methods.transferFrom(addr0, this.matcher.address, ether('0.025')).encodeABI(),
                        this.dai.contract.methods.approve(this.swap.address, ether('0.025')).encodeABI(),
                        this.weth.contract.methods.transfer(addr0, ether('25')).encodeABI(),
                    ],
                ],
            ).substring(2);

            const interaction = this.matcher.address + '00' + this.swap.contract.methods.fillOrder(
                backOrder,
                signatureBackOrder,
                matchingParams,
                ether('15'),
                0,
                ether('0.015'),
            ).encodeABI().substring(10);

            const addr0weth = await this.weth.balanceOf(addr0);
            const addr1weth = await this.weth.balanceOf(addr1);
            const addr0dai = await this.dai.balanceOf(addr0);
            const addr1dai = await this.dai.balanceOf(addr1);

            await this.weth.approve(this.matcher.address, ether('0.025'));
            await this.matcher.matchOrders(this.swap.address, order, signature, interaction, ether('10'), 0, ether('0.01'));

            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(addr0weth.sub(ether('0.025')));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(addr1weth.add(ether('0.025')));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(addr0dai.add(ether('25')));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(addr1dai.sub(ether('25')));
        });

        it('triple recursive swap', async () => {
            const order1 = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: ether('10'),
                    takingAmount: ether('0.01'),
                    from: addr1,
                },
                {
                    predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
                },
            );

            const order2 = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: ether('15'),
                    takingAmount: ether('0.015'),
                    from: addr1,
                },
                {
                    predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
                },
            );

            const backOrder = buildOrder(
                {
                    makerAsset: this.weth.address,
                    takerAsset: this.dai.address,
                    makingAmount: ether('0.025'),
                    takingAmount: ether('25'),
                    from: addr0,
                },
                {
                    predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
                },
            );

            const signature1 = signOrder(order1, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());
            const signature2 = signOrder(order2, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());
            const signatureBackOrder = signOrder(backOrder, this.chainId, this.swap.address, addr0Wallet.getPrivateKey());

            const matchingParams = this.matcher.address + '01' + web3.eth.abi.encodeParameters(
                ['address[]', 'bytes[]'],
                [
                    [
                        this.weth.address,
                        this.dai.address,
                    ],
                    [
                        this.weth.contract.methods.approve(this.swap.address, ether('0.025')).encodeABI(),
                        this.dai.contract.methods.approve(this.swap.address, ether('25')).encodeABI(),
                    ],
                ],
            ).substring(2);

            const internalInteraction = this.matcher.address + '00' + this.swap.contract.methods.fillOrder(
                backOrder,
                signatureBackOrder,
                matchingParams,
                ether('0.025'),
                0,
                ether('25'),
            ).encodeABI().substring(10);

            const externalInteraction = this.matcher.address + '00' + this.swap.contract.methods.fillOrder(
                order2,
                signature2,
                internalInteraction,
                ether('15'),
                0,
                ether('0.015'),
            ).encodeABI().substring(10);

            const addr0weth = await this.weth.balanceOf(addr0);
            const addr1weth = await this.weth.balanceOf(addr1);
            const addr0dai = await this.dai.balanceOf(addr0);
            const addr1dai = await this.dai.balanceOf(addr1);

            await this.matcher.matchOrders(this.swap.address, order1, signature1, externalInteraction, ether('10'), 0, ether('0.01'));

            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(addr0weth.sub(ether('0.025')));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(addr1weth.add(ether('0.025')));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(addr0dai.add(ether('25')));
            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(addr1dai.sub(ether('25')));
        });
    });

    describe('check hash', async () => {
        beforeEach(async () => {
            this.hashChecker = await HashChecker.new(this.swap.address);
        });

        it('should check hash and fill', async () => {
            const preInteraction = this.hashChecker.address;

            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    from: addr1,
                },
                {
                    preInteraction,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const makerDai = await this.dai.balanceOf(addr1);
            const takerDai = await this.dai.balanceOf(addr0);
            const makerWeth = await this.weth.balanceOf(addr1);
            const takerWeth = await this.weth.balanceOf(addr0);

            await this.hashChecker.setHashOrderStatus(order, true);
            await this.swap.fillOrder(order, signature, '0x', ether('100'), 0, ether('0.1'));

            expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(makerDai.sub(ether('100')));
            expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(takerDai.add(ether('100')));
            expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(makerWeth.add(ether('0.1')));
            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(takerWeth.sub(ether('0.1')));
        });

        it('should revert transaction when orderHash not equal target', async () => {
            const preInteraction = this.hashChecker.address;

            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    from: addr1,
                },
                {
                    preInteraction,
                },
            );
            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            await expect(this.swap.fillOrder(order, signature, '0x', ether('100'), 0, ether('0.1'))).to.eventually.be.rejectedWith('IncorrectOrderHash()');
        });
    });
});
