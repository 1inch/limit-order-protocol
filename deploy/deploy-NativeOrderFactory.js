const hre = require('hardhat');
const { getChainId, network } = hre;

const wethByNetwork = {
    hardhat: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    mainnet: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
};

const lop = {
    hardhat: '0x111111125421cA6dc452d289314280a0f8842A65',
    mainnet: '0x111111125421cA6dc452d289314280a0f8842A65',
};

const accessToken = {
    hardhat: '0xAccE550000863572B867E661647CD7D97b72C507',
    mainnet: '0xAccE550000863572B867E661647CD7D97b72C507',
};

module.exports = async ({ getNamedAccounts, deployments }) => {
    console.log('running deploy script');
    console.log('network id ', await getChainId());

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const nativeOrderFactory = await deploy('NativeOrderFactory', {
        from: deployer,
        args: [wethByNetwork[network.name], lop[network.name], accessToken[network.name], 60, '1inch Aggregation Router', '6'],
    });

    console.log('NativeOrderFactory deployed to:', nativeOrderFactory.address);
};

module.exports.skip = async () => true;
