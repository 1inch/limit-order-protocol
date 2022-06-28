const ArgumentsDecoderTest = artifacts.require('ArgumentsDecoderTest');

describe('SolidityTests', async () => {
    describe('ArgumentsDecoderTest', async () => {
        it('testDecodeBool', async () => {
            const argumentsDecoderTest = await ArgumentsDecoderTest.new();
            await argumentsDecoderTest.testDecodeBool();
        });

        it('testDecodeUint', async () => {
            const argumentsDecoderTest = await ArgumentsDecoderTest.new();
            await argumentsDecoderTest.testDecodeUint();
        });
    });
});
