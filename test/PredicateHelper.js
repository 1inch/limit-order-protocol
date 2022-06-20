const { expect } = require("chai");
const { web3 } = require("hardhat");
const { toBN } = require('./helpers/utils');

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
        const gasUsedCompact = (await this.predicateHelper.contract.methods.timestampBelowCompact(paramCompact).send({ from: currentAddress })).gasUsed;
        expect(gasUsedCompact).to.lessThan(gasUsed);
    });
});
