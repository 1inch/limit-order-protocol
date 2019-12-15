// const { expectRevert } = require('openzeppelin-test-helpers');
// const { expect } = require('chai');

const LimitSwap = artifacts.require('LimitSwap');

contract('LimitSwap', function ([_, addr1]) {
    describe('LimitSwap', async function () {
        it('should be ok', async function () {
            this.token = await LimitSwap.new();
        });
    });
});
