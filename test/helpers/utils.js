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

function composeCalldataForOptionalTarget (target, defaultTarget, calldata) {
    return target.toLowerCase() === defaultTarget.toLowerCase()
        ? composeCalldataForDefaultTarget(calldata)
        : composeCalldataForTarget(target, calldata);
}

function composeCalldataForDefaultTarget (calldata) {
    // Top bit 0 means target is default
    // Other bits 127 mean dyncam calldata offset and size are not missing
    return '0x7F' + trim0x(calldata);
}

function composeCalldataForTarget (target, calldata) {
    // Top bit 1 means target is NOT default
    // Other bits 127 mean dyncam calldata offset and size are not missing
    return '0xFF' + trim0x(target) + trim0x(calldata);
}

function compactABI (argumentsCount, data) {
    const fixedLength = 4 + argumentsCount * 32;

    if (trim0x(data).length / 2 === fixedLength) {
        console.log('n', argumentsCount, fixedLength, data);
        return '0x' + argumentsCount.toString(16).padStart(2, '0') + trim0x(data);
    }

    console.log('y', argumentsCount, fixedLength, trim0x(data).length, data);

    expect(trim0x(data).substring(fixedLength * 2, fixedLength * 2 + 64))
        .to.be.equal(toBN((argumentsCount + 1) * 32).toString('hex').padStart(64, '0'));
    expect(
        toBN(trim0x(data).substring(fixedLength * 2 + 64, fixedLength * 2 + 128), 'hex')
            .sub(toBN(trim0x(data).length / 2 - fixedLength - 64))
    ).to.be.bignumber.lt(toBN(32));

    return '0x' +
        argumentsCount.toString(16).padStart(2, '0') +
        trim0x(data.substring(0, fixedLength)) +
        trim0x(data.substring(fixedLength + 64, data.length));
}

function joinStaticCalls (targets, calldatas, defaultTarget) {
    const data = calldatas.map((cd, i) => trim0x(composeCalldataForOptionalTarget(targets[i], defaultTarget, cd)));
    const cumulativeSum = (sum => value => sum += value)(0);
    return {
        offsets: data
            .map(d => d.length / 2)
            .map(cumulativeSum)
            .reduce((acc, val, i) => acc.or(toBN(val).shln(32 * i)), toBN('0')),
        data: '0x' + data.join('')
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
    compactABI,
};
