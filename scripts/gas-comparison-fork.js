// Gas comparison against the LIVE mainnet Fusion settlement: an order priced by the settlement's own
// build-time auction (production today) versus the same order with the settlement's curve neutralized
// and the new anchored auction chained behind it (the migration shape). Real fills, real receipts.
//
//   MAINNET_RPC_URL=... MAINNET_RPC_URL=... npx hardhat run scripts/gas-comparison-fork.js
const hre = require('hardhat');
const { ethers, network } = hre;
const fs = require('fs');
const { ABIOrder, buildOrder, buildTakerTraits, buildAnchoredAuctionDetails, buildAnchoredExclusivity } = require('../test/helpers/orderUtils');
const { buildLegacyAuctionDetails } = require('../test/helpers/fusionAuction');
const { ether } = require('../test/helpers/utils');

const RPC = process.env.MAINNET_RPC_URL || process.env.FORK_RPC_URL;
const MAINNET = {
    router: '0x111111125421ca6dc452d289314280a0f8842a65',
    settlement: '0x2Ad5004c60e16E54d5007C80CE329Adde5B51Ef5',
    dai: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
};
const DAI_BALANCE_SLOT = 2n;
const MAKING = ether('100');
const TAKING = ether('0.03');
const BUMP = 50_000;
const DURATION = 180;
const CURVE_POINTS = [{ coefficient: 40_000, delay: 60 }, { coefficient: 20_000, delay: 60 }];

async function main () {
    if (!RPC) throw new Error('set MAINNET_RPC_URL');
    await network.provider.request({ method: 'hardhat_reset', params: [{ forking: { jsonRpcUrl: RPC } }] });

    const [maker, taker] = await ethers.getSigners();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const router = await ethers.getContractAt('LimitOrderProtocol', MAINNET.router);
    const dai = await ethers.getContractAt('TokenMock', MAINNET.dai);
    const weth = await ethers.getContractAt('WrappedTokenMock', MAINNET.weth);

    const Registrator = await ethers.getContractFactory('OrderRegistrator');
    const registrator = await Registrator.deploy(router);
    await registrator.waitForDeployment();
    const Auction = await ethers.getContractFactory('FusionAnchoredAuction');
    const auction = await Auction.deploy(registrator);
    await auction.waitForDeployment();
    const auctionAddr = await auction.getAddress();

    const slot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [maker.address, DAI_BALANCE_SLOT]));
    await network.provider.send('hardhat_setStorageAt', [MAINNET.dai, slot, ethers.toBeHex(ether('1000000'), 32)]);
    await dai.connect(maker).approve(router, ethers.MaxUint256);
    await weth.connect(taker).deposit({ value: ether('50') });
    await weth.connect(taker).approve(router, ethers.MaxUint256);

    const sign = (order) => maker.signTypedData(
        { name: '1inch Aggregation Router', version: '6', chainId, verifyingContract: MAINNET.router },
        { Order: ABIOrder.components }, order);

    const whitelistPI = ['uint32', 'uint8', 'uint80', 'uint16'];
    const whitelistVals = [0, 1, BigInt(taker.address) & ((1n << 80n) - 1n), 0];

    // A. Production today: the live settlement's own build-time Dutch auction prices the order.
    function prodOrder (salt) {
        const getter = ethers.solidityPacked(
            ['address', 'bytes', 'uint16', 'uint8', 'uint16', 'uint8', 'bytes'],
            [MAINNET.settlement, buildLegacyAuctionDetails({ startTime: 0, duration: DURATION, initialRateBump: BUMP, points: CURVE_POINTS }),
                0, 0, 0, 0, '0x01' + taker.address.slice(-20)]);
        const pi = ethers.solidityPacked(
            ['address', 'bytes1', 'address', 'address', 'uint16', 'uint8', 'uint16', 'uint8', ...whitelistPI, 'uint256', 'uint8'],
            [MAINNET.settlement, '0x00', ethers.ZeroAddress, ethers.ZeroAddress, 0, 0, 0, 0, ...whitelistVals, TAKING, 0]);
        return buildOrder({ maker: maker.address, makerAsset: MAINNET.dai, takerAsset: MAINNET.weth, makingAmount: MAKING, takingAmount: TAKING, salt },
            { makingAmountData: getter, takingAmountData: getter, postInteraction: pi });
    }

    // B. Migration: the same live settlement, curve neutralized, with the anchored auction chained behind it.
    function chainedOrder (salt) {
        const tail = ethers.solidityPacked(['address', 'bytes'],
            [auctionAddr, buildAnchoredAuctionDetails({ startTime: 0, duration: DURATION, initialRateBump: BUMP, points: CURVE_POINTS, anchored: true })]);
        const exclusivity = ethers.solidityPacked(['address', 'bytes'],
            [auctionAddr, buildAnchoredExclusivity({ anchored: true, whitelist: [{ address: taker.address }] })]);
        const getter = ethers.solidityPacked(
            ['address', 'bytes', 'uint16', 'uint8', 'uint16', 'uint8', 'bytes', 'bytes'],
            [MAINNET.settlement, buildLegacyAuctionDetails(), 0, 0, 0, 0, '0x01' + taker.address.slice(-20), tail]);
        const pi = ethers.solidityPacked(
            ['address', 'bytes1', 'address', 'address', 'uint16', 'uint8', 'uint16', 'uint8', ...whitelistPI, 'uint256', 'uint8', 'bytes'],
            [MAINNET.settlement, '0x00', ethers.ZeroAddress, ethers.ZeroAddress, 0, 0, 0, 0, ...whitelistVals, TAKING, 0, exclusivity]);
        return buildOrder({ maker: maker.address, makerAsset: MAINNET.dai, takerAsset: MAINNET.weth, makingAmount: MAKING, takingAmount: TAKING, salt },
            { makingAmountData: getter, takingAmountData: getter, postInteraction: pi });
    }

    async function measure (order, { announce }) {
        let announceGas = 0;
        if (announce) {
            announceGas = Number((await (await registrator.connect(maker).registerOrder(order, order.extension)).wait()).gasUsed);
        }
        const { r, yParityAndS: vs } = ethers.Signature.from(await sign(order));
        const tt = buildTakerTraits({ makingAmount: true, extension: order.extension });
        const tx = await router.connect(taker).fillOrderArgs(order, r, vs, MAKING / 2n, tt.traits, tt.args, { maxPriorityFeePerGas: 0 });
        return { fill: Number((await tx.wait()).gasUsed), announce: announceGas };
    }

    // Warm shared storage first so the two configurations are compared on equal footing.
    await measure(prodOrder(11n), { announce: false });
    await measure(chainedOrder(12n), { announce: true });

    const prod = await measure(prodOrder(21n), { announce: false });
    const chained = await measure(chainedOrder(22n), { announce: true });

    const out = {
        prod: prod.fill,
        chained: chained.fill,
        announce: chained.announce,
        deltaFill: chained.fill - prod.fill,
        deltaPct: ((chained.fill - prod.fill) / prod.fill) * 100,
    };
    console.log(`live settlement, its own auction : ${out.prod}`);
    console.log(`live settlement + chained anchored: ${out.chained}   (+${out.deltaFill}, +${out.deltaPct.toFixed(1)}%)`);
    console.log(`one-time announcement            : ${out.announce}`);
    fs.writeFileSync('/tmp/gas_fork.json', JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
