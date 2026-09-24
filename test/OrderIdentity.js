const hre = require('hardhat');
const { ethers } = hre;
const { expect, constants } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');
const { buildOrder, buildTakerTraits, signOrder, buildMakerTraits, name, version } = require('./helpers/orderUtils');
const { ether } = require('./helpers/utils');

// Specification tests for order identity and receiver resolution.
//
// FR-ORDER-001 (CRITICAL) - an order's identity is the EIP-712 hash of its eight
//   fields bound to the protocol's own domain. Closes GAP-001, one of the two
//   CRITICAL requirements the existing suite left PARTIAL.
// FR-ORDER-003 (HIGH) - a zero receiver means the maker. Closes GAP-002.
//
// Scenarios: SCN-001, SCN-005. Invariant: INV-015.

describe('Order identity', function () {
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

        return { dai, weth, swap, chainId };
    }

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

    const Order = [
        { name: 'salt', type: 'uint256' },
        { name: 'maker', type: 'address' },
        { name: 'receiver', type: 'address' },
        { name: 'makerAsset', type: 'address' },
        { name: 'takerAsset', type: 'address' },
        { name: 'makingAmount', type: 'uint256' },
        { name: 'takingAmount', type: 'uint256' },
        { name: 'makerTraits', type: 'uint256' },
    ];

    function digestFor (order, chainId, verifyingContract) {
        return ethers.TypedDataEncoder.hash(
            { name, version, chainId, verifyingContract },
            { Order },
            orderFields(order),
        );
    }

    describe('FR-ORDER-001 domain binding [GAP-001]', function () {
        async function buildSampleOrder () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);
            const order = buildOrder({
                maker: addr1.address,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                makerTraits: buildMakerTraits(),
            });
            return { order, swap, chainId, dai, weth };
        }

        // SCN-001. The on-chain hash must agree with an independent EIP-712
        // implementation, so the two are not merely self-consistent.
        it('[FR-ORDER-001] agrees with an independent EIP-712 encoding', async function () {
            const { order, swap, chainId } = await buildSampleOrder();

            const expected = digestFor(order, chainId, await swap.getAddress());
            expect(await swap.hashOrder(order)).to.equal(expected);
        });

        // SCN-001 criterion 2. The same eight field values on a different chain
        // are a different order.
        it('[FR-ORDER-001] produces a different hash on a different chain id', async function () {
            const { order, swap } = await buildSampleOrder();
            const swapAddress = await swap.getAddress();

            const onMainnet = digestFor(order, 1n, swapAddress);
            const onPolygon = digestFor(order, 137n, swapAddress);

            expect(onMainnet).to.not.equal(onPolygon);
        });

        // SCN-001 criterion 3. Two deployments on the same chain are distinct
        // domains, so a signature cannot be replayed between them. This is the
        // assertion that needs two real contracts rather than arithmetic.
        it('[FR-ORDER-001] produces a different hash for a second deployment on the same chain', async function () {
            const { order, swap, chainId } = await buildSampleOrder();

            const { swap: otherSwap } = await deploySwapTokens();
            expect(await otherSwap.getAddress()).to.not.equal(await swap.getAddress());

            const first = await swap.hashOrder(order);
            const second = await otherSwap.hashOrder(order);

            expect(first).to.not.equal(second);
            expect(first).to.equal(digestFor(order, chainId, await swap.getAddress()));
            expect(second).to.equal(digestFor(order, chainId, await otherSwap.getAddress()));
        });

        // SCN-001 criterion 3, the consequence that matters: a signature made
        // for one deployment is rejected by another.
        it('[FR-ORDER-001][ACC-001] rejects a signature made for a different deployment', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);
            const { swap: otherSwap } = await deploySwapTokens();

            const order = buildOrder({
                maker: addr1.address,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                makerTraits: buildMakerTraits(),
            });

            // Signed for otherSwap, submitted to swap.
            const { r, yParityAndS: vs } = ethers.Signature.from(
                await signOrder(order, chainId, await otherSwap.getAddress(), addr1),
            );
            const takerTraits = buildTakerTraits({});

            await expect(
                swap.fillOrder(order, r, vs, order.makingAmount, takerTraits.traits),
            ).to.be.revertedWithCustomError(swap, 'BadSignature');
        });

        // INV-015. Each of the eight fields must contribute to identity: a
        // field that did not would let one signature authorise two trades.
        it('[FR-ORDER-001][INV-015] changes the hash when any single field changes', async function () {
            const { order, swap } = await buildSampleOrder();

            const baseline = await swap.hashOrder(order);
            const mutations = {
                salt: BigInt(order.salt) + 1n,
                maker: addr2.address,
                receiver: addr2.address,
                makerAsset: addr2.address,
                takerAsset: addr2.address,
                makingAmount: BigInt(order.makingAmount) + 1n,
                takingAmount: BigInt(order.takingAmount) + 1n,
                makerTraits: BigInt(order.makerTraits) ^ 1n,
            };

            for (const [field, value] of Object.entries(mutations)) {
                const mutated = { ...orderFields(order), [field]: value };
                expect(await swap.hashOrder(mutated), `field ${field} does not affect the order hash`)
                    .to.not.equal(baseline);
            }
        });

        it('[FR-ORDER-001] is a pure read that returns the same value every time', async function () {
            const { order, swap } = await buildSampleOrder();

            const first = await swap.hashOrder(order);
            const second = await swap.hashOrder(order);
            expect(first).to.equal(second);
        });
    });

    describe('FR-ORDER-003 receiver resolution [GAP-002]', function () {
        // SCN-005. A zero receiver resolves to the maker rather than burning
        // the taker's payment at the zero address.
        it('[FR-ORDER-003] pays the maker when the order names no receiver', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const makingAmount = ether('100');
            const takingAmount = ether('0.1');

            const order = buildOrder({
                maker: addr1.address,
                receiver: constants.ZERO_ADDRESS,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount,
                takingAmount,
                makerTraits: buildMakerTraits(),
            });
            expect(order.receiver).to.equal(constants.ZERO_ADDRESS);

            const { r, yParityAndS: vs } = ethers.Signature.from(
                await signOrder(order, chainId, await swap.getAddress(), addr1),
            );
            const takerTraits = buildTakerTraits({});

            const fillTx = swap.fillOrder(order, r, vs, makingAmount, takerTraits.traits);

            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [makingAmount, -makingAmount]);
            // The maker receives the taking amount, and nothing reaches address zero.
            await expect(fillTx).to.changeTokenBalances(
                weth,
                [addr, addr1, constants.ZERO_ADDRESS],
                [-takingAmount, takingAmount, 0],
            );
        });

        it('[FR-ORDER-003] pays a named third-party receiver instead of the maker', async function () {
            const { dai, weth, swap, chainId } = await loadFixture(deployContractsAndInit);

            const makingAmount = ether('100');
            const takingAmount = ether('0.1');

            const order = buildOrder({
                maker: addr1.address,
                receiver: addr2.address,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount,
                takingAmount,
                makerTraits: buildMakerTraits(),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(
                await signOrder(order, chainId, await swap.getAddress(), addr1),
            );
            const takerTraits = buildTakerTraits({});

            await expect(
                swap.fillOrder(order, r, vs, makingAmount, takerTraits.traits),
            ).to.changeTokenBalances(
                weth,
                [addr, addr1, addr2],
                [-takingAmount, 0, takingAmount],
            );
        });
    });
});
