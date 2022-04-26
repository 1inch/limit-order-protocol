const RangeAmountCalculator = artifacts.require('RangeAmountCalculator');

describe('RangeAmountCalculator', async function () {
    beforeEach(async function () {
        this.rangeAmountCalculator = await RangeAmountCalculator.new();
    });

    describe('Fill by maker asset', () => {
        it('Fill limit-order completely', async function () {
            const priceStart = 3000;
            const priceEnd = 4000;
            const totalLiquidity = 10;
            const fillAmount = 10;
            const filledFor = 0;

            const amount = (await this.rangeAmountCalculator.getRangeTakerAmount(
                priceStart,
                priceEnd,
                totalLiquidity,
                fillAmount,
                filledFor,
            )).toNumber();

            expect(amount).to.equal(35000); // 3500 * 10
        });

        it('Fill limit-order by half', async function () {
            const priceStart = 3000;
            const priceEnd = 4000;
            const totalLiquidity = 10;
            const fillAmount = 5;
            const filledFor = 0;

            const amount = (await this.rangeAmountCalculator.getRangeTakerAmount(
                priceStart,
                priceEnd,
                totalLiquidity,
                fillAmount,
                filledFor,
            )).toNumber();

            expect(amount).to.equal(16250); // 3250 * 5
        });

        it('Fill limit-order 10 times', async function () {
            const rangeAmountCalculator = this.rangeAmountCalculator;

            const priceStart = 3000;
            const priceEnd = 4000;
            const totalLiquidity = 10;
            let filledFor = 0;

            async function fillOrderFor (fillAmount) {
                const amount = (await rangeAmountCalculator.getRangeTakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, filledFor)).toNumber();

                filledFor += fillAmount;

                return amount;
            }

            expect(await fillOrderFor(1)).to.equal(3050);
            expect(await fillOrderFor(1)).to.equal(3150);
            expect(await fillOrderFor(1)).to.equal(3250);
            expect(await fillOrderFor(1)).to.equal(3350);
            expect(await fillOrderFor(1)).to.equal(3450);
            expect(await fillOrderFor(1)).to.equal(3550);
            expect(await fillOrderFor(1)).to.equal(3650);
            expect(await fillOrderFor(1)).to.equal(3750);
            expect(await fillOrderFor(1)).to.equal(3850);
            expect(await fillOrderFor(1)).to.equal(3950);
        });
    });

    describe('Fill by taker asset', () => {
        it('Fill limit-order completely', async function () {
            const priceStart = 3000;
            const priceEnd = 4000;
            const totalLiquidity = 10;
            const fillAmount = 35000;
            const filledFor = 0;

            const amount = (await this.rangeAmountCalculator.getRangeMakerAmount(
                priceStart,
                priceEnd,
                totalLiquidity,
                fillAmount,
                filledFor,
            )).toNumber();

            expect(amount).to.equal(10); // 35000 / 3500 = 10
        });

        it('Fill limit-order by half', async function () {
            const priceStart = 3000;
            const priceEnd = 4000;
            const totalLiquidity = 10;
            const fillAmount = 16250;
            const filledFor = 0;

            const amount = (await this.rangeAmountCalculator.getRangeMakerAmount(
                priceStart,
                priceEnd,
                totalLiquidity,
                fillAmount,
                filledFor,
            )).toNumber();

            expect(amount).to.equal(5); // 16250 / 3250 = 5
        });

        it('Fill limit-order by several steps', async function () {
            const rangeAmountCalculator = this.rangeAmountCalculator;

            const priceStart = 3000;
            const priceEnd = 4000;
            const totalLiquidity = 10;
            let filledFor = 0;

            async function fillOrderFor (fillAmount) {
                const amount = (await rangeAmountCalculator.getRangeMakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, filledFor)).toNumber();

                filledFor += amount;

                return amount;
            }

            expect(await fillOrderFor(3050)).to.equal(1);
            expect(await fillOrderFor(3150)).to.equal(1);
            expect(await fillOrderFor(3250)).to.equal(1);
            expect(await fillOrderFor(3350 + 3450)).to.equal(2);
        });
    });
});
