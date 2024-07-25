const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');
const { buildOrder, buildTakerTraits, signOrder, buildMakerTraits, buildFeeTakerPostInteractionData } = require('./helpers/orderUtils');
const { ether } = require('./helpers/utils');

describe('FeeTaker', function () {
    let addr, addr1, addr2, addr3;
    before(async function () {
        [addr, addr1, addr2, addr3] = await ethers.getSigners();
    });

    async function deployContractsAndInit () {
        const { dai, weth, inch, swap, chainId } = await deploySwapTokens();

        await dai.mint(addr, ether('1000000'));
        await weth.deposit({ value: ether('100') });
        await inch.mint(addr, ether('1000000'));
        await dai.mint(addr1, ether('1000000'));
        await weth.connect(addr1).deposit({ value: ether('100') });
        await inch.mint(addr1, ether('1000000'));

        await dai.approve(swap, ether('1000000'));
        await weth.approve(swap, ether('1000000'));
        await inch.approve(swap, ether('1000000'));
        await dai.connect(addr1).approve(swap, ether('1000000'));
        await weth.connect(addr1).approve(swap, ether('1000000'));
        await inch.connect(addr1).approve(swap, ether('1000000'));

        const FeeTaker = await ethers.getContractFactory('FeeTaker');
        const feeTaker = await FeeTaker.deploy(swap, weth, weth, addr);
        const feeBank = await ethers.getContractAt('FeeBank', await feeTaker.FEE_BANK());

        await weth.approve(feeBank, ether('1'));
        await feeBank.deposit(ether('1'));

        return { dai, weth, inch, swap, chainId, feeTaker, feeBank };
    };

    it('should send all tokens to the maker with 0 fee', async function () {
        const { dai, weth, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);

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
            {
                postInteraction: buildFeeTakerPostInteractionData({
                    feeTaker: await feeTaker.getAddress(),
                    feeRecipient: addr2.address,
                    whitelist: [addr.address],
                }),
            },
        );

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
        const takerTraits = buildTakerTraits({
            extension: order.extension,
        });
        const fillTx = swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);
        console.log(`GasUsed: ${(await (await fillTx).wait()).gasUsed.toString()}`);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [makingAmount, -makingAmount]);
        await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1, addr2], [-takingAmount, takingAmount, 0]);
    });

    it('should send all tokens to the maker receiver with 0 fee', async function () {
        const { dai, weth, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);

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
            {
                postInteraction: buildFeeTakerPostInteractionData({
                    feeTaker: await feeTaker.getAddress(),
                    feeRecipient: addr2.address,
                    receiver: addr3.address,
                    whitelist: [addr.address],
                }),
            },
        );

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
        const takerTraits = buildTakerTraits({
            extension: order.extension,
        });
        const fillTx = swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);
        console.log(`GasUsed: ${(await (await fillTx).wait()).gasUsed.toString()}`);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [makingAmount, -makingAmount]);
        await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1, addr2, addr3], [-takingAmount, 0, 0, takingAmount]);
    });

    it('should charge fee NOT by FEE_BANK when in whitelist', async function () {
        const { dai, weth, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);

        const makingAmount = ether('300');
        const takingAmount = ether('0.3');
        const integratorFee = BigInt(1e4);
        const resolverFee = BigInt(1e3);

        const order = buildOrder(
            {
                maker: addr1.address,
                receiver: await feeTaker.getAddress(),
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount,
                takingAmount,
            },
            {
                postInteraction: buildFeeTakerPostInteractionData({
                    feeTaker: await feeTaker.getAddress(),
                    integratorFee,
                    resolverFee,
                    feeRecipient: addr2.address,
                    whitelist: [addr.address],
                }),
            },
        );

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
        const takerTraits = buildTakerTraits({
            extension: order.extension,
        });
        const fillTx = swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);
        console.log(`GasUsed: ${(await (await fillTx).wait()).gasUsed.toString()}`);

        const feeCalculated = takingAmount * integratorFee / (BigInt(1e5) + integratorFee + 2n * resolverFee) +
            takingAmount * resolverFee / (BigInt(1e5) + integratorFee + 2n * resolverFee);
        const cashback = takingAmount * resolverFee / (BigInt(1e5) + integratorFee + 2n * resolverFee);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [makingAmount, -makingAmount]);
        await expect(fillTx).to.changeTokenBalances(weth,
            [addr, addr1, addr2],
            [-takingAmount + cashback, takingAmount - feeCalculated - cashback, feeCalculated],
        );
    });

    it('should charge fee by FEE_BANK when in whitelist', async function () {
        const { dai, weth, swap, chainId, feeTaker, feeBank } = await loadFixture(deployContractsAndInit);

        await feeBank.setPayWithFeeBank(true);

        const makingAmount = ether('300');
        const takingAmount = ether('0.3');
        const integratorFee = BigInt(1e4);
        const resolverFee = BigInt(1e3);

        const order = buildOrder(
            {
                maker: addr1.address,
                receiver: await feeTaker.getAddress(),
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount,
                takingAmount,
            },
            {
                postInteraction: buildFeeTakerPostInteractionData({
                    feeTaker: await feeTaker.getAddress(),
                    integratorFee,
                    resolverFee,
                    feeRecipient: addr2.address,
                    whitelist: [addr.address],
                }),
            },
        );

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
        const takerTraits = buildTakerTraits({
            extension: order.extension,
        });
        const fillTx = swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);
        console.log(`GasUsed: ${(await (await fillTx).wait()).gasUsed.toString()}`);

        const feeCalculated = takingAmount * integratorFee / (BigInt(1e5) + integratorFee + 2n * resolverFee) +
            takingAmount * resolverFee / (BigInt(1e5) + integratorFee + 2n * resolverFee);
        const cashback = takingAmount * integratorFee / (BigInt(1e5) + integratorFee + 2n * resolverFee) +
            takingAmount * resolverFee / (BigInt(1e5) + integratorFee + 2n * resolverFee) * 2n;
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [makingAmount, -makingAmount]);
        await expect(fillTx).to.changeTokenBalances(weth,
            [addr, addr1, addr2],
            [-takingAmount + cashback, takingAmount - cashback, 0],
        );
        expect(await feeBank.availableCredit(addr)).to.be.equal(ether('1') - feeCalculated);
    });

    it('should charge fee NOT by FEE_BANK when out of whitelist', async function () {
        const { dai, weth, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);

        const makingAmount = ether('300');
        const takingAmount = ether('0.3');
        const integratorFee = BigInt(1e4);
        const resolverFee = BigInt(1e3);

        const order = buildOrder(
            {
                maker: addr1.address,
                receiver: await feeTaker.getAddress(),
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount,
                takingAmount,
            },
            {
                postInteraction: buildFeeTakerPostInteractionData({
                    feeTaker: await feeTaker.getAddress(),
                    integratorFee,
                    resolverFee,
                    feeRecipient: addr2.address,
                    whitelist: [addr2.address],
                }),
            },
        );

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
        const takerTraits = buildTakerTraits({
            extension: order.extension,
        });
        const fillTx = swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);
        console.log(`GasUsed: ${(await (await fillTx).wait()).gasUsed.toString()}`);

        const feeCalculated = takingAmount * integratorFee / (BigInt(1e5) + integratorFee + 2n * resolverFee) +
            takingAmount * resolverFee / (BigInt(1e5) + integratorFee + 2n * resolverFee) * 2n;
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [makingAmount, -makingAmount]);
        await expect(fillTx).to.changeTokenBalances(weth,
            [addr, addr1, addr2],
            [-takingAmount, takingAmount - feeCalculated, feeCalculated],
        );
    });

    it('should charge fee by FEE_BANK when out of whitelist', async function () {
        const { dai, weth, swap, chainId, feeTaker, feeBank } = await loadFixture(deployContractsAndInit);

        await feeBank.setPayWithFeeBank(true);

        const makingAmount = ether('300');
        const takingAmount = ether('0.3');
        const integratorFee = BigInt(1e4);
        const resolverFee = BigInt(1e3);

        const order = buildOrder(
            {
                maker: addr1.address,
                receiver: await feeTaker.getAddress(),
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount,
                takingAmount,
            },
            {
                postInteraction: buildFeeTakerPostInteractionData({
                    feeTaker: await feeTaker.getAddress(),
                    integratorFee,
                    resolverFee,
                    feeRecipient: addr2.address,
                    whitelist: [addr2.address],
                }),
            },
        );

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
        const takerTraits = buildTakerTraits({
            extension: order.extension,
        });
        const fillTx = swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);
        console.log(`GasUsed: ${(await (await fillTx).wait()).gasUsed.toString()}`);

        const feeCalculated = takingAmount * integratorFee / (BigInt(1e5) + integratorFee + 2n * resolverFee) +
            takingAmount * resolverFee / (BigInt(1e5) + integratorFee + 2n * resolverFee) * 2n;
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [makingAmount, -makingAmount]);
        await expect(fillTx).to.changeTokenBalances(weth,
            [addr, addr1, addr2],
            [-takingAmount + feeCalculated, takingAmount - feeCalculated, 0],
        );
        expect(await feeBank.availableCredit(addr)).to.be.equal(ether('1') - feeCalculated);
    });

    it('should charge fee in eth', async function () {
        const { dai, weth, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);

        const makingAmount = ether('300');
        const takingAmount = ether('0.3');
        const integratorFee = BigInt(1e4);

        const order = buildOrder(
            {
                maker: addr1.address,
                receiver: await feeTaker.getAddress(),
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount,
                takingAmount,
                makerTraits: buildMakerTraits({ unwrapWeth: true }),
            },
            {
                postInteraction: buildFeeTakerPostInteractionData({
                    feeTaker: await feeTaker.getAddress(),
                    integratorFee,
                    resolverFee: 0n,
                    feeRecipient: addr2.address,
                    whitelist: [addr.address],
                }),
            },
        );

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
        const takerTraits = buildTakerTraits({
            extension: order.extension,
        });
        const feeCalculated = takingAmount * integratorFee / (BigInt(1e5) + integratorFee);
        const fillTx = swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);
        console.log(`GasUsed: ${(await (await fillTx).wait()).gasUsed.toString()}`);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [makingAmount, -makingAmount]);
        await expect(fillTx).to.changeTokenBalance(weth, addr, -takingAmount);
        await expect(fillTx).to.changeEtherBalances([addr1, addr2], [takingAmount - feeCalculated, feeCalculated]);
    });
});
