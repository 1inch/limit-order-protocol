const hre = require('hardhat');
const { getChainId } = hre;

module.exports = async ({ getNamedAccounts, deployments }) => {
    console.log('running deploy script');
    console.log('network id ', await getChainId());

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const seriesNonceManager = await deploy('SeriesNonceManager', {
        from: deployer,
    });

    console.log('SeriesNonceManager deployed to:', seriesNonceManager.address);

    if (await getChainId() !== '31337') {
        await hre.run('verify:verify', {
            address: seriesNonceManager.address,
        });
    }
};

module.exports.skip = async () => true;
