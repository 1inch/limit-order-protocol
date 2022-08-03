const { bufferToHex } = require('ethereumjs-util');
const { TypedDataUtils } = require('@metamask/eth-sig-util');
const {
    TypedDataVersion,
} = require('@1inch/solidity-utils');
const domain = require('./mocks/domain.json');

const usdcPOLDS = '0x294369e003769a2d4d625e8a9ebebffa09ff70dd7c708497d8b56d2c2d199a19';

describe('EIP712Domain', () => {
    it('should check build domain hash', async () => {
        const data = domain;
        const domainTypeHash = bufferToHex(TypedDataUtils.hashStruct('EIP712Domain', data.domain, data.types, TypedDataVersion));
        expect(usdcPOLDS).to.equal(domainTypeHash);
    });

    it('should check build data hash', async (done) => {
        const data = domain;
        const dataHash = bufferToHex(TypedDataUtils.hashStruct(data.primaryType, data.message, data.types, TypedDataVersion));
        console.log('data hash', dataHash);
        done();
    });

    it('qwe', (done) => {
        const hash = bufferToHex(TypedDataUtils.eip712Hash(domain, TypedDataVersion));
        console.log(hash);
        done();
    });
});
