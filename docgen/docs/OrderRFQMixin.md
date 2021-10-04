# OrderRFQMixin





## Functions
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
  struct OrderRFQMixin.OrderRFQ order,
  bytes signature,
  uint256 makingAmount,
  uint256 takingAmount
) external returns (uint256, uint256)
```
Fills order's quote, fully or partially (whichever is possible)


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct OrderRFQMixin.OrderRFQ | Order quote to fill  
|`signature` | bytes | Signature to confirm quote ownership  
|`makingAmount` | uint256 | Making amount  
|`takingAmount` | uint256 | Taking amount 


### fillOrderRFQToWithPermit
```solidity
function fillOrderRFQToWithPermit(
  struct OrderRFQMixin.OrderRFQ order,
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
|`order` | struct OrderRFQMixin.OrderRFQ | 
|`signature` | bytes | 
|`makingAmount` | uint256 | 
|`takingAmount` | uint256 | 
|`target` | address | 
|`permit` | bytes | 


### fillOrderRFQTo
```solidity
function fillOrderRFQTo(
  struct OrderRFQMixin.OrderRFQ order,
  bytes signature,
  uint256 makingAmount,
  uint256 takingAmount,
  address target
) public returns (uint256, uint256)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct OrderRFQMixin.OrderRFQ | 
|`signature` | bytes | 
|`makingAmount` | uint256 | 
|`takingAmount` | uint256 | 
|`target` | address | 


## Events
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

