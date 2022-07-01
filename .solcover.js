module.exports = {
    skipFiles: ['mocks', 'tests', 'interfaces'],
    mocha: {
        grep: "@skip-on-coverage",
        invert: true
    },
}
