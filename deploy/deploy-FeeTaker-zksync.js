const hre = require('hardhat');
const { getChainId } = hre;
const { deployAndGetContract } = require('@1inch/solidity-utils');

const WETH = {
    324: '0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91', // zksync
};

const ROUTER_V6_ADDR = '0x6fd4383cB451173D5f9304F041C7BCBf27d561fF';

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

    const constructorArgs = [ROUTER_V6_ADDR, WETH[chainId], deployer];
    const contractName = 'FeeTaker';

    await deployAndGetContract({
        contractName,
        constructorArgs,
        deployments,
        deployer,
    });
};

module.exports.skip = async () => true;
