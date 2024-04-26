const hre = require('hardhat');
const { ethers } = hre;
const { getChainId } = hre;

const ROUTER_V6_ADDR = '0x111111125421ca6dc452d289314280a0f8842a65';

const PERMIT2_WITNESS_PROXY_SALT = ethers.keccak256(ethers.toUtf8Bytes('Permit2WitnessProxy'));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async ({ deployments }) => {
    const networkName = hre.network.name;
    console.log(`running ${networkName} deploy script`);
    const chainId = await getChainId();
    console.log('network id ', chainId);
    if (
        networkName in hre.config.networks[networkName] &&
        chainId !== hre.config.networks[networkName].chainId.toString()
    ) {
        console.log(`network chain id: ${hre.config.networks[networkName].chainId}, your chain id ${chainId}`);
        console.log('skipping wrong chain id deployment');
        return;
    }

    const create3Deployer = await ethers.getContractAt('ICreate3Deployer', (await deployments.get('Create3Deployer')).address);

    const Permit2WitnessProxyFactory = await ethers.getContractFactory('Permit2WitnessProxy');

    const deployData = (await Permit2WitnessProxyFactory.getDeployTransaction(ROUTER_V6_ADDR)).data;

    const txn = create3Deployer.deploy(PERMIT2_WITNESS_PROXY_SALT, deployData, { gasLimit: 5000000 });
    await (await txn).wait();

    const permit2WitnessProxyAddr = await create3Deployer.addressOf(PERMIT2_WITNESS_PROXY_SALT);

    console.log('Permit2WitnessProxy deployed to:', permit2WitnessProxyAddr);

    await sleep(5000); // wait for etherscan to index contract

    if (chainId !== '31337') {
        await hre.run('verify:verify', {
            address: permit2WitnessProxyAddr,
            constructorArguments: [ROUTER_V6_ADDR],
        });
    }
};

module.exports.skip = async () => true;
