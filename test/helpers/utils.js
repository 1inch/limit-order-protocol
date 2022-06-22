const { trim0x } = require('@1inch/solidity-utils');
const { BN, ether } = require('@openzeppelin/test-helpers');
const { assert, expect } = require('chai');

const addr1PrivateKey = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

function price (val) {
    return ether(val).toString();
}

function toBN (num, base) {
    return new BN(num, base === 'hex' ? 16 : base);
}

function cutSelector (data) {
    const hexPrefix = '0x';
    return hexPrefix + data.substring(hexPrefix.length + 8);
}

function cutLastArg (data, padding=0) {
    return data.substring(0, data.length - 64 - padding);
}

function composeCalldataForOptionalTarget (argumentsCount, target, defaultTarget, calldata) {
    return target.toLowerCase() === defaultTarget.toLowerCase()
        ? composeCalldataForDefaultTarget(argumentsCount, calldata)
        : composeCalldataForTarget(argumentsCount, target, calldata);
}

function composeCalldataForDefaultTarget (argumentsCount, calldata) {
    // Top bit 0 means target is default
    // Other bits 127 mean dyncam calldata offset and size are not missing
    const compact = trimOffsetAndLength(argumentsCount, trim0x(calldata));
    return '0x' + argumentsCount.toString(16).padStart(2, '0') + trim0x(compact);
}

function concatHex (arr) {
    return arr.map(trim0x).join('');
}

function composeCalldataForTarget (argumentsCount, target, calldata) {
    // Top bit 1 means target is NOT default
    // Other bits 127 mean dyncam calldata offset and size are not missing
    const compact = trimOffsetAndLength(argumentsCount, trim0x(calldata));
    return '0x' + (128 + argumentsCount).toString(16).padStart(2, '0') + concatHex([target, compact]);
}

function trimOffsetAndLength (argumentsCount, data) {
    const trimmed = trim0x(data);
    const fixedLength = 4 + argumentsCount * 32;

    if (trimmed.length / 2 === fixedLength) {
        return trimmed;
    }

    const actualOffset = toBN(trimmed.substring(fixedLength * 2, fixedLength * 2 + 64), 'hex').toNumber();
    const expectedOffset = (argumentsCount + 1) * 32;
    expect(actualOffset).to.be.equal(expectedOffset);

    const dynamicLength = toBN(trimmed.substring(fixedLength * 2 + 64, fixedLength * 2 + 128), 'hex').toNumber();
    const paddedLength = trimmed.length / 2 - fixedLength - 64;
    expect(paddedLength - dynamicLength).to.be.gte(0).and.lt(32);

    return '0x' + concatHex([
        trimmed.substring(0, fixedLength * 2),
        trimmed.substring(fixedLength * 2 + 128, fixedLength * 2 + 128 + dynamicLength * 2),
    ]);
}

function joinStaticCalls (calldatas) {
    const cumulativeSum = (sum => value => sum += value)(0);
    return {
        offsets: calldatas
            .map(trim0x)
            .map(d => d.length / 2)
            .map(cumulativeSum)
            .reduce((acc, val, i) => acc.or(toBN(val).shln(32 * i)), toBN('0')),
        data: '0x' + calldatas.map(trim0x).join('')
    }
}

module.exports = {
    addr1PrivateKey,
    composeCalldataForOptionalTarget,
    composeCalldataForDefaultTarget,
    composeCalldataForTarget,
    joinStaticCalls,
    price,
    toBN,
    cutSelector,
    cutLastArg,
};
