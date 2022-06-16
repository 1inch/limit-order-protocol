const { constants } = require('@openzeppelin/test-helpers');
const ethSigUtil = require('eth-sig-util');
const { EIP712Domain } = require('./eip712');
const { toBN, cutLastArg } = require('./utils');

const OrderRFQ = [
    { name: 'info', type: 'uint256' },
    { name: 'makerAsset', type: 'address' },
    { name: 'takerAsset', type: 'address' },
    { name: 'maker', type: 'address' },
    { name: 'allowedSender', type: 'address' },
    { name: 'makingAmount', type: 'uint256' },
    { name: 'takingAmount', type: 'uint256' },
];

const Order = [
    { name: 'salt', type: 'uint256' },
    { name: 'makerAsset', type: 'address' },
    { name: 'takerAsset', type: 'address' },
    { name: 'maker', type: 'address' },
    { name: 'receiver', type: 'address' },
    { name: 'allowedSender', type: 'address' },
    { name: 'makingAmount', type: 'uint256' },
    { name: 'takingAmount', type: 'uint256' },
    { name: 'offsets', type: 'uint256' },
    { name: 'interactions', type: 'bytes' },
];

const name = '1inch Limit Order Protocol';
const version = '3';

function buildOrder (
    {
        exchange,
        makerAsset,
        takerAsset,
        makingAmount,
        takingAmount,
        allowedSender = constants.ZERO_ADDRESS,
        receiver = constants.ZERO_ADDRESS,
        from: maker = constants.ZERO_ADDRESS,
    },
    {
        makerAssetData = constants.ZERO_ADDRESS,
        takerAssetData = '0x',
        getMakingAmount = '',
        getTakingAmount = '',
        predicate = '0x',
        permit = '0x',
        preInteraction = '0x',
        postInteraction = '0x',
    } = {}
) {
    if (getMakingAmount === '') {
        getMakingAmount = '0x6d'; // 'm'
        // cutLastArg(exchange.contract.methods.getMakingAmount(makingAmount, takingAmount, 0).encodeABI());
    }
    if (getTakingAmount === '') {
        getTakingAmount = '0x74'; // 't'
        // cutLastArg(exchange.contract.methods.getTakingAmount(makingAmount, takingAmount, 0).encodeABI());
    }

    const allInteractions = [
        makerAssetData,
        takerAssetData,
        getMakingAmount,
        getTakingAmount,
        predicate,
        permit,
        preInteraction,
        postInteraction,
    ];

    const interactions = '0x' + allInteractions.map(a => a.substring(2)).join('');

    // https://stackoverflow.com/a/55261098/440168
    const cumulativeSum = (sum => value => sum += value)(0);
    const offsets = allInteractions
        .map(a => a.length / 2 - 1)
        .map(cumulativeSum)
        .reduce((acc, a, i) => acc.add(toBN(a).shln(32 * i)), toBN('0'));

    return {
        salt: '1',
        makerAsset,
        takerAsset,
        maker,
        receiver,
        allowedSender,
        makingAmount: makingAmount.toString(),
        takingAmount: takingAmount.toString(),
        offsets: offsets.toString(),
        interactions,
    };
}

function buildOrderRFQ (
    info,
    makerAsset,
    takerAsset,
    makingAmount,
    takingAmount,
    from,
    allowedSender = constants.ZERO_ADDRESS
) {
    return {
        info,
        makerAsset,
        takerAsset,
        maker: from,
        allowedSender,
        makingAmount,
        takingAmount,
    };
}

function buildOrderData (chainId, verifyingContract, order) {
    return {
        primaryType: 'Order',
        types: { EIP712Domain, Order },
        domain: { name, version, chainId, verifyingContract },
        message: order,
    };
}

function buildOrderRFQData (chainId, verifyingContract, order) {
    return {
        primaryType: 'OrderRFQ',
        types: { EIP712Domain, OrderRFQ },
        domain: { name, version, chainId, verifyingContract },
        message: order,
    };
}

function signOrder (order, chainId, target, privateKey) {
    const data = buildOrderData(chainId, target, order);
    return ethSigUtil.signTypedMessage(privateKey, { data });
}

function signOrderRFQ (order, chainId, target, privateKey) {
    const data = buildOrderRFQData(chainId, target, order);
    return ethSigUtil.signTypedMessage(privateKey, { data });
}

module.exports = {
    buildOrder,
    buildOrderRFQ,
    buildOrderData,
    buildOrderRFQData,
    signOrder,
    signOrderRFQ,
    name,
    version,
};
