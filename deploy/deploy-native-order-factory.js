const hre = require('hardhat');
const { getChainId, network, ethers } = hre;
const { deployAndGetContract, deployAndGetContractWithCreate3 } = require('@1inch/solidity-utils');
const constants = require('../config/constants');

module.exports = async ({ getNamedAccounts, deployments }) => {
    const networkName = network.name;
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

    let nativeOrderFactory;

    if (networkName.indexOf('zksync') !== -1) {
        const { deployer } = await getNamedAccounts();

        // Deploy on zkSync-like networks without create3
        nativeOrderFactory = await deployAndGetContract({
            contractName: 'NativeOrderFactory',
            constructorArgs: [constants.WETH[chainId], constants.ROUTER_V6[chainId], constants.ACCESS_TOKEN[chainId], 60, '1inch Aggregation Router', '6'],
            deployments,
            deployer,
        });
    } else {
        const salt = constants.NATIVE_ORDER_SALT[chainId].startsWith('0x')
            ? constants.NATIVE_ORDER_SALT[chainId]
            : ethers.keccak256(ethers.toUtf8Bytes(constants.NATIVE_ORDER_SALT[chainId]));

        nativeOrderFactory = await deployAndGetContractWithCreate3({
            contractName: 'NativeOrderFactory',
            constructorArgs: [constants.WETH[chainId], constants.ROUTER_V6[chainId], constants.ACCESS_TOKEN[chainId], 60, '1inch Aggregation Router', '6'],
            create3Deployer: constants.CREATE3_DEPLOYER[chainId],
            salt,
            deployments,
        });
    }

    if (chainId !== '31337') {
        const implementationAddress = await nativeOrderFactory.IMPLEMENTATION();
        console.log(`NativeOrderImpl deployed to: ${implementationAddress}`);

        await hre.run('verify:verify', {
            address: implementationAddress,
            constructorArguments: [constants.WETH[chainId], await nativeOrderFactory.getAddress(), constants.ROUTER_V6[chainId], constants.ACCESS_TOKEN[chainId], 60, '1inch Aggregation Router', '6'],
        });
    }
};

module.exports.skip = async () => true;
