const { utils } = require('ethers');

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
            .reduce((acc, val, i) => acc | BigInt(val) << BigInt(32 * i), 0n),
        data: '0x' + trimmed.join(''),
    };
}

function ether (num) {
    return utils.parseUnits(num);
}

function setn (num, bit, value) {
    if (value) {
        return BigInt(num) | (1n << BigInt(bit));
    } else {
        return BigInt(num) & (~(1n << BigInt(bit)));
    }
}

module.exports = {
    joinStaticCalls,
    price,
    ether,
    cutSelector,
    cutLastArg,
    getSelector,
    setn,
    trim0x,
};
