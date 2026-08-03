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

    const orderRegistrator = constants.ORDER_REGISTRATOR[chainId];
    if (!orderRegistrator || orderRegistrator === ethers.ZeroAddress) {
        // The registrator is immutable in the helper, and every announcement goes through it, so an
        // unset one produces a helper whose executions always revert.
        throw new Error(
            `No OrderRegistrator configured for chain ${chainId}. SignAndAnnounce registers orders with ` +
            'it, so deploy the registrator first and record its address in config/constants.json.',
        );
    }

    const constructorArgs = [constants.ROUTER_V6[chainId], orderRegistrator];

    if (networkName.indexOf('zksync') !== -1) { // create3 is not supported for zksync
        const { deployer } = await getNamedAccounts();

        await deployAndGetContract({
            contractName: 'SignAndAnnounce',
            constructorArgs,
            deployments,
            deployer,
            skipVerify: process.env.OPS_SKIP_VERIFY === 'true',
        });
    } else {
        const salt = constants.SIGN_AND_ANNOUNCE_SALT[chainId].startsWith('0x')
            ? constants.SIGN_AND_ANNOUNCE_SALT[chainId]
            : ethers.keccak256(ethers.toUtf8Bytes(constants.SIGN_AND_ANNOUNCE_SALT[chainId]));

        console.log(`Using salt: ${salt}`);

        await deployAndGetContractWithCreate3({
            contractName: 'SignAndAnnounce',
            constructorArgs,
            create3Deployer: constants.CREATE3_DEPLOYER[chainId],
            salt,
            deployments,
            skipVerify: process.env.OPS_SKIP_VERIFY === 'true',
        });
    }
};

module.exports.skip = async () => true;
