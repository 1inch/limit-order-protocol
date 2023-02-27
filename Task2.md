### Version warning
The master branch contains the latest work-in-progress version of limit orders. It hasn't been audited and may contain severe security issues or may not work at all.

Please, use the commit tagged `v2` ([here](https://github.com/1inch/limit-order-protocol/releases/tag/v2)) to get the latest production version that has passed through a series of [security audits](https://github.com/1inch/1inch-audits/tree/master/Limit%20Order%20Protocol%20V2).
# Differences between Limit Orders and RFQ Limit Orders

Limit orders and RFQ limit orders are two order types that can be used in the 1inch limit order protocol. While they share some similarities, there are also some key differences between them.

## Limit Orders

A limit order is an extremely flexible order type that can be customized in many ways. Some key features of limit orders include:

- **Order execution predicate:** This is a function that checks for certain conditions before the order can be executed. For example, you can set an expiration time or check that a certain price is higher than an oracle price.
- **Asset price evaluation:** This is a helper function that allows the system to extract asset prices from arbitrary on-chain sources.
- **Callback:** This is a function that notifies the maker when the order is executed.

## RFQ Limit Orders

RFQ limit orders are gas-optimized orders with more restricted capabilities. Some key features of RFQ limit orders include:

- **Expiration time:** RFQ orders also support expiration times.
- **Cancellation:** RFQ orders can be cancelled by order ID.
- **One-time fill:** RFQ orders can only be filled once.
- **Partial fill:** One time partial fill is possible with RFQ orders.

## Comparison

While both order types share some features, there are some notable differences. Limit orders are more flexible and customizable, while RFQ orders are more gas-efficient and suitable for market makers. Here's a summary of the key differences:

|  | Limit Orders | RFQ Limit Orders |
| --- | --- | --- |
| Execution Predicate | Highly customizable | Less customizable |
| Asset Price Evaluation | Helper function available | Helper function available |
| Callback | Available | Not available |
| Expiration Time | Highly customizable | Available |
| Cancellation | Available | Available |
| One-Time Fill | Not applicable | Available |
| Partial Fill | Available | Available |

Overall, the choice between limit orders and RFQ limit orders will depend on your specific use case and priorities.
