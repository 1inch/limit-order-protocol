const hre = require('hardhat');
const { getChainId } = hre;
const constants = require('./constants');

module.exports = async ({ getNamedAccounts, deployments }) => {
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

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const limitOrderProtocol = await deploy('LimitOrderProtocol', {
        from: deployer,
        args: [constants.WETH[chainId]],
    });

    console.log('LimitOrderProtocol deployed to:', limitOrderProtocol.address);

    if (chainId !== '31337') {
        await hre.run('verify:verify', {
            address: limitOrderProtocol.address,
            constructorArguments: [constants.WETH[chainId]],
        });
    }
};

module.exports.skip = async () => true;
