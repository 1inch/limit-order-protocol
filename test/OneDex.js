// const { expectRevert } = require('openzeppelin-test-helpers');
// const { expect } = require('chai');

const OneDex = artifacts.require('OneDex');

contract('OneDex', function ([_, addr1]) {
    describe('OneDex', async function () {
        it('should be ok', async function () {
            this.token = await OneDex.new();
        });
    });
});
