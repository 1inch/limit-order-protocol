const { constants, permit2Contract } = require('@1inch/solidity-utils');
const { SignatureTransfer, PERMIT2_ADDRESS } = require('@uniswap/permit2-sdk');
const { ether } = require('./helpers/utils');
const { signOrder, buildOrder, buildTakerTraits, buildMakerTraitsRFQ } = require('./helpers/orderUtils');
const { deploySwapTokens } = require('./helpers/fixtures');
const hre = require('hardhat');
const { ethers } = hre;

describe('WitnessProxyExample', function () {
    let addr, addr1;
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const WITNESS_TYPEHASH = '0x098c829387d2da3edcf4fde88d652acd561e4ef68a7d2c7d5ff4d3aad8c92615';

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
    });

    it('permit2 witness example', async function () {
        const { dai, weth, swap, chainId } = await deploySwapTokens();

        await dai.mint(addr, ether('2000'));
        await weth.connect(addr1).deposit({ value: ether('1') });

        await dai.approve(swap, ether('2000'));
        await weth.connect(addr1).approve(PERMIT2_ADDRESS, ether('1'));

        const Permit2WitnessProxy = await ethers.getContractFactory('Permit2WitnessProxy');
        const permit2WitnessProxy = await Permit2WitnessProxy.deploy(await swap.getAddress());
        await permit2WitnessProxy.waitForDeployment();

        await permit2Contract();

        const permit = {
            permitted: {
                token: await weth.getAddress(),
                amount: ether('1'),
            },
            spender: await permit2WitnessProxy.getAddress(),
            nonce: 0,
            deadline: 0xffffffff,
        };

        const witness = {
            witness: { salt: '0x0000000000000000000000000000000000000000000000000000000000000000' },
            witnessTypeName: 'Witness',
            witnessType: { Witness: [{ name: 'salt', type: 'bytes32' }] },
        };

        const data = SignatureTransfer.getPermitData(
            permit,
            PERMIT2_ADDRESS,
            31337,
            witness,
        );

        const sig = ethers.Signature.from(await addr1.signTypedData(data.domain, data.types, data.values));

        const makerAssetSuffix = '0x' + permit2WitnessProxy.interface.encodeFunctionData('func_801zDya', [
            constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, 0,
            {
                permitted: {
                    token: permit.permitted.token,
                    amount: permit.permitted.amount,
                },
                nonce: permit.nonce,
                deadline: permit.deadline,
            },
            ethers.keccak256(abiCoder.encode(['bytes32', 'bytes32'], [WITNESS_TYPEHASH, witness.witness.salt])),
            sig.compactSerialized,
        ]).substring(202);

        const order = buildOrder(
            {
                maker: addr1.address,
                makerAsset: await permit2WitnessProxy.getAddress(),
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
