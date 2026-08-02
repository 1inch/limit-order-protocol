
## IOrderRegistrator

_The interface defines the structure of the order registrator contract.
The registrator is responsible for registering orders and emitting an event when an order is registered._

### Functions list
- [registerOrder(order, extension, signature) external](#registerorder)
- [announcedAt(orderHash) external](#announcedat)
- [announcedAtBlock(orderHash) external](#announcedatblock)

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
Returns the block timestamp of the first registration of an order.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| orderHash | bytes32 | The hash of the order. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
timestamp | uint256 | The timestamp of the first registration, or 0 if the order was never registered. |

### announcedAtBlock

```solidity
function announcedAtBlock(bytes32 orderHash) external view returns (uint256 blockNumber)
```
Returns the block number of the first registration of an order.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| orderHash | bytes32 | The hash of the order. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
blockNumber | uint256 | The block number of the first registration, or 0 if the order was never registered. |

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

