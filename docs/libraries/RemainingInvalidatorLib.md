
## RemainingInvalidator

## RemainingInvalidatorLib

The library provides a mechanism to invalidate order based on the remaining amount of the order.

_The remaining amount is used as a nonce to invalidate the order.
When order is created, the remaining invalidator is 0.
When order is filled, the remaining invalidator is the inverse of the remaining amount._

### Functions list
- [isNewOrder(invalidator) internal](#isneworder)
- [remaining(invalidator) internal](#remaining)
- [remaining(invalidator, orderMakerAmount) internal](#remaining)
- [remains(remainingMakingAmount, makingAmount) internal](#remains)
- [fullyFilled() internal](#fullyfilled)

### Errors list
- [RemainingInvalidatedOrder() ](#remaininginvalidatedorder)

### Functions
### isNewOrder

```solidity
function isNewOrder(RemainingInvalidator invalidator) internal pure returns (bool)
```
Checks if an order is new based on the invalidator value.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| invalidator | RemainingInvalidator | The remaining invalidator of the order. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | result Whether the order is new or not. |

### remaining

```solidity
function remaining(RemainingInvalidator invalidator) internal pure returns (uint256)
```
Retrieves the remaining amount for an order.

_If the order is unknown, a RemainingInvalidatedOrder error is thrown._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| invalidator | RemainingInvalidator | The remaining invalidator for the order. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | uint256 | result The remaining amount for the order. |

### remaining

```solidity
function remaining(RemainingInvalidator invalidator, uint256 orderMakerAmount) internal pure returns (uint256)
```
Calculates the remaining amount for an order.

_If the order is unknown, the order maker amount is returned._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| invalidator | RemainingInvalidator | The remaining invalidator for the order. |
| orderMakerAmount | uint256 | The amount to return if the order is new. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | uint256 | result The remaining amount for the order. |

### remains

```solidity
function remains(uint256 remainingMakingAmount, uint256 makingAmount) internal pure returns (RemainingInvalidator)
```
Calculates the remaining invalidator of the order.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| remainingMakingAmount | uint256 | The remaining making amount of the order. |
| makingAmount | uint256 | The making amount of the order. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | RemainingInvalidator | result The remaining invalidator for the order. |

### fullyFilled

```solidity
function fullyFilled() internal pure returns (RemainingInvalidator)
```
Provides the remaining invalidator for a fully filled order.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | RemainingInvalidator | result The remaining invalidator for a fully filled order. |

### Errors
### RemainingInvalidatedOrder

```solidity
error RemainingInvalidatedOrder()
```

_The error is thrown when an attempt is made to invalidate an already invalidated entity._

