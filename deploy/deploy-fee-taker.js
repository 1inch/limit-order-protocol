const { deployAndGetContractWithCreate3, deployAndGetContract } = require('@1inch/solidity-utils');
const hre = require('hardhat');
const { ethers, getChainId } = hre;
const constants = require('./constants');

const FEE_TAKER_SALT = ethers.keccak256(ethers.toUtf8Bytes('FeeTakerV1'));

module.exports = async ({ deployments, getNamedAccounts }) => {
    const networkName = hre.network.name;
    console.log(`running ${networkName} deploy script`);
    const chainId = await getChainId();
    console.log('network id ', chainId);

    if (
        networkName in hre.config.networks &&
        chainId !== hre.config.networks[networkName].chainId.toString()
    ) {
        console.log(`network chain id: ${hre.config.networks[networkName].chainId}, your chain id ${chainId}`);
        console.log('skipping wrong chain id deployment');
        return;
    }

    const { deployer } = await getNamedAccounts();

    if (chainId === '324') { // zksync
        await deployAndGetContract({
            contractName: 'FeeTaker',
            constructorArgs: [constants.ROUTER_V6[chainId], constants.ACCESS_TOKEN[chainId], constants.WETH[chainId], deployer],
            deployments,
            deployer,
        });
    } else {
        await deployAndGetContractWithCreate3({
            contractName: 'FeeTaker',
            constructorArgs: [constants.ROUTER_V6[chainId], constants.ACCESS_TOKEN[chainId], constants.WETH[chainId], deployer],
            create3Deployer: constants.CREATE3_DEPLOYER[chainId],
            salt: FEE_TAKER_SALT,
            deployments,
        });
    }
};

module.exports.skip = async () => true;
