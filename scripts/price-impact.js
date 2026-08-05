// Low-liquidity, high-price-impact swap: what the maker receives when the order is filled in slices,
// under today's time-only Fusion auction versus the new volume-ladder pricing.
//
// The price-impact model (how much better a resolver can source a small slice than the whole order)
// is a stated assumption, labelled as such. Every "new pricing" number is read from
// FusionAnchoredAuction.getTakingAmount on a real order; nothing on that side is re-implemented.
const hre = require('hardhat');
const { ethers } = hre;
const fs = require('fs');
const { deploySwapTokens } = require('../test/helpers/fixtures');
const { buildOrder, buildMakerTraits, buildAnchoredAuctionDetails } = require('../test/helpers/orderUtils');
const { ether } = require('../test/helpers/utils');

const MAKING = ether('100000'); // 100k of a thin token
const TAKING = ether('10'); // priced at the full-size (worst-impact) rate

// Price impact for a thin book: sourcing the whole order costs the resolver the full impact, while a
// small slice costs much less. Modelled as impact growing with the square root of size, normalised so
// that the full order's impact is IMPACT_FULL. The order's own price already carries the full-size
// impact, so the resolver's edge on a slice is the difference.
const IMPACT_FULL = 0.04; // 4% for a full sweep of a low-liquidity pair
const impactAt = (share) => IMPACT_FULL * Math.sqrt(share);
const edgeAt = (share) => IMPACT_FULL - impactAt(share); // what a resolver keeps under flat pricing

// The quote matrix a quoter would publish for that book: one row per decile, each row's premium set to
// the edge available at that size, in 1e7. Monotonically non-increasing, as the contract requires.
const ROWS = [];
for (let i = 1; i <= 10; i++) ROWS.push({ share: i / 10, premium: Math.round(edgeAt(i / 10) * 1e7) });

function curveFromRows () {
    const initial = ROWS[0].premium;
    const points = [];
    let prevShare = 0;
    for (const row of ROWS) {
        points.push({ premium: row.premium, shareDelta: Math.round((row.share - prevShare) * 10000) });
        prevShare = row.share;
    }
    points.pop(); // the final point is the implied (0 premium, full amount)
    return { initial, points };
}

async function main () {
    const [maker, taker] = await ethers.getSigners();
    const { dai, weth, swap } = await deploySwapTokens();

    const Registrator = await ethers.getContractFactory('OrderRegistrator');
    const registrator = await Registrator.deploy(swap);
    await registrator.waitForDeployment();
    const Auction = await ethers.getContractFactory('FusionAnchoredAuction');
    const auction = await Auction.deploy(registrator);
    await auction.waitForDeployment();
    const auctionAddr = await auction.getAddress();

    // No time bump anywhere: this comparison isolates fill-size pricing from the clock.
    const withCurve = buildAnchoredAuctionDetails({ startTime: 0, duration: 0, initialRateBump: 0, fillPremiums: curveFromRows() });
    const flat = buildAnchoredAuctionDetails({ startTime: 0, duration: 0, initialRateBump: 0 });

    const mkOrder = (data) => buildOrder(
        {
            maker: maker.address,
            makerAsset: dai.target,
            takerAsset: weth.target,
            makingAmount: MAKING,
            takingAmount: TAKING,
            makerTraits: buildMakerTraits({ allowMultipleFills: true }),
        },
        {
            makingAmountData: ethers.solidityPacked(['address', 'bytes'], [auctionAddr, data]),
            takingAmountData: ethers.solidityPacked(['address', 'bytes'], [auctionAddr, data]),
        },
    );
    const orderNew = mkOrder(withCurve);
    const orderOld = mkOrder(flat);
    const hashNew = await swap.hashOrder(orderNew);
    const hashOld = await swap.hashOrder(orderOld);

    // taking amount the contract charges for a fill of `amount`, with `remaining` left before it
    // The view is the chain target, so extraData is the auction blob without its 20-byte address prefix.
    const priceNew = (amount, remaining) => auction.getTakingAmount(
        orderNew, orderNew.extension, hashNew, taker.address, amount, remaining, withCurve);
    const priceOld = (amount, remaining) => auction.getTakingAmount(
        orderOld, orderOld.extension, hashOld, taker.address, amount, remaining, flat);

    // ---- 1. a single fill of each size, taken as the first fill ----
    const perSize = [];
    for (let i = 1; i <= 10; i++) {
        const amount = (MAKING * BigInt(i)) / 10n;
        const oldPaid = await priceOld(amount, MAKING);
        const newPaid = await priceNew(amount, MAKING);
        // what the resolver can source that slice for, from the impact model
        const sourced = Number(oldPaid) * (1 + edgeAt(i / 10));
        perSize.push({
            share: i * 10,
            oldPaid: oldPaid.toString(),
            newPaid: newPaid.toString(),
            sourced: Math.round(sourced).toString(),
        });
    }

    // ---- 2. maker proceeds when the order is filled in slices ----
    async function pattern (slices) {
        let remaining = MAKING;
        let oldTotal = 0n; let newTotal = 0n;
        for (const frac of slices) {
            const amount = (MAKING * BigInt(Math.round(frac * 1000))) / 1000n;
            oldTotal += await priceOld(amount, remaining);
            newTotal += await priceNew(amount, remaining);
            remaining -= amount;
        }
        return { oldTotal: oldTotal.toString(), newTotal: newTotal.toString() };
    }

    const patterns = [
        { key: 'sweep', label: 'one sweep', slices: [1] },
        { key: 'halves', label: 'two halves', slices: [0.5, 0.5] },
        { key: 'quarters', label: 'four quarters', slices: [0.25, 0.25, 0.25, 0.25] },
        { key: 'tenths', label: 'ten tenths', slices: Array(10).fill(0.1) },
        { key: 'cherry', label: 'cherry-pick 10% then stop', slices: [0.1] },
    ];
    const results = [];
    for (const p of patterns) results.push({ ...p, ...(await pattern(p.slices)) });

    const out = { making: MAKING.toString(), taking: TAKING.toString(), impactFull: IMPACT_FULL, rows: ROWS, perSize, patterns: results };
    fs.writeFileSync('/tmp/impact_data.json', JSON.stringify(out, null, 2));

    console.log('per-size (first fill):');
    for (const r of perSize) {
        const oldPct = (Number(r.oldPaid) / Number(r.sourced) - 1) * 100;
        const newPct = (Number(r.newPaid) / Number(r.sourced) - 1) * 100;
        console.log(`  ${String(r.share).padStart(3)}%  old=${(Number(r.oldPaid) / 1e18).toFixed(4)}  new=${(Number(r.newPaid) / 1e18).toFixed(4)}` +
            `  sourced=${(Number(r.sourced) / 1e18).toFixed(4)}  resolver keeps: old ${(-oldPct).toFixed(2)}% -> new ${(-newPct).toFixed(2)}%`);
    }
    console.log('\npatterns (maker proceeds, WETH):');
    for (const r of results) {
        const gain = ((Number(r.newTotal) / Number(r.oldTotal) - 1) * 100).toFixed(2);
        console.log(`  ${r.label.padEnd(28)} old=${(Number(r.oldTotal) / 1e18).toFixed(4)}  new=${(Number(r.newTotal) / 1e18).toFixed(4)}  (+${gain}%)`);
    }
    console.log('\nwritten to /tmp/impact_data.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
