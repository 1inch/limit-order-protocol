// Measures gas for a fill under today's production Fusion pricing and under the new anchored
// auction, on identical orders. Every number written here is a real receipt.gasUsed from a fill
// executed against LimitOrderProtocol; nothing is estimated.
//
//   npx hardhat run scripts/gas-comparison.js
const hre = require('hardhat');
const { ethers } = hre;
const fs = require('fs');

const { deploySwapTokens } = require('../test/helpers/fixtures');
const {
    buildOrder, buildTakerTraits, signOrder, buildMakerTraits,
    buildFeeTakerExtensions, buildAnchoredAuctionDetails, buildAnchoredExclusivity,
} = require('../test/helpers/orderUtils');
const { buildLegacyAuctionDetails } = require('../test/helpers/fusionAuction');
const { ether } = require('../test/helpers/utils');

const MAKING = ether('100');
const TAKING = ether('0.1');
const BUMP = 50_000; // 0.5% in 1e7
const DURATION = 180;

// A three-point curve, the shape a production quote actually carries.
const CURVE_POINTS = [{ coefficient: 40_000, delay: 60 }, { coefficient: 20_000, delay: 60 }];
// The quote's depth ladder for the fill-curve configuration.
const FILL_POINTS = [{ premium: 30_000, shareDelta: 3000 }, { premium: 15_000, shareDelta: 3000 }];

async function main () {
    const [maker, taker, resolver2] = await ethers.getSigners();
    const { dai, weth, inch, swap, chainId } = await deploySwapTokens();

    await dai.mint(maker, ether('10000000'));
    await inch.mint(taker, ether('1'));
    await weth.connect(taker).deposit({ value: ether('500') });
    await dai.connect(maker).approve(swap, ethers.MaxUint256);
    await weth.connect(taker).approve(swap, ethers.MaxUint256);

    const Registrator = await ethers.getContractFactory('OrderRegistrator');
    const registrator = await Registrator.deploy(swap);
    await registrator.waitForDeployment();

    const Auction = await ethers.getContractFactory('FusionAnchoredAuction');
    const auction = await Auction.deploy(registrator);
    await auction.waitForDeployment();

    const Settlement = await ethers.getContractFactory('SimpleSettlementMock');
    const settlement = await Settlement.deploy(swap, inch, weth, maker);
    await settlement.waitForDeployment();

    const auctionAddr = await auction.getAddress();
    const settlementAddr = await settlement.getAddress();
    // The getter side takes a count byte plus 10-byte addresses; the post-interaction side
    // additionally carries the allowed time and per-entry deltas.
    const whitelistGetter = '0x01' + taker.address.slice(-20);
    const whitelistPI = ethers.solidityPacked(['uint32', 'uint8', 'uint80', 'uint16'],
        [0, 1, BigInt(taker.address) & ((1n << 80n) - 1n), 0]);

    let salt = 1n;
    const nextOrder = (extensions, extra = {}) => buildOrder(
        {
            maker: maker.address,
            makerAsset: dai.target,
            takerAsset: weth.target,
            makingAmount: MAKING,
            takingAmount: TAKING,
            makerTraits: buildMakerTraits({ allowMultipleFills: true, nonce: salt++ }),
            ...extra,
        },
        extensions,
    );

    async function fillGas (order, amount, { announce = false } = {}) {
        let announceGas = 0;
        if (announce) {
            const tx = await registrator.connect(maker).registerOrder(order, order.extension);
            announceGas = Number((await tx.wait()).gasUsed);
        }
        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, swap.target, maker));
        const tt = buildTakerTraits({ makingAmount: true, extension: order.extension });
        const tx = await swap.connect(taker).fillOrderArgs(order, r, vs, amount, tt.traits, tt.args);
        return { fill: Number((await tx.wait()).gasUsed), announce: announceGas };
    }

    // ---- A. today's production Fusion: the settlement's own build-time auction ----
    const prodExtensions = () => buildFeeTakerExtensions({
        feeTaker: settlementAddr,
        getterExtraPrefix: buildLegacyAuctionDetails({ startTime: 0, duration: DURATION, initialRateBump: BUMP, points: CURVE_POINTS }),
        protocolFeeRecipient: resolver2.address,
        resolverFee: 1000,
        whitelistDiscount: 100,
        whitelist: whitelistGetter,
        whitelistPostInteraction: whitelistPI,
    });

    // ---- B/C/D. the new auction standalone ----
    const newExtensions = ({ anchored, fillPremiums }) => {
        const data = ethers.solidityPacked(['address', 'bytes'], [auctionAddr, buildAnchoredAuctionDetails({
            startTime: 0, duration: DURATION, initialRateBump: BUMP, points: CURVE_POINTS, anchored, fillPremiums,
        })]);
        return {
            makingAmountData: data,
            takingAmountData: data,
            postInteraction: ethers.solidityPacked(['address', 'bytes'],
                [auctionAddr, buildAnchoredExclusivity({ anchored, whitelist: [{ address: taker.address }] })]),
        };
    };

    // ---- E. migration shape: the deployed settlement, curve neutralized, chained to the new auction ----
    const chainedExtensions = ({ fillPremiums }) => {
        const tail = ethers.solidityPacked(['address', 'bytes'], [auctionAddr, buildAnchoredAuctionDetails({
            startTime: 0, duration: DURATION, initialRateBump: BUMP, points: CURVE_POINTS, anchored: true, fillPremiums,
        })]);
        return buildFeeTakerExtensions({
            feeTaker: settlementAddr,
            getterExtraPrefix: buildLegacyAuctionDetails(),
            protocolFeeRecipient: resolver2.address,
            resolverFee: 1000,
            whitelistDiscount: 100,
            whitelist: whitelistGetter,
            whitelistPostInteraction: whitelistPI,
            customMakingGetter: tail,
            customTakingGetter: tail,
            customPostInteraction: ethers.solidityPacked(['address', 'bytes'],
                [auctionAddr, buildAnchoredExclusivity({ anchored: true, whitelist: [{ address: taker.address }] })]),
        });
    };

    // Warm the token and protocol storage so every configuration is measured on comparable state.
    await fillGas(nextOrder(prodExtensions(), { receiver: settlementAddr }), MAKING / 4n);
    await fillGas(nextOrder(newExtensions({ anchored: false })), MAKING / 4n);
    await fillGas(nextOrder(chainedExtensions({}), { receiver: settlementAddr }), MAKING / 4n, { announce: true });

    const out = { configs: [] };
    const record = async (key, label, extensions, opts = {}) => {
        const { receiver, ...fillOpts } = opts;
        const extra = receiver ? { receiver } : {};
        const half = await fillGas(nextOrder(extensions, extra), MAKING / 2n, fillOpts);
        const full = await fillGas(nextOrder(extensions, extra), MAKING, fillOpts);
        out.configs.push({ key, label, half: half.fill, full: full.fill, announce: half.announce });
        console.log(`${key.padEnd(26)} half=${half.fill}  full=${full.fill}  announce=${half.announce}`);
    };

    await record('prod', 'today\'s Fusion settlement', prodExtensions(), { receiver: settlementAddr });
    await record('new_parity', 'new auction, no flags', newExtensions({ anchored: false }));
    await record('new_anchored', 'new auction, anchored', newExtensions({ anchored: true }), { announce: true });
    await record('new_anchored_curve', 'new auction, anchored + ladder',
        newExtensions({ anchored: true, fillPremiums: { initial: 45_000, points: FILL_POINTS } }), { announce: true });
    await record('chained', 'settlement + chained new auction', chainedExtensions({}), { announce: true, receiver: settlementAddr });
    await record('chained_curve', 'settlement + chained, with ladder',
        chainedExtensions({ fillPremiums: { initial: 45_000, points: FILL_POINTS } }), { announce: true, receiver: settlementAddr });

    // The DelegatedMaker flow: one create transaction replaces the off-chain signature entirely.
    const DelegatedMaker = await ethers.getContractFactory('DelegatedMaker');
    const dm = await DelegatedMaker.deploy(swap, registrator);
    await dm.waitForDeployment();
    await dai.connect(maker).approve(dm, ethers.MaxUint256);
    const dmAddr = await dm.getAddress();
    const dmData = ethers.solidityPacked(['address', 'bytes'], [auctionAddr, buildAnchoredAuctionDetails({
        startTime: 0, duration: DURATION, initialRateBump: BUMP, points: CURVE_POINTS, anchored: true,
    })]);
    const dmOrder = buildOrder(
        {
            maker: dmAddr,
            receiver: maker.address,
            makerAsset: dai.target,
            takerAsset: weth.target,
            makingAmount: MAKING,
            takingAmount: TAKING,
            makerTraits: buildMakerTraits({ allowMultipleFills: true }),
        },
        { makingAmountData: dmData, takingAmountData: dmData, preInteraction: dmAddr },
    );
    const createTx = await dm.connect(maker).createOrder(dmOrder, dmOrder.extension);
    const createGas = Number((await createTx.wait()).gasUsed);
    const tt = buildTakerTraits({ makingAmount: true, extension: dmOrder.extension });
    const dmFill = await swap.connect(taker).fillContractOrderArgs(dmOrder, '0x', MAKING / 2n, tt.traits, tt.args);
    const dmFillGas = Number((await dmFill.wait()).gasUsed);
    const dmFill2 = await swap.connect(taker).fillContractOrderArgs(dmOrder, '0x', MAKING / 4n, tt.traits, tt.args);
    const dmFillGas2 = Number((await dmFill2.wait()).gasUsed);
    out.delegatedMaker = { create: createGas, half: dmFillGas, second: dmFillGas2 };
    console.log(`delegatedMaker             create=${createGas}  half=${dmFillGas}  second=${dmFillGas2}`);

    fs.writeFileSync('/tmp/gas_data.json', JSON.stringify(out, null, 2));
    console.log('\nwritten to /tmp/gas_data.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
