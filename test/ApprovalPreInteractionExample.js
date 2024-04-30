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

        await swap.fillContractOrder(order, sig, order.makingAmount, takerTraits.traits);
    });
});
