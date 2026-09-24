const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens } = require('./helpers/fixtures');
const { ether } = require('./helpers/utils');

// Specification tests for ACC-003 and ACC-005, closing GAP-023 and GAP-024.
//
// Phase 4 found three independent Ownable instances in the deployed system -
// LimitOrderProtocol, FeeTaker and NativeOrderFactory - with nothing in the
// code linking them. They may be three different keys on each of the 16 chains.
// None of them had any ownership-transfer coverage.
//
// OQ-4 asks who actually holds each key per deployment. That is deployment
// configuration rather than code, and stays open.

describe('Ownership', function () {
    let addr, addr1, addr2;

    before(async function () {
        [addr, addr1, addr2] = await ethers.getSigners();
    });

    async function deployOwnables () {
        const { dai, weth, inch, swap } = await deploySwapTokens();

        const FeeTaker = await ethers.getContractFactory('FeeTaker');
        const feeTaker = await FeeTaker.deploy(swap, inch, weth, addr);
        await feeTaker.waitForDeployment();

        const TokenMock = await ethers.getContractFactory('TokenMock');
        const accessToken = await TokenMock.deploy('Access Token', 'ACCESS');
        await accessToken.waitForDeployment();

        const NativeOrderFactory = await ethers.getContractFactory('NativeOrderFactory');
        const nativeOrderFactory = await NativeOrderFactory.deploy(
            weth, swap, accessToken, 60, '1inch Limit Order Protocol', '4',
        );
        await nativeOrderFactory.waitForDeployment();

        return { dai, weth, inch, swap, feeTaker, nativeOrderFactory };
    }

    // GAP-024. The three owners are genuinely independent: transferring one
    // leaves the others untouched. Worth asserting because the deployment
    // scripts create them together and it would be easy to assume otherwise.
    it('[ACC-003][GAP-024] the three Ownable contracts have independent owners', async function () {
        const { swap, feeTaker, nativeOrderFactory } = await loadFixture(deployOwnables);

        expect(await swap.owner()).to.equal(addr.address);
        expect(await feeTaker.owner()).to.equal(addr.address);
        expect(await nativeOrderFactory.owner()).to.equal(addr.address);

        await swap.transferOwnership(addr1.address);

        expect(await swap.owner()).to.equal(addr1.address);
        expect(await feeTaker.owner()).to.equal(addr.address);
        expect(await nativeOrderFactory.owner()).to.equal(addr.address);
    });

    it('[ACC-003][GAP-024] rejects an ownership transfer from a non-owner', async function () {
        const { swap, feeTaker, nativeOrderFactory } = await loadFixture(deployOwnables);

        for (const contract of [swap, feeTaker, nativeOrderFactory]) {
            await expect(contract.connect(addr2).transferOwnership(addr2.address))
                .to.be.revertedWithCustomError(contract, 'OwnableUnauthorizedAccount')
                .withArgs(addr2.address);
        }
    });

    // ACC-003 criterion 4. After a transfer the old owner has no privilege at
    // all, and the new owner has it.
    it('[ACC-003][GAP-024] moves the pause privilege with ownership', async function () {
        const { swap } = await loadFixture(deployOwnables);

        await swap.transferOwnership(addr1.address);

        await expect(swap.pause())
            .to.be.revertedWithCustomError(swap, 'OwnableUnauthorizedAccount')
            .withArgs(addr.address);

        await swap.connect(addr1).pause();
        expect(await swap.paused()).to.equal(true);
    });

    it('[ACC-003][GAP-024] rejects transferring ownership to the zero address', async function () {
        const { swap } = await loadFixture(deployOwnables);

        await expect(swap.transferOwnership(ethers.ZeroAddress))
            .to.be.revertedWithCustomError(swap, 'OwnableInvalidOwner')
            .withArgs(ethers.ZeroAddress);

        expect(await swap.owner()).to.equal(addr.address);
    });

    // GAP-023. NativeOrderFactory.rescueFunds was entirely uncovered:
    // coverage reported lines 70-74 unreached.
    it('[ACC-005][GAP-023] only the factory owner can rescue a stranded balance', async function () {
        const { dai, nativeOrderFactory } = await loadFixture(deployOwnables);

        const factoryAddress = await nativeOrderFactory.getAddress();
        const stranded = ether('5');
        await dai.mint(addr, stranded);
        await dai.transfer(factoryAddress, stranded);
        expect(await dai.balanceOf(factoryAddress)).to.equal(stranded);

        await expect(nativeOrderFactory.connect(addr2).rescueFunds(dai, addr2.address, stranded))
            .to.be.revertedWithCustomError(nativeOrderFactory, 'OwnableUnauthorizedAccount')
            .withArgs(addr2.address);

        // The owner can direct the rescue to an arbitrary recipient.
        await expect(nativeOrderFactory.rescueFunds(dai, addr1.address, stranded))
            .to.changeTokenBalances(dai, [factoryAddress, addr1], [-stranded, stranded]);
    });

    // ACC-003 criterion 5. Renouncing is irreversible and leaves the contract
    // permanently without an owner. Pinned on FeeTaker too, where it would
    // strand any future balance for good.
    it('[ACC-005] renouncing FeeTaker ownership makes rescueFunds permanently unreachable', async function () {
        const { weth, feeTaker } = await loadFixture(deployOwnables);

        await weth.deposit({ value: ether('1') });
        await weth.transfer(await feeTaker.getAddress(), ether('1'));

        await feeTaker.renounceOwnership();
        expect(await feeTaker.owner()).to.equal(ethers.ZeroAddress);

        await expect(feeTaker.rescueFunds(weth, ether('1')))
            .to.be.revertedWithCustomError(feeTaker, 'OwnableUnauthorizedAccount');

        // The balance is now permanently stranded.
        expect(await weth.balanceOf(await feeTaker.getAddress())).to.equal(ether('1'));
    });
});
