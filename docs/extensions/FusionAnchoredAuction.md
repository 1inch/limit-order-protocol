
## FusionAnchoredAuction

Dutch auction whose schedule may be anchored to the moment an order was announced on-chain,
and whose price may depend on how much of the order a taker fills.

_An absolute auction start baked into an order at build time is missed by a maker that signs slowly —
a multisig collecting signatures, for instance — and such an order degrades to the auction floor price.
Anchoring reads the announcement recorded by {OrderRegistrator} and starts the auction from it instead,
so a slow maker gets the same price curve a fast one gets.

The contract is a standalone amount getter and post-interaction rather than a settlement subclass. It is
referenced by address from the order extension, either directly or chained after a settlement contract
through the amount-getter and post-interaction chains, and so works with any deployed settlement version.
Every feature is opt-in per order through the flags byte; with no flags set the pricing matches an
unanchored Dutch auction._

### Types list
- [AuctionState](#auctionstate)

### Functions list
- [constructor(orderRegistrator) public](#constructor)
- [postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData) external](#postinteraction)
- [_getMakingAmount(order, extension, orderHash, taker, takingAmount, remainingMakingAmount, extraData) internal](#_getmakingamount)
- [_getTakingAmount(order, extension, orderHash, taker, makingAmount, remainingMakingAmount, extraData) internal](#_gettakingamount)

### Errors list
- [OrderNotAnnounced() ](#ordernotannounced)
- [AuctionExpired() ](#auctionexpired)
- [AllowedTimeViolation() ](#allowedtimeviolation)
- [InvalidFillScalingNumerator() ](#invalidfillscalingnumerator)

### Types
### AuctionState

_State parsed out of the auction details, in the form the rate bump is computed from._

```solidity
struct AuctionState {
  uint256 auctionBump;
  uint256 initialRateBump;
  uint256 gasBump;
  uint256 fillScalingNumerator;
}
```

### Functions
### constructor

```solidity
constructor(contract IOrderRegistrator orderRegistrator) public
```
Initializes the contract.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| orderRegistrator | contract IOrderRegistrator | The registrator whose announcements anchored orders are priced from. |

### postInteraction

```solidity
function postInteraction(struct IOrderMixin.Order order, bytes extension, bytes32 orderHash, address taker, uint256 makingAmount, uint256 takingAmount, uint256 remainingMakingAmount, bytes extraData) external
```
See {IPostInteraction-postInteraction}.

_Holds resolver exclusivity relative to the announcement. An order whose exclusivity is expressed
as absolute timestamps has already passed all of its windows by the time a late announcement lands,
so a settlement contract lets every resolver in at once; this restores the windows the maker asked for.
Anchored orders should therefore leave the settlement's own allowed time non-blocking.

The function moves no funds and only reverts, so it is deliberately callable by anyone: when chained
from a settlement contract the caller is that contract rather than the limit order protocol, and a
caller check would break the composition.

`extraData` consists of:
1 byte - flags
4 bytes - allowed time
3 bytes - allowed time delay, present when the anchored flag is set
1 byte - size of the whitelist
(bytes10,bytes2)[N] - whitelisted addresses and the time delta until the next one
bytes - custom data to call an extra post-interaction (optional)

Whitelisted addresses are compared by their lowest 10 bytes, the same trade-off the settlement
contracts already make between calldata size and the cost of grinding a colliding address._

### _getMakingAmount

```solidity
function _getMakingAmount(struct IOrderMixin.Order order, bytes extension, bytes32 orderHash, address taker, uint256 takingAmount, uint256 remainingMakingAmount, bytes extraData) internal view returns (uint256)
```

_Applies the auction to the making amount. The fill share is not known here — it is the value
being computed — so it is estimated at the worst rate bump the auction can produce and the price is
then recomputed from that estimate. The estimate can only understate the share and therefore only
overstate the rate bump, so the result never exceeds the amount an exact solution would return._

### _getTakingAmount

```solidity
function _getTakingAmount(struct IOrderMixin.Order order, bytes extension, bytes32 orderHash, address taker, uint256 makingAmount, uint256 remainingMakingAmount, bytes extraData) internal view returns (uint256)
```

_Applies the auction to the taking amount, where the fill share is known exactly._

### Errors
### OrderNotAnnounced

```solidity
error OrderNotAnnounced()
```

_The order relies on its announcement but has never been announced._

### AuctionExpired

```solidity
error AuctionExpired()
```

_The order is past the deadline that follows its auction._

### AllowedTimeViolation

```solidity
error AllowedTimeViolation()
```

_The taker may not fill the order yet._

### InvalidFillScalingNumerator

```solidity
error InvalidFillScalingNumerator()
```

_Fill scaling is expressed in 1e2 and cannot exceed 100%._

