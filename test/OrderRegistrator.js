const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { expect, constants, ether } = require('@1inch/solidity-utils');
const { buildOrder } = require('./helpers/orderUtils');
const { ethers } = require('hardhat');
const { deploySwap, deployUSDC, deployUSDT } = require('./helpers/fixtures');
const { executeContractCallWithSigners } = require('@gnosis.pm/safe-contracts/dist');

/** Packs one transaction of a MultiSend batch: operation, target, value, data length, data. */
function encodeMultiSendTx (operation, to, data) {
    return ethers.solidityPacked(['uint8', 'address', 'uint256', 'uint256', 'bytes'], [operation, to, 0, ethers.dataLength(data), data]);
}

describe('OrderRegistrator', function () {
    let addr, addr1;

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
    });

    async function deployAndInit () {
        const { swap } = await deploySwap();
        const { usdc } = await deployUSDC();
        const { usdt } = await deployUSDT();
        const OrderRegistrator = await ethers.getContractFactory('OrderRegistrator');
        const registrator = await OrderRegistrator.deploy(swap);
        await registrator.waitForDeployment();
        const chainId = (await ethers.provider.getNetwork()).chainId;
        return { swap, usdc, usdt, registrator, chainId };
    };

    async function buildTestOrder (usdc, usdt) {
        return buildOrder({
            makerAsset: await usdc.getAddress(),
            takerAsset: await usdt.getAddress(),
            makingAmount: 1,
            takingAmount: 2,
            maker: addr.address,
        });
    }

    it('should emit OrderRegistered event', async function () {
        const { usdc, usdt, registrator } = await loadFixture(deployAndInit);

        const order = await buildTestOrder(usdc, usdt);
        const orderTuple = [order.salt, order.maker, order.receiver, order.makerAsset, order.takerAsset, order.makingAmount, order.takingAmount, order.makerTraits];

        const tx = registrator.registerOrder(order, order.extension);
        await expect(tx).to.emit(registrator, 'OrderRegistered').withArgs(orderTuple, order.extension);
    });

    it('should reject registration from anyone but the maker', async function () {
        const { usdc, usdt, registrator } = await loadFixture(deployAndInit);

        // Nothing but the sender authenticates a registration, so a stranger's is refused outright —
        // there is no signature to present and no state a maker could have prepared to let them in.
        const order = await buildTestOrder(usdc, usdt);
        const tx = registrator.connect(addr1).registerOrder(order, order.extension);
        await expect(tx).to.be.revertedWithCustomError(registrator, 'AccessDenied');
    });

    it('should revert with wrong extension', async function () {
        const { usdc, usdt, registrator } = await loadFixture(deployAndInit);

        const order = await buildTestOrder(usdc, usdt);
        const orderLibFactory = await ethers.getContractFactory('OrderLib');

        const tx = registrator.registerOrder(order, order.extension + '00');
        await expect(tx).to.be.revertedWithCustomError(orderLibFactory, 'UnexpectedOrderExtension');
    });

    describe('announcements', function () {
        it('should record when an order was announced and emit OrderAnnounced', async function () {
            const { usdc, usdt, swap, registrator } = await loadFixture(deployAndInit);
            const order = await buildTestOrder(usdc, usdt);
            const orderHash = await swap.hashOrder(order);

            const tx = await registrator.registerOrder(order, order.extension);

            expect(await registrator.announcedAt(orderHash)).to.equal(await time.latest());
            await expect(tx).to.emit(registrator, 'OrderAnnounced').withArgs(orderHash, await time.latest());
        });

        it('should report an order that was never announced as unannounced', async function () {
            const { usdc, usdt, swap, registrator } = await loadFixture(deployAndInit);
            const order = await buildTestOrder(usdc, usdt);

            expect(await registrator.announcedAt(await swap.hashOrder(order))).to.equal(0);
        });

        it('should keep the first announcement when the same order is registered again', async function () {
            const { usdc, usdt, swap, registrator } = await loadFixture(deployAndInit);
            const order = await buildTestOrder(usdc, usdt);
            const orderHash = await swap.hashOrder(order);

            await registrator.registerOrder(order, order.extension);
            const announcedAt = await registrator.announcedAt(orderHash);

            await time.increase(3600);
            // A repeated announcement is not an error — SafeOrderBuilder rebuilds an unchanged order this way —
            // but it must not move an auction that is already anchored to the first one, and the anchor
            // event must not fire a second time.
            const tx = registrator.registerOrder(order, order.extension);
            await expect(tx).to.emit(registrator, 'OrderRegistered');
            await expect(tx).to.not.emit(registrator, 'OrderAnnounced');

            expect(await registrator.announcedAt(orderHash)).to.equal(announcedAt);
        });
    });

    describe('announcement by a contract maker', function () {
        async function deploySafeAndInit () {
            const { swap, usdc, usdt, registrator } = await deployAndInit();

            const GnosisSafeProxyFactory = await ethers.getContractFactory('GnosisSafeProxyFactory');
            const proxyFactoryContract = await GnosisSafeProxyFactory.deploy();
            await proxyFactoryContract.waitForDeployment();
            const GnosisSafe = await ethers.getContractFactory('GnosisSafe');
            const gnosisSafeContract = await GnosisSafe.deploy();
            await gnosisSafeContract.waitForDeployment();
            const CompatibilityFallbackHandler = await ethers.getContractFactory('CompatibilityFallbackHandler');
            const fallbackHandler = await CompatibilityFallbackHandler.deploy();
            await fallbackHandler.waitForDeployment();
            const SafeOrderBuilder = await ethers.getContractFactory('SafeOrderBuilder');
            const safeOrderBuilder = await SafeOrderBuilder.deploy(swap, registrator);
            await safeOrderBuilder.waitForDeployment();
            const AggregatorMock = await ethers.getContractFactory('AggregatorMock');
            const oracle = await AggregatorMock.deploy(ether('0.00025'));
            await oracle.waitForDeployment();

            const setupData = gnosisSafeContract.interface.encodeFunctionData(
                'setup',
                [[addr.address], 1, constants.ZERO_ADDRESS, '0x', await fallbackHandler.getAddress(), constants.ZERO_ADDRESS, 0, constants.ZERO_ADDRESS],
            );
            const receipt = await (await proxyFactoryContract.createProxy(await gnosisSafeContract.getAddress(), setupData)).wait();
            const safe = GnosisSafe.attach(receipt.logs[1].args[0]);

            // workaround as safe lib expects old version of ethers
            safe.address = await safe.getAddress();
            safeOrderBuilder.address = await safeOrderBuilder.getAddress();
            addr._signTypedData = addr.signTypedData;

            const order = buildOrder({
                makerAsset: await usdc.getAddress(),
                takerAsset: await usdt.getAddress(),
                makingAmount: 100n,
                takingAmount: 100n,
                maker: await safe.getAddress(),
            });

            return { swap, registrator, safe, safeOrderBuilder, oracle, order };
        }

        it('should record an announcement made with an on-chain signature', async function () {
            const { swap, registrator, safe, safeOrderBuilder, oracle, order } = await loadFixture(deploySafeAndInit);

            // The Safe marks the order digest and announces it in one delegatecall — the flow a multisig
            // maker uses, and the one the anchored auction has to price from. The registrator sees the
            // Safe itself as the sender, which is exactly the maker-only rule.
            const oracleParams = [await oracle.getAddress(), ether('0.00025'), 1000];
            const tx = await executeContractCallWithSigners(
                safe,
                safeOrderBuilder,
                'buildAndSignOrder',
                [order, order.extension, oracleParams, oracleParams],
                [addr],
                true,
            );
            await tx.wait();

            await expect(tx).to.emit(registrator, 'OrderRegistered');
            const orderHash = await swap.hashOrder(order);
            expect(await registrator.announcedAt(orderHash)).to.equal(await time.latest());
        });

        it('should mark the digest and announce through one MultiSend batch', async function () {
            const { swap, registrator, safe, order } = await loadFixture(deploySafeAndInit);

            // The Safe flow needs no bespoke helper: one co-signed execution delegatecalls the official
            // MultiSend, whose batch marks the digest through the already-audited SignMessageLib and
            // then registers the order — an inner call, so the registrator sees the Safe as the maker.
            const MultiSend = await ethers.getContractFactory('MultiSend');
            const multiSend = await MultiSend.deploy();
            await multiSend.waitForDeployment();
            const SignMessageLib = await ethers.getContractFactory('SignMessageLib');
            const signMessageLib = await SignMessageLib.deploy();
            await signMessageLib.waitForDeployment();

            // workaround as safe lib expects old version of ethers
            multiSend.address = await multiSend.getAddress();

            const orderHash = await swap.hashOrder(order);
            const batch = ethers.concat([
                encodeMultiSendTx(1, await signMessageLib.getAddress(), signMessageLib.interface.encodeFunctionData('signMessage', [orderHash])),
                encodeMultiSendTx(0, await registrator.getAddress(), registrator.interface.encodeFunctionData('registerOrder', [order, order.extension])),
            ]);
            const tx = await executeContractCallWithSigners(safe, multiSend, 'multiSend', [batch], [addr], true);
            await tx.wait();

            await expect(tx).to.emit(registrator, 'OrderRegistered');
            await expect(tx).to.emit(registrator, 'OrderAnnounced').withArgs(orderHash, await time.latest());
            expect(await registrator.announcedAt(orderHash)).to.equal(await time.latest());

            // The digest marking is what later lets the protocol fill this order with an empty signature.
            const validator = await ethers.getContractAt('CompatibilityFallbackHandler', safe.address);
            expect(await validator['isValidSignature(bytes32,bytes)'](orderHash, '0x')).to.equal('0x1626ba7e');
        });
    });
});
