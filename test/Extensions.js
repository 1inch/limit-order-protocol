const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('@1inch/solidity-utils');
const { buildOrder } = require('./helpers/orderUtils');
const { ethers } = require('hardhat');

describe('MakerContract', function () {
    let addr;

    before(async function () {
        [addr] = await ethers.getSigners();
    });

    async function deployAndInit () {
        const ExtensionMock = await ethers.getContractFactory('ExtensionMock');
        const extensionMock = await ExtensionMock.deploy();
        await extensionMock.waitForDeployment();
        return { extensionMock };
    };

    it('should correctly parse empty custom data', async function () {
        const { extensionMock } = await loadFixture(deployAndInit);

        const order = buildOrder(
            {
                maker: addr.address,
                receiver: addr.address,
                makerAsset: addr.address,
                takerAsset: addr.address,
                makingAmount: '0',
                takingAmount: '0',
            },
            {
                postInteraction: addr.address,
            },
        );

        const customData = await extensionMock.getCustomData(order.extension);
        expect(customData).to.be.equal('0x');
    });

    it('should correctly parse non-empty custom data', async function () {
        const { extensionMock } = await loadFixture(deployAndInit);

        const order = buildOrder(
            {
                maker: addr.address,
                receiver: addr.address,
                makerAsset: addr.address,
                takerAsset: addr.address,
                makingAmount: '0',
                takingAmount: '0',
            },
            {
                predicate: addr.address,
                customData: '0x1234',
            },
        );

        const customData = await extensionMock.getCustomData(order.extension);
        expect(customData).to.be.equal('0x1234');
    });

    it('should correctly parse custom data when all other fields are empty', async function () {
        const { extensionMock } = await loadFixture(deployAndInit);

        const order = buildOrder(
            {
                maker: addr.address,
                receiver: addr.address,
                makerAsset: addr.address,
                takerAsset: addr.address,
                makingAmount: '0',
                takingAmount: '0',
            },
            {
                customData: '0x123456781234',
            },
        );

        const customData = await extensionMock.getCustomData(order.extension);
        expect(customData).to.be.equal('0x123456781234');
    });
});
