const fs = require('fs');
const path = require('path');

// Read and parse the constants JSON file
const constantsPath = path.join(__dirname, 'constants.json');
const constants = JSON.parse(fs.readFileSync(constantsPath, 'utf8'));

module.exports = {
    WETH: constants.weth || {},
    ROUTER_V6: constants.routerV6 || {},
    ACCESS_TOKEN: constants.accessToken || {},
    CREATE3_DEPLOYER: constants.create3Deployer || {},
    ORDER_REGISTRATOR: constants.orderRegistrator || {},
    FEE_TAKER_SALT: constants.feeTakerSalt || {},
    PERMIT2_WITNESS_PROXY_SALT: constants.permit2WitnessProxySalt || {},
};

module.exports.skip = async () => true;
