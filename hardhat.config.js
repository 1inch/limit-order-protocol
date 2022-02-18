require('@nomiclabs/hardhat-etherscan');
require('@nomiclabs/hardhat-truffle5');
require('solidity-coverage');
require('hardhat-deploy');
require('hardhat-gas-reporter');
require('dotenv').config();

const networks = require('./hardhat.networks');

module.exports = {
    solidity: {
        version: '0.8.11',
        settings: {
            optimizer: {
                enabled: true,
                runs: 1000000,
            },
        },
    },
    networks: networks,
    namedAccounts: {
        deployer: {
            default: 0,
        },
    },
    etherscan: {
        apiKey: {
            mainnet: process.env.MAINNET_ETHERSCAN_KEY,
            bsc: process.env.BSC_ETHERSCAN_KEY,
            optimisticEthereum: process.env.OPTIMISTIC_ETHERSCAN_KEY,
            polygon: process.env.MATIC_ETHERSCAN_KEY,
            arbitrumOne: process.env.ARBITRUM_ETHERSCAN_KEY,
            xdai: process.env.XDAI_ETHERSCAN_KEY,
            avalanche: process.env.AVAX_ETHERSCAN_KEY,
            kovan: process.env.KOVAN_ETHERSCAN_KEY,
        },
    },
    gasReporter: {
        enable: true,
        currency: 'USD',
    },
};
