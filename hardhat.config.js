require('@matterlabs/hardhat-zksync-deploy');
require('@matterlabs/hardhat-zksync-solc');
require('@nomicfoundation/hardhat-chai-matchers');
require('solidity-coverage');
require('solidity-docgen');
require('hardhat-dependency-compiler');
require('hardhat-deploy');
require('hardhat-gas-reporter');
require('hardhat-tracer');
require('dotenv').config();
const { oneInchTemplates } = require('@1inch/solidity-utils/docgen');
const { Networks, getNetwork } = require('@1inch/solidity-utils/hardhat-setup');

if (getNetwork().indexOf('zksync') !== -1) {
    require('@matterlabs/hardhat-zksync-verify');
} else {
    require('@nomicfoundation/hardhat-verify');
}

const { networks, etherscan } = (new Networks()).registerAll();

module.exports = {
    etherscan,
    tracer: {
        enableAllOpcodes: true,
    },
    solidity: {
        version: '0.8.23',
        settings: {
            optimizer: {
                enabled: true,
                runs: 1_000_000,
            },
            evmVersion: networks[getNetwork()]?.hardfork || 'shanghai',
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
            '@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxyFactory.sol',
        ],
    },
    zksolc: {
        version: '1.4.0',
        compilerSource: 'binary',
        settings: {},
    },
    docgen: {
        outputDir: 'docs',
        templates: oneInchTemplates(),
        pages: 'files',
        exclude: ['mocks'],
    },
};
