# OrderMixin


Regular Limit Order mixin



## Derives
- [Permitable](libraries/Permitable.md)
- [PredicateHelper](helpers/PredicateHelper.md)
- [NonceManager](helpers/NonceManager.md)
- [ChainlinkCalculator](helpers/ChainlinkCalculator.md)
- [AmountCalculator](helpers/AmountCalculator.md)
- [EIP712](https://docs.openzeppelin.com/contracts/3.x/api/utils/cryptography#draft-EIP712)

## Functions
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
|`Result`| uint256 | Unfilled amount of order plus one if order exists. Otherwise 0

### remainingsRaw
```solidity
function remainingsRaw(
  bytes32[] orderHashes
) external returns (uint256[])
```
Same as `remainingRaw` but for multiple orders

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`orderHashes` | bytes32[] | 


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
  struct OrderLib.Order order
) external
```
Cancels order by setting remaining amount to zero

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct OrderLib.Order | 


### fillOrder
```solidity
function fillOrder(
  struct OrderLib.Order order,
  bytes signature,
  bytes interaction,
  uint256 makingAmount,
  uint256 takingAmount,
  uint256 thresholdAmount
) external returns (uint256, uint256)
```
Fills an order. If one doesn't exist (first fill) it will be created using order.makerAssetData


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct OrderLib.Order | Order quote to fill  
|`signature` | bytes | Signature to confirm quote ownership  
|`interaction` | bytes | Making amount  
|`makingAmount` | uint256 | Taking amount  
|`takingAmount` | uint256 | Specifies maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount 
|`thresholdAmount` | uint256 | 


### fillOrderToWithPermit
```solidity
function fillOrderToWithPermit(
  struct OrderLib.Order order,
  bytes signature,
  bytes interaction,
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

See tests for examples
#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct OrderLib.Order | Order quote to fill  
|`signature` | bytes | Signature to confirm quote ownership  
|`interaction` | bytes | Making amount  
|`makingAmount` | uint256 | Taking amount  
|`takingAmount` | uint256 | Specifies maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount  
|`thresholdAmount` | uint256 | Address that will receive swap funds  
|`target` | address | Should consist of abiencoded token address and encoded `IERC20Permit.permit` call.  
|`permit` | bytes | 


### fillOrderTo
```solidity
function fillOrderTo(
  struct OrderLib.Order order_,
  bytes signature,
  bytes interaction,
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
|`order_` | struct OrderLib.Order | Order quote to fill  
|`signature` | bytes | Signature to confirm quote ownership  
|`interaction` | bytes | Making amount  
|`makingAmount` | uint256 | Taking amount  
|`takingAmount` | uint256 | Specifies maximum allowed takingAmount when takingAmount is zero, otherwise specifies minimum allowed makingAmount  
|`thresholdAmount` | uint256 | Address that will receive swap funds 
|`target` | address | 


### checkPredicate
```solidity
function checkPredicate(
  struct OrderLib.Order order
) public returns (bool)
```
Checks order predicate

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct OrderLib.Order | 


### hashOrder
```solidity
function hashOrder(
  struct OrderLib.Order order
) public returns (bytes32)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct OrderLib.Order | 


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
  bytes32 orderHash,
  uint256 remainingRaw
)
```
Emitted when order gets cancelled

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`maker` | address | 
|`orderHash` | bytes32 | 
|`remainingRaw` | uint256 | 

