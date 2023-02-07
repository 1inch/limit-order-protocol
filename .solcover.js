module.exports = {
    configureYulOptimizer: true,
    skipFiles: ['mocks', 'tests', 'interfaces'],
    mocha: {
        grep: "@skip-on-coverage",
        invert: true
    },
}
