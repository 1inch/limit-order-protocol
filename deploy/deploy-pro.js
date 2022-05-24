const hre = require('hardhat');
const { getChainId } = hre;

module.exports = async ({ getNamedAccounts, deployments }) => {
    console.log('running deploy script');
    console.log('network id ', await getChainId());

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const limitOrderProtocolPro = await deploy('LimitOrderProtocolPro', {
        from: deployer,
    });

    console.log('LimitOrderProtocolPro deployed to:', limitOrderProtocolPro.address);

    if (await getChainId() !== '31337') {
        await hre.run('verify:verify', {
            address: limitOrderProtocolPro.address,
        });
    }
};

module.exports.skip = async () => true;
