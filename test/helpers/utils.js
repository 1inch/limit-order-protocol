const { parseUnits } = require('ethers');

function calculateGasUsed (trace, address) {
    // Count gas used by all calls to our contract
    const totalGasUsed = flattenTree([trace])
        .filter(t => t.opcode === 'CALL' && t.params.to.toLowerCase() === address.toLowerCase())
        .reduce((acc, t) => { acc += t.params.gasUsed; return acc; }, 0);

    // Count gas used by our contract calls and staticcalls (and not to itself)
    const totalSubtract = flattenTree([trace])
        .filter(t => t.opcode === 'CALL' && t.params.from.toLowerCase() === address.toLowerCase() && t.params.to.toLowerCase() !== address.toLowerCase())
        .reduce((acc, t) => { acc += t.params.gasUsed; return acc; }, 0);

    return calldataCost(trace.params.inputData) + totalGasUsed - totalSubtract;
}

function calldataCost (calldata) {
    const trimmed = trim0x(calldata);
    const zeroCount = trimmed.match(/.{2}/g).filter(x => x === '00').length;
    const nonZeroCount = trimmed.length / 2 - zeroCount;
    return zeroCount * 4 + nonZeroCount * 16;
}

// findTrace(tracer, 'CALL', exchange.address)
function findTrace (tracer, opcode, address) {
    return tracer.recorder.previousTraces.filter(
        tr => tr.top.opcode === opcode && tr.top.params.to.toLowerCase() === address.toLowerCase(),
    ).slice(-1)[0].top;
}

// TODO: refactor to get sigle trace as input
/// const allTraces = flattenTree([trace]);
const flattenTree = arr => arr.flatMap(item => [item, ...flattenTree(item.children || [])]);

// expect(countAllItems(['a','b','c','a','b','b'])).to.contain({a: 2, b: 3, c: 1});
const countAllItems = items => items.reduce((acc, item) => { acc[item] = (acc[item] || 0) + 1; return acc; }, {});

// console.log(JSON.stringify(treeForEach(trace, tr => tr.children, tr => { delete tr.parent })))
function treeForEach (element, unnest, action) {
    action(element);
    for (const item of unnest(element) || []) {
        treeForEach(item, unnest, action);
    }
    return element;
}

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
    return parseUnits(num);
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
    getSelector,
    setn,
    trim0x,
    calculateGasUsed,
    findTrace,
    flattenTree,
    countAllItems,
    treeForEach,
};
