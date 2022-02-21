<p align="center">
  <img src="https://app.1inch.io/assets/images/logo.svg" width="200" alt="1inch network" />
</p>

# 1inch Limit Order Protocol Smart Contract

[![Build Status](https://github.com/1inch/limit-order-protocol/workflows/CI/badge.svg)](https://github.com/1inch/limit-order-protocol/actions)
[![Coverage Status](https://coveralls.io/repos/github/1inch/limit-order-protocol/badge.svg?branch=master)](https://coveralls.io/github/1inch/limit-order-protocol?branch=master)

### About

You can find general overview and docs on 1inch limit orders protocol [here](https://docs.1inch.io/docs/limit-order-protocol/introduction/).

This repository contains a smart contract for EVM based blockchains (Ethereum, Binance Smart Chain, etc.), this contract is core part of 1inch limit order protocol.

Contract allows users to place limit orders, that later could be filled on-chain. Limit order itself is a data structure created off-chain and signed according to EIP-712.

Key features of the protocol is **extreme flexibility** and **high gas efficiency** that achieved by using following order types.

### Limit Order
Extremely **flexible** limit order, can be configured with:
1) Order execution predicate.
    - Typical usage is checking that certain time stamp or block number. With this you can set certain expiration time.
    - You can specify construct any predicate that you want, for example check that certain price is higher than oracle price, to implement stop loss or take profit strategies 
2) Helper function for asset price evaluation.
    - Function that will allow to extract assets price from arbitrary on-chain source
3) Callback, for to notify maker on order execution.

### RFQ order

**Gas optimized order** with restricted capabilities suitable **for market makers**

- Support expiration time
- Support cancellation by order id
- RFQ Order could be filled only once
- Partial Fill is possible (once)

### Supported tokens
- ERC 20
- ERC 721
- ERC 1155
- Other token standards could be supported via external extension

### Deployments & audits:
You can find 1inch limit order protocol deployments here: 

**Ethereum mainnet:** [0x119c71D3BbAC22029622cbaEc24854d3D32D2828](https://etherscan.io/address/0x3ef51736315f52d568d6d2cf289419b9cfffe782)

**BSC mainnet:** [0x1e38Eff998DF9d3669E32f4ff400031385Bf6362](https://bscscan.com/address/0x1e38Eff998DF9d3669E32f4ff400031385Bf6362#code)

**Polygon mainnet:** [0x94Bc2a1C732BcAd7343B25af48385Fe76E08734f](https://polygonscan.com/address/0x94Bc2a1C732BcAd7343B25af48385Fe76E08734f#code)

**Optimism Mainnet:** [0x11431a89893025D2a48dCA4EddC396f8C8117187](https://optimistic.etherscan.io/address/0x11431a89893025D2a48dCA4EddC396f8C8117187)

**Arbitrun One:** [0x7F069df72b7A39bCE9806e3AfaF579E54D8CF2b9](https://arbiscan.io/address/0x7F069df72b7A39bCE9806e3AfaF579E54D8CF2b9)

**Gnosis Chain:** [0x54431918cEC22932fCF97E54769F4E00f646690F](https://blockscout.com/xdai/mainnet/address/0x54431918cEC22932fCF97E54769F4E00f646690F/transactions)

**Avalanche:** [0x0F85A912448279111694F4Ba4F85dC641c54b594](https://snowtrace.io/address/0x0F85A912448279111694F4Ba4F85dC641c54b594#code)

**Kovan Testnet:** [0xa218543cc21ee9388Fa1E509F950FD127Ca82155](https://kovan.etherscan.io/address/0xa218543cc21ee9388Fa1E509F950FD127Ca82155)


You can find audit reports on etherscan and in the separate [audit repository](https://github.com/1inch/1inch-audits/tree/master/Limit%20Order%20Protocol). 


### Utils library
Plenty of utils that helps create & sign orders are available in our typescript utils library:  
- [1inch Limit Order Utils](https://github.com/1inch/limit-order-protocol-utils) 
