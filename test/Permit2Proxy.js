const { constants, permit2Contract } = require('@1inch/solidity-utils');
const { SignatureTransfer, PERMIT2_ADDRESS } = require('@uniswap/permit2-sdk');
const { ether } = require('./helpers/utils');
const { signOrder, buildOrder, buildTakerTraits, buildMakerTraitsRFQ } = require('./helpers/orderUtils');
const { deploySwapTokens } = require('./helpers/fixtures');
const { nextPermit2Nonce } = require('./helpers/nonce');
const hre = require('hardhat');
const { ethers } = hre;

describe('Permit2Proxy', function () {
    let addr, addr1;

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
    });

    it('permit2 example (without witness)', async function () {
        const { dai, weth, swap, chainId } = await deploySwapTokens();

        await dai.mint(addr, ether('2000'));
        await weth.connect(addr1).deposit({ value: ether('1') });
        await dai.approve(swap, ether('2000'));
        await weth.connect(addr1).approve(PERMIT2_ADDRESS, ether('1'));

        const Permit2Proxy = await ethers.getContractFactory('Permit2Proxy');
        const permit2Proxy = await Permit2Proxy.deploy(await swap.getAddress());
        await permit2Proxy.waitForDeployment();

        await permit2Contract();

        const permit = {
            permitted: {
                token: await weth.getAddress(),
                amount: ether('1'),
            },
            spender: await permit2Proxy.getAddress(),
            nonce: nextPermit2Nonce(),
            deadline: 0xffffffff,
        };

        const data = SignatureTransfer.getPermitData(
            permit,
            PERMIT2_ADDRESS,
            chainId,
        );

        const sig = ethers.Signature.from(await addr1.signTypedData(data.domain, data.types, data.values));

        const makerAssetSuffix = '0x' + permit2Proxy.interface.encodeFunctionData('func_nZHTch', [
            constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, 0,
            {
                permitted: {
                    token: permit.permitted.token,
                    amount: permit.permitted.amount,
                },
                nonce: permit.nonce,
                deadline: permit.deadline,
            },
            sig.compactSerialized,
        ]).substring(202);

        const order = buildOrder(
            {
                maker: addr1.address,
                makerAsset: await permit2Proxy.getAddress(),
                takerAsset: await dai.getAddress(),
                makingAmount: ether('1'),
                takingAmount: ether('2000'),
                makerTraits: buildMakerTraitsRFQ(),
            },
            {
                makerAssetSuffix,
            },
        );

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
            threshold: order.takingAmount,
        });

        await swap.fillOrderArgs(order, r, vs, order.makingAmount, takerTraits.traits, takerTraits.args);
    });
});
