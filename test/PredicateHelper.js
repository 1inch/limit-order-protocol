const { expect } = require('chai');
const { web3 } = require('hardhat');

const PredicateHelper = artifacts.require('PredicateHelper');

describe('PredicateHelper', async function () {
    let currentAddress;

    beforeEach(async function () {
        this.predicateHelper = await PredicateHelper.new();
    });

    before(async function () {
        [currentAddress] = await web3.eth.getAccounts();
    });

    it('Timestamp below compact - should uses less gas then timestamp below', async function () {
        const blockNumber = await web3.eth.getBlockNumber();
        const futureTimestamp = (await web3.eth.getBlock(blockNumber)).timestamp + 1000;
        const paramCompact = web3.utils.toHex(futureTimestamp);
        expect(await this.predicateHelper.timestampBelow(futureTimestamp)).to.equal(true);
        expect(await this.predicateHelper.timestampBelowCompact(paramCompact)).to.equal(true);
        const gasUsed = (await this.predicateHelper.contract.methods.timestampBelow(futureTimestamp).send({ from: currentAddress })).gasUsed;
        const encodedFunction = web3.eth.abi.encodeFunctionCall({
            name: 'timestampBelowCompact',
            type: 'function',
            inputs: [{
                type: 'bytes4',
                name: 'time',
            }],
        }, [paramCompact]);
        const txCompact = await web3.eth.sendTransaction({
            from: currentAddress,
            to: this.predicateHelper.address,
            data: encodedFunction.substring(0, 18),
        });
        console.log(txCompact);
        expect(txCompact.gasUsed).to.lessThan(gasUsed);
    });
});
