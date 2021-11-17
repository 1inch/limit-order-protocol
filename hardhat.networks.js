const networks = {};

if (process.env.MAINNET_RPC_URL && process.env.MAINNET_PRIVATE_KEY) {
    networks.mainnet = {
        url: process.env.MAINNET_RPC_URL,
        chainId: 1,
        accounts: [process.env.MAINNET_PRIVATE_KEY],
    };
}

if (process.env.BSC_RPC_URL && process.env.BSC_PRIVATE_KEY) {
    networks.bsc = {
        url: process.env.BSC_RPC_URL,
        chainId: 56,
        accounts: [process.env.BSC_PRIVATE_KEY],
    };
}

if (process.env.KOVAN_RPC_URL && process.env.KOVAN_PRIVATE_KEY) {
    networks.kovan = {
        url: process.env.KOVAN_RPC_URL,
        chainId: 42,
        accounts: [process.env.KOVAN_PRIVATE_KEY],
    };
}

if (process.env.MATIC_RPC_URL && process.env.MATIC_PRIVATE_KEY) {
    networks.matic = {
        url: process.env.MATIC_RPC_URL,
        chainId: 137,
        accounts: [process.env.MATIC_PRIVATE_KEY],
    };
}

if (process.env.ARBITRUM_RPC_URL && process.env.ARBITRUM_PRIVATE_KEY) {
    networks.arbitrum = {
        url: process.env.ARBITRUM_RPC_URL,
        chainId: 42161,
        accounts: [process.env.ARBITRUM_PRIVATE_KEY],
    };
}

if (process.env.ROPSTEN_RPC_URL && process.env.ROPSTEN_PRIVATE_KEY) {
    networks.ropsten = {
        url: process.env.ROPSTEN_RPC_URL,
        chainId: 3,
        accounts: [process.env.ROPSTEN_PRIVATE_KEY],
    };
}

module.exports = networks;
