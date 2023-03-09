# Differences between Limit Order and Request for Quote (RFQ)

The main difference between a Limit Order and Request for Quote (RFQ) on 1inch is in the way they are executed.

A Limit Order is an order to buy or sell a specific asset at a specific price or better. When a user places a Limit Order on 1inch, the order is broadcast to the open market, and if there is a matching sell or buy order at the same or better price, the trade is executed automatically.

On the other hand, an RFQ is a request for a quote from a specific liquidity provider. When a user requests an RFQ on 1inch, the request is sent directly to the selected liquidity provider, who provides a quote for the requested trade. The user can then choose to accept or reject the quote, and if accepted, the trade is executed at the quoted price.

In summary, the main differences between Limit Orders and RFQs are:

|      | Limit Order | RFQ |
| :--- | :----------- | :----------- |
| Execution   | Automatically when a matching order is found on the open market | Manually after the user accepts a quote from a liquidity provider |
| Price       | User specifies the price at which they are willing to buy or sell | User requests a quote from a liquidity provider for the desired trade |
| Liquidity   | Rely on the available liquidity on the open market | Rely on the liquidity of the selected liquidity provider |