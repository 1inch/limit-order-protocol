const { constants, trim0x } = require('@1inch/solidity-utils');
const { assert } = require('chai');
const { ethers } = require('ethers');
const { keccak256 } = require('ethers/lib/utils');

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

const name = '1inch Limit Order Protocol';
const version = '3';

function buildConstraints ({
    allowedSender = constants.ZERO_ADDRESS,
    allowMultipleFills = true,
    expiry = 0,
    nonce = 0,
    series = 0,
} = {}) {
    assert(series >= 0 && series < 256, 'Series should be less than 256');

    let res = '0x' +
        BigInt(series).toString(16).padStart(2, '0') +
        BigInt(nonce).toString(16).padStart(10, '0') +
        BigInt(expiry).toString(16).padStart(10, '0') +
        BigInt(allowedSender).toString(16).padStart(40, '0');

    assert(res.length === 64, 'Constraints should be 64 bytes long');

    if (allowMultipleFills) {
        res = '0x' + (BigInt(res) | (1n << 254n)).toString(16).padStart(64, '0');
    }
    return res;
}

function buildOrderRFQ (
    {
        maker,
        makerAsset,
        takerAsset,
        makingAmount,
        takingAmount,
        constraints = '0',
    },
    {
        receiver = '0x',
        makerAssetData = '0x',
        takerAssetData = '0x',
        getMakingAmount = '0x',
        getTakingAmount = '0x',
        predicate = '0x',
        permit = '0x',
        preInteraction = '0x',
        postInteraction = '0x',
    } = {}
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

    const allInteractionsConcat = allInteractions.map(trim0x).join('');

    // https://stackoverflow.com/a/55261098/440168
    const cumulativeSum = (sum => value => { sum += value; return sum; })(0);
    const offsets = allInteractions
        .map(a => a.length / 2 - 1)
        .map(cumulativeSum)
        .reduce((acc, a, i) => acc + (BigInt(a) << BigInt(32 * i)), 0n);

    let extension = '0x';
    if (trim0x(receiver).length > 0) {
        extension += trim0x(receiver);
        if (allInteractionsConcat.length > 0) {
            extension += offsets.toString(16).padStart(64, '0') + allInteractionsConcat;
        }
    }
    else if (allInteractionsConcat.length > 0) {
        extension += trim0x(constants.ZERO_ADDRESS) + offsets.toString(16).padStart(64, '0') + allInteractionsConcat;
    }

    let salt = '1';
    if (trim0x(extension).length > 0) {
        salt = keccak256(extension);
        constraints = BigInt(constraints) | (1n << 249n);
    }

    return {
        salt,
        maker,
        makerAsset,
        takerAsset,
        makingAmount,
        takingAmount,
        constraints,
        extension,
    };
}

function buildOrderRFQData (chainId, verifyingContract, order) {
    return {
        domain: { name, version, chainId, verifyingContract },
        types: { OrderRFQ },
        value: order,
    };
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
    ABIOrderRFQ,
    buildConstraints,
    buildOrderRFQ,
    buildOrderRFQData,
    signOrderRFQ,
    compactSignature,
    makeMakingAmount,
    makeUnwrapWeth,
    skipOrderPermit,
    name,
    version,
};
