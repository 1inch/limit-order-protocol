const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('../helpers/fixtures');
const { buildOrder, buildTakerTraits, signOrder, buildMakerTraits } = require('../helpers/orderUtils');
const { ether } = require('../helpers/utils');

// Characterization tests, NOT specification tests.
//
// description.md documents neither the owner/pause mechanism nor the simulate
// entry point. These tests pin the behaviour that exists.
//
// Authorised by:
//   DIV-004 - ACCEPTED_CURRENT_BEHAVIOUR, 2026-08-03. Owner can halt all fills;
//             cancellation deliberately stays open. See ACC-003, OPS-001.
//   DIV-005 - ACCEPTED_CURRENT_BEHAVIOUR, 2026-08-03. simulate delegatecalls an
//             arbitrary target and always reverts. See SEC-001.
//
// The proof that simulate cannot persist state is a specification test, not a
// characterization one, and lives with SEC-001 in the main suite.

describe('OrderMixin characterization [DIV-004][DIV-005]', function () {
    let addr, addr1, addr2;

    before(async function () {
        [addr, addr1, addr2] = await ethers.getSigners();
    });

    async function deployAndSignOrder () {
        const { dai, weth, swap, chainId } = await deploySwapTokens();

        await dai.mint(addr1, ether('1000000'));
        await weth.deposit({ value: ether('100') });
        await dai.connect(addr1).approve(swap, ether('1000000'));
        await weth.approve(swap, ether('100'));

        const order = buildOrder({
            maker: addr1.address,
            makerAsset: await dai.getAddress(),
            takerAsset: await weth.getAddress(),
            makingAmount: ether('100'),
            takingAmount: ether('0.1'),
            makerTraits: buildMakerTraits(),
        });
        const { r, yParityAndS: vs } = ethers.Signature.from(
            await signOrder(order, chainId, await swap.getAddress(), addr1),
        );

        return { dai, weth, swap, chainId, order, r, vs };
    }

    describe('pause [DIV-004]', function () {
        // OPS-001. The asymmetry is the substance: pausing blocks fills and
        // deliberately does not block a maker's exit.
        it('[OPS-001][ACC-003] blocks the EOA fill entry points while paused', async function () {
            const { swap, order, r, vs } = await loadFixture(deployAndSignOrder);

            await swap.pause();
            expect(await swap.paused()).to.equal(true);

            const takerTraits = buildTakerTraits({});

            await expect(
                swap.fillOrder(order, r, vs, order.makingAmount, takerTraits.traits),
            ).to.be.revertedWithCustomError(swap, 'EnforcedPause');

            await expect(
                swap.fillOrderArgs(order, r, vs, order.makingAmount, takerTraits.traits, takerTraits.args),
            ).to.be.revertedWithCustomError(swap, 'EnforcedPause');
        });

        // Pinned because it corrects an assumption: the pause check is NOT the
        // first thing a fill evaluates. whenNotPaused sits on _fill, which runs
        // after signature verification, so an invalid signature is reported
        // even while the protocol is paused. Discovered by this test failing
        // against the naive expectation of EnforcedPause.
        //
        // Consequence: a caller cannot use the revert reason to distinguish
        // "paused" from "bad signature" on the contract-order path, and SCN-041
        // holds only for a signature that would otherwise be accepted.
        it('[OPS-001] verifies the signature before the pause check on the contract-order path', async function () {
            const { swap, order } = await loadFixture(deployAndSignOrder);

            await swap.pause();
            const takerTraits = buildTakerTraits({});

            // order.maker is an EOA, so ERC-1271 validation of an empty
            // signature fails. That failure precedes whenNotPaused.
            await expect(
                swap.fillContractOrder(order, '0x', order.makingAmount, takerTraits.traits),
            ).to.be.revertedWithCustomError(swap, 'BadSignature');

            await expect(
                swap.fillContractOrderArgs(order, '0x', order.makingAmount, takerTraits.traits, takerTraits.args),
            ).to.be.revertedWithCustomError(swap, 'BadSignature');
        });

        // OPS-001, closing GAP-011. Previously unasserted: the existing suite
        // covers the block but never that the maker retains an exit.
        it('[OPS-001][GAP-011] leaves cancellation available while paused', async function () {
            const { swap, order } = await loadFixture(deployAndSignOrder);

            const orderHash = await swap.hashOrder(order);
            await swap.pause();

            await expect(swap.connect(addr1).cancelOrder(order.makerTraits, orderHash))
                .to.emit(swap, 'OrderCancelled')
                .withArgs(orderHash);

            expect(await swap.remainingInvalidatorForOrder(addr1.address, orderHash)).to.equal(0n);
        });

        it('[OPS-001][GAP-011] leaves epoch advance available while paused', async function () {
            const { swap } = await loadFixture(deployAndSignOrder);

            await swap.pause();

            await expect(swap.connect(addr1).increaseEpoch(0))
                .to.emit(swap, 'EpochIncreased')
                .withArgs(addr1.address, 0, 1);

            expect(await swap.epoch(addr1.address, 0)).to.equal(1n);
        });

        // An order cancelled during a pause stays cancelled afterwards: the
        // pause does not buffer or defer the write.
        it('[OPS-001] an order cancelled while paused is still unfillable after unpausing', async function () {
            const { swap, order, r, vs } = await loadFixture(deployAndSignOrder);

            const orderHash = await swap.hashOrder(order);
            await swap.pause();
            await swap.connect(addr1).cancelOrder(order.makerTraits, orderHash);
            await swap.unpause();

            expect(await swap.paused()).to.equal(false);

            const takerTraits = buildTakerTraits({});
            await expect(
                swap.fillOrder(order, r, vs, order.makingAmount, takerTraits.traits),
            ).to.be.revertedWithCustomError(swap, 'InvalidatedOrder');
        });

        it('[ACC-003] resumes normal filling after unpausing', async function () {
            const { dai, swap, order, r, vs } = await loadFixture(deployAndSignOrder);

            await swap.pause();
            await swap.unpause();

            const takerTraits = buildTakerTraits({});
            await expect(
                swap.fillOrder(order, r, vs, order.makingAmount, takerTraits.traits),
            ).to.changeTokenBalances(dai, [addr, addr1], [order.makingAmount, -order.makingAmount]);
        });

        it('[ACC-003] rejects pause and unpause from a non-owner', async function () {
            const { swap } = await loadFixture(deployAndSignOrder);

            await expect(swap.connect(addr2).pause())
                .to.be.revertedWithCustomError(swap, 'OwnableUnauthorizedAccount')
                .withArgs(addr2.address);

            await swap.pause();

            await expect(swap.connect(addr2).unpause())
                .to.be.revertedWithCustomError(swap, 'OwnableUnauthorizedAccount')
                .withArgs(addr2.address);
        });

        // ACC-003 criterion 5. Renouncing ownership is irreversible and leaves
        // the protocol permanently unpausable - worth pinning because it is a
        // plausible decentralisation step with a one-way consequence.
        it('[ACC-003] renouncing ownership makes the protocol permanently unpausable', async function () {
            const { swap } = await loadFixture(deployAndSignOrder);

            await swap.renounceOwnership();
            expect(await swap.owner()).to.equal(ethers.ZeroAddress);

            await expect(swap.pause()).to.be.revertedWithCustomError(swap, 'OwnableUnauthorizedAccount');
        });
    });

    describe('simulate [DIV-005]', function () {
        // SEC-001. The revert is unconditional, so there is no success path at
        // all - the outcome is always delivered as revert data.
        it('[SEC-001] reverts with SimulationResults reporting a successful inner call', async function () {
            const { swap } = await loadFixture(deployAndSignOrder);

            // increaseEpoch succeeds and returns no data.
            const calldata = swap.interface.encodeFunctionData('increaseEpoch', [0]);

            await expect(swap.simulate(swap, calldata))
                .to.be.revertedWithCustomError(swap, 'SimulationResults')
                .withArgs(true, '0x');
        });

        it('[SEC-001] reverts with SimulationResults reporting a failed inner call', async function () {
            const { swap } = await loadFixture(deployAndSignOrder);

            // advanceEpoch(0, 0) reverts AdvanceEpochFailed.
            const calldata = swap.interface.encodeFunctionData('advanceEpoch', [0, 0]);

            await expect(swap.simulate(swap, calldata))
                .to.be.revertedWithCustomError(swap, 'SimulationResults')
                .withArgs(false, swap.interface.getError('AdvanceEpochFailed').selector);
        });

        // simulate is unrestricted: any caller reaches the delegatecall. Pinned
        // because the safety argument rests entirely on the revert, not on
        // access control.
        it('[SEC-001] is callable by any address and still reverts', async function () {
            const { swap } = await loadFixture(deployAndSignOrder);

            const calldata = swap.interface.encodeFunctionData('increaseEpoch', [0]);

            await expect(swap.connect(addr2).simulate(swap, calldata))
                .to.be.revertedWithCustomError(swap, 'SimulationResults');
        });
    });
});
