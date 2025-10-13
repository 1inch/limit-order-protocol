const { deployAndGetContractWithCreate3, deployAndGetContract } = require('@1inch/solidity-utils');
const hre = require('hardhat');
const { ethers, getChainId } = hre;
const constants = require('../config/constants');

module.exports = async ({ deployments, getNamedAccounts }) => {
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

    if (networkName.indexOf('zksync') !== -1) { // zksync
        await deployAndGetContract({
            contractName: 'FeeTaker',
            constructorArgs: [constants.ROUTER_V6[chainId], constants.ACCESS_TOKEN[chainId], constants.WETH[chainId], deployer],
            deployments,
            deployer,
        });
    } else {
        const salt = constants.FEE_TAKER_SALT[chainId].startsWith('0x')
            ? constants.FEE_TAKER_SALT[chainId]
            : ethers.keccak256(ethers.toUtf8Bytes(constants.FEE_TAKER_SALT[chainId]));

        console.log(`Using salt: ${salt}`);
            
        await deployAndGetContractWithCreate3({
            contractName: 'FeeTaker',
            constructorArgs: [constants.ROUTER_V6[chainId], constants.ACCESS_TOKEN[chainId], constants.WETH[chainId], deployer],
            create3Deployer: constants.CREATE3_DEPLOYER[chainId],
            salt,
            deployments,
        });
    }
};

module.exports.skip = async () => true;
