const { constants, trim0x } = require('@1inch/solidity-utils');
const { assert } = require('chai');
const { ethers } = require('ethers');
const { keccak256 } = require('ethers/lib/utils');
const { setn } = require('./utils');

const Order = [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'makerAsset', type: 'address' },
    { name: 'takerAsset', type: 'address' },
    { name: 'makingAmount', type: 'uint256' },
    { name: 'takingAmount', type: 'uint256' },
    { name: 'constraints', type: 'uint256' },
];

const ABIOrder = {
    type: 'tuple',
    name: 'order',
    components: Order,
};

const name = '1inch Limit Order Protocol';
const version = '4';

const _NO_PARTIAL_FILLS_FLAG = 255n;
const _ALLOW_MULTIPLE_FILLS_FLAG = 254n;
const _NO_PRICE_IMPROVEMENT_FLAG = 253n;
const _NEED_PREINTERACTION_FLAG = 252n;
const _NEED_POSTINTERACTION_FLAG = 251n;
const _NEED_EPOCH_CHECK_FLAG = 250n;
const _HAS_EXTENSION_FLAG = 249n;
const _USE_PERMIT2_FLAG = 248n;

function buildConstraints ({
    allowedSender = constants.ZERO_ADDRESS,
    shouldCheckEpoch = false,
    allowPartialFill = true,
    allowPriceImprovement = true,
    allowMultipleFills = true,
    usePermit2 = false,
    expiry = 0,
    nonce = 0,
    series = 0,
} = {}) {
    assert(BigInt(expiry) >= 0n && BigInt(expiry) < (1n << 40n), 'Expiry should be less than 40 bits');
    assert(BigInt(nonce) >= 0 && BigInt(nonce) < (1n << 40n), 'Nonce should be less than 40 bits');
    assert(BigInt(series) >= 0 && BigInt(series) < (1n << 40n), 'Series should be less than 40 bits');

    let res = '0x' +
        BigInt(series).toString(16).padStart(10, '0') +
        BigInt(nonce).toString(16).padStart(10, '0') +
        BigInt(expiry).toString(16).padStart(10, '0') +
        (BigInt(allowedSender) & ((1n << 80n) - 1n)).toString(16).padStart(20, '0'); // Truncate address to 80 bits

    assert(res.length === 52, 'Constraints should be 25 bytes long');

    if (allowMultipleFills) {
        res = '0x' + setn(BigInt(res), _ALLOW_MULTIPLE_FILLS_FLAG, true).toString(16).padStart(64, '0');
    }
    if (!allowPartialFill) {
        res = '0x' + setn(BigInt(res), _NO_PARTIAL_FILLS_FLAG, true).toString(16).padStart(64, '0');
    }
    if (!allowPriceImprovement) {
        res = '0x' + setn(BigInt(res), _NO_PRICE_IMPROVEMENT_FLAG, true).toString(16).padStart(64, '0');
    }
    if (shouldCheckEpoch) {
        res = '0x' + setn(BigInt(res), _NEED_EPOCH_CHECK_FLAG, true).toString(16).padStart(64, '0');
    }
    if (usePermit2) {
        res = '0x' + setn(BigInt(res), _USE_PERMIT2_FLAG, true).toString(16).padStart(64, '0');
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
        makingAmountGetter = '0x',
        takingAmountGetter = '0x',
        predicate = '0x',
        permit = '0x',
        preInteraction = '0x',
        postInteraction = '0x',
    } = {},
) {
    constraints = '0x' + setn(BigInt(constraints), _ALLOW_MULTIPLE_FILLS_FLAG, false).toString(16).padStart(64, '0');
    constraints = '0x' + setn(BigInt(constraints), _NO_PARTIAL_FILLS_FLAG, false).toString(16).padStart(64, '0');
    constraints = '0x' + setn(BigInt(constraints), _NO_PRICE_IMPROVEMENT_FLAG, false).toString(16).padStart(64, '0');
    constraints = '0x' + setn(BigInt(constraints), _NEED_EPOCH_CHECK_FLAG, false).toString(16).padStart(64, '0');

    return buildOrder(
        {
            maker,
            makerAsset,
            takerAsset,
            makingAmount,
            takingAmount,
            constraints,
        },
        {
            receiver,
            makerAssetData,
            takerAssetData,
            makingAmountGetter,
            takingAmountGetter,
            predicate,
            permit,
            preInteraction,
            postInteraction,
        },
    );
}

function buildOrder (
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
        makingAmountGetter = '0x',
        takingAmountGetter = '0x',
        predicate = '0x',
        permit = '0x',
        preInteraction = '0x',
        postInteraction = '0x',
    } = {},
) {
    const allInteractions = [
        makerAssetData,
        takerAssetData,
        makingAmountGetter,
        takingAmountGetter,
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
    } else if (allInteractionsConcat.length > 0) {
        extension += trim0x(constants.ZERO_ADDRESS) + offsets.toString(16).padStart(64, '0') + allInteractionsConcat;
    }

    let salt = '1';
    if (trim0x(extension).length > 0) {
        salt = BigInt(keccak256(extension)) & ((1n << 160n) - 1n); // Use 160 bit of extension hash
        constraints = BigInt(constraints) | (1n << _HAS_EXTENSION_FLAG);
    }

    if (trim0x(preInteraction).length > 0) {
        constraints = BigInt(constraints) | (1n << _NEED_PREINTERACTION_FLAG);
    }

    if (trim0x(postInteraction).length > 0) {
        constraints = BigInt(constraints) | (1n << _NEED_POSTINTERACTION_FLAG);
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

function buildOrderData (chainId, verifyingContract, order) {
    return {
        domain: { name, version, chainId, verifyingContract },
        types: { Order },
        value: order,
    };
}

async function signOrder (order, chainId, target, wallet) {
    const orderData = buildOrderData(chainId, target, order);
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
    buildConstraints,
    buildOrder,
    buildOrderRFQ,
    buildOrderData,
    signOrder,
    compactSignature,
    makeMakingAmount,
    makeUnwrapWeth,
    skipOrderPermit,
    name,
    version,
};
