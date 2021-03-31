const { promisify } = require('util');
const fs = require('fs').promises;

function _normalizeOp (op) {
    if (op.op === 'STATICCALL') {
        if (op.stack.length > 8 && op.stack[op.stack.length - 8] === '0000000000000000000000000000000000000000000000000000000000000001') {
            op.gasCost = 700 + 3000;
            op.op = 'STATICCALL-ECRECOVER';
        }
        else if (op.stack.length > 8 && op.stack[op.stack.length - 8] <= '00000000000000000000000000000000000000000000000000000000000000FF') {
            op.gasCost = 700;
            op.op = 'STATICCALL-' + op.stack[op.stack.length - 8].substr(62, 2);
        }
        else {
            op.gasCost = 700;
        }
    }
    if (['CALL', 'DELEGATECALL', 'CALLCODE'].indexOf(op.op) != -1) {
        op.gasCost = 700;
    }
    if (['RETURN', 'REVERT', 'INVALID'].indexOf(op.op) != -1) {
        op.gasCost = 3;
    }
}

async function profileEVM (txHash, instruction) {
    const trace = await promisify(web3.currentProvider.send.bind(web3.currentProvider))({
        jsonrpc: '2.0',
        method: 'debug_traceTransaction',
        params: [txHash, {}],
        id: new Date().getTime(),
    });

    const str = JSON.stringify(trace);

    // await fs.writeFile("./trace.json", str);

    if (Array.isArray(instruction)) {
        return instruction.map(instr => {
            return str.split('"' + instr.toUpperCase() + '"').length - 1;
        });
    }

    return str.split('"' + instruction.toUpperCase() + '"').length - 1;
}

async function gasspectEVM (txHash) {
    const trace = await promisify(web3.currentProvider.send.bind(web3.currentProvider))({
        jsonrpc: '2.0',
        method: 'debug_traceTransaction',
        params: [txHash, {}],
        id: new Date().getTime(),
    });

    let ops = trace.result.structLogs;

    let trace_address = [0, -1];
    for (let op of ops) {
        op.trace_address = trace_address.slice(0, trace_address.length - 1);
        _normalizeOp(op);

        if (op.depth + 2 > trace_address.length) {
            trace_address[trace_address.length - 1] += 1;
            trace_address.push(-1);
        }

        if (op.depth + 2 < trace_address.length) {
            trace_address.pop();
        }
    }

    console.log(ops.filter(op => op.gasCost > 300).map(op => op.trace_address.join('-') + '-' + op.op + ' = ' + op.gasCost));

    // await fs.writeFile("./trace-3.json", JSON.stringify(ops));

    // const res = ops.reduce((dict, op) => {
    //     const key = op.trace_address.join('-') + '-' + op.op;
    //     dict[key] = (dict[key] || 0) + op.gasCost;
    //     return dict;
    // }, {});

    // const entries = Object.keys(res).map(k => [k, res[k]]);
    // entries.sort((a,b) => b[1].gasCost - a[1].gasCost);
    // console.log(entries.map(([k, op]) => k + ' = ' + op.gasCost));
}

module.exports = {
    profileEVM,
    gasspectEVM,
};
