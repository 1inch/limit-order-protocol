const constants = require('./constants.json');

module.exports = {
    WETH: constants.weth || {},
    ROUTER_V6: constants.routerV6 || {},
    ACCESS_TOKEN: constants.accessToken || {},
    CREATE3_DEPLOYER: constants.create3Deployer || {},
    ORDER_REGISTRATOR: constants.orderRegistrator || {},
    FEE_TAKER_SALT: constants.feeTakerSalt || {},
    PERMIT2_WITNESS_PROXY_SALT: constants.permit2WitnessProxySalt || {},
};
