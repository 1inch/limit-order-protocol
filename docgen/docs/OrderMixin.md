# OrderMixin





## Functions
### remaining
```solidity
function remaining(
  bytes32 orderHash
) external returns (uint256 amount)
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


### checkPredicate
```solidity
function checkPredicate(
  struct OrderMixin.Order order
) public returns (bool)
```
Checks order predicate

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct OrderMixin.Order | 


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
  struct OrderMixin.Order order
) external
```
Cancels order by setting remaining amount to zero

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct OrderMixin.Order | 


### fillOrder
```solidity
function fillOrder(
  struct OrderMixin.Order order,
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
|`order` | struct OrderMixin.Order | Order quote to fill  
|`signature` | bytes | Signature to confirm quote ownership  
|`makingAmount` | uint256 | Making amount  
|`takingAmount` | uint256 | Taking amount  
|`thresholdAmount` | uint256 | If makingAmout > 0 this is max takingAmount, else it is min makingAmount 


### fillOrderToWithPermit
```solidity
function fillOrderToWithPermit(
  struct OrderMixin.Order order,
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
|`order` | struct OrderMixin.Order | 
|`signature` | bytes | 
|`makingAmount` | uint256 | 
|`takingAmount` | uint256 | 
|`thresholdAmount` | uint256 | 
|`target` | address | 
|`permit` | bytes | 


### fillOrderTo
```solidity
function fillOrderTo(
  struct OrderMixin.Order order,
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
|`order` | struct OrderMixin.Order | 
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

