const hre = require('hardhat');
const { getChainId } = hre;

module.exports = async ({ getNamedAccounts, deployments }) => {
    console.log('running deploy script');
    console.log('network id ', await getChainId());

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const wethUnwrapper = await deploy('WethUnwrapper', {
        from: deployer,
        skipIfAlreadyDeployed: true,
    });

    console.log('WethUnwrapper deployed to:', wethUnwrapper.address);

    if (await getChainId() !== '31337') {
        await hre.run('verify:verify', {
            address: wethUnwrapper.address,
        });
    }
};

module.exports.skip = async () => true;
