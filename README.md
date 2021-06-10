<p align="center">
  <img src="https://app.1inch.io/assets/images/logo.svg" width="200" alt="1inch network" />
</p>

# 1inch Limit Order Protocol

[![Build Status](https://github.com/1inch/limit-order-protocol/workflows/CI/badge.svg)](https://github.com/1inch/limit-order-protocol/actions)
[![Coverage Status](https://coveralls.io/repos/github/1inch/limit-order-protocol/badge.svg?branch=master)](https://coveralls.io/github/1inch/limit-order-protocol?branch=master)

### About

You can find general overview and docs on 1inch limit orders protocol [here](https://docs.1inch.io/limit-order-protocol-utils/).

This repository contains a smart contract for EVM based blockchains (Ethereum, Binance Smart Chain, etc.), this contract is core part of 1inch limit order protocol.

Contract allows users to place limit orders, that later could be filled on-chain. Limit order itself is a data structure created off-chain and signed according to EIP-712.

Ket features of the protocol is **extreme flexibility** and **high gas efficiency** that achieved by using following order types.

### Limit Order
Extremely **flexible** limit order, can be configured with:
1) Order execution predicate.
    - Typical usage is checking that certain time stamp or block number. With this you can set certain expiration time.
    - You can specify construct any predicate that you want, for example check that certain price is higher than oracle price, to implement stop loss or take profit stategies 
2) Helper function for asset price evaluation.
    - Function that will allow to extract assets price from arbitrary on-chain source
3) Callback, for to notify maker on order execution.

### RFQ order

**Gas optimized order** with restricted capabilities suitable **for market makers**

- Support expiration time
- Support cancelation by order id
- RFQ Order could be filled only once
- Partial Fill is possible (once)

### Supported tokens
- ERC 20
- ERC 721
- ERC 1155
- Other token standards could be supported via external extension

### Deployments & audits:
You can find 1inch limit order protocol deployments here: 
- Ethereum mainnet: [0x3ef51736315F52d568D6D2cf289419b9CfffE782](https://etherscan.io/address/0x3ef51736315f52d568d6d2cf289419b9cfffe782)
- BSC mainnet: [0xe3456f4Ee65E745A44EC3bcB83D0f2529D1b84Eb](https://bscscan.com/address/0xe3456f4ee65e745a44ec3bcb83d0f2529d1b84eb)
- Polygon mainnet: [0xb707d89D29c189421163515c59E42147371D6857](https://polygonscan.com/address/0xb707d89D29c189421163515c59E42147371D6857)
- Kovan testnet: [0x94Bc2a1C732BcAd7343B25af48385Fe76E08734f](https://kovan.etherscan.io/address/0x94bc2a1c732bcad7343b25af48385fe76e08734f)

You can find audit reports on etherscan and in the separate [audit repository](https://github.com/1inch/1inch-audits). 


### Utils library
Plenty of utils that helps create & sign orders are available in our typescript utils library:  
- [1inch Limit Order Utils](https://github.com/1inch/limit-order-protocol-utils) 
