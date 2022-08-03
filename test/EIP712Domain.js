const { bufferToHex } = require('ethereumjs-util');
const { TypedDataUtils } = require('@metamask/eth-sig-util');
const {
    TypedDataVersion,
} = require('@1inch/solidity-utils');
const {
    Eip2612PermitUtils,
    PrivateKeyProviderConnector,
    fromRpcSig,
} = require('@1inch/permit-signed-approvals-utils');
const { buildDataWithSalt } = require('./helpers/eip712');

const USDCToken = artifacts.require('USDCToken');

describe('EIP712Domain', () => {

    it('should check build domain hash', async () => {
        const privateKey = '02cf164878d6bdc739a2e156e20fa452f6c51af17909abe83eb28de1bfe95c44';
        const connector = new PrivateKeyProviderConnector(privateKey, web3);
        const eip2612PermitUtils = new Eip2612PermitUtils(connector);
        const name = 'USD Coin (PoS)';
        const version = '1';
        const decimals = 6;
        const childChainManager = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199';
        const owner = '0x490eb69959d773bb3095a6a274529b981d5f52e5';
        const spender = '0x94bc2a1c732bcad7343b25af48385fe76e08734f';
        const nonce = 0;
        const deadline = 1659704099;
        const value = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
        const USDCContract = await USDCToken.new();
        await USDCContract.initialize(name, version, decimals, childChainManager);
        const chainId = (await USDCContract.getChainId()).toNumber();
        const verifyingContract = await USDCContract.verifyingContract();
        const data = buildDataWithSalt(owner, name, version, chainId, verifyingContract, spender, nonce, value, deadline);
        const domainHashLocal = bufferToHex(TypedDataUtils.hashStruct('EIP712Domain', data.domain, data.types, TypedDataVersion));
        const domainHashContract = await USDCContract.makeDomainSeparator(name, version);
        expect(domainHashLocal).to.equal(domainHashContract);
        const permitHashLocal = bufferToHex(TypedDataUtils.hashStruct(data.primaryType, data.message, data.types, TypedDataVersion));
        const permitHashContract = await USDCContract.permitDataTypeHash(owner, spender, value, deadline);
        expect(permitHashLocal).to.equal(permitHashContract);
        const permitParams = {
            owner,
            spender,
            value,
            nonce,
            deadline,
        };
        const signature = await eip2612PermitUtils.buildPermitSignature(
            permitParams,
            chainId,
            name,
            verifyingContract,
        );
        const { v, r, s } = fromRpcSig(signature);
        const permit = await USDCContract.permit(owner, spender, value, deadline, v, r, s);
        /// Error Permit: invalid signature
    });
});
