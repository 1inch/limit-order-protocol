const hre = require('hardhat');
const { getChainId } = hre;

const REGISTRY = '0xAc8D32a117799d58C5c10C7c23a9cD05f8Ce4F35';

module.exports = async ({ getNamedAccounts, deployments }) => {
    console.log('running deploy script');
    console.log('network id ', await getChainId());

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const whitelistChecker = await deploy('WhitelistChecker', {
        args: [REGISTRY],
        from: deployer,
    });

    console.log('WhitelistChecker deployed to:', whitelistChecker.address);

    if (await getChainId() !== '31337') {
        await hre.run('verify:verify', {
            address: whitelistChecker.address,
            constructorArguments: [REGISTRY]
        });
    }
};

module.exports.skip = async () => true;
