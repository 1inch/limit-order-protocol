require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-truffle5');
require('solidity-coverage');
require('hardhat-deploy');
require('hardhat-gas-reporter');

module.exports = {
    networks: {
        hardhat: {
            accounts: [
                { privateKey: "0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501200", balance: "1000000000000000000000000" },
                { privateKey: "0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501201", balance: "1000000000000000000000000" },
                { privateKey: "0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501202", balance: "1000000000000000000000000" },
                { privateKey: "0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501203", balance: "1000000000000000000000000" },
                { privateKey: "0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501204", balance: "1000000000000000000000000" },
                { privateKey: "0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501205", balance: "1000000000000000000000000" },
                { privateKey: "0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501206", balance: "1000000000000000000000000" },
                { privateKey: "0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501207", balance: "1000000000000000000000000" },
                { privateKey: "0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501208", balance: "1000000000000000000000000" },
                { privateKey: "0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501209", balance: "1000000000000000000000000" },
            ]
        }
    },
    solidity: {
        version: '0.8.4',
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
