const networks = {
    hardhat: {
        forking: {
            url: process.env.MAINNET_RPC_URL,
        },
        accounts: {
            mnemonic: 'test test test test test test test test test test test junk',
        },
        gasPrice: 1000000000,
    },
};

function register (name, chainId, url, privateKey) {
    if (url && privateKey) {
        networks[name] = {
            url: url,
            chainId: chainId,
            gasPrice: 55000000000,
            accounts: [privateKey],
        };
        console.log(`Network '${name}' registered`);
    } else {
        console.log(`Network '${name}' not registered`);
    }
}

register('mainnet', 1, process.env.MAINNET_RPC_URL, process.env.MAINNET_PRIVATE_KEY);
register('bsc', 56, process.env.BSC_RPC_URL, process.env.BSC_PRIVATE_KEY);
register('kovan', 42, process.env.KOVAN_RPC_URL, process.env.KOVAN_PRIVATE_KEY);
register('matic', 137, process.env.MATIC_RPC_URL, process.env.MATIC_PRIVATE_KEY);
register('arbitrum', 42161, process.env.ARBITRUM_RPC_URL, process.env.ARBITRUM_PRIVATE_KEY);
register('kovan-optimistic', 69, process.env.KOVAN_OPTIMISTIC_RPC_URL, process.env.KOVAN_OPTIMISTIC_PRIVATE_KEY);
// 6d24be3ebd523cfea12ddac901fbaf375b3f930c1e4fd102da367efc4504894b isn't a real private key - just to make it compile
register('optimistic', 10, process.env.OPTIMISTIC_RPC_URL, '6d24be3ebd523cfea12ddac901fbaf375b3f930c1e4fd102da367efc4504894b');

module.exports = networks;
