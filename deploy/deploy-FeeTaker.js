const hre = require('hardhat');
const { getChainId } = hre;
const { deployAndGetContract } = require('@1inch/solidity-utils');

module.exports = async ({ deployments, getNamedAccounts }) => {
    const networkName = hre.network.name;
    console.log(`running ${networkName} deploy script`);
    const chainId = await getChainId();
    console.log('network id ', chainId);
    if (
        networkName in hre.config.networks[networkName] &&
        chainId !== hre.config.networks[networkName].chainId.toString()
    ) {
        console.log(`network chain id: ${hre.config.networks[networkName].chainId}, your chain id ${chainId}`);
        console.log('skipping wrong chain id deployment');
        return;
    }

    const { deployer } = await getNamedAccounts();

    const constructorArgs = [];
    const contractName = 'FeeTaker';
    const deploymentName = 'FeeTakerDeployment';

    await deployAndGetContract({
        contractName,
        constructorArgs,
        deployments,
        deployer,
        deploymentName,
    });
};

module.exports.skip = async () => true;
