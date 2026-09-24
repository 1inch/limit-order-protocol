const { expect } = require('@1inch/solidity-utils');
const { ether } = require('./helpers/utils');
const { signOrder, buildOrder, buildTakerTraits, buildMakerTraitsRFQ } = require('./helpers/orderUtils');
const { deploySwapTokens } = require('./helpers/fixtures');
const hre = require('hardhat');
const { ethers } = hre;

describe('ApprovalPreInteractionExample', function () {
    let addr, addr1;

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
    });

    it('approval preInteraction example', async function () {
        const { dai, weth, swap, chainId } = await deploySwapTokens();

        const ApprovalPreInteraction = await ethers.getContractFactory('ApprovalPreInteraction');
        const approvalPreInteraction = await ApprovalPreInteraction.deploy(swap, addr1);
        await approvalPreInteraction.waitForDeployment();

        await dai.mint(addr, ether('2000'));
        await weth.connect(addr1).deposit({ value: ether('1') });

        await dai.approve(swap, ether('2000'));
        await weth.connect(addr1).transfer(await approvalPreInteraction.getAddress(), ether('1'));

        const order = buildOrder(
            {
                maker: await approvalPreInteraction.getAddress(),
                makerAsset: await weth.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('2000'),
                makerTraits: buildMakerTraitsRFQ(),
            },
        );

        // set _NEED_PREINTERACTION_FLAG in makerTraits
        order.makerTraits = BigInt(order.makerTraits) | (1n << 252n);

        const { compactSerialized: sig } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            threshold: order.takingAmount,
        });

        // Proposal P-03, approved at Gate B on 2026-08-03 (GAP-Q01).
        // This test previously ended on the bare call above, asserting only
        // that the transaction did not revert. It is the sole coverage of
        // ApprovalPreInteraction. Assertions are additive; nothing was relaxed.
        const makerContract = await approvalPreInteraction.getAddress();

        // The pre-interaction has not run yet, so the protocol holds no
        // allowance over the maker contract's WETH.
        expect(await weth.allowance(makerContract, await swap.getAddress())).to.equal(0n);

        const fillTx = swap.fillContractOrder(order, sig, order.makingAmount, takerTraits.traits);

        // FR-FILL-002: the pre-interaction grants the approval mid-fill, which
        // is what allows the maker leg to settle at all.
        await expect(fillTx).to.changeTokenBalances(
            weth,
            [addr, makerContract],
            [order.makingAmount, -order.makingAmount],
        );
        // FR-ORDER-003: the order names no receiver, so the taker's DAI goes
        // to the maker - here the contract itself.
        await expect(fillTx).to.changeTokenBalances(
            dai,
            [addr, makerContract],
            [-order.takingAmount, order.takingAmount],
        );
    });
});
