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
function scaleByFill (rateBump, { initialRateBump, fillScalingNumerator = 0 }, orderMakingAmount, makingAmount, remainingMakingAmount) {
    const initial = BigInt(initialRateBump);
    const k = BigInt(fillScalingNumerator);
    if (k === 0n || makingAmount >= remainingMakingAmount || initial <= rateBump) return rateBump;
    const unreleasedBump = (initial - rateBump) * (remainingMakingAmount - makingAmount) / orderMakingAmount;
    return rateBump + unreleasedBump * k / 100n;
}

const SHARE_BASE = 10_000n;

/** Mirrors FusionAnchoredAuction._fillPremium. */
function fillPremiumAt (orderMakingAmount, makingAmount, remainingMakingAmount, { initial, points = [] }) {
    let currentPremium = BigInt(initial);
    const share = (orderMakingAmount - remainingMakingAmount + makingAmount) * SHARE_BASE / orderMakingAmount;
    if (share === 0n) return currentPremium;

    let currentShare = 0n;
    for (const { premium, shareDelta } of points) {
        const nextPremium = BigInt(premium);
        const nextShare = currentShare + BigInt(shareDelta);
        if (share <= nextShare) {
            return ((share - currentShare) * nextPremium + (nextShare - share) * currentPremium) / (nextShare - currentShare);
        }
        currentPremium = nextPremium;
        currentShare = nextShare;
    }
    return (SHARE_BASE - share) * currentPremium / (SHARE_BASE - currentShare);
}

/** Mirrors FusionAnchoredAuction._rateBumpForFill. */
function rateBumpForFill (rateBump, auction, orderMakingAmount, makingAmount, remainingMakingAmount) {
    if (auction.fillPremiums) {
        if (makingAmount >= remainingMakingAmount) return rateBump;
        return rateBump + fillPremiumAt(orderMakingAmount, makingAmount, remainingMakingAmount, auction.fillPremiums);
    }
    return scaleByFill(rateBump, auction, orderMakingAmount, makingAmount, remainingMakingAmount);
}

/** Taking amount a fill by making amount is priced at. */
function takingAmountFor (order, auction, timestamp, makingAmount, remainingMakingAmount) {
    const rateBump = rateBumpForFill(auctionBumpAt(timestamp, auction), auction, order.makingAmount, makingAmount, remainingMakingAmount);
    const unbumped = ceilDiv(order.takingAmount * makingAmount, order.makingAmount);
    return ceilDiv(unbumped * (BASE_POINTS + rateBump), BASE_POINTS);
}

/** Making amount a fill by taking amount is priced at, including the conservative fill-share estimate. */
function makingAmountFor (order, auction, timestamp, takingAmount, remainingMakingAmount) {
    const bump = auctionBumpAt(timestamp, auction);
    const unbumped = order.makingAmount * takingAmount / order.takingAmount;
    let rateBump = bump;
    if (auction.fillScalingNumerator || auction.fillPremiums) {
        const worstRateBump = auction.fillPremiums
            ? bump + [BigInt(auction.fillPremiums.initial), ...auction.fillPremiums.points.map((p) => BigInt(p.premium))]
                .reduce((a, b) => (a > b ? a : b))
            : scaleByFill(bump, auction, order.makingAmount, 0n, remainingMakingAmount);
        const estimate = unbumped * BASE_POINTS / (BASE_POINTS + worstRateBump);
        rateBump = rateBumpForFill(bump, auction, order.makingAmount, estimate, remainingMakingAmount);
    }
    return unbumped * BASE_POINTS / (BASE_POINTS + rateBump);
}

module.exports = {
    BASE_POINTS,
    NO_FEE_DATA,
    SHARE_BASE,
    ceilDiv,
    auctionBumpAt,
    buildLegacyAuctionDetails,
    fillPremiumAt,
    scaleByFill,
    takingAmountFor,
    makingAmountFor,
};
