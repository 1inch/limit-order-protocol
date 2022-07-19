const { expect, ether } = require('@1inch/solidity-utils');

const RangeAmountCalculator = artifacts.require('RangeAmountCalculator');

describe('RangeAmountCalculator', async function () {
    beforeEach(async function () {
        this.rangeAmountCalculator = await RangeAmountCalculator.new();
    });

    describe('Fill by maker asset', () => {
        it('Fill limit-order completely', async function () {
            const priceStart = ether('3000');
            const priceEnd = ether('4000');
            const totalLiquidity = ether('10');
            const fillAmount = ether('10');
            const filledFor = ether('0');

            const amount = await this.rangeAmountCalculator.getRangeTakerAmount(
                priceStart,
                priceEnd,
                totalLiquidity,
                fillAmount,
                filledFor,
            );
            expect(amount).to.be.bignumber.equals(ether('35000')); // 3500 * 10
        });

        it('Fill limit-order by half', async function () {
            const priceStart = ether('3000');
            const priceEnd = ether('4000');
            const totalLiquidity = ether('10');
            const fillAmount = ether('5');
            const filledFor = ether('0');

            const amount = await this.rangeAmountCalculator.getRangeTakerAmount(
                priceStart.toString(),
                priceEnd.toString(),
                totalLiquidity.toString(),
                fillAmount.toString(),
                filledFor.toString(),
            );
            expect(amount).to.be.bignumber.equals(ether('16250')); // 3250 * 5
        });

        it('Fill limit-order 10 times', async function () {
            const priceStart = ether('3000');
            const priceEnd = ether('4000');
            const totalLiquidity = ether('10');
            let filledFor = ether('0');

            const fillOrderFor = async (fillAmount) => {
                const amount = await this.rangeAmountCalculator.getRangeTakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, filledFor);
                filledFor = filledFor.add(fillAmount);
                return amount;
            };

            for (let i = 0; i < 10; i++) {
                expect(await fillOrderFor(ether('1'))).to.be.bignumber.equals(ether('3050').add(ether('100').muln(i)));
            }
        });
    });

    describe('Fill by taker asset', () => {
        it('Fill limit-order completely', async function () {
            const priceStart = ether('3000');
            const priceEnd = ether('4000');
            const totalLiquidity = ether('10');
            const fillAmount = ether('35000');
            const filledFor = ether('0');

            const amount = await this.rangeAmountCalculator.getRangeMakerAmount(
                priceStart,
                priceEnd,
                totalLiquidity,
                fillAmount,
                filledFor,
            );
            expect(amount).to.be.bignumber.equals(ether('10')); // 35000 / 3500 = 10
        });

        it('Fill limit-order by half', async function () {
            const priceStart = ether('3000');
            const priceEnd = ether('4000');
            const totalLiquidity = ether('10');
            const fillAmount = ether('16250');
            const filledFor = ether('0');

            const amount = await this.rangeAmountCalculator.getRangeMakerAmount(
                priceStart,
                priceEnd,
                totalLiquidity,
                fillAmount,
                filledFor,
            );
            expect(amount).to.be.bignumber.equals(ether('5')); // 16250 / 3250 = 5
        });

        it('Fill limit-order by several steps', async function () {
            const priceStart = ether('3000');
            const priceEnd = ether('4000');
            const totalLiquidity = ether('10');
            let filledFor = ether('0');

            const fillOrderFor = async (fillAmount) => {
                const amount = await this.rangeAmountCalculator.getRangeMakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, filledFor);
                console.log(fillAmount.toString(), amount.toString());
                filledFor = filledFor.add(amount);
                return amount;
            };

            for (let i = 0; i < 10; i++) {
                expect(await fillOrderFor(ether('3050').add(ether('100').muln(i)))).to.be.bignumber.equals(ether('1'));
            }
        });
    });
});
