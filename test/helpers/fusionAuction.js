const { ethers } = require('hardhat');

const BASE_POINTS = 10_000_000n; // 100%

const ceilDiv = (a, b) => (a + b - 1n) / b;

/** The auction encoding the deployed settlement reads, which is the anchored one without its flags byte. */
function buildLegacyAuctionDetails ({
    gasBumpEstimate = 0,
    gasPriceEstimate = 0,
    startTime = 0,
    duration = 0,
    initialRateBump = 0,
    points = [],
} = {}) {
    const types = ['uint24', 'uint32', 'uint32', 'uint24', 'uint24', 'uint8'];
    const values = [gasBumpEstimate, gasPriceEstimate, startTime, duration, initialRateBump, points.length];
    for (const { coefficient, delay } of points) {
        types.push('uint24', 'uint16');
        values.push(coefficient, delay);
    }
    return ethers.solidityPacked(types, values);
}

/** Zero fees and an empty whitelist, so a settlement getter passes its input straight through. */
const NO_FEE_DATA = ethers.solidityPacked(['uint16', 'uint8', 'uint16', 'uint8', 'uint8'], [0, 0, 0, 0, 0]);

/** Mirrors FusionAnchoredAuction._getAuctionBump. */
function auctionBumpAt (timestamp, { startTime, duration, initialRateBump, points = [] }) {
    const now = BigInt(timestamp);
    const start = BigInt(startTime);
    const finish = start + BigInt(duration);
    if (now <= start) return BigInt(initialRateBump);
    if (now >= finish) return 0n;

    let currentPointTime = start;
    let currentRateBump = BigInt(initialRateBump);
    for (const { coefficient, delay } of points) {
        const nextRateBump = BigInt(coefficient);
        const nextPointTime = currentPointTime + BigInt(delay);
        if (now <= nextPointTime) {
            return ((now - currentPointTime) * nextRateBump + (nextPointTime - now) * currentRateBump) / (nextPointTime - currentPointTime);
        }
        currentRateBump = nextRateBump;
        currentPointTime = nextPointTime;
    }
    return (finish - now) * currentRateBump / (finish - currentPointTime);
}

/** Mirrors FusionAnchoredAuction._scaleByFill. */
function scaleByFill (rateBump, { initialRateBump, fillScalingNumerator = 0 }, makingAmount, remainingMakingAmount) {
    const initial = BigInt(initialRateBump);
    const k = BigInt(fillScalingNumerator);
    if (k === 0n || makingAmount >= remainingMakingAmount || initial <= rateBump) return rateBump;
    const unreleasedBump = (initial - rateBump) * (remainingMakingAmount - makingAmount) / remainingMakingAmount;
    return rateBump + unreleasedBump * k / 100n;
}

/** Taking amount a fill by making amount is priced at. */
function takingAmountFor (order, auction, timestamp, makingAmount, remainingMakingAmount) {
    const rateBump = scaleByFill(auctionBumpAt(timestamp, auction), auction, makingAmount, remainingMakingAmount);
    const unbumped = ceilDiv(order.takingAmount * makingAmount, order.makingAmount);
    return ceilDiv(unbumped * (BASE_POINTS + rateBump), BASE_POINTS);
}

/** Making amount a fill by taking amount is priced at, including the conservative fill-share estimate. */
function makingAmountFor (order, auction, timestamp, takingAmount, remainingMakingAmount) {
    const bump = auctionBumpAt(timestamp, auction);
    const unbumped = order.makingAmount * takingAmount / order.takingAmount;
    let rateBump = bump;
    if (auction.fillScalingNumerator) {
        const worstRateBump = scaleByFill(bump, auction, 0n, remainingMakingAmount);
        const estimate = unbumped * BASE_POINTS / (BASE_POINTS + worstRateBump);
        rateBump = scaleByFill(bump, auction, estimate, remainingMakingAmount);
    }
    return unbumped * BASE_POINTS / (BASE_POINTS + rateBump);
}

module.exports = {
    BASE_POINTS,
    NO_FEE_DATA,
    ceilDiv,
    auctionBumpAt,
    buildLegacyAuctionDetails,
    scaleByFill,
    takingAmountFor,
    makingAmountFor,
};
