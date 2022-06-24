const { toBN, ether } = require('@1inch/solidity-utils');
const Wallet = require('ethereumjs-wallet').default;

const addr0Wallet = Wallet.fromPrivateKey(Buffer.from('ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', 'hex'));
const addr1Wallet = Wallet.fromPrivateKey(Buffer.from('59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', 'hex'));

function price (val) {
    return ether(val).toString();
}

function trim0x (bigNumber) {
    const s = bigNumber.toString();
    if (s.startsWith('0x')) {
        return s.substring(2);
    }
    return s;
}

function cutSelector (data) {
    const hexPrefix = '0x';
    return hexPrefix + data.substring(hexPrefix.length + 8);
}

function cutLastArg (data, padding = 0) {
    return data.substring(0, data.length - 64 - padding);
}

function joinStaticCalls (dataArray) {
    const trimmed = dataArray.map(trim0x);
    const cumulativeSum = (sum => value => { sum += value; return sum; })(0);
    return {
        offsets: trimmed
            .map(d => d.length / 2)
            .map(cumulativeSum)
            .reduce((acc, val, i) => acc.or(toBN(val).shln(32 * i)), toBN('0')),
        data: '0x' + trimmed.join(''),
    };
}

module.exports = {
    addr0Wallet,
    addr1Wallet,
    joinStaticCalls,
    price,
    cutSelector,
    cutLastArg,
    trim0x,
};
