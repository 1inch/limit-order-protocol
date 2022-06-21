const { trim0x } = require('@1inch/solidity-utils');
const { BN, ether } = require('@openzeppelin/test-helpers');

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
    return '0x64' + trim0x(calldata); // 0x64 == "d", which means DEFAULT
}

function composeCalldataForTarget (target, calldata) {
    return '0x00' + trim0x(target) + trim0x(calldata);
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
};
