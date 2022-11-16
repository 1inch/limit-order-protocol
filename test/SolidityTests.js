const { expect } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deployCalldataLibTest } = require('./helpers/fixtures');
const { ether, getSelector } = require('./helpers/utils');

describe('SolidityTests', function () {
    const abiCoder = ethers.utils.defaultAbiCoder;

    describe('CalldataLibTest', function () {
        before(async function () {
            this.offset = 12;
            this.uint256Data = abiCoder.encode(['uint256'], [ether('1234')]);
            this.uint256DataWithOffset = this.uint256Data + abiCoder.encode(['uint256'], [ether('5678')]).slice(-this.offset * 2);
            const iface = new ethers.utils.Interface(['function test(uint256 a, string b)']);
            this.selectorData = getSelector(iface.encodeFunctionData('test', ['0', '']));
            this.selectorDataWithOffset = '0x' + this.uint256Data.slice(-this.offset * 2) + this.selectorData.slice(2);
            this.boolData = abiCoder.encode(['bool'], [true]);
        });

        describe('testDecodeUint256 with offset', function () {
            it('should decode while data length and offset correct', async function () {
                const { calldataLibTest } = await loadFixture(deployCalldataLibTest);
                for (let i = 0; i < this.offset; i++) {
                    await calldataLibTest.testDecodeUint256(this.uint256DataWithOffset, i);
                }
                await expect(
                    calldataLibTest.testDecodeUint256(this.uint256DataWithOffset, this.offset + 1),
                ).to.be.revertedWithCustomError(calldataLibTest, 'IncorrectDataLength');
            });

            it('should be cheaper than standart method @skip-on-coverage', async function () {
                const { calldataLibTest } = await loadFixture(deployCalldataLibTest);
                const result = await calldataLibTest.testUint256CalldataOffsetGas(this.uint256DataWithOffset, this.offset);
                expect(result.gasLib).to.be.lt(result.gasAbiDecode);
            });
        });

        describe('testDecodeSelector', function () {
            it('should decode', async function () {
                const { calldataLibTest } = await loadFixture(deployCalldataLibTest);
                await calldataLibTest.testDecodeSelector(this.selectorData);
            });

            it('should not decode with incorrect data length', async function () {
                const { calldataLibTest } = await loadFixture(deployCalldataLibTest);
                await expect(
                    calldataLibTest.testDecodeSelector(this.selectorData.slice(0, -2)),
                ).to.be.revertedWithCustomError(calldataLibTest, 'IncorrectDataLength');
            });

            it('should be cheaper than standart method @skip-on-coverage', async function () {
                const { calldataLibTest } = await loadFixture(deployCalldataLibTest);
                const result = await calldataLibTest.testSelectorGas(this.selectorData);
                expect(result.gasLib).to.be.lt(result.gasAbiDecode);
            });
        });

        describe('testDecodeTailCalldata', function () {
            it('should decode', async function () {
                const { calldataLibTest } = await loadFixture(deployCalldataLibTest);
                await calldataLibTest.testDecodeTailCalldata(this.uint256Data, this.offset);
            });

            it('should not decode with incorrect data length', async function () {
                const { calldataLibTest } = await loadFixture(deployCalldataLibTest);
                await expect(
                    calldataLibTest.testDecodeTailCalldata(this.uint256Data, 33),
                ).to.be.revertedWithCustomError(calldataLibTest, 'IncorrectDataLength');
            });

            it('should be cheaper than standart method @skip-on-coverage', async function () {
                const { calldataLibTest } = await loadFixture(deployCalldataLibTest);
                const result = await calldataLibTest.testDecodeTailCalldataGas(this.uint256Data, this.offset);
                expect(result.gasLib).to.be.lt(result.gasAbiDecode);
            });
        });

        describe('testDecodeTargetAndCalldata', function () {
            it('should decode', async function () {
                const { calldataLibTest } = await loadFixture(deployCalldataLibTest);
                await calldataLibTest.testDecodeTargetAndCalldata(this.uint256Data);
            });

            it('should not decode with incorrect data length', async function () {
                const { calldataLibTest } = await loadFixture(deployCalldataLibTest);
                await expect(
                    calldataLibTest.testDecodeTargetAndCalldata(this.uint256Data.slice(0, 18 * 2)),
                ).to.be.revertedWithCustomError(calldataLibTest, 'IncorrectDataLength');
            });

            it('should be cheaper than standart method @skip-on-coverage', async function () {
                const { calldataLibTest } = await loadFixture(deployCalldataLibTest);
                const result = await calldataLibTest.testDecodeTargetAndCalldataGas(this.uint256Data);
                expect(result.gasLib).to.be.lt(result.gasAbiDecode);
            });
        });
    });
});
