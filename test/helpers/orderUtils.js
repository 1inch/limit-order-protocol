const { constants, trim0x } = require('@1inch/solidity-utils');
const { assert } = require('chai');
const { ethers } = require('ethers');

const OrderRFQ = [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'makerAsset', type: 'address' },
    { name: 'takerAsset', type: 'address' },
    { name: 'makingAmount', type: 'uint256' },
    { name: 'takingAmount', type: 'uint256' },
    { name: 'constraints', type: 'uint256' },
];

const ABIOrderRFQ = {
    type: 'tuple',
    name: 'order',
    components: OrderRFQ,
};

const Order = [
    { name: 'salt', type: 'uint256' },
    { name: 'makerAsset', type: 'address' },
    { name: 'takerAsset', type: 'address' },
    { name: 'makingAmount', type: 'uint256' },
    { name: 'takingAmount', type: 'uint256' },
    { name: 'constraints', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'receiver', type: 'address' },
    { name: 'offsets', type: 'uint256' },
    { name: 'interactions', type: 'bytes' },
];

const ABIOrder = {
    type: 'tuple',
    name: 'order',
    components: Order,
};

const name = '1inch Limit Order Protocol';
const version = '3';

function buildConstraints ({
    allowedSender = constants.ZERO_ADDRESS,
    expiry = 0,
    nonce = 0,
    series = 0,
} = {}) {
    assert(series >= 0 && series < 256, 'Series should be less than 256');
    const res = '0x' +
        BigInt(series).toString(16).padStart(2, '0') +
        BigInt(nonce).toString(16).padStart(10, '0') +
        BigInt(expiry).toString(16).padStart(10, '0') +
        BigInt(allowedSender).toString(16).padStart(40, '0');
    assert(res.length === 64, 'Constraints should be 64 bytes long');
    return res;
}

function buildOrder (
    {
        makerAsset,
        takerAsset,
        makingAmount,
        takingAmount,
        constraints = '0',
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
        .reduce((acc, a, i) => acc + (BigInt(a) << BigInt(32 * i)), 0n);

    return {
        salt: '1',
        makerAsset,
        takerAsset,
        maker,
        receiver,
        constraints,
        makingAmount: makingAmount.toString(),
        takingAmount: takingAmount.toString(),
        offsets: offsets.toString(),
        interactions,
    };
}

function buildOrderRFQ (
    maker,
    makerAsset,
    takerAsset,
    makingAmount,
    takingAmount,
    constraints = '0',
) {
    return {
        salt: '0',
        maker,
        makerAsset,
        takerAsset,
        makingAmount,
        takingAmount,
        constraints,
    };
}

function buildOrderData (chainId, verifyingContract, order) {
    return {
        domain: { name, version, chainId, verifyingContract },
        types: { Order },
        value: order,
    };
}

function buildOrderRFQData (chainId, verifyingContract, order) {
    return {
        domain: { name, version, chainId, verifyingContract },
        types: { OrderRFQ },
        value: order,
    };
}

async function signOrder (order, chainId, target, wallet) {
    const orderData = buildOrderData(chainId, target, order);
    return await wallet._signTypedData(orderData.domain, orderData.types, orderData.value);
}

async function signOrderRFQ (order, chainId, target, wallet) {
    const orderData = buildOrderRFQData(chainId, target, order);
    return await wallet._signTypedData(orderData.domain, orderData.types, orderData.value);
}

function compactSignature (signature) {
    const sig = ethers.utils.splitSignature(signature);
    return {
        r: sig.r,
        vs: sig._vs,
    };
}

function makeMakingAmount (amount) {
    return (BigInt(amount) | (1n << 255n)).toString();
}

function makeUnwrapWeth (amount) {
    return (BigInt(amount) | (1n << 254n)).toString();
}

function skipOrderPermit (amount) {
    return (BigInt(amount) | (1n << 253n)).toString();
}

module.exports = {
    ABIOrder,
    ABIOrderRFQ,
    buildConstraints,
    buildOrder,
    buildOrderRFQ,
    buildOrderData,
    buildOrderRFQData,
    signOrder,
    signOrderRFQ,
    compactSignature,
    makeMakingAmount,
    makeUnwrapWeth,
    skipOrderPermit,
    name,
    version,
};
