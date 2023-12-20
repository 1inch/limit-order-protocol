const { expect } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deployRangeAmountCalculator } = require('./helpers/fixtures');
const { ether } = require('./helpers/utils');

describe('RangeAmountCalculator', function () {
    let addr;

    before(async function () {
        [addr] = await ethers.getSigners();
    });

    describe('Fill by maker asset', function () {
        const priceStart = ether('3000');
        const priceEnd = ether('4000');
        const totalLiquidity = ether('10');

        it('Revert with incorrect prices', async function () {
            const { rangeAmountCalculator } = await loadFixture(deployRangeAmountCalculator);
            const fillAmount = ether('10');
            const remainingMakerAmount = totalLiquidity;
            const txn1 = await rangeAmountCalculator.getRangeTakerAmount.populateTransaction(priceEnd, priceStart, totalLiquidity, fillAmount, remainingMakerAmount);
            await expect(addr.sendTransaction(txn1)).to.be.revertedWithCustomError(rangeAmountCalculator, 'IncorrectRange');
            const txn2 = await rangeAmountCalculator.getRangeTakerAmount.populateTransaction(priceStart, priceStart, totalLiquidity, fillAmount, remainingMakerAmount);
            await expect(addr.sendTransaction(txn2)).to.be.revertedWithCustomError(rangeAmountCalculator, 'IncorrectRange');
        });

        it('Fill limit-order completely', async function () {
            const { rangeAmountCalculator } = await loadFixture(deployRangeAmountCalculator);
            const fillAmount = ether('10');
            const remainingMakerAmount = totalLiquidity;
            expect(await rangeAmountCalculator.getRangeTakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, remainingMakerAmount))
                .to.equal(ether('35000')); // 3500 * 10
        });

        it('Fill limit-order by half', async function () {
            const { rangeAmountCalculator } = await loadFixture(deployRangeAmountCalculator);
            const fillAmount = ether('5');
            const remainingMakerAmount = totalLiquidity;
            expect(await rangeAmountCalculator.getRangeTakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, remainingMakerAmount))
                .to.equal(ether('16250')); // 3250 * 5
        });

        it('Fill limit-order 10 times', async function () {
            const { rangeAmountCalculator } = await loadFixture(deployRangeAmountCalculator);
            let remainingMakerAmount = totalLiquidity;

            const fillOrderFor = async (fillAmount) => {
                const amount = await rangeAmountCalculator.getRangeTakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, remainingMakerAmount);
                remainingMakerAmount = remainingMakerAmount - fillAmount;
                return amount;
            };

            for (let i = 0; i < 10; i++) {
                expect(await fillOrderFor(ether('1'))).to.equal(ether('3050') + ether('100') * BigInt(i));
            }
        });
    });

    describe('Fill by taker asset', function () {
        const priceStart = ether('3000');
        const priceEnd = ether('4000');
        const totalLiquidity = ether('10');

        it('Revert with incorrect prices', async function () {
            const { rangeAmountCalculator } = await loadFixture(deployRangeAmountCalculator);
            const fillAmount = ether('10');
            const remainingMakerAmount = totalLiquidity;
            const txn1 = await rangeAmountCalculator.getRangeMakerAmount.populateTransaction(priceEnd, priceStart, totalLiquidity, fillAmount, remainingMakerAmount);
            await expect(addr.sendTransaction(txn1)).to.be.revertedWithCustomError(rangeAmountCalculator, 'IncorrectRange');
            const txn2 = await rangeAmountCalculator.getRangeMakerAmount.populateTransaction(priceStart, priceStart, totalLiquidity, fillAmount, remainingMakerAmount);
            await expect(addr.sendTransaction(txn2)).to.be.revertedWithCustomError(rangeAmountCalculator, 'IncorrectRange');
        });

        it('Fill limit-order completely', async function () {
            const { rangeAmountCalculator } = await loadFixture(deployRangeAmountCalculator);
            const fillAmount = ether('35000');
            const remainingMakerAmount = totalLiquidity;
            expect(await rangeAmountCalculator.getRangeMakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, remainingMakerAmount))
                .to.equal(ether('10')); // 35000 / 3500 = 10
        });

        it('Fill limit-order by half', async function () {
            const { rangeAmountCalculator } = await loadFixture(deployRangeAmountCalculator);
            const fillAmount = ether('16250');
            const remainingMakerAmount = totalLiquidity;
            expect(await rangeAmountCalculator.getRangeMakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, remainingMakerAmount))
                .to.equal(ether('5')); // 16250 / 3250 = 5
        });

        it('Fill limit-order by several steps', async function () {
            const { rangeAmountCalculator } = await loadFixture(deployRangeAmountCalculator);
            let remainingMakerAmount = totalLiquidity;

            const fillOrderFor = async (fillAmount) => {
                const amount = await rangeAmountCalculator.getRangeMakerAmount(priceStart, priceEnd, totalLiquidity, fillAmount, remainingMakerAmount);
                remainingMakerAmount = remainingMakerAmount - amount;
                return amount;
            };

            for (let i = 0; i < 10; i++) {
                expect(await fillOrderFor(ether('3050') + ether('100') * BigInt(i))).to.equal(ether('1'));
            }
        });
    });
});
