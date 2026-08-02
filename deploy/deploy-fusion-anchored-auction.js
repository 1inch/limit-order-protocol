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
        // The registrator is immutable in the auction contract, and every anchored fill reads it, so an
        // unset one produces a contract that can never price an anchored order.
        throw new Error(
            `No OrderRegistrator configured for chain ${chainId}. FusionAnchoredAuction reads announcements ` +
            'from it, so deploy the registrator first and record its address in config/constants.json.',
        );
    }

    if (networkName.indexOf('zksync') !== -1) { // create3 is not supported for zksync
        const { deployer } = await getNamedAccounts();

        await deployAndGetContract({
            contractName: 'FusionAnchoredAuction',
            constructorArgs: [orderRegistrator],
            deployments,
            deployer,
            skipVerify: process.env.OPS_SKIP_VERIFY === 'true',
        });
    } else {
        const salt = constants.FUSION_ANCHORED_AUCTION_SALT[chainId].startsWith('0x')
            ? constants.FUSION_ANCHORED_AUCTION_SALT[chainId]
            : ethers.keccak256(ethers.toUtf8Bytes(constants.FUSION_ANCHORED_AUCTION_SALT[chainId]));

        console.log(`Using salt: ${salt}`);

        await deployAndGetContractWithCreate3({
            contractName: 'FusionAnchoredAuction',
            constructorArgs: [orderRegistrator],
            create3Deployer: constants.CREATE3_DEPLOYER[chainId],
            salt,
            deployments,
            skipVerify: process.env.OPS_SKIP_VERIFY === 'true',
        });
    }
};

module.exports.skip = async () => true;
