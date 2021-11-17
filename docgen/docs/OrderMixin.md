# OrderMixin

Order Limits v1 mixin



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
|`Result`| uint256 | Unfilled amount of order plus one if order exists. Otherwise 0

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
|`thresholdAmount` | uint256 | Specifies maximum allowed takingAmount it's zero. Otherwise minimum allowed makingAmount 


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
Same as `fillOrder` but calls permit first,
allowing to approve token spending and make a swap in one transaction.
Also allows to specify funds destination instead of `msg.sender`


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct OrderMixin.Order | Order quote to fill  
|`signature` | bytes | Signature to confirm quote ownership  
|`makingAmount` | uint256 | Making amount  
|`takingAmount` | uint256 | Taking amount  
|`thresholdAmount` | uint256 | Specifies maximum allowed takingAmount it's zero. Otherwise minimum allowed makingAmount  
|`target` | address | Address that will receive swap funds  
|`permit` | bytes | Should consist of abiencoded token address and encoded `IERC20Permit.permit` call. See tests for examples 


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
Same as `fillOrder` but allows to specify funds destination instead of `msg.sender`


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct OrderMixin.Order | Order quote to fill  
|`signature` | bytes | Signature to confirm quote ownership  
|`makingAmount` | uint256 | Making amount  
|`takingAmount` | uint256 | Taking amount  
|`thresholdAmount` | uint256 | Specifies maximum allowed takingAmount it's zero. Otherwise minimum allowed makingAmount  
|`target` | address | Address that will receive swap funds 


## Events
### OrderFilled
```solidity
event OrderFilled(
  address maker,
  bytes32 orderHash,
  uint256 remaining
)
```
Emitted every time order gets filled, including partial fills

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
Emitted when order gets cancelled

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`maker` | address | 
|`orderHash` | bytes32 | 

