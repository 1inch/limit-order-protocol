require('@eth-optimism/hardhat-ovm');
require('@nomiclabs/hardhat-truffle5');
require('solidity-coverage');
require('hardhat-deploy');
require('hardhat-gas-reporter');

require('dotenv').config();

if (process.env.MAINNET_RPC_URL == null) {
    throw new Error('Please specify MAINNET_RPC_URL in .env file');
}

const networks = require('./hardhat.networks');

module.exports = {
    ovm: {
        solcVersion: '0.7.6+commit.3b061308',
    },
    paths: {
        artifacts: './artifacts-ovm',
    },
    solidity: {
        version: '0.7.6',
        settings: {
            optimizer: {
                enabled: true,
                runs: 1000000,
            },
        },
    },
    gasReporter: {
        enable: true,
        currency: 'USD',
    },
};
