const { Wallet } = require('zksync-web3');
const { Deployer } = require('@matterlabs/hardhat-zksync-deploy');

const WETH = '0x5aea5775959fbc2557cc8789bc1bf90a239d9a91';

module.exports = async (hre) => {
    console.log('running deploy script');
    console.log('network id ', await hre.getChainId());

    // Initialize the wallet.
    const wallet = new Wallet(process.env.ZKSYNC_PRIVATE_KEY);

    // Create deployer object and load the artifact of the contract we want to deploy.
    const deployer = new Deployer(hre, wallet);

    const WethUnwrapper = await deployer.loadArtifact('WethUnwrapper');
    const wethUnwrapper = await deployer.deploy(WethUnwrapper, [WETH]);
    console.log(`${WethUnwrapper.contractName} was deployed to ${wethUnwrapper.address}`);
    if (await hre.getChainId() !== '31337') {
        await hre.run('verify:verify', {
            address: wethUnwrapper.address,
            constructorArguments: [WETH],
        });
    }

    const SeriesEpochManager = await deployer.loadArtifact('SeriesEpochManager');
    const seriesEpochManager = await deployer.deploy(SeriesEpochManager);
    console.log(`${SeriesEpochManager.contractName} was deployed to ${seriesEpochManager.address}`);
    if (await hre.getChainId() !== '31337') {
        await hre.run('verify:verify', {
            address: seriesEpochManager.address,
        });
    }

    const CallsSimulator = await deployer.loadArtifact('CallsSimulator');
    const callsSimulator = await deployer.deploy(CallsSimulator);
    console.log(`${CallsSimulator.contractName} was deployed to ${callsSimulator.address}`);
    if (await hre.getChainId() !== '31337') {
        await hre.run('verify:verify', {
            address: callsSimulator.address,
        });
    }
};

module.exports.skip = async () => true;
