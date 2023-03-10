# Limit orders vs RFQ Orders

## Summary

Both Limit Orders and RFQ Orders share similar order-fulfilling functionality. The difference is that regular order offers more customization options and features, while  RFQ order is extremely gas efficient but without ability to customize.

## Limit Orders

1inch Limit orders are comparatively highly customizable with abilities to set more Execution Predicates, access to Callbacks and helpers. 

### Features

Execution Predicates (Conditions for Order Execution)

- Expiration Timestamp
- Block Number
- Price for Stop Loss Strategies
- Price for Take Profit Strategies

Callbacks to notify Maker on order execution.

[Helper functions](https://github.com/1inch/limit-order-protocol/blob/master/docgen/docs/helpers/ChainlinkCalculator.md) for asset price evaluation that allows you to extract asset prices from arbitrary on-chain source.

### Contract Documentation

To view the functions needed you can have a look at the [OrderMixin.md](https://github.com/1inch/limit-order-protocol/blob/f85c0c1e5bee846054ceddece3c401d338326369/docgen/docs/OrderMixin.md) in the docs

## RFQ Orders

A request for quotation (RFQ) is a business process in which a customer requests a quote from a supplier (market maker) for the purchase of some token, they’re originally dedicated to market makers in the first place. Usually Market makers create a set of RFQ Orders then expose it via the API. Traders on the platform algorithm ask for market maker quotes. If the quotes match traders' needs, the trader receives signed RFQ order from the market maker.

### Features

- Gas optimized orders with restricted capabilities suitable for market makers
- Expiration Timestamp
- Cancellation by Order ID
- RFQ Order could be filled only once
- Partial Fill is possible (once)

### Contracts

To view the functions needed you can have a look at the [OrderMixinRFQ.md](https://github.com/1inch/limit-order-protocol/blob/f85c0c1e5bee846054ceddece3c401d338326369/docgen/docs/OrderRFQMixin.md) in the docs

## Comparison Matrix

|  | Partial Fills | Expiration Timestamp | Order Cancellation | Price for Stop Loss & Take Profit Strategies | Callbacks to notify Makers | Asset Price Evaluation Helper Function | Times it can be filled | Gas Optimized |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Limit Orders | Multiple | ✅ | ✅ | ✅ | ✅ | ✅ | Multiple |  |
| RFQ Orders | Once | ✅ | ✅ |  | ✅https://github.com/1inch/limit-order-protocol/commit/f4e0a3671ea58d464a9350c58e9fecf3f066fefd |  | Once | ✅ |
|  |  |  |  |  |  |  |  |  |

### Video

We’ll be uploading an explainer video soon to give you some more information. Hang Tight!
