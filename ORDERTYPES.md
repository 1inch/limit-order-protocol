# Limit Orders and RFQ Orders

1inch’s limit order protocol allows you to place two different kinds of orders: Limit orders and RFQ Orders.

## Limit Order

A limit order is a type of order to buy or sell an asset at a specific price or better. When a limit order is placed, the trade will only be executed if the market price reaches or exceeds the price specified in the limit order.

When a trader places a limit order on, the order is added to the order book and remains open until it is executed, canceled, or expires. The limit order allows users to specify the price at which they want to buy or sell an asset, which can help them to minimize the risk of buying or selling at an unfavorable price.

## RFQ Order

A RFQ (Request for Quote) order is a type of limit order that allows traders to request a quote for a specific trade from multiple liquidity providers, including both centralized and decentralized exchanges. The RFQ order allows traders to get a more competitive price for their trades by enabling liquidity providers to compete for the trade.

When a user places an RFQ order, 1inch’s limit order protocol sends the request to multiple suppliers (market makers), who respond with quotes for the trade. The quotes include the price at which the liquidity provider is willing to execute the trade and the amount of the asset that they are willing to provide. The user can then compare the quotes and choose the best one for their trade.

Once the user chooses a quote, the trade is executed as a limit order, with the supplier providing the specified amount of the asset at the quoted price. The RFQ order allows traders to get a better price than they might get with a regular limit order by enabling multiple liquidity providers to compete for the trade.

## Differences Between Limit and RFQ Orders

These are some of the most important differences between the two types of orders:

* The main difference is that RFQ orders are dedicated to market makers 
* Limit orders can be partially filled, while RFQ Orders can be partially filled only once
* Cancelation of the orders works differently:
	* RFQ Orders need to be cancel by order id
	* Limit orders can be single canceled or canceled in a bunch
* Limit orders allow you to specify any predicate that you want, giving you all the flexibility you may need to implement your profit strategy

## 1inch Limit Orders Protocol Documentation

You can read all the detailed documentation on [1inch limit orders protocol here.](https://docs.1inch.io/docs/limit-order-protocol/introduction/)