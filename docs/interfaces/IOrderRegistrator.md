
## IOrderRegistrator

_The interface defines the structure of the order registrator contract.
The registrator is responsible for registering orders and emitting an event when an order is registered.
Registration is maker-only and signature-free: the transaction sender must be the order's maker,
which is the sole authentication. Fill authorization is carried separately by each flow._

### Functions list
- [registerOrder(order, extension) external](#registerorder)
- [announcedAt(orderHash) external](#announcedat)

### Events list
- [OrderRegistered(order, extension) ](#orderregistered)
- [OrderAnnounced(orderHash, timestamp) ](#orderannounced)

### Functions
### registerOrder

```solidity
function registerOrder(struct IOrderMixin.Order order, bytes extension) external
```
Registers an order. Callable only by the order's maker; reverts for any other sender.
The first successful call records the announcement timestamp and block number; repeated calls
re-emit {OrderRegistered} without moving the announcement.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | The order to be registered. |
| extension | bytes | The extension data associated with the order. |

### announcedAt

```solidity
function announcedAt(bytes32 orderHash) external view returns (uint256 timestamp)
```
Returns the block timestamp of the first registration of an order.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| orderHash | bytes32 | The hash of the order. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
timestamp | uint256 | The timestamp of the first registration, or 0 if the order was never registered. |

### Events
### OrderRegistered

```solidity
event OrderRegistered(struct IOrderMixin.Order order, bytes extension)
```
Emitted when an order is registered. Emission proves the maker itself sent the order.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | The order that was registered. |
| extension | bytes | The extension data associated with the order. |

### OrderAnnounced

```solidity
event OrderAnnounced(bytes32 orderHash, uint256 timestamp)
```
Emitted on the first registration of an order — the single anchor write for
announcement-anchored auctions. Never emitted again for the same order.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| orderHash | bytes32 | The hash of the announced order. |
| timestamp | uint256 | The block timestamp recorded as the announcement time. Carried in the event so indexers need no extra block lookup; the emitting block itself is on the log already. |

