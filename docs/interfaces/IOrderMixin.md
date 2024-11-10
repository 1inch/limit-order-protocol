
## IOrderMixin

### Types list
- [Order](#order)

### Functions list
- [bitInvalidatorForOrder(maker, slot) external](#bitinvalidatorfororder)
- [remainingInvalidatorForOrder(maker, orderHash) external](#remaininginvalidatorfororder)
- [rawRemainingInvalidatorForOrder(maker, orderHash) external](#rawremaininginvalidatorfororder)
- [cancelOrder(makerTraits, orderHash) external](#cancelorder)
- [cancelOrders(makerTraits, orderHashes) external](#cancelorders)
- [bitsInvalidateForOrder(makerTraits, additionalMask) external](#bitsinvalidatefororder)
- [hashOrder(order) external](#hashorder)
- [simulate(target, data) external](#simulate)
- [fillOrder(order, r, vs, amount, takerTraits) external](#fillorder)
- [fillOrderArgs(order, r, vs, amount, takerTraits, args) external](#fillorderargs)
- [fillContractOrder(order, signature, amount, takerTraits) external](#fillcontractorder)
- [fillContractOrderArgs(order, signature, amount, takerTraits, args) external](#fillcontractorderargs)

### Events list
- [OrderFilled(orderHash, remainingAmount) ](#orderfilled)
- [OrderCancelled(orderHash) ](#ordercancelled)
- [BitInvalidatorUpdated(maker, slotIndex, slotValue) ](#bitinvalidatorupdated)

### Errors list
- [InvalidatedOrder() ](#invalidatedorder)
- [TakingAmountExceeded() ](#takingamountexceeded)
- [PrivateOrder() ](#privateorder)
- [BadSignature() ](#badsignature)
- [OrderExpired() ](#orderexpired)
- [WrongSeriesNonce() ](#wrongseriesnonce)
- [SwapWithZeroAmount() ](#swapwithzeroamount)
- [PartialFillNotAllowed() ](#partialfillnotallowed)
- [OrderIsNotSuitableForMassInvalidation() ](#orderisnotsuitableformassinvalidation)
- [EpochManagerAndBitInvalidatorsAreIncompatible() ](#epochmanagerandbitinvalidatorsareincompatible)
- [ReentrancyDetected() ](#reentrancydetected)
- [PredicateIsNotTrue() ](#predicateisnottrue)
- [TakingAmountTooHigh() ](#takingamounttoohigh)
- [MakingAmountTooLow() ](#makingamounttoolow)
- [TransferFromMakerToTakerFailed() ](#transferfrommakertotakerfailed)
- [TransferFromTakerToMakerFailed() ](#transferfromtakertomakerfailed)
- [MismatchArraysLengths() ](#mismatcharrayslengths)
- [InvalidPermit2Transfer() ](#invalidpermit2transfer)
- [SimulationResults(success, res) ](#simulationresults)

### Types
### Order

```solidity
struct Order {
  uint256 salt;
  Address maker;
  Address receiver;
  Address makerAsset;
  Address takerAsset;
  uint256 makingAmount;
  uint256 takingAmount;
  MakerTraits makerTraits;
}
```

### Functions
### bitInvalidatorForOrder

```solidity
function bitInvalidatorForOrder(address maker, uint256 slot) external view returns (uint256 result)
```
Returns bitmask for double-spend invalidators based on lowest byte of order.info and filled quotes

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| maker | address | Maker address |
| slot | uint256 | Slot number to return bitmask for |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
result | uint256 | Each bit represents whether corresponding was already invalidated |

### remainingInvalidatorForOrder

```solidity
function remainingInvalidatorForOrder(address maker, bytes32 orderHash) external view returns (uint256 remaining)
```
Returns bitmask for double-spend invalidators based on lowest byte of order.info and filled quotes

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| maker | address |  |
| orderHash | bytes32 | Hash of the order |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
remaining | uint256 | Remaining amount of the order |

### rawRemainingInvalidatorForOrder

```solidity
function rawRemainingInvalidatorForOrder(address maker, bytes32 orderHash) external view returns (uint256 remainingRaw)
```
Returns bitmask for double-spend invalidators based on lowest byte of order.info and filled quotes

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| maker | address |  |
| orderHash | bytes32 | Hash of the order |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
remainingRaw | uint256 | Inverse of the remaining amount of the order if order was filled at least once, otherwise 0 |

### cancelOrder

```solidity
function cancelOrder(MakerTraits makerTraits, bytes32 orderHash) external
```
Cancels order's quote

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| makerTraits | MakerTraits | Order makerTraits |
| orderHash | bytes32 | Hash of the order to cancel |

### cancelOrders

```solidity
function cancelOrders(MakerTraits[] makerTraits, bytes32[] orderHashes) external
```
Cancels orders' quotes

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| makerTraits | MakerTraits[] | Orders makerTraits |
| orderHashes | bytes32[] | Hashes of the orders to cancel |

### bitsInvalidateForOrder

```solidity
function bitsInvalidateForOrder(MakerTraits makerTraits, uint256 additionalMask) external
```
Cancels all quotes of the maker (works for bit-invalidating orders only)

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| makerTraits | MakerTraits | Order makerTraits |
| additionalMask | uint256 | Additional bitmask to invalidate orders |

### hashOrder

```solidity
function hashOrder(struct IOrderMixin.Order order) external view returns (bytes32 orderHash)
```
Returns order hash, hashed with limit order protocol contract EIP712

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | Order |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
orderHash | bytes32 | Hash of the order |

### simulate

```solidity
function simulate(address target, bytes data) external
```
Delegates execution to custom implementation. Could be used to validate if `transferFrom` works properly

_The function always reverts and returns the simulation results in revert data._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| target | address | Addresses that will be delegated |
| data | bytes | Data that will be passed to delegatee |

### fillOrder

```solidity
function fillOrder(struct IOrderMixin.Order order, bytes32 r, bytes32 vs, uint256 amount, TakerTraits takerTraits) external payable returns (uint256 makingAmount, uint256 takingAmount, bytes32 orderHash)
```
Fills order's quote, fully or partially (whichever is possible).

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | Order quote to fill |
| r | bytes32 | R component of signature |
| vs | bytes32 | VS component of signature |
| amount | uint256 | Taker amount to fill |
| takerTraits | TakerTraits | Specifies threshold as maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount. The 2nd (0 based index) highest bit specifies whether taker wants to skip maker's permit. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
makingAmount | uint256 | Actual amount transferred from maker to taker |
takingAmount | uint256 | Actual amount transferred from taker to maker |
orderHash | bytes32 | Hash of the filled order |

### fillOrderArgs

```solidity
function fillOrderArgs(struct IOrderMixin.Order order, bytes32 r, bytes32 vs, uint256 amount, TakerTraits takerTraits, bytes args) external payable returns (uint256 makingAmount, uint256 takingAmount, bytes32 orderHash)
```
Same as `fillOrder` but allows to specify arguments that are used by the taker.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | Order quote to fill |
| r | bytes32 | R component of signature |
| vs | bytes32 | VS component of signature |
| amount | uint256 | Taker amount to fill |
| takerTraits | TakerTraits | Specifies threshold as maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount. The 2nd (0 based index) highest bit specifies whether taker wants to skip maker's permit. |
| args | bytes | Arguments that are used by the taker (target, extension, interaction, permit) |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
makingAmount | uint256 | Actual amount transferred from maker to taker |
takingAmount | uint256 | Actual amount transferred from taker to maker |
orderHash | bytes32 | Hash of the filled order |

### fillContractOrder

```solidity
function fillContractOrder(struct IOrderMixin.Order order, bytes signature, uint256 amount, TakerTraits takerTraits) external returns (uint256 makingAmount, uint256 takingAmount, bytes32 orderHash)
```
Same as `fillOrder` but uses contract-based signatures.

_See tests for examples_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | Order quote to fill |
| signature | bytes | Signature to confirm quote ownership |
| amount | uint256 | Taker amount to fill |
| takerTraits | TakerTraits | Specifies threshold as maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount. The 2nd (0 based index) highest bit specifies whether taker wants to skip maker's permit. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
makingAmount | uint256 | Actual amount transferred from maker to taker |
takingAmount | uint256 | Actual amount transferred from taker to maker |
orderHash | bytes32 | Hash of the filled order |

### fillContractOrderArgs

```solidity
function fillContractOrderArgs(struct IOrderMixin.Order order, bytes signature, uint256 amount, TakerTraits takerTraits, bytes args) external returns (uint256 makingAmount, uint256 takingAmount, bytes32 orderHash)
```
Same as `fillContractOrder` but allows to specify arguments that are used by the taker.

_See tests for examples_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order | Order quote to fill |
| signature | bytes | Signature to confirm quote ownership |
| amount | uint256 | Taker amount to fill |
| takerTraits | TakerTraits | Specifies threshold as maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount. The 2nd (0 based index) highest bit specifies whether taker wants to skip maker's permit. |
| args | bytes | Arguments that are used by the taker (target, extension, interaction, permit) |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
makingAmount | uint256 | Actual amount transferred from maker to taker |
takingAmount | uint256 | Actual amount transferred from taker to maker |
orderHash | bytes32 | Hash of the filled order |

### Events
### OrderFilled

```solidity
event OrderFilled(bytes32 orderHash, uint256 remainingAmount)
```
Emitted when order gets filled

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| orderHash | bytes32 | Hash of the order |
| remainingAmount | uint256 | Amount of the maker asset that remains to be filled |

### OrderCancelled

```solidity
event OrderCancelled(bytes32 orderHash)
```
Emitted when order without `useBitInvalidator` gets cancelled

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| orderHash | bytes32 | Hash of the order |

### BitInvalidatorUpdated

```solidity
event BitInvalidatorUpdated(address maker, uint256 slotIndex, uint256 slotValue)
```
Emitted when order with `useBitInvalidator` gets cancelled

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| maker | address | Maker address |
| slotIndex | uint256 | Slot index that was updated |
| slotValue | uint256 | New slot value |

### Errors
### InvalidatedOrder

```solidity
error InvalidatedOrder()
```

### TakingAmountExceeded

```solidity
error TakingAmountExceeded()
```

### PrivateOrder

```solidity
error PrivateOrder()
```

### BadSignature

```solidity
error BadSignature()
```

### OrderExpired

```solidity
error OrderExpired()
```

### WrongSeriesNonce

```solidity
error WrongSeriesNonce()
```

### SwapWithZeroAmount

```solidity
error SwapWithZeroAmount()
```

### PartialFillNotAllowed

```solidity
error PartialFillNotAllowed()
```

### OrderIsNotSuitableForMassInvalidation

```solidity
error OrderIsNotSuitableForMassInvalidation()
```

### EpochManagerAndBitInvalidatorsAreIncompatible

```solidity
error EpochManagerAndBitInvalidatorsAreIncompatible()
```

### ReentrancyDetected

```solidity
error ReentrancyDetected()
```

### PredicateIsNotTrue

```solidity
error PredicateIsNotTrue()
```

### TakingAmountTooHigh

```solidity
error TakingAmountTooHigh()
```

### MakingAmountTooLow

```solidity
error MakingAmountTooLow()
```

### TransferFromMakerToTakerFailed

```solidity
error TransferFromMakerToTakerFailed()
```

### TransferFromTakerToMakerFailed

```solidity
error TransferFromTakerToMakerFailed()
```

### MismatchArraysLengths

```solidity
error MismatchArraysLengths()
```

### InvalidPermit2Transfer

```solidity
error InvalidPermit2Transfer()
```

### SimulationResults

```solidity
error SimulationResults(bool success, bytes res)
```

