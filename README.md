<div align="center">
    <img src="https://github.com/1inch/limit-order-protocol/blob/master/.github/1inch_github_w.svg#gh-light-mode-only">
    <img src="https://github.com/1inch/limit-order-protocol/blob/master/.github/1inch_github_b.svg#gh-dark-mode-only">
</div>

# 1inch Limit Order Protocol Smart Contract

[![Build Status](https://github.com/1inch/limit-order-protocol/workflows/CI/badge.svg)](https://github.com/1inch/limit-order-protocol/actions)
[![Coverage Status](https://codecov.io/gh/1inch/limit-order-protocol/branch/master/graph/badge.svg?token=FSFTJPS41S)](https://codecov.io/gh/1inch/limit-order-protocol)

### Version warning

The `master` branch contains the latest work-in-progress version of limit orders. It hasn't been audited and may contain severe security issues or may not work at all.

Please, use the commit tagged version to get the latest production version that has passed through a series of security audits:

- tag `4.0.0` [Limit order protocol v4](https://github.com/1inch/limit-order-protocol/tree/4.0.0) / [security audits](https://github.com/1inch/1inch-audits/tree/master/Aggregation%20Pr.%20V6%20and%20Limit%20Order%20Pr.V4)
- tag `3.0.1` [Limit order protocol v3](https://github.com/1inch/limit-order-protocol/tree/3.0.1) / [security audits](https://github.com/1inch/1inch-audits/tree/master/Aggregation%20Pr.%20V5%20and%20Limit%20Order%20Pr.V3)
- tag `v2` - [Limit order protocol v2](https://github.com/1inch/limit-order-protocol/tree/v2) / [security audits](https://github.com/1inch/1inch-audits/tree/master/Limit%20Order%20Protocol%20V2)

### About

You can find the latest general overview and documentation on the 1inch limit orders protocol in the [description.md](description.md). Documentation for this and previous versions can be found on the [1inch documentation portal](https://docs.1inch.io/docs/limit-order-protocol/introduction/).

The repository contains smart contracts for EVM-based blockchains (such as Ethereum, Binance Smart Chain, etc.). These contracts are a core part of the 1inch limit order protocol, allowing users to create limit orders off-chain that can be filled on-chain. A limit order is a data structure signed according to EIP-712.

### Limit Order

The key features of the protocol are **extreme flexibility** and **high gas efficiency**, which are achieved with the following features

**Basic features**

- Select an asset receiver for an order.
- Choose whether to allow or disallow partial and multiple fills.
- Define conditions that must be met before execution can proceed (e.g. stop-loss, take-profit orders).
- Specify interactions (arbitrary maker's code) to execute before and after order filling.
- Choose an approval scheme for token spend (approve, permit, permit2).
- Request that WETH be unwrapped to ETH either before (to sell ETH) or after the swap (to receive ETH).
- Make an order private by specifying the only allowed taker's address.
- Set the order's expiration date.
- Assign a nonce or epoch to the order for easy cancellation later.

**Advanced features**

- Define a proxy to handle transfers of assets that are not compliant with `IERC20`, allowing the swapping of non-ERC20 tokens, such as ERC721 or ERC1155.
- Define functions to calculate, on-chain, the exchange rate for maker and taker assets. These functions can be used to implement dutch auctions (where the rate decreases over time) or range orders (where the rate depends on the volume already filled), among others.

### RFQ orders

Separate RFQ order are deprecated in v4. To create the most gas efficient order use a basic order without extensions.

### Supported tokens

- ERC 20
- ERC 721
- ERC 1155
- Other token standards could be supported via external extension

### Deployments & audits (Limit Orders Protocol v3):

You can find 1inch limit order protocol deployments here:

**Ethereum mainnet:** [0x119c71D3BbAC22029622cbaEc24854d3D32D2828](https://etherscan.io/address/0x119c71D3BbAC22029622cbaEc24854d3D32D2828)

**BSC mainnet:** [0x1e38Eff998DF9d3669E32f4ff400031385Bf6362](https://bscscan.com/address/0x1e38Eff998DF9d3669E32f4ff400031385Bf6362#code)

**Polygon mainnet:** [0x94Bc2a1C732BcAd7343B25af48385Fe76E08734f](https://polygonscan.com/address/0x94Bc2a1C732BcAd7343B25af48385Fe76E08734f#code)

**Optimism Mainnet:** [0x11431a89893025D2a48dCA4EddC396f8C8117187](https://optimistic.etherscan.io/address/0x11431a89893025D2a48dCA4EddC396f8C8117187)

**Arbitrum One:** [0x7F069df72b7A39bCE9806e3AfaF579E54D8CF2b9](https://arbiscan.io/address/0x7F069df72b7A39bCE9806e3AfaF579E54D8CF2b9)

**Gnosis Chain:** [0x54431918cEC22932fCF97E54769F4E00f646690F](https://blockscout.com/xdai/mainnet/address/0x54431918cEC22932fCF97E54769F4E00f646690F/transactions)

**Avalanche:** [0x0F85A912448279111694F4Ba4F85dC641c54b594](https://snowtrace.io/address/0x0F85A912448279111694F4Ba4F85dC641c54b594#code)

**Kovan Testnet:** [0xa218543cc21ee9388Fa1E509F950FD127Ca82155](https://kovan.etherscan.io/address/0xa218543cc21ee9388Fa1E509F950FD127Ca82155)

**Fantom Opera:** [0x11DEE30E710B8d4a8630392781Cc3c0046365d4c](https://ftmscan.com/address/0x11DEE30E710B8d4a8630392781Cc3c0046365d4c)

You can find audit reports on etherscan and in the separate [audit repository](https://github.com/1inch/1inch-audits/tree/master/Limit%20Order%20Protocol).

### Utils library (Limit Orders Protocol v4)
Plenty of utils that helps create & sign orders are available in our typescript utils library:

- [1inch Limit Order Utils](https://github.com/1inch/limit-order-protocol-utils)
