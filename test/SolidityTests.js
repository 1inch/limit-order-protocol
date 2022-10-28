const { expect } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deployArgumentsDecoderTest } = require('./helpers/fixtures');
const { ether, getSelector } = require('./helpers/utils');

describe('SolidityTests', function () {
    const abiCoder = ethers.utils.defaultAbiCoder;

    describe('ArgumentsDecoderTest', function () {
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
                const { argumentsDecoderTest } = await loadFixture(deployArgumentsDecoderTest);
                for (let i = 0; i < this.offset; i++) {
                    await argumentsDecoderTest.testDecodeUint256(this.uint256DataWithOffset, i);
                }
                await expect(
                    argumentsDecoderTest.testDecodeUint256(this.uint256DataWithOffset, this.offset + 1),
                ).to.be.revertedWithCustomError(argumentsDecoderTest, 'IncorrectDataLength');
            });

            it('should be cheaper than standart method @skip-on-coverage', async function () {
                const { argumentsDecoderTest } = await loadFixture(deployArgumentsDecoderTest);
                const result = await argumentsDecoderTest.testUint256CalldataOffsetGas(this.uint256DataWithOffset, this.offset);
                expect(result.gasLib).to.be.lt(result.gasAbiDecode);
            });
        });

        describe('testDecodeSelector', function () {
            it('should decode', async function () {
                const { argumentsDecoderTest } = await loadFixture(deployArgumentsDecoderTest);
                await argumentsDecoderTest.testDecodeSelector(this.selectorData);
            });

            it('should not decode with incorrect data length', async function () {
                const { argumentsDecoderTest } = await loadFixture(deployArgumentsDecoderTest);
                await expect(
                    argumentsDecoderTest.testDecodeSelector(this.selectorData.slice(0, -2)),
                ).to.be.revertedWithCustomError(argumentsDecoderTest, 'IncorrectDataLength');
            });

            it('should be cheaper than standart method @skip-on-coverage', async function () {
                const { argumentsDecoderTest } = await loadFixture(deployArgumentsDecoderTest);
                const result = await argumentsDecoderTest.testSelectorGas(this.selectorData);
                expect(result.gasLib).to.be.lt(result.gasAbiDecode);
            });
        });

        describe('testDecodeTailCalldata', function () {
            it('should decode', async function () {
                const { argumentsDecoderTest } = await loadFixture(deployArgumentsDecoderTest);
                await argumentsDecoderTest.testDecodeTailCalldata(this.uint256Data, this.offset);
            });

            it('should not decode with incorrect data length', async function () {
                const { argumentsDecoderTest } = await loadFixture(deployArgumentsDecoderTest);
                await expect(
                    argumentsDecoderTest.testDecodeTailCalldata(this.uint256Data, 33),
                ).to.be.revertedWithCustomError(argumentsDecoderTest, 'IncorrectDataLength');
            });

            it('should be cheaper than standart method @skip-on-coverage', async function () {
                const { argumentsDecoderTest } = await loadFixture(deployArgumentsDecoderTest);
                const result = await argumentsDecoderTest.testDecodeTailCalldataGas(this.uint256Data, this.offset);
                expect(result.gasLib).to.be.lt(result.gasAbiDecode);
            });
        });

        describe('testDecodeTargetAndCalldata', function () {
            it('should decode', async function () {
                const { argumentsDecoderTest } = await loadFixture(deployArgumentsDecoderTest);
                await argumentsDecoderTest.testDecodeTargetAndCalldata(this.uint256Data);
            });

            it('should not decode with incorrect data length', async function () {
                const { argumentsDecoderTest } = await loadFixture(deployArgumentsDecoderTest);
                await expect(
                    argumentsDecoderTest.testDecodeTargetAndCalldata(this.uint256Data.slice(0, 18 * 2)),
                ).to.be.revertedWithCustomError(argumentsDecoderTest, 'IncorrectDataLength');
            });

            it('should be cheaper than standart method @skip-on-coverage', async function () {
                const { argumentsDecoderTest } = await loadFixture(deployArgumentsDecoderTest);
                const result = await argumentsDecoderTest.testDecodeTargetAndCalldataGas(this.uint256Data);
                expect(result.gasLib).to.be.lt(result.gasAbiDecode);
            });
        });
    });
});
