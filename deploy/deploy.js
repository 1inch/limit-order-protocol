const { deployAndGetContract } = require('@1inch/solidity-utils');

const hre = require('hardhat');
const { getChainId } = hre;
const constants = require('./constants');

module.exports = async ({ getNamedAccounts, deployments }) => {
    const networkName = hre.network.name;
    console.log(`running ${networkName} deploy script`);
    const chainId = await getChainId();
    console.log('network id ', chainId);

    if (
        networkName in hre.config.networks &&
        chainId !== hre.config.networks[networkName].chainId?.toString()
    ) {
        console.log(`network chain id: ${hre.config.networks[networkName].chainId}, your chain id ${chainId}`);
        console.log('skipping wrong chain id deployment');
        return;
    }

    const { deployer } = await getNamedAccounts();

    await deployAndGetContract({
        contractName: 'LimitOrderProtocol',
        constructorArgs: [constants.WETH[chainId]],
        deployments,
        deployer,
    });
};

module.exports.skip = async () => true;
