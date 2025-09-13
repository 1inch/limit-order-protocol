const { deployAndGetContract, deployAndGetContractWithCreate3 } = require('@1inch/solidity-utils');
const hre = require('hardhat');
const { ethers, getChainId } = hre;
const constants = require('./constants');

module.exports = async ({ getNamedAccounts, deployments, config }) => {
    const networkName = hre.network.name;
    console.log('running deploy script');
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

    const lopHelperNames = config.deployOpts?.lopHelperNames;

    console.log('Lop helper names to deploy:', lopHelperNames);

    const helperOrder = ['SeriesNonceManager', 'CallsSimulator', 'PriorityFeeLimiter', 'OrderRegistrator', 'SafeOrderBuilder'];
    const sortedLopHelperNames = lopHelperNames
        ? helperOrder.filter(name => lopHelperNames.includes(name))
        : [];

    let orderRegistrator;

    let DEPLOYMENT_METHOD = config.deployOpts?.deploymentMethod || 'create3';

    if (chainId === '324') { // create3 is not supported for zksync
        DEPLOYMENT_METHOD = 'create';
    }

    for (const helperName of sortedLopHelperNames) {
        let args = [];
        switch (helperName) {
        case 'OrderRegistrator':
            args = [constants.ROUTER_V6[chainId]];
            break;
        case 'SafeOrderBuilder':
            args = [constants.ROUTER_V6[chainId], orderRegistrator ? await orderRegistrator.getAddress() : constants.ORDER_REGISTRATOR[chainId]];
            break;
        }

        console.log(`Deploying ${helperName} with args: ${JSON.stringify(args)}`);
        console.log(`Using deployment method: ${DEPLOYMENT_METHOD}`);

        let result;

        if (DEPLOYMENT_METHOD === 'create3') {
            result = await deployAndGetContractWithCreate3({
                contractName: helperName,
                constructorArgs: args,
                deploymentName: helperName,
                create3Deployer: constants.CREATE3_DEPLOYER[chainId],
                salt: ethers.keccak256(ethers.toUtf8Bytes(helperName)),
                deployments,
            });
        } else {
            const { deployer } = await getNamedAccounts();

            result = await deployAndGetContract({
                contractName: helperName,
                constructorArgs: args,
                deployments,
                deployer,
            });
        }

        console.log(`Address for ${helperName}: ${await result.getAddress()}`);

        if (helperName === 'OrderRegistrator') {
            orderRegistrator = result;
        }
    }
};

module.exports.skip = async () => true;
