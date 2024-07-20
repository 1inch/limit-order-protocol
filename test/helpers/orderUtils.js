const { constants, trim0x } = require('@1inch/solidity-utils');
const { assert } = require('chai');
const { keccak256 } = require('ethers');
const { setn } = require('./utils');
const { ethers } = require('hardhat');

const Order = [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'receiver', type: 'address' },
    { name: 'makerAsset', type: 'address' },
    { name: 'takerAsset', type: 'address' },
    { name: 'makingAmount', type: 'uint256' },
    { name: 'takingAmount', type: 'uint256' },
    { name: 'makerTraits', type: 'uint256' },
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
const _NEED_PREINTERACTION_FLAG = 252n;
const _NEED_POSTINTERACTION_FLAG = 251n;
const _NEED_EPOCH_CHECK_FLAG = 250n;
const _HAS_EXTENSION_FLAG = 249n;
const _USE_PERMIT2_FLAG = 248n;
const _UNWRAP_WETH_FLAG = 247n;

const TakerTraitsConstants = {
    _MAKER_AMOUNT_FLAG: 1n << 255n,
    _UNWRAP_WETH_FLAG: 1n << 254n,
    _SKIP_ORDER_PERMIT_FLAG: 1n << 253n,
    _USE_PERMIT2_FLAG: 1n << 252n,
    _ARGS_HAS_TARGET: 1n << 251n,

    _ARGS_EXTENSION_LENGTH_OFFSET: 224n,
    _ARGS_EXTENSION_LENGTH_MASK: 0xffffff,
    _ARGS_INTERACTION_LENGTH_OFFSET: 200n,
    _ARGS_INTERACTION_LENGTH_MASK: 0xffffff,
};

function buildTakerTraits ({
    makingAmount = false,
    unwrapWeth = false,
    skipMakerPermit = false,
    usePermit2 = false,
    target = '0x',
    extension = '0x',
    interaction = '0x',
    threshold = 0n,
} = {}) {
    return {
        traits: BigInt(threshold) | (
            (makingAmount ? TakerTraitsConstants._MAKER_AMOUNT_FLAG : 0n) |
            (unwrapWeth ? TakerTraitsConstants._UNWRAP_WETH_FLAG : 0n) |
            (skipMakerPermit ? TakerTraitsConstants._SKIP_ORDER_PERMIT_FLAG : 0n) |
            (usePermit2 ? TakerTraitsConstants._USE_PERMIT2_FLAG : 0n) |
            (trim0x(target).length > 0 ? TakerTraitsConstants._ARGS_HAS_TARGET : 0n) |
            (BigInt(trim0x(extension).length / 2) << TakerTraitsConstants._ARGS_EXTENSION_LENGTH_OFFSET) |
            (BigInt(trim0x(interaction).length / 2) << TakerTraitsConstants._ARGS_INTERACTION_LENGTH_OFFSET)
        ),
        args: ethers.solidityPacked(
            ['bytes', 'bytes', 'bytes'],
            [target, extension, interaction],
        ),
    };
}

function buildMakerTraitsRFQ ({
    allowedSender = constants.ZERO_ADDRESS,
    shouldCheckEpoch = false,
    allowPartialFill = true,
    usePermit2 = false,
    unwrapWeth = false,
    expiry = 0,
    nonce = 0,
    series = 0,
} = {}) {
    return buildMakerTraits({
        allowedSender,
        shouldCheckEpoch,
        allowPartialFill,
        allowMultipleFills: false,
        usePermit2,
        unwrapWeth,
        expiry,
        nonce,
        series,
    });
}

function buildMakerTraits ({
    allowedSender = constants.ZERO_ADDRESS,
    shouldCheckEpoch = false,
    allowPartialFill = true,
    allowMultipleFills = true,
    usePermit2 = false,
    unwrapWeth = false,
    expiry = 0,
    nonce = 0,
    series = 0,
} = {}) {
    assert(BigInt(expiry) >= 0n && BigInt(expiry) < (1n << 40n), 'Expiry should be less than 40 bits');
    assert(BigInt(nonce) >= 0 && BigInt(nonce) < (1n << 40n), 'Nonce should be less than 40 bits');
    assert(BigInt(series) >= 0 && BigInt(series) < (1n << 40n), 'Series should be less than 40 bits');

    return '0x' + (
        (BigInt(series) << 160n) |
        (BigInt(nonce) << 120n) |
        (BigInt(expiry) << 80n) |
        (BigInt(allowedSender) & ((1n << 80n) - 1n)) |
        setn(0n, _UNWRAP_WETH_FLAG, unwrapWeth) |
        setn(0n, _ALLOW_MULTIPLE_FILLS_FLAG, allowMultipleFills) |
        setn(0n, _NO_PARTIAL_FILLS_FLAG, !allowPartialFill) |
        setn(0n, _NEED_EPOCH_CHECK_FLAG, shouldCheckEpoch) |
        setn(0n, _USE_PERMIT2_FLAG, usePermit2)
    ).toString(16).padStart(64, '0');
}

function buildOrderRFQ (
    {
        maker,
        receiver = constants.ZERO_ADDRESS,
        makerAsset,
        takerAsset,
        makingAmount,
        takingAmount,
        makerTraits = '0',
    },
    {
        makerAssetSuffix = '0x',
        takerAssetSuffix = '0x',
        makingAmountData = '0x',
        takingAmountData = '0x',
        predicate = '0x',
        permit = '0x',
        preInteraction = '0x',
        postInteraction = '0x',
    } = {},
) {
    makerTraits = '0x' + setn(BigInt(makerTraits), _ALLOW_MULTIPLE_FILLS_FLAG, false).toString(16).padStart(64, '0');
    makerTraits = '0x' + setn(BigInt(makerTraits), _NO_PARTIAL_FILLS_FLAG, false).toString(16).padStart(64, '0');
    makerTraits = '0x' + setn(BigInt(makerTraits), _NEED_EPOCH_CHECK_FLAG, false).toString(16).padStart(64, '0');

    return buildOrder(
        {
            maker,
            receiver,
            makerAsset,
            takerAsset,
            makingAmount,
            takingAmount,
            makerTraits,
        },
        {
            makerAssetSuffix,
            takerAssetSuffix,
            makingAmountData,
            takingAmountData,
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
        receiver = constants.ZERO_ADDRESS,
        makerAsset,
        takerAsset,
        makingAmount,
        takingAmount,
        makerTraits = buildMakerTraits(),
    },
    {
        makerAssetSuffix = '0x',
        takerAssetSuffix = '0x',
        makingAmountData = '0x',
        takingAmountData = '0x',
        predicate = '0x',
        permit = '0x',
        preInteraction = '0x',
        postInteraction = '0x',
        customData = '0x',
    } = {},
) {
    const allInteractions = [
        makerAssetSuffix,
        takerAssetSuffix,
        makingAmountData,
        takingAmountData,
        predicate,
        permit,
        preInteraction,
        postInteraction,
    ];

    const allInteractionsConcat = allInteractions.map(trim0x).join('') + trim0x(customData);

    // https://stackoverflow.com/a/55261098/440168
    const cumulativeSum = (sum => value => { sum += value; return sum; })(0);
    const offsets = allInteractions
        .map(a => a.length / 2 - 1)
        .map(cumulativeSum)
        .reduce((acc, a, i) => acc + (BigInt(a) << BigInt(32 * i)), 0n);

    let extension = '0x';
    if (allInteractionsConcat.length > 0) {
        extension += offsets.toString(16).padStart(64, '0') + allInteractionsConcat;
    }

    let salt = '1';
    if (trim0x(extension).length > 0) {
        salt = BigInt(keccak256(extension)) & ((1n << 160n) - 1n); // Use 160 bit of extension hash
        makerTraits = BigInt(makerTraits) | (1n << _HAS_EXTENSION_FLAG);
    }

    if (trim0x(preInteraction).length > 0) {
        makerTraits = BigInt(makerTraits) | (1n << _NEED_PREINTERACTION_FLAG);
    }

    if (trim0x(postInteraction).length > 0) {
        makerTraits = BigInt(makerTraits) | (1n << _NEED_POSTINTERACTION_FLAG);
    }

    return {
        salt,
        maker,
        receiver,
        makerAsset,
        takerAsset,
        makingAmount,
        takingAmount,
        makerTraits,
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
    return await wallet.signTypedData(orderData.domain, orderData.types, orderData.value);
}

function fillWithMakingAmount (amount) {
    return BigInt(amount) | BigInt(buildTakerTraits({ makingAmount: true }).traits);
}

function unwrapWethTaker (amount) {
    return BigInt(amount) | BigInt(buildTakerTraits({ unwrapWeth: true }).traits);
}

function skipMakerPermit (amount) {
    return BigInt(amount) | BigInt(buildTakerTraits({ skipMakerPermit: true }).traits);
}

function buildExtensionsBitmapData({
    whitelistSize = 1,
    feeType = 0,
} = {}) {
    const WHITELIST_BITMAP_OFFSET = 3; // Bitmap: VVVVVxxx
    const FEE_RESOLVER_FLAG = 1;
    const FEE_INTEGRATOR_FLAG = 2;
    return ethers.toBeHex(
        (whitelistSize << WHITELIST_BITMAP_OFFSET) |
        feeType & FEE_RESOLVER_FLAG |
        feeType & FEE_INTEGRATOR_FLAG,
    );
}

function buildFeeTakerPostInteractionData ({
    feeTaker,
    integratorFee = 0n,
    resolverFee = 0n,
    feeRecipient,
    whitelist = [],
    receiver,
}) {
    // * 2 bytes — Resolver fee percentage (in 1e5). Should be skipped if resolver fee usage flag is not setted.
    // * 2 bytes — Integrator fee percentage (in 1e5). Should be skipped if integration fee usage flag is not setted.
    // * (bytes10)[N] — Taker whitelist
    // * 20 bytes — Fee recipient. Should be skipped if used FeeBank or all fee flags is not setted.
    // * 20 bytes — Receiver of taking tokens (optional, if not set, maker is used)
    // * 1 byte - Bitmap indicating various usage flags and values.
    let data = feeTaker;
    if (BigInt(resolverFee) > 0n) {
        data += trim0x(ethers.toBeHex(resolverFee, 2));
    }
    if (BigInt(integratorFee) > 0n) {
        data += trim0x(ethers.toBeHex(integratorFee, 2));
    }
    const zippedWhitelist = whitelist.map(item => item.slice(-20));
    data += zippedWhitelist.join();
    if (feeRecipient) {
        data += trim0x(feeRecipient);
    }
    if (receiver) {
        data += trim0x(receiver);
    }

    const feeType = (BigInt(resolverFee) > 0n ? 1 : 0) + (BigInt(integratorFee) > 0n ? 2 : 0);
    data += trim0x(buildExtensionsBitmapData({ whitelistSize: whitelist.length, feeType }));
    return data;
}

module.exports = {
    ABIOrder,
    buildTakerTraits,
    buildMakerTraits,
    buildMakerTraitsRFQ,
    buildOrder,
    buildOrderRFQ,
    buildOrderData,
    signOrder,
    fillWithMakingAmount,
    unwrapWethTaker,
    skipMakerPermit,
    buildFeeTakerPostInteractionData,
    name,
    version,
};
