const hre = require('hardhat');
const { ethers, network, tracer } = hre;
const { expect, time, constants, getPermit2, permit2Contract } = require('@1inch/solidity-utils');
const { ABIOrder, fillWithMakingAmount, unwrapWethTaker, buildMakerTraits, buildMakerTraitsRFQ, buildOrder, signOrder, buildOrderData, buildTakerTraits } = require('./helpers/orderUtils');
const { getPermit, withTarget } = require('./helpers/eip712');
const { joinStaticCalls, ether, findTrace, countAllItems, withTrace, getEventArgs } = require('./helpers/utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens, deployArbitraryPredicate } = require('./helpers/fixtures');
const { parseUnits } = require('ethers');

describe('ZKSync one love', function () {
    let addr, addr1, addr2;
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();

    before(async function () {
        [addr, addr1, addr2] = await ethers.getSigners();
    });

    async function deployContractsAndInit () {
        const { dai, weth, usdc, swap, chainId } = await deploySwapTokens();
        const tokens = { dai, weth, usdc };
        const contracts = { swap };

        await dai.mint(addr1, ether('1000000'));
        await dai.mint(addr, ether('1000000'));
        await weth.deposit({ value: ether('100') });
        await weth.connect(addr1).deposit({ value: ether('100') });
        await dai.approve(swap, ether('1000000'));
        await dai.connect(addr1).approve(swap, ether('1000000'));
        await weth.approve(swap, ether('100'));
        await weth.connect(addr1).approve(swap, ether('100'));

        // Deploy access token for third-party cancellations
        const TokenMock = await ethers.getContractFactory('TokenMock');
        tokens.accessToken = await TokenMock.deploy('Access Token', 'ACCESS');
        await tokens.accessToken.waitForDeployment();

        await tokens.accessToken.mint(addr2, 1);

        const NativeOrderFactory = await ethers.getContractFactory('NativeOrderFactory');
        contracts.nativeOrderFactory = await NativeOrderFactory.deploy(weth, swap, tokens.accessToken, 60, '1inch Limit Order Protocol', '4');
        await contracts.nativeOrderFactory.waitForDeployment();
        const orderLibFactory = await ethers.getContractFactory('OrderLib');

        return { tokens, contracts, chainId, orderLibFactory };
    };

    describe('wip', function () {
        it.only('test', async function () {
            const { tokens: { dai, weth }, contracts: { nativeOrderFactory, swap } } = await loadFixture(deployContractsAndInit);
            const order = buildOrder(
                {
                    maker: addr1.address,
                    receiver: addr1.address,
                    makerAsset: await weth.getAddress(),
                    takerAsset: await dai.getAddress(),
                    makingAmount: ether('0.3'),
                    takingAmount: ether('300'),
                },
                {},
            );

            const deposittx = nativeOrderFactory.connect(addr1).create(order, { value: order.makingAmount });
            await expect(deposittx).to.changeEtherBalance(addr1, -order.makingAmount);
            // get cloneAddress and check its balance
            const receipt = await (await deposittx).wait();
            const cloneAddress = getEventArgs(receipt, nativeOrderFactory.interface, 'NativeOrderCreated')[2]; // index 2 is clone address
            expect(await weth.balanceOf(cloneAddress)).to.equal(order.makingAmount);

            const signature = abiCoder.encode([ABIOrder], [order]);
            /// Partial fill
            const takerTraits1 = buildTakerTraits({
                threshold: ether('0.2'),
                extension: order.extension,
            });
            order.maker = cloneAddress;
            const fillTx1 = swap.fillContractOrderArgs(order, signature, ether('200'), takerTraits1.traits, takerTraits1.args);
            await expect(fillTx1).to.changeTokenBalances(dai, [addr, cloneAddress, addr1], [ether('-200'), '0', ether('200')]);
            await expect(fillTx1).to.changeTokenBalances(weth, [addr, cloneAddress, addr1], [ether('0.2'), ether('-0.2'), '0']);
        });
    });
});
