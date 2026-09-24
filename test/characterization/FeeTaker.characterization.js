const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('../helpers/fixtures');
const { buildOrder, buildTakerTraits, signOrder, buildFeeTakerExtensions } = require('../helpers/orderUtils');
const { ether } = require('../helpers/utils');

// Characterization tests, NOT specification tests.
//
// No specification of FeeTaker's intended fee behaviour exists: the string "fee"
// does not appear in description.md. These tests pin what the code does today so
// a regression is visible. They cannot establish that the behaviour is correct,
// because the expected values were derived from the implementation itself.
//
// Authorised by DIV-010, decided ACCEPTED_CURRENT_BEHAVIOUR on 2026-08-03 with
// the instruction to reverse-engineer fee intent from the code and mark the
// resulting requirements low-confidence. See ECON-001 .. ECON-004.
//
// OQ-3 remains open: a real fee specification would let these be promoted to
// specification tests. Promotion requires a requirement, a scenario and an
// approval - never a rename.

describe('FeeTaker characterization [DIV-010]', function () {
    let addr, addr1, addr2, addr3, addr4;

    before(async function () {
        [addr, addr1, addr2, addr3, addr4] = await ethers.getSigners();
    });

    async function deployContractsAndInit () {
        const { dai, weth, inch, swap, chainId } = await deploySwapTokens();

        await dai.mint(addr1, ether('1000000'));
        await weth.deposit({ value: ether('100') });
        await inch.mint(addr, ether('1000'));

        // addr2 is funded to trade but deliberately holds no access token and is
        // left out of every whitelist, so it exercises the ungated path.
        await weth.connect(addr2).deposit({ value: ether('100') });

        await dai.connect(addr1).approve(swap, ether('1000000'));
        await weth.approve(swap, ether('1000000'));
        await weth.connect(addr2).approve(swap, ether('1000000'));

        const FeeTaker = await ethers.getContractFactory('FeeTaker');
        const feeTaker = await FeeTaker.deploy(swap, inch, weth, addr);
        await feeTaker.waitForDeployment();

        return { dai, weth, inch, swap, chainId, feeTaker };
    }

    // 10 whitelist entries, all the low 10 bytes of one address.
    const whitelistOf = (address) => '0x0a' + address.slice(-20).repeat(10);

    async function buildFeeOrder ({ feeTaker, dai, weth, chainId, swap, extensionOverrides = {} }) {
        const makingAmount = ether('300');
        const takingAmount = ether('0.3');

        const order = buildOrder(
            {
                maker: addr1.address,
                receiver: await feeTaker.getAddress(),
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount,
                takingAmount,
            },
            buildFeeTakerExtensions({
                feeTaker: await feeTaker.getAddress(),
                integratorFeeRecipient: addr3.address,
                protocolFeeRecipient: addr4.address,
                integratorFee: BigInt(1e4),
                resolverFee: BigInt(1e3),
                ...extensionOverrides,
            }),
        );

        const { r, yParityAndS: vs } = ethers.Signature.from(
            await signOrder(order, chainId, await swap.getAddress(), addr1),
        );
        const takerTraits = buildTakerTraits({ makingAmount: true, extension: order.extension });

        return { order, r, vs, takerTraits, makingAmount, takingAmount };
    }

    // ECON-001 criterion 2 / INV-010. This is the one assertion here that is
    // meaningful without knowing the intended fee model: whatever the split is
    // supposed to be, the payouts must account for every unit the taker sent.
    it('[ECON-001][INV-010] pays out exactly what the taker sent, retaining nothing', async function () {
        const { dai, weth, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);
        const { order, r, vs, takerTraits, makingAmount } = await buildFeeOrder({
            feeTaker, dai, weth, chainId, swap, extensionOverrides: { whitelist: whitelistOf(addr.address) },
        });

        const feeTakerAddress = await feeTaker.getAddress();
        const before = {
            taker: await weth.balanceOf(addr.address),
            maker: await weth.balanceOf(addr1.address),
            integrator: await weth.balanceOf(addr3.address),
            protocol: await weth.balanceOf(addr4.address),
            feeTaker: await weth.balanceOf(feeTakerAddress),
        };

        await swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);

        const after = {
            taker: await weth.balanceOf(addr.address),
            maker: await weth.balanceOf(addr1.address),
            integrator: await weth.balanceOf(addr3.address),
            protocol: await weth.balanceOf(addr4.address),
            feeTaker: await weth.balanceOf(feeTakerAddress),
        };

        const takerPaid = before.taker - after.taker;
        const distributed =
            (after.maker - before.maker) +
            (after.integrator - before.integrator) +
            (after.protocol - before.protocol);

        expect(takerPaid).to.be.gt(0n);
        expect(distributed).to.equal(takerPaid);
        expect(after.feeTaker).to.equal(before.feeTaker);
        expect(after.feeTaker).to.equal(0n);
    });

    // ECON-003. The whitelist is checked on the low 80 bits only, and a taker
    // outside it must hold the access token instead.
    it('[ECON-003] settles for a non-whitelisted taker that holds the access token', async function () {
        const { dai, weth, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);
        const { order, r, vs, takerTraits, makingAmount } = await buildFeeOrder({
            feeTaker, dai, weth, chainId, swap, extensionOverrides: { whitelist: whitelistOf(addr1.address) },
        });

        // addr is not in the whitelist but was minted 1000 INCH, the access token.
        await expect(
            swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args),
        ).to.changeTokenBalances(dai, [addr, addr1], [makingAmount, -makingAmount]);
    });

    // ECON-003, closing GAP-021: the revert was previously unasserted.
    it('[ECON-003][GAP-021] reverts OnlyWhitelistOrAccessToken without whitelist or access token', async function () {
        const { dai, weth, inch, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);
        const { order, r, vs, takerTraits, makingAmount } = await buildFeeOrder({
            feeTaker, dai, weth, chainId, swap, extensionOverrides: { whitelist: whitelistOf(addr1.address) },
        });

        expect(await inch.balanceOf(addr2.address)).to.equal(0n);

        await expect(
            swap.connect(addr2).fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args),
        ).to.be.revertedWithCustomError(feeTaker, 'OnlyWhitelistOrAccessToken');
    });

    // ECON-001. Fees are only collectable when FeeTaker is actually holding the
    // taking amount, which it only is when it is the order's receiver.
    it('[ECON-001] reverts InconsistentFee when a fee-bearing order does not pay FeeTaker', async function () {
        const { dai, weth, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);

        const makingAmount = ether('300');
        const takingAmount = ether('0.3');

        const order = buildOrder(
            {
                maker: addr1.address,
                receiver: addr1.address, // not FeeTaker, while fees are non-zero
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount,
                takingAmount,
            },
            buildFeeTakerExtensions({
                feeTaker: await feeTaker.getAddress(),
                integratorFeeRecipient: addr3.address,
                protocolFeeRecipient: addr4.address,
                integratorFee: BigInt(1e4),
                resolverFee: BigInt(1e3),
                whitelist: whitelistOf(addr.address),
            }),
        );

        const { r, yParityAndS: vs } = ethers.Signature.from(
            await signOrder(order, chainId, await swap.getAddress(), addr1),
        );
        const takerTraits = buildTakerTraits({ makingAmount: true, extension: order.extension });

        await expect(
            swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args),
        ).to.be.revertedWithCustomError(feeTaker, 'InconsistentFee');
    });

    // ECON-004. The discount scales the resolver fee only, and only for a
    // whitelisted taker. A numerator of 0 removes the resolver fee entirely.
    it('[ECON-004] a zero whitelist discount removes the resolver fee for a whitelisted taker', async function () {
        const { dai, weth, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);

        const takingAmount = ether('0.3');
        const integratorFee = BigInt(1e4);
        const resolverFee = BigInt(1e3);

        const { order, r, vs, takerTraits, makingAmount } = await buildFeeOrder({
            feeTaker,
            dai,
            weth,
            chainId,
            swap,
            extensionOverrides: {
                whitelist: whitelistOf(addr.address),
                whitelistDiscount: 0,
                integratorFee,
                resolverFee,
            },
        });

        // With the resolver fee discounted to zero, the protocol recipient
        // receives only the integrator pool's remainder: integratorShare
        // defaults to 50, so half of the integrator fee.
        const integratorExpected = takingAmount * (integratorFee / 2n) / BigInt(1e5);
        const protocolExpected = takingAmount * (integratorFee / 2n) / BigInt(1e5);

        await expect(
            swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args),
        ).to.changeTokenBalances(
            weth,
            [addr1.address, addr3.address, addr4.address],
            [takingAmount, integratorExpected, protocolExpected],
        );
    });

    // ECON-004. Validation bounds are the only real evidence of intent in the
    // fee code: someone deliberately capped both at 100.
    it('[ECON-004] rejects a whitelist discount numerator above 100', async function () {
        const { dai, weth, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);
        const { order, r, vs, takerTraits, makingAmount } = await buildFeeOrder({
            feeTaker,
            dai,
            weth,
            chainId,
            swap,
            extensionOverrides: { whitelist: whitelistOf(addr.address), whitelistDiscount: 101 },
        });

        await expect(
            swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args),
        ).to.be.revertedWithCustomError(feeTaker, 'InvalidWhitelistDiscountNumerator');
    });

    it('[ECON-004] rejects an integrator share above 100', async function () {
        const { dai, weth, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);
        const { order, r, vs, takerTraits, makingAmount } = await buildFeeOrder({
            feeTaker,
            dai,
            weth,
            chainId,
            swap,
            extensionOverrides: { whitelist: whitelistOf(addr.address), integratorShare: 101 },
        });

        await expect(
            swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args),
        ).to.be.revertedWithCustomError(feeTaker, 'InvalidIntegratorShare');
    });

    // ACC-004, closing GAP-009. postInteraction moves whatever balance FeeTaker
    // holds, so the caller restriction is the whole protection.
    it('[ACC-004][GAP-009] rejects a direct postInteraction call from a non-protocol address', async function () {
        const { dai, weth, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);
        const { order } = await buildFeeOrder({
            feeTaker, dai, weth, chainId, swap, extensionOverrides: { whitelist: whitelistOf(addr.address) },
        });

        const orderTuple = [
            order.salt, order.maker, order.receiver, order.makerAsset,
            order.takerAsset, order.makingAmount, order.takingAmount, order.makerTraits,
        ];

        await expect(
            feeTaker.connect(addr2).postInteraction(
                orderTuple, '0x', ethers.ZeroHash, addr2.address, 1n, 1n, 1n, '0x',
            ),
        ).to.be.revertedWithCustomError(feeTaker, 'OnlyLimitOrderProtocol');
    });

    // ACC-005, closing GAP-010. FeeTaker should hold nothing between
    // transactions; rescueFunds exists for when it nonetheless does.
    it('[ACC-005][GAP-010] only the owner can rescue a stranded balance', async function () {
        const { weth, feeTaker } = await loadFixture(deployContractsAndInit);

        const stranded = ether('1');
        await weth.transfer(await feeTaker.getAddress(), stranded);
        expect(await weth.balanceOf(await feeTaker.getAddress())).to.equal(stranded);

        await expect(
            feeTaker.connect(addr2).rescueFunds(weth, stranded),
        ).to.be.revertedWithCustomError(feeTaker, 'OwnableUnauthorizedAccount');

        // addr is the owner, set at deployment.
        await expect(
            feeTaker.rescueFunds(weth, stranded),
        ).to.changeTokenBalances(weth, [addr, await feeTaker.getAddress()], [stranded, -stranded]);
    });
});
