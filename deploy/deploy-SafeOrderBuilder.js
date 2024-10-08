const hre = require('hardhat');
const { ethers, getChainId, getNamedAccounts } = hre;
const { deployAndGetContractWithCreate3, deployAndGetContract } = require('@1inch/solidity-utils');
const { getNetwork } = require('@1inch/solidity-utils/hardhat-setup');

const ROUTER_V6_ADDR = '0x111111125421ca6dc452d289314280a0f8842a65';
const ROUTER_V6_ADDR_ZKSYNC = '0x6fd4383cb451173d5f9304f041c7bcbf27d561ff';

const ORDER_REGISTRATOR_SALT = ethers.keccak256(ethers.toUtf8Bytes('OrderRegistrator'));
const SAFE_ORDER_BUILDER_SALT = ethers.keccak256(ethers.toUtf8Bytes('SafeOrderBuilder'));

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

    const { deployer } = await getNamedAccounts();

    if (getNetwork().indexOf('zksync') !== -1) {
        // ZkSync deploy without create3
        const orderRegistrator = await deployAndGetContract({
            contractName: 'OrderRegistrator',
            constructorArgs: [ROUTER_V6_ADDR_ZKSYNC],
            deploymentName: 'OrderRegistrator',
            deployments,
            deployer,
        });
        await deployAndGetContract({
            contractName: 'SafeOrderBuilder',
            constructorArgs: [ROUTER_V6_ADDR_ZKSYNC, await orderRegistrator.getAddress()],
            deploymentName: 'SafeOrderBuilder',
            deployments,
            deployer,
        });
    } else {
        const create3Deployer = await ethers.getContractAt('ICreate3Deployer', (await deployments.get('Create3Deployer')).address);

        const orderRegistrator = await deployAndGetContractWithCreate3({
            contractName: 'OrderRegistrator',
            constructorArgs: [ROUTER_V6_ADDR],
            deploymentName: 'OrderRegistrator',
            create3Deployer,
            salt: ORDER_REGISTRATOR_SALT,
            deployments,
        });
        await deployAndGetContractWithCreate3({
            contractName: 'SafeOrderBuilder',
            constructorArgs: [ROUTER_V6_ADDR, await orderRegistrator.getAddress()],
            deploymentName: 'SafeOrderBuilder',
            create3Deployer,
            salt: SAFE_ORDER_BUILDER_SALT,
            deployments,
        });
    }
};

module.exports.skip = async () => true;
