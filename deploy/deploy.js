const hre = require('hardhat');
const { getChainId } = hre;

module.exports = async ({ getNamedAccounts, deployments }) => {
    console.log('running deploy script');
    console.log('network id ', await getChainId());

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const limitOrderProtocol = await deploy('LimitOrderProtocol', {
        from: deployer,
    });

    console.log('LimitOrderProtocol deployed to:', limitOrderProtocol.address);

    if (await getChainId() !== '31337') {
        await hre.run('verify:verify', {
            address: limitOrderProtocol.address,
        });
    }
};

module.exports.skip = async () => true;
