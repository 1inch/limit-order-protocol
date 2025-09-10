const hre = require('hardhat');
const { getChainId, network } = hre;
const { deployAndGetContract } = require('@1inch/solidity-utils');

const wethByNetwork = {
    mainnet: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
};

const ROUTER_V6_ADDR = '0x111111125421ca6dc452d289314280a0f8842a65';
const ACCESS_TOKEN_ADDR = '0xAcce5500000f71A32B5E5514D1577E14b7aacC4a';

module.exports = async ({ getNamedAccounts, deployments }) => {
    console.log('running deploy script');
    console.log('network id ', await getChainId());

    const { deployer } = await getNamedAccounts();

    const nativeOrderFactory = await deployAndGetContract({
        contractName: 'NativeOrderFactory',
        constructorArgs: [wethByNetwork[network.name], ROUTER_V6_ADDR, ACCESS_TOKEN_ADDR, 60, '1inch Aggregation Router', '6'],
        deployments,
        deployer,
        skipVerify: true,
    });
    console.log('NativeOrderFactory deployed to:', await nativeOrderFactory.getAddress());

    console.log('NativeOrderImpl deployed to:', await nativeOrderFactory.IMPLEMENTATION());
};

module.exports.skip = async () => true;
