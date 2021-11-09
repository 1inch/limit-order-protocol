const ArgumentsDecoderTest = artifacts.require('ArgumentsDecoderTest');

describe('SolidityTests', async function () {
    describe('ArgumentsDecoderTest', async function () {
        it('testDecodeBool', async function () {
            const argumentsDecoderTest = await ArgumentsDecoderTest.new();
            await argumentsDecoderTest.testDecodeBool();
        });

        it('testDecodeUint', async function () {
            const argumentsDecoderTest = await ArgumentsDecoderTest.new();
            await argumentsDecoderTest.testDecodeUint();
        });
    });
});
