const { expect, trim0x, ether, time, toBN, assertRoughlyEqualValues } = require('@1inch/solidity-utils');
const { addr0Wallet, addr1Wallet, cutLastArg } = require('./helpers/utils');

const TokenMock = artifacts.require('TokenMock');
const WrappedTokenMock = artifacts.require('WrappedTokenMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');
const DutchAuctionCalculator = artifacts.require('DutchAuctionCalculator');

const { buildOrder, signOrder } = require('./helpers/orderUtils');

describe('Dutch auction', async () => {
    const [addr0, addr1] = [addr0Wallet.getAddressString(), addr1Wallet.getAddressString()];

    before(async () => {
        this.chainId = await web3.eth.getChainId();
        this.DutchAuctionCalculator = await DutchAuctionCalculator.new();
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

        this.ts = await time.latest();
        const startEndTs = toBN(this.ts).shln(128).or(toBN(this.ts).addn(86400));
        this.order = buildOrder(
            {
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                from: addr0,
            },
            {
                getMakingAmount: this.DutchAuctionCalculator.address + cutLastArg(trim0x(this.DutchAuctionCalculator.contract.methods.getMakingAmount(
                    startEndTs, ether('0.1'), ether('0.05'), ether('100'), 0,
                ).encodeABI()), 64),
                getTakingAmount: this.DutchAuctionCalculator.address + cutLastArg(trim0x(this.DutchAuctionCalculator.contract.methods.getTakingAmount(
                    startEndTs, ether('0.1'), ether('0.05'), ether('100'), 0,
                ).encodeABI()), 64),
            },
        );
        this.signature = signOrder(this.order, this.chainId, this.swap.address, addr0Wallet.getPrivateKey());

        this.makerDaiBefore = await this.dai.balanceOf(addr0);
        this.takerDaiBefore = await this.dai.balanceOf(addr1);
        this.makerWethBefore = await this.weth.balanceOf(addr0);
        this.takerWethBefore = await this.weth.balanceOf(addr1);
    });

    it('swap with makingAmount 50% time passed', async () => {
        await time.increaseTo(toBN(this.ts).addn(43200)); // 50% auction time
        await this.swap.fillOrder(this.order, this.signature, '0x', ether('100'), '0', ether('0.08'), { from: addr1 });

        expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(this.makerDaiBefore.sub(ether('100')));
        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(this.takerDaiBefore.add(ether('100')));
        assertRoughlyEqualValues(await this.weth.balanceOf(addr0), this.makerWethBefore.add(ether('0.075')), 1e-6);
        assertRoughlyEqualValues(await this.weth.balanceOf(addr1), this.takerWethBefore.sub(ether('0.075')), 1e-6);
    });

    it('swap with takingAmount 50% time passed', async () => {
        await time.increaseTo(toBN(this.ts).addn(43200)); // 50% auction time
        await this.swap.fillOrder(this.order, this.signature, '0x', '0', ether('0.075'), ether('100'), { from: addr1 });

        expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(this.makerDaiBefore.sub(ether('100')));
        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(this.takerDaiBefore.add(ether('100')));
        assertRoughlyEqualValues(await this.weth.balanceOf(addr0), this.makerWethBefore.add(ether('0.075')), 1e-6);
        assertRoughlyEqualValues(await this.weth.balanceOf(addr1), this.takerWethBefore.sub(ether('0.075')), 1e-6);
    });

    it('swap with makingAmount 0% time passed', async () => {
        await this.swap.fillOrder(this.order, this.signature, '0x', ether('100'), '0', ether('0.1'), { from: addr1 });

        expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(this.makerDaiBefore.sub(ether('100')));
        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(this.takerDaiBefore.add(ether('100')));
        assertRoughlyEqualValues(await this.weth.balanceOf(addr0), this.makerWethBefore.add(ether('0.1')), 1e-6);
        assertRoughlyEqualValues(await this.weth.balanceOf(addr1), this.takerWethBefore.sub(ether('0.1')), 1e-6);
    });

    it('swap with takingAmount 0% time passed', async () => {
        await this.swap.fillOrder(this.order, this.signature, '0x', '0', ether('0.1'), ether('100'), { from: addr1 });

        expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(this.makerDaiBefore.sub(ether('100')));
        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(this.takerDaiBefore.add(ether('100')));
        assertRoughlyEqualValues(await this.weth.balanceOf(addr0), this.makerWethBefore.add(ether('0.1')), 1e-6);
        assertRoughlyEqualValues(await this.weth.balanceOf(addr1), this.takerWethBefore.sub(ether('0.1')), 1e-6);
    });

    it('swap with makingAmount 100% time passed', async () => {
        await time.increaseTo(toBN(this.ts).addn(86500)); // >100% auction time
        await this.swap.fillOrder(this.order, this.signature, '0x', ether('100'), '0', ether('0.05'), { from: addr1 });

        expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(this.makerDaiBefore.sub(ether('100')));
        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(this.takerDaiBefore.add(ether('100')));
        assertRoughlyEqualValues(await this.weth.balanceOf(addr0), this.makerWethBefore.add(ether('0.05')), 1e-6);
        assertRoughlyEqualValues(await this.weth.balanceOf(addr1), this.takerWethBefore.sub(ether('0.05')), 1e-6);
    });

    it('swap with takingAmount 100% time passed', async () => {
        await time.increaseTo(toBN(this.ts).addn(86500)); // >100% auction time
        await this.swap.fillOrder(this.order, this.signature, '0x', '0', ether('0.05'), ether('100'), { from: addr1 });

        expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(this.makerDaiBefore.sub(ether('100')));
        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(this.takerDaiBefore.add(ether('100')));
        assertRoughlyEqualValues(await this.weth.balanceOf(addr0), this.makerWethBefore.add(ether('0.05')), 1e-6);
        assertRoughlyEqualValues(await this.weth.balanceOf(addr1), this.takerWethBefore.sub(ether('0.05')), 1e-6);
    });
});
