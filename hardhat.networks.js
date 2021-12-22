const networks = {};

function register (name, chainId, url, privateKey) {
    if (url && privateKey) {
        networks[name] = {
            url,
            chainId,
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
register('optimistic', 10, process.env.OPTIMISTIC_RPC_URL, process.env.OPTIMISTIC_PRIVATE_KEY);
register('kovan-optimistic', 69, process.env.KOVAN_OPTIMISTIC_RPC_URL, process.env.KOVAN_OPTIMISTIC_PRIVATE_KEY);
register('matic', 137, process.env.MATIC_RPC_URL, process.env.MATIC_PRIVATE_KEY);
register('arbitrum', 42161, process.env.ARBITRUM_RPC_URL, process.env.ARBITRUM_PRIVATE_KEY);
register('ropsten', 3, process.env.ROPSTEN_RPC_URL, process.env.ROPSTEN_PRIVATE_KEY);
register('xdai', 100, process.env.XDAI_RPC_URL, process.env.XDAI_PRIVATE_KEY);
register('avax', 43114, process.env.AVAX_RPC_URL, process.env.AVAX_PRIVATE_KEY);

module.exports = networks;
