const weth = require('./weth');
const routerV6 = require('./router-v6');
const accessToken = require('./access-token');
const create3Deployer = require('./create3-deployer');
const orderRegistrator = require('./order-registrator');

module.exports = {
    WETH: weth,
    ROUTER_V6: routerV6,
    ACCESS_TOKEN: accessToken,
    CREATE3_DEPLOYER: create3Deployer,
    ORDER_REGISTRATOR: orderRegistrator,
};

module.exports.skip = async () => true;
