require('@matterlabs/hardhat-zksync-deploy');
require('@matterlabs/hardhat-zksync-solc');
require('@matterlabs/hardhat-zksync-verify');
require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-etherscan');
require('@nomicfoundation/hardhat-chai-matchers');
require('solidity-coverage');
require('hardhat-dependency-compiler');
require('hardhat-deploy');
require('hardhat-gas-reporter');
require('hardhat-tracer');
require('dotenv').config();

const { networks, etherscan } = require('./hardhat.networks');

module.exports = {
    etherscan,
    tracer: {
        enableAllOpcodes: true,
    },
    solidity: {
        version: '0.8.19',
        settings: {
            optimizer: {
                enabled: true,
                runs: 100,
            },
            viaIR: true,
        },
    },
    networks,
    namedAccounts: {
        deployer: {
            default: 0,
        },
    },
    gasReporter: {
        enable: true,
        currency: 'USD',
    },
    dependencyCompiler: {
        paths: [
            '@1inch/solidity-utils/contracts/mocks/TokenCustomDecimalsMock.sol',
            '@1inch/solidity-utils/contracts/mocks/TokenMock.sol',
        ],
    },
    zksolc: {
        version: '1.3.7',
        compilerSource: 'binary',
        settings: {},
    },
};
