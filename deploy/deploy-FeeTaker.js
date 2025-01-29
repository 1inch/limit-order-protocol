const { deployAndGetContractWithCreate3 } = require('@1inch/solidity-utils');
const hre = require('hardhat');
const { ethers } = hre;
const { getChainId } = hre;

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
};

const ROUTER_V6_ADDR = '0x111111125421ca6dc452d289314280a0f8842a65';
const ACCESS_TOKEN_ADDR = '0xACCe550000159e70908C0499a1119D04e7039C28';

const FEE_TAKER_SALT = ethers.keccak256(ethers.toUtf8Bytes('FeeTaker'));

module.exports = async ({ deployments, getNamedAccounts }) => {
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

    await deployAndGetContractWithCreate3({
        contractName: 'FeeTaker',
        constructorArgs: [ROUTER_V6_ADDR, ACCESS_TOKEN_ADDR, WETH[chainId], deployer],
        create3Deployer: (await deployments.get('Create3Deployer')).address,
        salt: FEE_TAKER_SALT,
        deployments,
    });
};

module.exports.skip = async () => true;
