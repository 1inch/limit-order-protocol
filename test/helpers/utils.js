const { utils } = require('ethers');
const { BN } = require('bn.js');

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

function getSelector (data) {
    const hexPrefix = '0x';
    return data.substring(0, hexPrefix.length + 8);
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

function toBN (num, base) {
    if (typeof (num) === 'string' && num.startsWith('0x')) {
        return new BN(num.substring(2), 16);
    }
    return new BN(num, base);
}

function ether (num) {
    return utils.parseUnits(num);
}

module.exports = {
    joinStaticCalls,
    price,
    ether,
    cutSelector,
    cutLastArg,
    getSelector,
    toBN,
    trim0x,
};
