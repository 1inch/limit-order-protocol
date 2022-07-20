const { expect, ether } = require('@1inch/solidity-utils');

const RangeAmountCalculator = artifacts.require('RangeAmountCalculator');

describe('RangeAmountCalculator', async () => {
    beforeEach(async () => {
        this.rangeAmountCalculator = await RangeAmountCalculator.new();
    });

    describe('Fill by maker asset', () => {
        it('Revert with incorrect prices', async () => {
            const priceStart = ether('4000');
            const priceEnd = ether('3000');
            const totalLiquidity = ether('10');
            const fillAmount = ether('10');
            const filledFor = ether('0');
            expect(this.rangeAmountCalculator.getRangeTakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, filledFor))
                .to.eventually.be.rejectedWith('IncorrectRange()');
        });

        describe('with range', () => {
            const priceStart = ether('3000');
            const priceEnd = ether('4000');
            const totalLiquidity = ether('10');

            it('Fill limit-order completely', async () => {
                const fillAmount = ether('10');
                const filledFor = ether('0');
                expect(await this.rangeAmountCalculator.getRangeTakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, filledFor))
                    .to.be.bignumber.equals(ether('35000')); // 3500 * 10
            });

            it('Fill limit-order by half', async () => {
                const fillAmount = ether('5');
                const filledFor = ether('0');
                expect(await this.rangeAmountCalculator.getRangeTakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, filledFor))
                    .to.be.bignumber.equals(ether('16250')); // 3250 * 5
            });

            it('Fill limit-order 10 times', async () => {
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

        describe('without range', () => {
            const priceStart = ether('3000');
            const priceEnd = priceStart;
            const totalLiquidity = ether('10');

            it('Fill limit-order completely without range', async () => {
                const fillAmount = ether('10');
                const filledFor = ether('0');
                expect(await this.rangeAmountCalculator.getRangeTakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, filledFor))
                    .to.be.bignumber.equals(ether('30000')); // 3000 * 10
            });

            it('Fill limit-order by half without range', async () => {
                const fillAmount = ether('5');
                const filledFor = ether('0');
                expect(await this.rangeAmountCalculator.getRangeTakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, filledFor))
                    .to.be.bignumber.equals(ether('15000')); // 3000 * 5
            });

            it('Fill limit-order 10 times without range', async () => {
                let filledFor = ether('0');

                const fillOrderFor = async (fillAmount) => {
                    const amount = await this.rangeAmountCalculator.getRangeTakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, filledFor);
                    filledFor = filledFor.add(fillAmount);
                    return amount;
                };

                for (let i = 0; i < 10; i++) {
                    expect(await fillOrderFor(ether('1'))).to.be.bignumber.equals(ether('3000'));
                }
            });
        });
    });

    describe('Fill by taker asset', async () => {
        it('Revert with incorrect prices', async()  =>{
            const priceStart = ether('4000');
            const priceEnd = ether('3000');
            const totalLiquidity = ether('10');
            const fillAmount = ether('10');
            const filledFor = ether('0');
            expect(this.rangeAmountCalculator.getRangeMakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, filledFor))
                .to.eventually.be.rejectedWith('IncorrectRange()');
        });

        describe('with range', () => {
            const priceStart = ether('3000');
            const priceEnd = ether('4000');
            const totalLiquidity = ether('10');

            it('Fill limit-order completely', async () => {
                const fillAmount = ether('35000');
                const filledFor = ether('0');
                expect(await this.rangeAmountCalculator.getRangeMakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, filledFor))
                    .to.be.bignumber.equals(ether('10')); // 35000 / 3500 = 10
            });

            it('Fill limit-order by half', async () => {
                const fillAmount = ether('16250');
                const filledFor = ether('0');
                expect(await this.rangeAmountCalculator.getRangeMakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, filledFor))
                    .to.be.bignumber.equals(ether('5')); // 16250 / 3250 = 5
            });

            it('Fill limit-order by several steps', async () => {
                let filledFor = ether('0');

                const fillOrderFor = async (fillAmount) => {
                    const amount = await this.rangeAmountCalculator.getRangeMakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, filledFor);
                    filledFor = filledFor.add(amount);
                    return amount;
                };

                for (let i = 0; i < 10; i++) {
                    expect(await fillOrderFor(ether('3050').add(ether('100').muln(i)))).to.be.bignumber.equals(ether('1'));
                }
            });
        });

        describe('without range', () => {
            const priceStart = ether('3000');
            const priceEnd = priceStart;
            const totalLiquidity = ether('10');

            it('Fill limit-order completely', async () => {
                const fillAmount = ether('30000');
                const filledFor = ether('0');
                expect(await this.rangeAmountCalculator.getRangeMakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, filledFor))
                    .to.be.bignumber.equals(ether('10')); // 30000 / 3000 = 10
            });

            it('Fill limit-order by half', async () => {
                const fillAmount = ether('15000');
                const filledFor = ether('0');
                expect(await this.rangeAmountCalculator.getRangeMakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, filledFor))
                    .to.be.bignumber.equals(ether('5')); // 15000 / 3000 = 5
            });

            it('Fill limit-order by several steps', async () => {
                let filledFor = ether('0');

                const fillOrderFor = async (fillAmount) => {
                    const amount = await this.rangeAmountCalculator.getRangeMakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, filledFor);
                    filledFor = filledFor.add(amount);
                    return amount;
                };

                for (let i = 0; i < 10; i++) {
                    expect(await fillOrderFor(ether('3000'))).to.be.bignumber.equals(ether('1'));
                }
            });
        });
    });
});
