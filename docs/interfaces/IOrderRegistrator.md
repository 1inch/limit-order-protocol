
## IOrderRegistrator

_The interface defines the structure of the order registrator contract.
The registrator is responsible for registering orders and emitting an event when an order is registered._

### Functions list
- [registerOrder(order, extension, signature) external](#registerorder)
- [announcedAt(orderHash) external](#announcedat)

### Events list
- [OrderRegistered(order, extension, signature) ](#orderregistered)

### Functions
### registerOrder

```solidity
function registerOrder(struct IOrderMixin.Order order, bytes extension, bytes signature) external
```
Registers an order.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | The order to be registered. |
| extension | bytes | The extension data associated with the order. |
| signature | bytes | The signature of the order. |

### announcedAt

```solidity
function announcedAt(bytes32 orderHash) external view returns (uint256 timestamp)
```
Returns the time an order was first registered, or zero when it never was.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| orderHash | bytes32 | The hash of the order. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
timestamp | uint256 | The block timestamp of the first registration. |

### Events
### OrderRegistered

```solidity
event OrderRegistered(struct IOrderMixin.Order order, bytes extension, bytes signature)
```
Emitted when an order is registered.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | The order that was registered. |
| extension | bytes | The extension data associated with the order. |
| signature | bytes | The signature of the order. |

