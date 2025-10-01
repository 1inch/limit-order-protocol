const hre = require('hardhat');
const { getChainId, network } = hre;
const { deployAndGetContract, deployAndGetContractWithCreate3 } = require('@1inch/solidity-utils');

const WETH = {
    1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // Mainnet
    56: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // BSC
    137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // Matic
    42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // Arbitrum
    10: '0x4200000000000000000000000000000000000006', // Optimistic
    43114: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', // Avalanche
    100: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d', // xDAI
    250: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83', // FTM
    1313161554: '0xC9BdeEd33CD01541e1eeD10f90519d2C06Fe3feB', // Aurora
    8217: '0xe4f05A66Ec68B54A58B17c22107b02e0232cC817', // Klaytn
    8453: '0x4200000000000000000000000000000000000006', // Base
    31337: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // Hardhat
    59144: '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f', // Linea
    146: '0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38', // Sonic
    130: '0x4200000000000000000000000000000000000006', // Unichain
    324: '0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91', // zksync
};

const ROUTER_V6_ADDR = '0x111111125421ca6dc452d289314280a0f8842a65';
const ACCESS_TOKEN_ADDR = '0xAcce5500000f71A32B5E5514D1577E14b7aacC4a';
const ZKSYNC_ROUTER_V6_ADDR = '0x6fd4383cB451173D5f9304F041C7BCBf27d561fF';
const ZKSYNC_ACCESS_TOKEN_ADDR = '0x4888651051B2Dc08Ac55Cd0f7D671e0FCba0DEED';
const create3Deployer = '0xD935a2bb926019E0ed6fb31fbD5b1Bbb7c05bf65';
const SALT_PROD = hre.ethers.keccak256(hre.ethers.toUtf8Bytes('NativeOrderFactory'));

module.exports = async ({ getNamedAccounts, deployments }) => {
    console.log('running deploy script');
    const chainId = await getChainId();
    console.log('network id ', chainId);

    const { deployer } = await getNamedAccounts();
    let nativeOrderFactory;
    let router;
    let accessToken;

    if (network.name.indexOf('zksync') !== -1) {
        // Deploy on zkSync-like networks without create3
        router = ZKSYNC_ROUTER_V6_ADDR;
        accessToken = ZKSYNC_ACCESS_TOKEN_ADDR;
        nativeOrderFactory = await deployAndGetContract({
            contractName: 'NativeOrderFactory',
            constructorArgs: [WETH[chainId], ZKSYNC_ROUTER_V6_ADDR, ZKSYNC_ACCESS_TOKEN_ADDR, 60, '1inch Aggregation Router', '6'],
            deployments,
            deployer,
        });
    } else {
        // Deploy with create3
        router = ROUTER_V6_ADDR;
        accessToken = ACCESS_TOKEN_ADDR;
        nativeOrderFactory = await deployAndGetContractWithCreate3({
            contractName: 'NativeOrderFactory',
            constructorArgs: [WETH[chainId], ROUTER_V6_ADDR, ACCESS_TOKEN_ADDR, 60, '1inch Aggregation Router', '6'],
            create3Deployer,
            salt: SALT_PROD,
            deployments,
        });
    }
    const implementationAddress = await nativeOrderFactory.IMPLEMENTATION();
    console.log(`NativeOrderImpl deployed to: ${implementationAddress}`);

    await hre.run('verify:verify', {
        address: implementationAddress,
        constructorArguments: [WETH[chainId], await nativeOrderFactory.getAddress(), router, accessToken, 60, '1inch Aggregation Router', '6'],
    });
};

module.exports.skip = async () => true;
