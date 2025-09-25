const { deployAndGetContractWithCreate3 } = require('@1inch/solidity-utils');

const hre = require('hardhat');
const { ethers } = hre;
const { getChainId } = hre;
const constants = require('./constants');

module.exports = async ({ deployments }) => {
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

    const salt = constants.PERMIT2_WITNESS_PROXY_SALT[chainId].startsWith('0x')
        ? constants.PERMIT2_WITNESS_PROXY_SALT[chainId]
        : ethers.keccak256(ethers.toUtf8Bytes(constants.PERMIT2_WITNESS_PROXY_SALT[chainId]));

    await deployAndGetContractWithCreate3({
        contractName: 'Permit2WitnessProxy',
        constructorArgs: [constants.ROUTER_V6[chainId]],
        create3Deployer: constants.CREATE3_DEPLOYER[chainId],
        salt,
        deployments,
    });
};

module.exports.skip = async () => true;
