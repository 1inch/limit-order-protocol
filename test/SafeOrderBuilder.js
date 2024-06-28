const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect, constants, ether } = require('@1inch/solidity-utils');
const { buildOrder, buildTakerTraits } = require('./helpers/orderUtils');
const { ethers } = require('hardhat');
const { deploySwap, deployUSDC, deployUSDT } = require('./helpers/fixtures');
const { executeContractCallWithSigners } = require('@gnosis.pm/safe-contracts/dist');

describe('SafeOrderBuilder', function () {
    let addr;

    before(async function () {
        [addr] = await ethers.getSigners();
    });

    async function deployAndInit () {
        const { swap } = await deploySwap();
        const { usdc } = await deployUSDC();
        const { usdt } = await deployUSDT();

        const OrderRegistrator = await ethers.getContractFactory('OrderRegistrator');
        const registrator = await OrderRegistrator.deploy(swap);
        await registrator.waitForDeployment();
        const chainId = (await ethers.provider.getNetwork()).chainId;

        const GnosisSafeProxyFactory = await ethers.getContractFactory('GnosisSafeProxyFactory');
        const proxyFactoryContract = await GnosisSafeProxyFactory.deploy();
        await proxyFactoryContract.waitForDeployment();
        const GnosisSafe = await ethers.getContractFactory('GnosisSafe');
        const gnosisSafeContract = await GnosisSafe.deploy();
        await gnosisSafeContract.waitForDeployment();
        const CompatibilityFallbackHandler = await ethers.getContractFactory('CompatibilityFallbackHandler');
        const fallbackHandler = await CompatibilityFallbackHandler.deploy();
        await fallbackHandler.waitForDeployment();
        const SafeOrderBuilder = await ethers.getContractFactory('SafeOrderBuilder');
        const safeOrderBuilder = await SafeOrderBuilder.deploy(swap, registrator);
        await safeOrderBuilder.waitForDeployment();
        const AggregatorMock = await ethers.getContractFactory('AggregatorMock');
        const usdcOracle = await AggregatorMock.deploy(ether('0.00025'));
        await usdcOracle.waitForDeployment();
        const usdtOracle = await AggregatorMock.deploy(ether('0.00025'));
        await usdtOracle.waitForDeployment();

        const owner1SafeData = await gnosisSafeContract.interface.encodeFunctionData(
            'setup',
            [[addr.address], 1, constants.ZERO_ADDRESS, '0x', await fallbackHandler.getAddress(), constants.ZERO_ADDRESS, 0, constants.ZERO_ADDRESS],
        );

        const txn = await proxyFactoryContract.createProxy(await gnosisSafeContract.getAddress(), owner1SafeData);
        const receipt = await txn.wait();
        const safe = await GnosisSafe.attach(receipt.logs[1].args[0]);

        // workaround as safe lib expects old version of ethers
        // TODO: remove when safe lib is updated
        safe.address = await safe.getAddress();
        safeOrderBuilder.address = await safeOrderBuilder.getAddress();
        usdc.address = await usdc.getAddress();
        addr._signTypedData = addr.signTypedData;
        // end of workaround

        const order = buildOrder({
            makerAsset: await usdc.getAddress(),
            takerAsset: await usdt.getAddress(),
            makingAmount: 100n,
            takingAmount: 100n,
            maker: await safe.getAddress(),
        });

        await usdc.mint(await safe.getAddress(), 1000n);
        await usdt.mint(addr.address, 1000n);
        await usdt.approve(await swap.getAddress(), 1000n);
        await executeContractCallWithSigners(
            safe,
            usdc,
            'approve',
            [await swap.getAddress(), 1000n],
            [addr],
            false,
        );

        return { swap, usdc, usdt, registrator, chainId, safe, safeOrderBuilder, usdcOracle, usdtOracle, order };
    };

    const testCases = [
        [ether('0.00025'), ether('0.00025'), 1n, 1n],
        [ether('0.0002'), ether('0.00025'), 5n, 4n],
        [ether('0.00025'), ether('0.0002'), 4n, 5n],
        [ether('0.00025'), ether('0.0005'), 2n, 1n],
        [ether('0.0005'), ether('0.00025'), 1n, 2n],
        [ether('0.0003'), ether('0.0002'), 2n, 3n],
    ];

    for (const [makerOracleResult, takerOracleResult, numerator, denominator] of testCases) {
        const testName = `price change ${Number(100n * ether('0.00025') / makerOracleResult) / 100} ${Number(100n * ether('0.00025') / takerOracleResult) / 100}`;
        it(testName, async function () {
            const { swap, safe, registrator, safeOrderBuilder, usdcOracle, usdtOracle, order } = await loadFixture(deployAndInit);

            const tx = await executeContractCallWithSigners(
                safe,
                safeOrderBuilder,
                'buildAndSignOrder',
                [order, order.extension, [await usdcOracle.getAddress(), makerOracleResult, 1000], [await usdtOracle.getAddress(), takerOracleResult, 1000]],
                [addr],
                true,
            );

            order.takingAmount = order.takingAmount * numerator / denominator;

            const orderTuple = [order.salt, order.maker, order.receiver, order.makerAsset, order.takerAsset, order.makingAmount, order.takingAmount, order.makerTraits];
            await expect(tx).to.emit(registrator, 'OrderRegistered').withArgs(orderTuple, order.extension, '0x');

            const takerTraits = buildTakerTraits({
                makingAmount: true,
                threshold: 1000,
            });

            await swap.fillContractOrder(order, '0x', order.makingAmount, takerTraits.traits);
        });
    }
});
