const hre = require('hardhat');
const { ethers } = hre;
const { getChainId } = hre;

const ROUTER_V6_ADDR = '0x111111125421ca6dc452d289314280a0f8842a65';

const ORDER_REGISTRATOR_SALT = ethers.keccak256(ethers.toUtf8Bytes('OrderRegistrator'));
const SAFE_ORDER_BUILDER_SALT = ethers.keccak256(ethers.toUtf8Bytes('SafeOrderBuilder'));

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

    const OrderRegistratorFactory = await ethers.getContractFactory('OrderRegistrator');

    const deployData = (await OrderRegistratorFactory.getDeployTransaction(ROUTER_V6_ADDR)).data;

    const txn = create3Deployer.deploy(ORDER_REGISTRATOR_SALT, deployData, { gasLimit: 5000000 });
    await (await txn).wait();

    const orderRegistratorAddr = await create3Deployer.addressOf(ORDER_REGISTRATOR_SALT);

    console.log('OrderRegistrator deployed to:', orderRegistratorAddr);

    const SafeOrderBuilderFactory = await ethers.getContractFactory('SafeOrderBuilder');

    const deployData2 = (await SafeOrderBuilderFactory.getDeployTransaction(ROUTER_V6_ADDR, orderRegistratorAddr)).data;

    const txn2 = create3Deployer.deploy(SAFE_ORDER_BUILDER_SALT, deployData2, { gasLimit: 5000000 });
    await (await txn2).wait();

    const safeOrderBuilderAddr = await create3Deployer.addressOf(SAFE_ORDER_BUILDER_SALT);

    console.log('SafeOrderBuilder deployed to:', safeOrderBuilderAddr);

    await sleep(5000); // wait for etherscan to index contract

    if (chainId !== '31337') {
        await hre.run('verify:verify', {
            address: orderRegistratorAddr,
            constructorArguments: [ROUTER_V6_ADDR],
        });

        await hre.run('verify:verify', {
            address: safeOrderBuilderAddr,
            constructorArguments: [ROUTER_V6_ADDR, orderRegistratorAddr],
        });
    }
};

module.exports.skip = async () => true;
