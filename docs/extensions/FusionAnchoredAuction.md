
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
unanchored Dutch auction.

Getter-side features only run when the order's amount data actually routes through this contract: an
order assembled with empty taking-amount data prices at its plain ratio and skips every check encoded
here, which no amount getter can prevent. Order builders must treat the amount-getter fields as
load-bearing. The fill-by deadline therefore lives in the post-interaction blob, which is not
skippable, rather than in the getters.

When chained behind a settlement that takes a surplus fee, the fill premium counts toward that
surplus: anything a fill pays above the settlement's scaled estimated taking amount is taxed at its
surplus percentage, and the estimate scales linearly with fill size while the premium does not, so a
quoter cannot pad it away exactly. Either accept that the protocol takes its surplus share of the
premium, or set the estimate with that in mind._

### Functions list
- [constructor(orderRegistrator) public](#constructor)
- [postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData) external](#postinteraction)
- [_getMakingAmount(order, extension, orderHash, taker, takingAmount, remainingMakingAmount, extraData) internal](#_getmakingamount)
- [_getTakingAmount(order, extension, orderHash, taker, makingAmount, remainingMakingAmount, extraData) internal](#_gettakingamount)

### Errors list
- [OrderNotAnnounced() ](#ordernotannounced)
- [AuctionExpired() ](#auctionexpired)
- [AllowedTimeViolation() ](#allowedtimeviolation)
- [NonMonotonicFillCurve() ](#nonmonotonicfillcurve)
- [InvalidFlagCombination() ](#invalidflagcombination)

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
3 bytes - announcement deadline delay, present when the announcement deadline flag is set
1 byte - size of the whitelist
(bytes10,bytes2)[N] - whitelisted addresses and the time delta until the next one
bytes - custom data to call an extra post-interaction (optional)

Whitelisted addresses are compared by their lowest 10 bytes, the same trade-off the settlement
contracts already make between calldata size and the cost of grinding a colliding address.

The announcement deadline stops the order being fillable once `announcedAt + delay` has passed —
the fill-by mechanism for anchored orders, bounding the floor-price tail an absolute expiry cannot
once the start is anchored. It requires the anchored flag: setting it alone reverts rather than
silently doing nothing. It lives here rather than in the amount getters because a post-interaction
is not skippable — an order whose amount data was mis-assembled skips every getter-side check but
still dies at its deadline. Conceptually the delay is `auctionDuration + the tail window the
maker tolerates`. An order that wants the deadline without resolver exclusivity
carries this blob with an empty whitelist. Note the deadline only reverts the fill itself; quoting
through the amount getters does not read it, which resolver fill simulations account for._

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

### NonMonotonicFillCurve

```solidity
error NonMonotonicFillCurve()
```

_A premium that rises along the volume ladder would reward splitting a fill._

### InvalidFlagCombination

```solidity
error InvalidFlagCombination()
```

_A flag was set that only means something in combination with another, absent one._

