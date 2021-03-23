const { promisify } = require('util');

async function profileEVM (txHash, instruction) {
    const trace = await promisify(web3.currentProvider.send.bind(web3.currentProvider))({
        jsonrpc: '2.0',
        method: 'debug_traceTransaction',
        params: [txHash, {}],
        id: new Date().getTime(),
    });

    const str = JSON.stringify(trace);

    if (Array.isArray(instruction)) {
        return instruction.map(instr => {
            return str.split('"' + instr.toUpperCase() + '"').length - 1;
        });
    }

    return str.split('"' + instruction.toUpperCase() + '"').length - 1;
}

module.exports = {
    profileEVM,
};
