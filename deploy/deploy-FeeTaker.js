const hre = require('hardhat');
const { getChainId } = hre;

module.exports = async ({ getNamedAccounts, deployments }) => {
    console.log('running deploy script');
    const chainId = await getChainId();
    console.log('network id ', chainId);

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const feeTaker = await deploy('FeeTaker', {
        from: deployer,
    });

    console.log('FeeTaker deployed to:', feeTaker.address);

    if (chainId !== '31337') {
        await hre.run('verify:verify', {
            address: feeTaker.address,
        });
    }
};

module.exports.skip = async () => true;
