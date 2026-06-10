const { deployAndGetContractWithCreate3, deployAndGetContract } = require('@1inch/solidity-utils');

const hre = require('hardhat');
const { ethers, getChainId } = hre;
const { permit2Address } = require('@uniswap/permit2-sdk');
const constants = require('../config/constants');

module.exports = async ({ deployments }) => {
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

    const PERMIT2_ADDRESS = permit2Address(Number(chainId));
    const { deployer } = await getNamedAccounts();

    if (networkName.indexOf('zksync') !== -1) { // zksync
        await deployAndGetContract({
            contractName: 'Permit2Proxy',
            constructorArgs: [constants.ROUTER_V6[chainId], PERMIT2_ADDRESS],
            deployments,
            deployer,
            skipVerify: process.env.OPS_SKIP_VERIFY === 'true',
        });
    } else {
        const salt = constants.PERMIT2_PROXY_SALT[chainId].startsWith('0x')
            ? constants.PERMIT2_PROXY_SALT[chainId]
            : ethers.keccak256(ethers.toUtf8Bytes(constants.PERMIT2_PROXY_SALT[chainId]));

        console.log(`Using salt: ${salt}`);
            
        await deployAndGetContractWithCreate3({
            contractName: 'Permit2Proxy',
            constructorArgs: [constants.ROUTER_V6[chainId], PERMIT2_ADDRESS],
            create3Deployer: constants.CREATE3_DEPLOYER[chainId],
            salt,
            deployments,
            skipVerify: process.env.OPS_SKIP_VERIFY === 'true',
        });
    }
};

module.exports.skip = async () => true;
