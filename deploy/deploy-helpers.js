const { deployAndGetContract } = require('@1inch/solidity-utils');
const hre = require('hardhat');
const { getChainId } = hre;

const LOP = '0x111111125421cA6dc452d289314280a0f8842A65'; // All chains

module.exports = async ({ getNamedAccounts, deployments }) => {
    console.log('running deploy script');
    const chainId = await getChainId();
    console.log('network id ', chainId);

    const { deployer } = await getNamedAccounts();

    // SeriesNonceManager
    await deployAndGetContract({
        contractName: 'SeriesNonceManager',
        constructorArgs: [],
        deployments,
        deployer,
    });

    // CallsSimulator
    await deployAndGetContract({
        contractName: 'CallsSimulator',
        constructorArgs: [],
        deployments,
        deployer,
    });

    // PriorityFeeLimiter
    await deployAndGetContract({
        contractName: 'PriorityFeeLimiter',
        constructorArgs: [],
        deployments,
        deployer,
    });

    // OrderRegistrator
    const orderRegistrator = await deployAndGetContract({
        contractName: 'OrderRegistrator',
        constructorArgs: [LOP],
        deployments,
        deployer,
    });

    // SafeOrderBuilder
    await deployAndGetContract({
        contractName: 'SafeOrderBuilder',
        constructorArgs: [LOP, await orderRegistrator.getAddress()],
        deployments,
        deployer,
    });
};

module.exports.skip = async () => true;
