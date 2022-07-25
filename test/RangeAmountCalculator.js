const { expect, ether } = require('@1inch/solidity-utils');

const RangeAmountCalculator = artifacts.require('RangeAmountCalculator');

describe('RangeAmountCalculator', async () => {
    beforeEach(async () => {
        this.rangeAmountCalculator = await RangeAmountCalculator.new();
    });

    describe('Fill by maker asset', () => {
        const priceStart = ether('3000');
        const priceEnd = ether('4000');
        const totalLiquidity = ether('10');

        it('Revert with incorrect prices', async () => {
            const fillAmount = ether('10');
            const remainingMakerAmount = totalLiquidity;
            expect(this.rangeAmountCalculator.getRangeTakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, remainingMakerAmount))
                .to.eventually.be.rejectedWith('IncorrectRange()');
            expect(this.rangeAmountCalculator.getRangeTakerAmount(priceStart, priceStart, totalLiquidity, fillAmount, remainingMakerAmount))
                .to.eventually.be.rejectedWith('IncorrectRange()');
        });

        it('Fill limit-order completely', async () => {
            const fillAmount = ether('10');
            const remainingMakerAmount = totalLiquidity;
            expect(await this.rangeAmountCalculator.getRangeTakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, remainingMakerAmount))
                .to.be.bignumber.equals(ether('35000')); // 3500 * 10
        });

        it('Fill limit-order by half', async () => {
            const fillAmount = ether('5');
            const remainingMakerAmount = totalLiquidity;
            expect(await this.rangeAmountCalculator.getRangeTakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, remainingMakerAmount))
                .to.be.bignumber.equals(ether('16250')); // 3250 * 5
        });

        it('Fill limit-order 10 times', async () => {
            let remainingMakerAmount = totalLiquidity;

            const fillOrderFor = async (fillAmount) => {
                const amount = await this.rangeAmountCalculator.getRangeTakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, remainingMakerAmount);
                remainingMakerAmount = remainingMakerAmount.sub(fillAmount);
                return amount;
            };

            for (let i = 0; i < 10; i++) {
                expect(await fillOrderFor(ether('1'))).to.be.bignumber.equals(ether('3050').add(ether('100').muln(i)));
            }
        });
    });

    describe('Fill by taker asset', async () => {
        const priceStart = ether('3000');
        const priceEnd = ether('4000');
        const totalLiquidity = ether('10');

        it('Revert with incorrect prices', async () => {
            const fillAmount = ether('10');
            const remainingMakerAmount = totalLiquidity;
            expect(this.rangeAmountCalculator.getRangeMakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, remainingMakerAmount))
                .to.eventually.be.rejectedWith('IncorrectRange()');
            expect(this.rangeAmountCalculator.getRangeMakerAmount(priceStart, priceStart, totalLiquidity, fillAmount, remainingMakerAmount))
                .to.eventually.be.rejectedWith('IncorrectRange()');
        });

        it('Fill limit-order completely', async () => {
            const fillAmount = ether('35000');
            const remainingMakerAmount = totalLiquidity;
            expect(await this.rangeAmountCalculator.getRangeMakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, remainingMakerAmount))
                .to.be.bignumber.equals(ether('10')); // 35000 / 3500 = 10
        });

        it('Fill limit-order by half', async () => {
            const fillAmount = ether('16250');
            const remainingMakerAmount = totalLiquidity;
            expect(await this.rangeAmountCalculator.getRangeMakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, remainingMakerAmount))
                .to.be.bignumber.equals(ether('5')); // 16250 / 3250 = 5
        });

        it('Fill limit-order by several steps', async () => {
            let remainingMakerAmount = totalLiquidity;

            const fillOrderFor = async (fillAmount) => {
                const amount = await this.rangeAmountCalculator.getRangeMakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, remainingMakerAmount);
                remainingMakerAmount = remainingMakerAmount.sub(amount);
                return amount;
            };

            for (let i = 0; i < 10; i++) {
                expect(await fillOrderFor(ether('3050').add(ether('100').muln(i)))).to.be.bignumber.equals(ether('1'));
            }
        });
    });
});
