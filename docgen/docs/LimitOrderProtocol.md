# LimitOrderProtocol

1inch Limit Order Protocol v1



## Functions
### DOMAIN_SEPARATOR
```solidity
function DOMAIN_SEPARATOR(
) external returns (bytes32)
```




### remaining
```solidity
function remaining(
  bytes32 orderHash
) external returns (uint256)
```
Returns unfilled amount for order. Throws if order does not exist

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`orderHash` | bytes32 | 


### remainingRaw
```solidity
function remainingRaw(
  bytes32 orderHash
) external returns (uint256)
```
Returns unfilled amount for order


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`orderHash` | bytes32 | 

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Result`| bytes32 | Unfilled amount of order plus one if order exists. Otherwise 0
### remainingsRaw
```solidity
function remainingsRaw(
  bytes32[] orderHashes
) external returns (uint256[] results)
```
Same as `remainingRaw` but for multiple orders

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`orderHashes` | bytes32[] | 


### invalidatorForOrderRFQ
```solidity
function invalidatorForOrderRFQ(
  address maker,
  uint256 slot
) external returns (uint256)
```
Returns bitmask for double-spend invalidators based on lowest byte of order.info and filled quotes


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`maker` | address | 
|`slot` | uint256 | 

#### Return Values:
| Name                           | Type          | Description                                                                  |
| :----------------------------- | :------------ | :--------------------------------------------------------------------------- |
|`Result`| address | Each bit represents whenever corresponding quote was filled
### checkPredicate
```solidity
function checkPredicate(
  struct LimitOrderProtocol.Order order
) public returns (bool)
```
Checks order predicate

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct LimitOrderProtocol.Order | 


### simulateCalls
```solidity
function simulateCalls(
  address[] targets,
  bytes[] data
) external
```
Calls every target with corresponding data. Then reverts with CALL_RESULTS_0101011 where zeroes and ones
denote failure or success of the corresponding call


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`targets` | address[] | Array of addresses that will be called  
|`data` | bytes[] | Array of data that will be passed to each call 


### cancelOrder
```solidity
function cancelOrder(
  struct LimitOrderProtocol.Order order
) external
```
Cancels order by setting remaining amount to zero

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct LimitOrderProtocol.Order | 


### cancelOrderRFQ
```solidity
function cancelOrderRFQ(
  uint256 orderInfo
) external
```
Cancels order's quote

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`orderInfo` | uint256 | 


### fillOrderRFQ
```solidity
function fillOrderRFQ(
  struct LimitOrderProtocol.OrderRFQ order,
  bytes signature,
  uint256 makingAmount,
  uint256 takingAmount
) external returns (uint256, uint256)
```
Fills order's quote, fully or partially (whichever is possible)


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct LimitOrderProtocol.OrderRFQ | Order quote to fill  
|`signature` | bytes | Signature to confirm quote ownership  
|`makingAmount` | uint256 | Making amount  
|`takingAmount` | uint256 | Taking amount 


### fillOrderRFQToWithPermit
```solidity
function fillOrderRFQToWithPermit(
  struct LimitOrderProtocol.OrderRFQ order,
  bytes signature,
  uint256 makingAmount,
  uint256 takingAmount,
  address target,
  bytes permit
) external returns (uint256, uint256)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct LimitOrderProtocol.OrderRFQ | 
|`signature` | bytes | 
|`makingAmount` | uint256 | 
|`takingAmount` | uint256 | 
|`target` | address | 
|`permit` | bytes | 


### fillOrderRFQTo
```solidity
function fillOrderRFQTo(
  struct LimitOrderProtocol.OrderRFQ order,
  bytes signature,
  uint256 makingAmount,
  uint256 takingAmount,
  address target
) public returns (uint256, uint256)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct LimitOrderProtocol.OrderRFQ | 
|`signature` | bytes | 
|`makingAmount` | uint256 | 
|`takingAmount` | uint256 | 
|`target` | address | 


### fillOrder
```solidity
function fillOrder(
  struct LimitOrderProtocol.Order order,
  bytes signature,
  uint256 makingAmount,
  uint256 takingAmount,
  uint256 thresholdAmount
) external returns (uint256, uint256)
```
Fills an order. If one doesn't exist (first fill) it will be created using order.makerAssetData


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct LimitOrderProtocol.Order | Order quote to fill  
|`signature` | bytes | Signature to confirm quote ownership  
|`makingAmount` | uint256 | Making amount  
|`takingAmount` | uint256 | Taking amount  
|`thresholdAmount` | uint256 | If makingAmout > 0 this is max takingAmount, else it is min makingAmount 


### fillOrderToWithPermit
```solidity
function fillOrderToWithPermit(
  struct LimitOrderProtocol.Order order,
  bytes signature,
  uint256 makingAmount,
  uint256 takingAmount,
  uint256 thresholdAmount,
  address target,
  bytes permit
) external returns (uint256, uint256)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct LimitOrderProtocol.Order | 
|`signature` | bytes | 
|`makingAmount` | uint256 | 
|`takingAmount` | uint256 | 
|`thresholdAmount` | uint256 | 
|`target` | address | 
|`permit` | bytes | 


### fillOrderTo
```solidity
function fillOrderTo(
  struct LimitOrderProtocol.Order order,
  bytes signature,
  uint256 makingAmount,
  uint256 takingAmount,
  uint256 thresholdAmount,
  address target
) public returns (uint256, uint256)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct LimitOrderProtocol.Order | 
|`signature` | bytes | 
|`makingAmount` | uint256 | 
|`takingAmount` | uint256 | 
|`thresholdAmount` | uint256 | 
|`target` | address | 


## Events
### OrderFilled
```solidity
event OrderFilled(
  address maker,
  bytes32 orderHash,
  uint256 remaining
)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`maker` | address | 
|`orderHash` | bytes32 | 
|`remaining` | uint256 | 

### OrderCanceled
```solidity
event OrderCanceled(
  address maker,
  bytes32 orderHash
)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`maker` | address | 
|`orderHash` | bytes32 | 

### OrderFilledRFQ
```solidity
event OrderFilledRFQ(
  bytes32 orderHash,
  uint256 makingAmount
)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`orderHash` | bytes32 | 
|`makingAmount` | uint256 | 

