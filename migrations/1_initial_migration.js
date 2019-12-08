const Migrations = artifacts.require('./Migrations.sol');
const OneDex = artifacts.require('./OneDex.sol');

module.exports = function (deployer) {
    deployer.deploy(Migrations);
    deployer.deploy(OneDex);
};
