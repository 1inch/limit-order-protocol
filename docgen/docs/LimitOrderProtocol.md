# LimitOrderProtocol





## Functions

### `DOMAIN_SEPARATOR() → bytes32`
No description


### `remaining(bytes32 orderHash) → uint256`
Returns unfilled amount for order. Throws if order does not exist


### `remainingRaw(bytes32 orderHash) → uint256`
Returns unfilled amount for order


#### Return Values:
- Unfilled amount of order plus one if order exists. Otherwise 0

### `remainingsRaw(bytes32[] orderHashes) → uint256[] results`
Same as `remainingRaw` but for multiple orders


### `invalidatorForOrderRFQ(address maker, uint256 slot) → uint256`
Returns bitmask for double-spend invalidators based on lowest byte of order.info and filled quotes


#### Return Values:
- Each bit represents whenever corresponding quote was filled

### `checkPredicate(struct LimitOrderProtocol.Order order) → bool`
Checks order predicate


### `simulateCalls(address[] targets, bytes[] data)`
No description

#### Parameters:
- `targets`: Array of functions. Each function is expected to take a corresponding `data` argument
as parameter and return bool

### `cancelOrder(struct LimitOrderProtocol.Order order)`
Cancels order by setting remaining amount to zero


### `cancelOrderRFQ(uint256 orderInfo)`
Cancels order's quote


### `fillOrderRFQ(struct LimitOrderProtocol.OrderRFQ order, bytes signature, uint256 makingAmount, uint256 takingAmount)`
Fills order's quote, fully or partially (whichever is possible)


#### Parameters:
- `order`: Order quote to fill

- `signature`: Signature to confirm quote ownership

- `makingAmount`: Making amount

- `takingAmount`: Taking amount

### `fillOrder(struct LimitOrderProtocol.Order order, bytes signature, uint256 makingAmount, uint256 takingAmount, uint256 thresholdAmount) → uint256, uint256`
Fills an order. If one doesn't exist (first fill) it will be created using order.makerAssetData


### `_hash(struct LimitOrderProtocol.Order order) → bytes32`
No description


### `_hash(struct LimitOrderProtocol.OrderRFQ order) → bytes32`
No description


### `_validate(bytes makerAssetData, bytes takerAssetData, bytes signature, bytes32 orderHash)`
No description


### `_callMakerAssetTransferFrom(address makerAsset, bytes makerAssetData, address taker, uint256 makingAmount)`
No description


### `_callTakerAssetTransferFrom(address takerAsset, bytes takerAssetData, address taker, uint256 takingAmount)`
No description


### `_callGetMakerAmount(struct LimitOrderProtocol.Order order, uint256 takerAmount) → uint256 makerAmount`
No description


### `_callGetTakerAmount(struct LimitOrderProtocol.Order order, uint256 makerAmount) → uint256 takerAmount`
No description




## Events

### `OrderFilled(address maker, bytes32 orderHash, uint256 remaining)`
No description

### `OrderFilledRFQ(bytes32 orderHash, uint256 makingAmount)`
No description

