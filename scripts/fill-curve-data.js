// Dumps chart data straight out of FusionAnchoredAuction's own view functions, so the PR's charts
// show contract output rather than a re-implementation of it. Run with:
//   yarn hardhat run /tmp/chart_data.js
const hre = require('hardhat');
const { ethers } = hre;
const fs = require('fs');
const { deploySwapTokens } = require('../test/helpers/fixtures');
const { buildOrder, buildAnchoredAuctionDetails } = require('../test/helpers/orderUtils');

const MAKING_AMOUNT = ethers.parseEther('100');
const TAKING_AMOUNT = ethers.parseEther('0.1');
const FIVE_PERCENT = 500_000; // in 1e7, exaggerated from production's sub-1% for legibility
const DURATION = 1800; // 30 minutes

// The quoter's depth schedule: one row per tenth of the order, non-increasing as the plan requires.
const MATRIX = [450_000, 400_000, 350_000, 300_000, 250_000, 200_000, 150_000, 100_000, 50_000, 0];

function matrixCurve () {
    // Rows are hit exactly at their share; the last row's zero is the curve's implied endpoint.
    return {
        initial: MATRIX[0],
        points: MATRIX.slice(0, 9).map((premium, i) => ({ premium: MATRIX[i + 1], shareDelta: 1000 })),
    };
}

async function main () {
    const { dai, weth, swap } = await deploySwapTokens();
    const [maker, taker] = await ethers.getSigners();

    const OrderRegistrator = await ethers.getContractFactory('OrderRegistrator');
    const registrator = await OrderRegistrator.deploy(swap);
    await registrator.waitForDeployment();
    const FusionAnchoredAuction = await ethers.getContractFactory('FusionAnchoredAuction');
    const auction = await FusionAnchoredAuction.deploy(registrator);
    await auction.waitForDeployment();
    const auctionAddress = await auction.getAddress();

    const now = (await ethers.provider.getBlock('latest')).timestamp;

    // The rate bump depends only on how far the auction has run, so sweeping the order's start time
    // against a fixed chain clock samples the whole curve without touching block timestamps.
    async function build (params) {
        const details = ethers.solidityPacked(['address', 'bytes'], [auctionAddress, buildAnchoredAuctionDetails(params)]);
        const order = buildOrder(
            {
                maker: maker.address,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: MAKING_AMOUNT,
                takingAmount: TAKING_AMOUNT,
            },
            { makingAmountData: details, takingAmountData: details },
        );
        return { order, extraData: buildAnchoredAuctionDetails(params), orderHash: await swap.hashOrder(order) };
    }

    /** Taking amount the contract prices a fill at, straight from the view. */
    async function price ({ order, extraData, orderHash }, makingAmount, remaining) {
        return auction.getTakingAmount(order, order.extension, orderHash, taker.address, makingAmount, remaining, extraData);
    }

    const out = {
        makingAmount: MAKING_AMOUNT.toString(),
        takingAmount: TAKING_AMOUNT.toString(),
        duration: DURATION,
        initialRateBump: FIVE_PERCENT,
        matrix: MATRIX,
    };

    // 1. The time curve: price of a full fill as the auction runs, sampled every 30 seconds from
    //    10 minutes before the start to 20 minutes after the finish.
    out.timeCurve = [];
    for (let elapsed = -600; elapsed <= DURATION + 3600; elapsed += 30) {
        const built = await build({ startTime: now - elapsed, duration: DURATION, initialRateBump: FIVE_PERCENT });
        out.timeCurve.push({ elapsed, taking: (await price(built, MAKING_AMOUNT, MAKING_AMOUNT)).toString() });
    }

    // 2. The matrix as a premium over the fill's share of the remainder, read at the auction floor so
    //    the fill premium is the only thing moving. A fill of share s is one from remaining = full.
    const afterAuction = { startTime: now - DURATION - 60, duration: DURATION, initialRateBump: FIVE_PERCENT };
    const matrixOrder = await build({ ...afterAuction, fillPremiums: matrixCurve() });
    out.matrixCurve = [];
    for (let bp = 25; bp <= 10000; bp += 25) {
        const makingAmount = MAKING_AMOUNT * BigInt(bp) / 10000n;
        out.matrixCurve.push({ share: bp, taking: (await price(matrixOrder, makingAmount, MAKING_AMOUNT)).toString() });
    }

    // 3. The decile rungs: a single fill of k tenths of the remainder lands exactly on the k-th row.
    out.matrixDeciles = [];
    for (let k = 1; k <= 10; k++) {
        const makingAmount = MAKING_AMOUNT * BigInt(k) / 10n;
        out.matrixDeciles.push({ decile: k, taking: (await price(matrixOrder, makingAmount, MAKING_AMOUNT)).toString() });
    }

    // 4. A curve with no interior points — the one-parameter schedule, falling straight to zero.
    const singleRowOrder = await build({ ...afterAuction, fillPremiums: { initial: FIVE_PERCENT, points: [] } });
    out.singleRowCurve = [];
    for (let bp = 25; bp <= 10000; bp += 25) {
        const makingAmount = MAKING_AMOUNT * BigInt(bp) / 10000n;
        out.singleRowCurve.push({ share: bp, taking: (await price(singleRowOrder, makingAmount, MAKING_AMOUNT)).toString() });
    }

    // 5. What splitting an order costs a taker, priced fill by fill down the remaining amount.
    const partitions = {
        'one sweep': [10000],
        'two halves': [5000, 5000],
        'four quarters': [2500, 2500, 2500, 2500],
        'ten tenths': Array(10).fill(1000),
    };
    out.scenarios = {};
    for (const [name, parts] of Object.entries(partitions)) {
        for (const [mode, order] of [['singleRow', singleRowOrder], ['matrix', matrixOrder]]) {
            let remaining = MAKING_AMOUNT;
            let total = 0n;
            for (const part of parts) {
                const makingAmount = MAKING_AMOUNT * BigInt(part) / 10000n;
                total += await price(order, makingAmount, remaining);
                remaining -= makingAmount;
            }
            out.scenarios[`${mode}|${name}`] = total.toString();
        }
    }

    // 6. A late arrival that completes what two earlier fills left, to show completion pays no premium.
    for (const [mode, order] of [['singleRow', singleRowOrder], ['matrix', matrixOrder]]) {
        const first = MAKING_AMOUNT * 3n / 10n;
        const second = MAKING_AMOUNT * 3n / 10n;
        const rest = MAKING_AMOUNT - first - second;
        const a = await price(order, first, MAKING_AMOUNT);
        const b = await price(order, second, MAKING_AMOUNT - first);
        const c = await price(order, rest, rest);
        out.scenarios[`${mode}|30/30/40, last completes`] = (a + b + c).toString();
        out[`${mode}Completion`] = c.toString();
    }

    fs.writeFileSync('/tmp/chart_data.json', JSON.stringify(out, null, 1));
    console.log('samples:', out.timeCurve.length, out.matrixCurve.length, Object.keys(out.scenarios).length);
    console.log('scenarios:', out.scenarios);
}

main().catch((e) => { console.error(e); process.exit(1); });
