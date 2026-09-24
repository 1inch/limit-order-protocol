const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');
const { buildOrder, buildTakerTraits, signOrder, buildMakerTraits } = require('./helpers/orderUtils');
const { ether } = require('./helpers/utils');

// Specification tests for the two callback-safety gaps that needed a new mock.
//
// GAP-013 / SEC-002 - the maker-permit reentrancy guard. The permit is the one
//   mutating external call that runs BEFORE the invalidator is written, so it
//   is the only place in a fill where a reentrant second fill could succeed.
//   No test previously reached ReentrancyDetected.
// GAP-016 / INT-002 - the protocol ignores whatever a taker interaction
//   returns. description.md documents a return value that does not exist;
//   Gate A decided that a DOCUMENTATION_BUG (DIV-001).
//
// Both mocks were added under OQ-8, authorised on 2026-08-03. They live in
// contracts/mocks/ and are test-only; no production contract was changed.

describe('Callback safety', function () {
    let addr, addr1;

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
    });

    function orderFields (order) {
        return {
            salt: order.salt,
            maker: order.maker,
            receiver: order.receiver,
            makerAsset: order.makerAsset,
            takerAsset: order.takerAsset,
            makingAmount: order.makingAmount,
            takingAmount: order.takingAmount,
            makerTraits: order.makerTraits,
        };
    }

    describe('SEC-002 maker-permit reentrancy [GAP-013]', function () {
        async function deployReentrantSetup () {
            const { dai, weth, swap, chainId } = await deploySwapTokens();

            const ReentrantPermitMock = await ethers.getContractFactory('ReentrantPermitMock');
            const reentrantPermit = await ReentrantPermitMock.deploy(await swap.getAddress());
            await reentrantPermit.waitForDeployment();

            const makingAmount = ether('100');
            const takingAmount = ether('0.1');

            await dai.mint(addr1, ether('1000'));
            await dai.connect(addr1).approve(swap, ether('1000'));

            // The taker of the outer fill.
            await weth.deposit({ value: ether('1') });
            await weth.approve(swap, ether('1'));

            // The mock needs its own taker asset so the reentrant inner fill
            // can actually settle - the guard only fires if the inner fill
            // succeeds and writes the invalidator.
            await weth.transfer(await reentrantPermit.getAddress(), ether('0.5'));
            await reentrantPermit.approveProtocol(await weth.getAddress(), ether('0.5'));

            // A 224-byte permit payload routes SafeERC20.tryPermit to
            // IERC20Permit.permit, which is what the mock implements. The
            // contents are irrelevant; the mock ignores every argument.
            const permit = ethers.solidityPacked(
                ['address', 'bytes'],
                [await reentrantPermit.getAddress(), '0x' + '00'.repeat(224)],
            );

            const order = buildOrder(
                {
                    maker: addr1.address,
                    makerAsset: await dai.getAddress(),
                    takerAsset: await weth.getAddress(),
                    makingAmount,
                    takingAmount,
                    // Default traits allow partial and multiple fills, which
                    // selects the remaining invalidator - the only path the
                    // guard protects.
                    makerTraits: buildMakerTraits(),
                },
                { permit },
            );

            const { r, yParityAndS: vs } = ethers.Signature.from(
                await signOrder(order, chainId, await swap.getAddress(), addr1),
            );
            const takerTraits = buildTakerTraits({ extension: order.extension });

            return { dai, weth, swap, reentrantPermit, order, r, vs, takerTraits, makingAmount };
        }

        it('[SEC-002] reverts ReentrancyDetected when the permit re-enters and fills the same order', async function () {
            const { swap, reentrantPermit, order, r, vs, takerTraits } = await loadFixture(deployReentrantSetup);

            // The mock replays a fill of the very same order from inside permit.
            const innerFill = swap.interface.encodeFunctionData('fillOrderArgs', [
                orderFields(order), r, vs, ether('10'), takerTraits.traits, takerTraits.args,
            ]);
            await reentrantPermit.setReentrantCalldata(innerFill);

            await expect(
                swap.fillOrderArgs(orderFields(order), r, vs, ether('10'), takerTraits.traits, takerTraits.args),
            ).to.be.revertedWithCustomError(swap, 'ReentrancyDetected');
        });

        it('[SEC-002] rolls the reentrant inner fill back with the outer one', async function () {
            const { dai, swap, reentrantPermit, order, r, vs, takerTraits } = await loadFixture(deployReentrantSetup);

            const innerFill = swap.interface.encodeFunctionData('fillOrderArgs', [
                orderFields(order), r, vs, ether('10'), takerTraits.traits, takerTraits.args,
            ]);
            await reentrantPermit.setReentrantCalldata(innerFill);

            const makerBefore = await dai.balanceOf(addr1.address);

            await expect(
                swap.fillOrderArgs(orderFields(order), r, vs, ether('10'), takerTraits.traits, takerTraits.args),
            ).to.be.revertedWithCustomError(swap, 'ReentrancyDetected');

            // Neither fill settled, and the order is untouched.
            expect(await dai.balanceOf(addr1.address)).to.equal(makerBefore);
            expect(await swap.rawRemainingInvalidatorForOrder(addr1.address, await swap.hashOrder(orderFields(order))))
                .to.equal(0n);
        });

        // SEC-002 criterion 4: the guard is not reached at all when the taker
        // declines the permit, because the permit never runs.
        it('[SEC-002][INT-004] does not run the permit at all when the taker skips it', async function () {
            const { swap, reentrantPermit, order, r, vs } = await loadFixture(deployReentrantSetup);

            const skipTraits = buildTakerTraits({ extension: order.extension, skipMakerPermit: true });

            const innerFill = swap.interface.encodeFunctionData('fillOrderArgs', [
                orderFields(order), r, vs, ether('10'), skipTraits.traits, skipTraits.args,
            ]);
            await reentrantPermit.setReentrantCalldata(innerFill);

            // The maker already approved the protocol directly, so the fill
            // settles without the permit and the mock is never called.
            await expect(
                swap.fillOrderArgs(orderFields(order), r, vs, ether('10'), skipTraits.traits, skipTraits.args),
            ).to.not.be.reverted;

            expect(await reentrantPermit.entered()).to.equal(false);
        });
    });

    describe('INT-002 taker interaction return value [GAP-016]', function () {
        async function deployReturningSetup () {
            const { dai, weth, swap, chainId } = await deploySwapTokens();

            const ReturningTakerInteractionMock = await ethers.getContractFactory('ReturningTakerInteractionMock');
            const takerMock = await ReturningTakerInteractionMock.deploy();
            await takerMock.waitForDeployment();

            const makingAmount = ether('100');
            const takingAmount = ether('0.1');

            await dai.mint(addr1, ether('1000'));
            await dai.connect(addr1).approve(swap, ether('1000'));
            await weth.deposit({ value: ether('1') });
            await weth.approve(swap, ether('1'));

            const order = buildOrder({
                maker: addr1.address,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount,
                takingAmount,
                makerTraits: buildMakerTraits(),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(
                await signOrder(order, chainId, await swap.getAddress(), addr1),
            );

            return { dai, weth, swap, takerMock, order, r, vs, makingAmount, takingAmount };
        }

        // SCN-022. A taker interaction that claims to offer a better rate
        // changes nothing: the amounts settled are the ones computed before it
        // ran.
        it('[INT-002] ignores a value returned by the taker interaction', async function () {
            const { dai, weth, swap, takerMock, order, r, vs, makingAmount, takingAmount } =
                await loadFixture(deployReturningSetup);

            // Claim an absurd "offered taking amount".
            await takerMock.setReturnValue(ethers.MaxUint256);

            const interaction = ethers.solidityPacked(
                ['address', 'bytes'],
                [await takerMock.getAddress(), '0x'],
            );
            const takerTraits = buildTakerTraits({ interaction });

            const fillTx = swap.fillOrderArgs(
                orderFields(order), r, vs, makingAmount, takerTraits.traits, takerTraits.args,
            );

            // The taker pays exactly the computed taking amount, not more and
            // not less, and the maker receives exactly it.
            await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1], [-takingAmount, takingAmount]);
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [makingAmount, -makingAmount]);
        });

        it('[INT-002] reports the pre-computed amounts in OrderFilled regardless of the return value', async function () {
            const { swap, takerMock, order, r, vs, makingAmount } = await loadFixture(deployReturningSetup);

            await takerMock.setReturnValue(1n);

            const interaction = ethers.solidityPacked(
                ['address', 'bytes'],
                [await takerMock.getAddress(), '0x'],
            );
            const takerTraits = buildTakerTraits({ interaction });

            // Full fill, so the remaining amount reported is zero.
            await expect(
                swap.fillOrderArgs(orderFields(order), r, vs, makingAmount, takerTraits.traits, takerTraits.args),
            )
                .to.emit(swap, 'OrderFilled')
                .withArgs(await swap.hashOrder(orderFields(order)), 0n);
        });

        it('[INT-002] settles identically whether the interaction returns data or not', async function () {
            const { weth, swap, takerMock, order, r, vs, makingAmount, takingAmount } =
                await loadFixture(deployReturningSetup);

            await takerMock.setReturnValue(ethers.MaxUint256);
            const withInteraction = buildTakerTraits({
                interaction: ethers.solidityPacked(['address', 'bytes'], [await takerMock.getAddress(), '0x']),
            });

            await expect(
                swap.fillOrderArgs(orderFields(order), r, vs, makingAmount, withInteraction.traits, withInteraction.args),
            ).to.changeTokenBalance(weth, addr, -takingAmount);
        });
    });
});
