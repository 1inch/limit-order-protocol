const { constants, toBN, trim0x, TypedDataVersion } = require('@1inch/solidity-utils');
const { signTypedData } = require('@metamask/eth-sig-util');
const { EIP712Domain } = require('./eip712');

const OrderRFQ = [
    { name: 'info', type: 'uint256' },
    { name: 'makerAsset', type: 'address' },
    { name: 'takerAsset', type: 'address' },
    { name: 'maker', type: 'address' },
    { name: 'allowedSender', type: 'address' },
    { name: 'makingAmount', type: 'uint256' },
    { name: 'takingAmount', type: 'uint256' },
];

const ABIOrderRFQ = {
    OrderRFQ: OrderRFQ.reduce((obj, item) => {
        obj[item.name] = item.type;
        return obj;
    }, {}),
};

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

const ABIOrder = {
    Order: Order.reduce((obj, item) => {
        obj[item.name] = item.type;
        return obj;
    }, {}),
};

const name = '1inch Limit Order Protocol';
const version = '3';

function buildOrder (
    {
        makerAsset,
        takerAsset,
        makingAmount,
        takingAmount,
        allowedSender = constants.ZERO_ADDRESS,
        receiver = constants.ZERO_ADDRESS,
        from: maker = constants.ZERO_ADDRESS,
    },
    {
        makerAssetData = '0x',
        takerAssetData = '0x',
        getMakingAmount = '0x',
        getTakingAmount = '0x',
        predicate = '0x',
        permit = '0x',
        preInteraction = '0x',
        postInteraction = '0x',
    } = {},
) {
    if (getMakingAmount === '') {
        getMakingAmount = '0x78'; // "x"
    }
    if (getTakingAmount === '') {
        getTakingAmount = '0x78'; // "x"
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

    const interactions = '0x' + allInteractions.map(trim0x).join('');

    // https://stackoverflow.com/a/55261098/440168
    const cumulativeSum = (sum => value => { sum += value; return sum; })(0);
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
    allowedSender = constants.ZERO_ADDRESS,
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
    return signTypedData({ privateKey, data, version: TypedDataVersion });
}

function signOrderRFQ (order, chainId, target, privateKey) {
    const data = buildOrderRFQData(chainId, target, order);
    return signTypedData({ privateKey, data, version: TypedDataVersion });
}

function compactSignature (signature) {
    const r = toBN(signature.substring(2, 66), 'hex');
    const s = toBN(signature.substring(66, 130), 'hex');
    const v = toBN(signature.substring(130, 132), 'hex');
    return {
        r: '0x' + r.toString('hex').padStart(64, '0'),
        vs: '0x' + v.subn(27).shln(255).add(s).toString('hex').padStart(64, '0'),
    };
}

function unwrapWeth (amount) {
    return toBN(amount).setn(252, 1).toString();
}

function makingAmount (amount) {
    return toBN(amount).setn(255, 1).toString();
}

function takingAmount (amount) {
    return toBN(amount).toString();
}

module.exports = {
    ABIOrderRFQ,
    ABIOrder,
    buildOrder,
    buildOrderRFQ,
    buildOrderData,
    buildOrderRFQData,
    signOrder,
    signOrderRFQ,
    compactSignature,
    makingAmount,
    takingAmount,
    unwrapWeth,
    name,
    version,
};
