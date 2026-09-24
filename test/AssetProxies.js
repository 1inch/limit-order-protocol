const hre = require('hardhat');
const { ethers } = hre;
const { expect, constants } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');
const { buildOrder, buildTakerTraits, signOrder, buildMakerTraits } = require('./helpers/orderUtils');
const { ether } = require('./helpers/utils');

// Specification tests for INT-006, closing GAP-019.
//
// ERC1155Proxy and ERC721ProxySafe were the last two production contracts at
// 0% coverage after every other test phase. Both hold token approvals and
// expose a function whose selector is deliberately ground to collide with
// IERC20.transferFrom, guarded only by onlyImmutableOwner. Untested code with
// that shape is exactly what should not reach an audit unexercised
// (SEC-F-012).
//
// The existing ERC721Proxy example borrows the ERC-20 TokenMock, relying on
// `transferFrom(from, to, tokenId)` happening to typecheck. That trick does
// not work for safeTransferFrom or for ERC-1155, so these tests use real
// ERC721TokenMock and ERC1155TokenMock (added under OQ-8).

describe('Asset proxies', function () {
    let addr, addr1;

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
    });

    // The protocol calls `transferFrom(from, to, amount)` and appends the
    // suffix. Encoding the full proxy call and cutting the first 202
    // characters - '0x', the 4-byte selector and the three standard words -
    // leaves exactly the extra arguments, with any dynamic offsets still
    // correct because the overall argument layout is unchanged.
    const SUFFIX_CUT = 202;

    describe('ERC721ProxySafe [INT-006]', function () {
        async function deployErc721Setup () {
            const { dai, swap, chainId } = await deploySwapTokens();

            const ERC721TokenMock = await ethers.getContractFactory('ERC721TokenMock');
            const nft = await ERC721TokenMock.deploy('NFT', 'NFT');
            await nft.waitForDeployment();

            const ERC721ProxySafe = await ethers.getContractFactory('ERC721ProxySafe');
            const proxy = await ERC721ProxySafe.deploy(await swap.getAddress());
            await proxy.waitForDeployment();

            const tokenId = 42n;
            await nft.mint(addr1, tokenId);
            await nft.connect(addr1).setApprovalForAll(proxy, true);

            await dai.mint(addr, ether('1000'));
            await dai.approve(swap, ether('1000'));

            return { dai, swap, chainId, nft, proxy, tokenId };
        }

        it('[INT-006] transfers the NFT to the taker through the proxy', async function () {
            const { dai, swap, chainId, nft, proxy, tokenId } = await loadFixture(deployErc721Setup);

            const takingAmount = ether('100');

            const makerAssetSuffix = '0x' + proxy.interface.encodeFunctionData(
                'func_60iHVgK',
                // from, to, amount are placeholders the protocol supplies.
                [addr1.address, constants.ZERO_ADDRESS, 0, tokenId, await nft.getAddress()],
            ).substring(SUFFIX_CUT);

            const order = buildOrder(
                {
                    maker: addr1.address,
                    // The proxy stands in for the asset.
                    makerAsset: await proxy.getAddress(),
                    takerAsset: await dai.getAddress(),
                    makingAmount: 1,
                    takingAmount,
                    makerTraits: buildMakerTraits(),
                },
                { makerAssetSuffix },
            );

            const { r, yParityAndS: vs } = ethers.Signature.from(
                await signOrder(order, chainId, await swap.getAddress(), addr1),
            );
            const takerTraits = buildTakerTraits({ makingAmount: true, extension: order.extension });

            expect(await nft.ownerOf(tokenId)).to.equal(addr1.address);

            const fillTx = swap.fillOrderArgs(order, r, vs, 1, takerTraits.traits, takerTraits.args);
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [-takingAmount, takingAmount]);

            // safeTransferFrom moved the token itself.
            expect(await nft.ownerOf(tokenId)).to.equal(addr.address);
        });

        // INT-006 criterion 2. The constructor asserts its own selector
        // collision, so a mis-ground proxy cannot deploy.
        it('[INT-006] the proxy function shares the ERC-20 transferFrom selector', async function () {
            const { proxy } = await loadFixture(deployErc721Setup);

            const proxySelector = proxy.interface.getFunction('func_60iHVgK').selector;
            const erc20TransferFrom = ethers.id('transferFrom(address,address,uint256)').slice(0, 10);

            expect(proxySelector).to.equal(erc20TransferFrom);
        });

        it('[INT-006][ACC-004] rejects a direct call from anyone but the protocol', async function () {
            const { nft, proxy, tokenId } = await loadFixture(deployErc721Setup);

            await expect(
                proxy.connect(addr).func_60iHVgK(addr1.address, addr.address, 0, tokenId, await nft.getAddress()),
            ).to.be.revertedWithCustomError(proxy, 'IOAccessDenied');

            expect(await nft.ownerOf(tokenId)).to.equal(addr1.address);
        });
    });

    describe('ERC1155Proxy [INT-006]', function () {
        async function deployErc1155Setup () {
            const { dai, swap, chainId } = await deploySwapTokens();

            const ERC1155TokenMock = await ethers.getContractFactory('ERC1155TokenMock');
            const multi = await ERC1155TokenMock.deploy('https://example.invalid/{id}');
            await multi.waitForDeployment();

            const ERC1155Proxy = await ethers.getContractFactory('ERC1155Proxy');
            const proxy = await ERC1155Proxy.deploy(await swap.getAddress());
            await proxy.waitForDeployment();

            const tokenId = 7n;
            await multi.mint(addr1, tokenId, 100n);
            await multi.connect(addr1).setApprovalForAll(proxy, true);

            await dai.mint(addr, ether('1000'));
            await dai.approve(swap, ether('1000'));

            return { dai, swap, chainId, multi, proxy, tokenId };
        }

        // Unlike the ERC-721 proxies, ERC1155Proxy forwards `amount` to
        // safeTransferFrom, so the making amount is the quantity moved.
        it('[INT-006] transfers the requested quantity to the taker', async function () {
            const { dai, swap, chainId, multi, proxy, tokenId } = await loadFixture(deployErc1155Setup);

            const makingAmount = 10n;
            const takingAmount = ether('100');

            const makerAssetSuffix = '0x' + proxy.interface.encodeFunctionData(
                'func_301JL5R',
                [addr1.address, constants.ZERO_ADDRESS, 0, await multi.getAddress(), tokenId, '0x'],
            ).substring(SUFFIX_CUT);

            const order = buildOrder(
                {
                    maker: addr1.address,
                    makerAsset: await proxy.getAddress(),
                    takerAsset: await dai.getAddress(),
                    makingAmount,
                    takingAmount,
                    makerTraits: buildMakerTraits(),
                },
                { makerAssetSuffix },
            );

            const { r, yParityAndS: vs } = ethers.Signature.from(
                await signOrder(order, chainId, await swap.getAddress(), addr1),
            );
            const takerTraits = buildTakerTraits({ makingAmount: true, extension: order.extension });

            expect(await multi.balanceOf(addr1.address, tokenId)).to.equal(100n);
            expect(await multi.balanceOf(addr.address, tokenId)).to.equal(0n);

            const fillTx = swap.fillOrderArgs(order, r, vs, makingAmount, takerTraits.traits, takerTraits.args);
            await expect(fillTx).to.changeTokenBalances(dai, [addr, addr1], [-takingAmount, takingAmount]);

            expect(await multi.balanceOf(addr1.address, tokenId)).to.equal(90n);
            expect(await multi.balanceOf(addr.address, tokenId)).to.equal(10n);
        });

        it('[INT-006] the proxy function shares the ERC-20 transferFrom selector', async function () {
            const { proxy } = await loadFixture(deployErc1155Setup);

            const proxySelector = proxy.interface.getFunction('func_301JL5R').selector;
            const erc20TransferFrom = ethers.id('transferFrom(address,address,uint256)').slice(0, 10);

            expect(proxySelector).to.equal(erc20TransferFrom);
        });

        it('[INT-006][ACC-004] rejects a direct call from anyone but the protocol', async function () {
            const { multi, proxy, tokenId } = await loadFixture(deployErc1155Setup);

            await expect(
                proxy.connect(addr).func_301JL5R(
                    addr1.address, addr.address, 1, await multi.getAddress(), tokenId, '0x',
                ),
            ).to.be.revertedWithCustomError(proxy, 'IOAccessDenied');

            expect(await multi.balanceOf(addr.address, tokenId)).to.equal(0n);
        });
    });
});
