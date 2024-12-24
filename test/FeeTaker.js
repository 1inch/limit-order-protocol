const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');
const { buildOrder, buildTakerTraits, signOrder, buildMakerTraits, buildFeeTakerExtensions } = require('./helpers/orderUtils');
const { ether } = require('./helpers/utils');

describe('FeeTaker', function () {
    let addr, addr1, addr2, addr3, addr4;
    before(async function () {
        [addr, addr1, addr2, addr3, addr4] = await ethers.getSigners();
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
        const feeTaker = await FeeTaker.deploy(swap, inch, weth, addr);

        return { dai, weth, inch, swap, chainId, feeTaker };
    };

    it('should send all tokens to the maker with 0 fee', async function () {
        const { dai, weth, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);

        const makingAmount = ether('300');
        const takingAmount = ether('0.3');
        const feeRecipient = addr2.address;

        const order = buildOrder(
            {
                maker: addr1.address,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount,
                takingAmount,
            },
            buildFeeTakerExtensions({ feeTaker: await feeTaker.getAddress() }),
        );

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
        const takerTraits = buildTakerTraits({
            extension: order.extension,
        });
        const fillTx = swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);
        console.log(`GasUsed: ${(await (await fillTx).wait()).gasUsed.toString()}`);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [makingAmount, -makingAmount]);
        await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1, feeRecipient], [-takingAmount, takingAmount, 0]);
    });

    it('should send all tokens to the maker receiver with 0 fee', async function () {
        const { dai, weth, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);

        const makingAmount = ether('300');
        const takingAmount = ether('0.3');
        const feeRecipient = addr2.address;
        const makerReceiver = addr3.address;

        const order = buildOrder(
            {
                maker: addr1.address,
                receiver: makerReceiver,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount,
                takingAmount,
            },
            buildFeeTakerExtensions({ feeTaker: await feeTaker.getAddress() }),
        );

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
        const takerTraits = buildTakerTraits({
            extension: order.extension,
        });
        const fillTx = swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);
        console.log(`GasUsed: ${(await (await fillTx).wait()).gasUsed.toString()}`);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [makingAmount, -makingAmount]);
        await expect(fillTx).to.changeTokenBalances(weth, [addr, addr1, feeRecipient, makerReceiver], [-takingAmount, 0, 0, takingAmount]);
    });

    it('should charge fee when in whitelist', async function () {
        const { dai, weth, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);

        const makingAmount = ether('300');
        const takingAmount = ether('0.3');
        const integratorFee = BigInt(1e4);
        const resolverFee = BigInt(1e3);
        const integratorFeeRecipient = addr2.address;
        const protocolFeeRecipient = addr3.address;
        const whitelist = '0x0a' + addr.address.slice(-20).repeat(10);

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
                integratorFeeRecipient,
                protocolFeeRecipient,
                integratorFee,
                resolverFee,
                whitelist,
            }),
        );

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
        });
        const fillTx = swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);
        console.log(`GasUsed: ${(await (await fillTx).wait()).gasUsed.toString()}`);

        const integratorFeeCalculated = takingAmount * (integratorFee / 2n) / BigInt(1e5);
        const protocolFeeCalculated = takingAmount * (integratorFee / 2n + resolverFee / 2n) / BigInt(1e5);
        const totalFeeCalculated = protocolFeeCalculated + integratorFeeCalculated;
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [makingAmount, -makingAmount]);
        await expect(fillTx).to.changeTokenBalances(
            weth,
            [addr, addr1, integratorFeeRecipient, protocolFeeRecipient],
            [-takingAmount - totalFeeCalculated, takingAmount, integratorFeeCalculated, protocolFeeCalculated],
        );
    });

    it('should charge fee when out of whitelist', async function () {
        const { dai, weth, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);

        const makingAmount = ether('300');
        const takingAmount = ether('0.3');
        const integratorFee = BigInt(1e4);
        const resolverFee = BigInt(1e3);
        const integratorFeeRecipient = addr2.address;
        const protocolFeeRecipient = addr3.address;
        const whitelist = '0x0a' + addr2.address.slice(-20).repeat(10);

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
                integratorFeeRecipient,
                protocolFeeRecipient,
                integratorFee,
                resolverFee,
                whitelist,
            }),
        );

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
        const takerTraits = buildTakerTraits({
            makingAmount: true,
            extension: order.extension,
        });
        const fillTx = swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);
        console.log(`GasUsed: ${(await (await fillTx).wait()).gasUsed.toString()}`);

        const integratorFeeCalculated = takingAmount * (integratorFee / 2n) / BigInt(1e5);
        const protocolFeeCalculated = takingAmount * (integratorFee / 2n + resolverFee) / BigInt(1e5);
        const totalFeeCalculated = protocolFeeCalculated + integratorFeeCalculated;
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [makingAmount, -makingAmount]);
        await expect(fillTx).to.changeTokenBalances(weth,
            [addr, addr1, integratorFeeRecipient, protocolFeeRecipient],
            [-takingAmount - totalFeeCalculated, takingAmount, integratorFeeCalculated, protocolFeeCalculated],
        );
    });

    it('should charge fee and send the rest to the maker receiver', async function () {
        const { dai, weth, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);

        const makingAmount = ether('300');
        const takingAmount = ether('0.3');
        const integratorFee = BigInt(1e4);
        const integratorFeeRecipient = addr2.address;
        const protocolFeeRecipient = addr3.address;
        const makerReceiver = addr4.address;

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
                integratorFeeRecipient,
                protocolFeeRecipient,
                makerReceiver,
                integratorFee,
            }),
        );

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
        const takerTraits = buildTakerTraits({
            extension: order.extension,
        });
        const fillTx = swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);
        console.log(`GasUsed: ${(await (await fillTx).wait()).gasUsed.toString()}`);

        const integratorFeeCalculated = takingAmount * integratorFee / 2n / BigInt(1e5);
        const protocolFeeCalculated = takingAmount * integratorFee / 2n / BigInt(1e5);
        const totalFeeCalculated = integratorFeeCalculated + protocolFeeCalculated;

        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [makingAmount, -makingAmount]);
        await expect(fillTx).to.changeTokenBalances(
            weth,
            [addr, addr1, integratorFeeRecipient, protocolFeeRecipient, makerReceiver],
            [-takingAmount - totalFeeCalculated, 0, integratorFeeCalculated, protocolFeeCalculated, takingAmount]);
    });

    it('should charge fee in eth', async function () {
        const { dai, weth, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);

        const makingAmount = ether('300');
        const takingAmount = ether('0.3');
        const integratorFee = BigInt(1e4);
        const feeCalculated = takingAmount * integratorFee / BigInt(1e5);
        const integratorFeeRecipient = addr2.address;
        const protocolFeeRecipient = addr3.address;

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
            buildFeeTakerExtensions({
                feeTaker: await feeTaker.getAddress(),
                integratorFeeRecipient,
                protocolFeeRecipient,
                integratorFee,
            }),
        );

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
        const takerTraits = buildTakerTraits({
            extension: order.extension,
        });
        const fillTx = swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);
        console.log(`GasUsed: ${(await (await fillTx).wait()).gasUsed.toString()}`);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [makingAmount, -makingAmount]);
        await expect(fillTx).to.changeTokenBalance(weth, addr, -takingAmount - feeCalculated);
        await expect(fillTx).to.changeEtherBalances([addr1, integratorFeeRecipient, protocolFeeRecipient], [takingAmount, feeCalculated / 2n, feeCalculated / 2n]);
    });

    it('should charge fee in eth and send the rest to the maker receiver', async function () {
        const { dai, weth, swap, chainId, feeTaker } = await loadFixture(deployContractsAndInit);

        const makingAmount = ether('300');
        const takingAmount = ether('0.3');
        const integratorFee = BigInt(1e4);
        const feeCalculated = takingAmount * integratorFee / BigInt(1e5);
        const integratorFeeRecipient = addr2.address;
        const protocolFeeRecipient = addr3.address;
        const makerReceiver = addr4.address;

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
            buildFeeTakerExtensions({
                feeTaker: await feeTaker.getAddress(),
                integratorFeeRecipient,
                protocolFeeRecipient,
                makerReceiver,
                integratorFee,
            }),
        );

        const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await swap.getAddress(), addr1));
        const takerTraits = buildTakerTraits({
            extension: order.extension,
        });
        const fillTx = swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);
        console.log(`GasUsed: ${(await (await fillTx).wait()).gasUsed.toString()}`);
        await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [makingAmount, -makingAmount]);
        await expect(fillTx).to.changeTokenBalance(weth, addr, -takingAmount - feeCalculated);
        await expect(fillTx).to.changeEtherBalances([addr1, integratorFeeRecipient, protocolFeeRecipient, makerReceiver], [0, feeCalculated / 2n, feeCalculated / 2n, takingAmount]);
    });
});
