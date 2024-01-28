const hre = require('hardhat');
const { getChainId } = hre;

module.exports = async ({ getNamedAccounts, deployments }) => {
    console.log('running deploy script');
    const chainId = await getChainId();
    console.log('network id ', chainId);

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

    const callsSimulator = await deploy('CallsSimulator', {
        from: deployer,
    });

    console.log('CallsSimulator deployed to:', callsSimulator.address);

    if (await getChainId() !== '31337') {
        await hre.run('verify:verify', {
            address: callsSimulator.address,
        });
    }

    const priorityFeeLimiter = await deploy('PriorityFeeLimiter', {
        from: deployer,
    });

    console.log('PriorityFeeLimiter deployed to:', priorityFeeLimiter.address);

    if (await getChainId() !== '31337') {
        await hre.run('verify:verify', {
            address: priorityFeeLimiter.address,
        });
    }
};

module.exports.skip = async () => true;
