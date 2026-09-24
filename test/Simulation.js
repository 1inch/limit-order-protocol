const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');
const { buildOrder, buildTakerTraits, signOrder, buildMakerTraits } = require('./helpers/orderUtils');
const { ether } = require('./helpers/utils');

// Specification tests for SEC-001 (CRITICAL) and INV-008.
//
// simulate() delegatecalls an arbitrary caller-supplied target in the
// protocol's own storage context. The unconditional revert on the line after
// the delegatecall is the entire safety argument - there is no branch between
// them, so no execution path reaches the end of the function.
//
// These tests exist to catch a future refactor that introduces a return path.
// That is their whole value: today they cannot fail, because the revert makes
// persistence impossible. If one ever fails, an attacker has arbitrary writes
// to both invalidator mappings.
//
// Closes GAP-012, the second of the two CRITICAL requirements the existing
// suite left PARTIAL. Authorised as a specification test by DIV-005.

describe('Simulation', function () {
    let addr, addr1, addr2;

    before(async function () {
        [addr, addr1, addr2] = await ethers.getSigners();
    });

    async function deployContractsAndInit () {
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

    async function readSlots (address, count = 12) {
        const slots = [];
        for (let i = 0; i < count; i++) {
            slots.push(await ethers.provider.getStorage(address, i));
        }
        return slots;
    }

    // INV-008 criterion 1. The generic form: a target that writes storage
    // leaves nothing behind.
    it('[SEC-001][INV-008] a simulated epoch advance does not change the epoch', async function () {
        const { swap } = await loadFixture(deployContractsAndInit);

        expect(await swap.epoch(addr1.address, 0)).to.equal(0n);

        const calldata = swap.interface.encodeFunctionData('increaseEpoch', [0]);
        await expect(swap.connect(addr1).simulate(swap, calldata))
            .to.be.revertedWithCustomError(swap, 'SimulationResults');

        expect(await swap.epoch(addr1.address, 0)).to.equal(0n);
    });

    // INV-008 criterion 6. Deliberately specific rather than relying on the
    // generic form: the invalidator mappings are the slots whose corruption
    // would be most valuable to an attacker.
    it('[SEC-001][INV-008] a simulated cancellation leaves the order fillable', async function () {
        const { dai, swap, order, r, vs } = await loadFixture(deployContractsAndInit);

        const orderHash = await swap.hashOrder(order);
        const calldata = swap.interface.encodeFunctionData('cancelOrder', [order.makerTraits, orderHash]);

        // delegatecall preserves msg.sender, so this would write the maker's
        // own invalidator slot if it persisted.
        await expect(swap.connect(addr1).simulate(swap, calldata))
            .to.be.revertedWithCustomError(swap, 'SimulationResults');

        // The raw accessor is the right observation for an untouched order.
        // remainingInvalidatorForOrder would revert RemainingInvalidatedOrder
        // here: its single-argument overload treats stored zero as invalidated,
        // while isNewOrder treats the same value as new. That disagreement is
        // recorded in 02-compliance-report.md section 8; the core only uses the
        // two-argument form, so it is latent rather than live.
        expect(await swap.rawRemainingInvalidatorForOrder(addr1.address, orderHash)).to.equal(0n);

        // The order is not merely recorded as live, it still fills.
        const takerTraits = buildTakerTraits({});
        await expect(
            swap.fillOrder(order, r, vs, order.makingAmount, takerTraits.traits),
        ).to.changeTokenBalances(dai, [addr, addr1], [order.makingAmount, -order.makingAmount]);
    });

    it('[SEC-001][INV-008] a simulated mass invalidation leaves the bitmap clear', async function () {
        const { swap } = await loadFixture(deployContractsAndInit);

        const bitInvalidatorTraits = buildMakerTraits({ allowMultipleFills: false, nonce: 5 });
        expect(await swap.bitInvalidatorForOrder(addr1.address, 0)).to.equal(0n);

        const calldata = swap.interface.encodeFunctionData('bitsInvalidateForOrder', [
            bitInvalidatorTraits,
            ethers.MaxUint256,
        ]);

        await expect(swap.connect(addr1).simulate(swap, calldata))
            .to.be.revertedWithCustomError(swap, 'SimulationResults');

        expect(await swap.bitInvalidatorForOrder(addr1.address, 0)).to.equal(0n);
    });

    // ACC-003 crossed with SEC-001: the owner's privilege is not reachable
    // through a simulation either.
    it('[SEC-001][INV-008] a simulated pause leaves the protocol active', async function () {
        const { swap } = await loadFixture(deployContractsAndInit);

        expect(await swap.paused()).to.equal(false);

        const calldata = swap.interface.encodeFunctionData('pause', []);
        // Called by the owner, so the inner call would succeed on its merits.
        await expect(swap.simulate(swap, calldata))
            .to.be.revertedWithCustomError(swap, 'SimulationResults')
            .withArgs(true, '0x');

        expect(await swap.paused()).to.equal(false);
    });

    it('[SEC-001][INV-008] a simulated ownership transfer leaves the owner unchanged', async function () {
        const { swap } = await loadFixture(deployContractsAndInit);

        const ownerBefore = await swap.owner();
        expect(ownerBefore).to.equal(addr.address);

        const calldata = swap.interface.encodeFunctionData('transferOwnership', [addr2.address]);
        await expect(swap.simulate(swap, calldata))
            .to.be.revertedWithCustomError(swap, 'SimulationResults');

        expect(await swap.owner()).to.equal(ownerBefore);
    });

    // The layout-agnostic form: rather than naming slots, snapshot the low
    // storage range and require it byte-identical. Catches a write this file
    // does not have a named getter for.
    it('[SEC-001][INV-008] leaves the protocol raw storage byte-identical', async function () {
        const { swap, order } = await loadFixture(deployContractsAndInit);

        const swapAddress = await swap.getAddress();
        const orderHash = await swap.hashOrder(order);
        const before = await readSlots(swapAddress);

        const writes = [
            swap.interface.encodeFunctionData('increaseEpoch', [0]),
            swap.interface.encodeFunctionData('cancelOrder', [order.makerTraits, orderHash]),
            swap.interface.encodeFunctionData('pause', []),
            swap.interface.encodeFunctionData('transferOwnership', [addr2.address]),
        ];

        for (const calldata of writes) {
            await expect(swap.simulate(swap, calldata))
                .to.be.revertedWithCustomError(swap, 'SimulationResults');
        }

        expect(await readSlots(swapAddress)).to.deep.equal(before);
    });

    // INV-008 criterion 3. A reverting target is reported, not swallowed.
    it('[SEC-001] reports a reverting target without persisting anything', async function () {
        const { swap } = await loadFixture(deployContractsAndInit);

        const before = await readSlots(await swap.getAddress());

        // advanceEpoch(0, 256) exceeds the 255 bound.
        const calldata = swap.interface.encodeFunctionData('advanceEpoch', [0, 256]);
        await expect(swap.simulate(swap, calldata))
            .to.be.revertedWithCustomError(swap, 'SimulationResults')
            .withArgs(false, swap.interface.getError('AdvanceEpochFailed').selector);

        expect(await readSlots(await swap.getAddress())).to.deep.equal(before);
    });

    // INV-008 criterion 4. A target with no code cannot be distinguished from
    // a successful no-op by the delegatecall, which is worth pinning so the
    // payload semantics are not mistaken for proof the target ran.
    it('[SEC-001] reports success for a target with no code', async function () {
        const { swap } = await loadFixture(deployContractsAndInit);

        await expect(swap.simulate(addr2.address, '0x'))
            .to.be.revertedWithCustomError(swap, 'SimulationResults')
            .withArgs(true, '0x');
    });

    // Residual gap, recorded rather than silently skipped: the case where an
    // outer contract calls simulate inside try/catch and then completes
    // successfully. That is the scenario in which "never persists" does real
    // work, and covering it needs a new mock contract in contracts/mocks/.
    // Adding a Solidity file was outside the scope approved at Gate B, so this
    // is left to a follow-up rather than approximated here.
    it('[SEC-001] has no success path that a caller could observe', async function () {
        const { swap } = await loadFixture(deployContractsAndInit);

        // Every invocation reverts, whatever the target and calldata.
        const cases = [
            [await swap.getAddress(), swap.interface.encodeFunctionData('increaseEpoch', [0])],
            [await swap.getAddress(), '0x'],
            [addr2.address, '0xdeadbeef'],
        ];

        for (const [target, data] of cases) {
            await expect(swap.simulate(target, data), `simulate(${target}, ${data}) did not revert`)
                .to.be.reverted;
        }
    });
});
