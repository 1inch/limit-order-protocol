const { TypedDataVersion } = require('@1inch/solidity-utils');
const { TypedDataUtils } = require('@metamask/eth-sig-util');
const { cutSelector, trim0x } = require('./utils');
const { ethers } = require('hardhat');

const EIP712Domain = [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
];

const Permit = [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
];

function domainSeparator (name, version, chainId, verifyingContract) {
    return '0x' + TypedDataUtils.hashStruct(
        'EIP712Domain',
        { name, version, chainId, verifyingContract },
        { EIP712Domain },
        TypedDataVersion,
    ).toString('hex');
}

function buildData (owner, name, version, chainId, verifyingContract, spender, nonce, value, deadline) {
    return {
        domain: { name, version, chainId, verifyingContract },
        types: { Permit },
        value: { owner, spender, value, nonce, deadline },
    };
}

const defaultDeadline = '18446744073709551615';

async function getPermit (owner, wallet, token, tokenVersion, chainId, spender, value, deadline = defaultDeadline) {
    const nonce = await token.nonces(owner);
    const name = await token.name();
    const data = buildData(owner, name, tokenVersion, chainId, await token.getAddress(), spender, nonce, value, deadline);
    const signature = await wallet.signTypedData(data.domain, data.types, data.value);
    const { v, r, s } = ethers.Signature.from(signature);
    const permitCall = token.interface.encodeFunctionData('permit', [owner, spender, value, deadline, v, r, s]);
    return cutSelector(permitCall);
}

function withTarget (target, data) {
    return target.toString() + trim0x(data);
}

module.exports = {
    EIP712Domain,
    Permit,
    domainSeparator,
    getPermit,
    withTarget,
};
