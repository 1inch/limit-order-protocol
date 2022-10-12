const hre = require('hardhat');
const { getChainId } = hre;
const { constants } = require('@1inch/solidity-utils');

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
    8217: '0xe4f05a66ec68b54a58b17c22107b02e0232cc817', // Klaytn
    31337: constants.ZERO_ADDRESS, // Hardhat
};

module.exports = async ({ getNamedAccounts, deployments }) => {
    console.log('running deploy script');
    const chainId = await getChainId();
    console.log('network id ', chainId);

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const args = [WETH[chainId]];
    const wethUnwrapper = await deploy('WethUnwrapper', {
        from: deployer,
        args,
    });

    console.log('WethUnwrapper deployed to:', wethUnwrapper.address);

    if (await getChainId() !== '31337') {
        await hre.run('verify:verify', {
            address: wethUnwrapper.address,
            constructorArguments: args,
        });
    }
};

module.exports.skip = async () => true;
