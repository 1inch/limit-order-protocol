module.exports = {
    copyPackages: ['@1inch/solidity-utils', '@openzeppelin/contracts'],
    skipFiles: ['mocks', 'tests'],
    mocha: {
        grep: "@skip-on-coverage",
        invert: true
    },
}
