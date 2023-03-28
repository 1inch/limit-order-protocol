const hre = require('hardhat');
const { getChainId } = hre;

module.exports = async ({ getNamedAccounts, deployments }) => {
    console.log('running deploy script');
    console.log('network id ', await getChainId());

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const seriesEpochManager = await deploy('SeriesEpochManager', {
        from: deployer,
    });

    console.log('SeriesEpochManager deployed to:', seriesEpochManager.address);

    if (await getChainId() !== '31337') {
        await hre.run('verify:verify', {
            address: seriesEpochManager.address,
        });
    }
};

module.exports.skip = async () => true;
