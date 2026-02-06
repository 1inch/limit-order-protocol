const { expect, constants, permit2Contract } = require('@1inch/solidity-utils');
const { SignatureTransfer, permit2Address } = require('@uniswap/permit2-sdk');
const { ether } = require('./helpers/utils');
const { signOrder, buildOrder, buildTakerTraits, buildMakerTraitsRFQ } = require('./helpers/orderUtils');
const { deploySwapTokens } = require('./helpers/fixtures');
const { nextPermit2Nonce } = require('./helpers/nonce');
const hre = require('hardhat');
const { ethers } = hre;

describe('Permit2Proxy', function () {
    it('should return correct permit2 address for zk chain', function () {
        expect(permit2Address(324).toLowerCase()).to.equal('0x0000000000225e31d15943971f47ad3022f714fa');
    });

    it('should return correct permit2 address for eth mainnet', function () {
        expect(permit2Address(1).toLowerCase()).to.equal('0x000000000022d473030f116ddee9f6b43ac78ba3');
    });
    let addr, addr1;

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
    });

    it('permit2 example (without witness)', async function () {
        const { dai, weth, swap, chainId } = await deploySwapTokens();

        const permit2Addr = permit2Address(chainId);

        await dai.mint(addr, ether('2000'));
        await weth.connect(addr1).deposit({ value: ether('1') });
        await dai.approve(swap, ether('2000'));
        await weth.connect(addr1).approve(permit2Addr, ether('1'));

        await permit2Contract(permit2Addr);

        const Permit2Proxy = await ethers.getContractFactory('Permit2Proxy');
        const permit2Proxy = await Permit2Proxy.deploy(await swap.getAddress(), permit2Addr);
        await permit2Proxy.waitForDeployment();

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
            permit2Addr,
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
