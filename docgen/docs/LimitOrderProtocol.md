


## Functions
### DOMAIN_SEPARATOR
```solidity
  function DOMAIN_SEPARATOR(
  ) external returns (bytes32)
```




### remaining
```solidity
  function remaining(
  ) external returns (uint256)
```
Returns unfilled amount for order. Throws if order does not exist



### remainingRaw
```solidity
  function remainingRaw(
  ) external returns (uint256)
```
Returns unfilled amount for order



#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Unfilled`| bytes32 | amount of order plus one if order exists. Otherwise 0
### remainingsRaw
```solidity
  function remainingsRaw(
  ) external returns (uint256[] results)
```
Same as `remainingRaw` but for multiple orders



### invalidatorForOrderRFQ
```solidity
  function invalidatorForOrderRFQ(
  ) external returns (uint256)
```
Returns bitmask for double-spend invalidators based on lowest byte of order.info and filled quotes



#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Each`| address | bit represents whenever corresponding quote was filled
### checkPredicate
```solidity
  function checkPredicate(
  ) public returns (bool)
```
Checks order predicate



### simulateCalls
```solidity
  function simulateCalls(
    address[] targets
  ) external
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`targets` | address[] | Array of functions. Each function is expected to take a corresponding `data` argument
as parameter and return bool

### cancelOrder
```solidity
  function cancelOrder(
  ) external
```
Cancels order by setting remaining amount to zero



### cancelOrderRFQ
```solidity
  function cancelOrderRFQ(
  ) external
```
Cancels order's quote



### fillOrderRFQ
```solidity
  function fillOrderRFQ(
    struct LimitOrderProtocol.OrderRFQ order,
    bytes signature,
    uint256 makingAmount,
    uint256 takingAmount
  ) external
```
Fills order's quote, fully or partially (whichever is possible)


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct LimitOrderProtocol.OrderRFQ | Order quote to fill
|`signature` | bytes | Signature to confirm quote ownership
|`makingAmount` | uint256 | Making amount
|`takingAmount` | uint256 | Taking amount

### fillOrder
```solidity
  function fillOrder(
  ) external returns (uint256, uint256)
```
Fills an order. If one doesn't exist (first fill) it will be created using order.makerAssetData



### _hash
```solidity
  function _hash(
  ) internal returns (bytes32)
```




### _hash
```solidity
  function _hash(
  ) internal returns (bytes32)
```




### _validate
```solidity
  function _validate(
  ) internal
```




### _callMakerAssetTransferFrom
```solidity
  function _callMakerAssetTransferFrom(
  ) internal
```




### _callTakerAssetTransferFrom
```solidity
  function _callTakerAssetTransferFrom(
  ) internal
```




### _callGetMakerAmount
```solidity
  function _callGetMakerAmount(
  ) internal returns (uint256 makerAmount)
```




### _callGetTakerAmount
```solidity
  function _callGetTakerAmount(
  ) internal returns (uint256 takerAmount)
```




## Events
### OrderFilled
```solidity
  event OrderFilled(
  )
```



### OrderFilledRFQ
```solidity
  event OrderFilledRFQ(
  )
```



