const hre = require('hardhat');
const { getChainId } = hre;

const REGISTRY = '0xFC0E24F6Fe4765C8996591F5D3E43b7060ABa83B';

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
