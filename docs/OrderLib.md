
## OrderLib

_The library provides common functionality for processing and manipulating limit orders.
It provides functionality to calculate and verify order hashes, calculate trade amounts, and validate
extension data associated with orders. The library also contains helper methods to get the receiver of
an order and call getter functions._

### Functions list
- [hash(order, domainSeparator) internal](#hash)
- [getReceiver(order) internal](#getreceiver)
- [calculateMakingAmount(order, extension, requestedTakingAmount, remainingMakingAmount, orderHash) internal](#calculatemakingamount)
- [calculateTakingAmount(order, extension, requestedMakingAmount, remainingMakingAmount, orderHash) internal](#calculatetakingamount)
- [isValidExtension(order, extension) internal](#isvalidextension)

### Errors list
- [MissingOrderExtension() ](#missingorderextension)
- [UnexpectedOrderExtension() ](#unexpectedorderextension)
- [InvalidExtensionHash() ](#invalidextensionhash)

### Functions
### hash

```solidity
function hash(struct IOrderMixin.Order order, bytes32 domainSeparator) internal pure returns (bytes32 result)
```
Calculates the hash of an order.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | The order to be hashed. |
| domainSeparator | bytes32 | The domain separator to be used for the EIP-712 hashing. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
result | bytes32 | The keccak256 hash of the order data. |

### getReceiver

```solidity
function getReceiver(struct IOrderMixin.Order order) internal pure returns (address)
```
Returns the receiver address for an order.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | The order. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | address | receiver The address of the receiver, either explicitly defined in the order or the maker's address if not specified. |

### calculateMakingAmount

```solidity
function calculateMakingAmount(struct IOrderMixin.Order order, bytes extension, uint256 requestedTakingAmount, uint256 remainingMakingAmount, bytes32 orderHash) internal view returns (uint256)
```
Calculates the making amount based on the requested taking amount.

_If getter is specified in the extension data, the getter is called to calculate the making amount,
otherwise the making amount is calculated linearly._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | The order. |
| extension | bytes | The extension data associated with the order. |
| requestedTakingAmount | uint256 | The amount the taker wants to take. |
| remainingMakingAmount | uint256 | The remaining amount of the asset left to fill. |
| orderHash | bytes32 | The hash of the order. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | uint256 | makingAmount The amount of the asset the maker receives. |

### calculateTakingAmount

```solidity
function calculateTakingAmount(struct IOrderMixin.Order order, bytes extension, uint256 requestedMakingAmount, uint256 remainingMakingAmount, bytes32 orderHash) internal view returns (uint256)
```
Calculates the taking amount based on the requested making amount.

_If getter is specified in the extension data, the getter is called to calculate the taking amount,
otherwise the taking amount is calculated linearly._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | The order. |
| extension | bytes | The extension data associated with the order. |
| requestedMakingAmount | uint256 | The amount the maker wants to receive. |
| remainingMakingAmount | uint256 | The remaining amount of the asset left to be filled. |
| orderHash | bytes32 | The hash of the order. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | uint256 | takingAmount The amount of the asset the taker takes. |

### isValidExtension

```solidity
function isValidExtension(struct IOrderMixin.Order order, bytes extension) internal pure returns (bool, bytes4)
```

_Validates the extension associated with an order._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | The order to validate against. |
| extension | bytes | The extension associated with the order. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | valid True if the extension is valid, false otherwise. |
[1] | bytes4 | errorSelector The error selector if the extension is invalid, 0x00000000 otherwise. |

### Errors
### MissingOrderExtension

```solidity
error MissingOrderExtension()
```

_Error to be thrown when the extension data of an order is missing._

### UnexpectedOrderExtension

```solidity
error UnexpectedOrderExtension()
```

_Error to be thrown when the order has an unexpected extension._

### InvalidExtensionHash

```solidity
error InvalidExtensionHash()
```

_Error to be thrown when the order extension hash is invalid._

