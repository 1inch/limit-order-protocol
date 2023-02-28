# OrderRFQMixin


RFQ Limit Order mixin



## Derives
- [Permitable](libraries/Permitable.md)
- [AmountCalculator](helpers/AmountCalculator.md)
- [EIP712](https://docs.openzeppelin.com/contracts/3.x/api/utils/cryptography#draft-EIP712)

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
|`Result`| uint256 | Each bit represents whether corresponding was already invalidated

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
  struct OrderRFQMixin.Order order,
  bytes signature,
  uint256 makingAmount,
  uint256 takingAmount
) external returns (uint256, uint256)
```
Fills order's quote, fully or partially (whichever is possible)


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct OrderRFQMixin.Order | Order quote to fill  
|`signature` | bytes | Signature to confirm quote ownership  
|`makingAmount` | uint256 | Making amount  
|`takingAmount` | uint256 | Taking amount 


### fillOrderRFQToWithPermit
```solidity
function fillOrderRFQToWithPermit(
  struct OrderRFQMixin.Order order,
  bytes signature,
  uint256 makingAmount,
  uint256 takingAmount,
  address target,
  bytes permit
) external returns (uint256, uint256)
```
Fills Same as `fillOrderRFQ` but calls permit first,
allowing to approve token spending and make a swap in one transaction.
Also allows to specify funds destination instead of `msg.sender`

See tests for examples
#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct OrderRFQMixin.Order | Order quote to fill  
|`signature` | bytes | Signature to confirm quote ownership  
|`makingAmount` | uint256 | Making amount  
|`takingAmount` | uint256 | Taking amount  
|`target` | address | Address that will receive swap funds  
|`permit` | bytes | Should consist of abiencoded token address and encoded `IERC20Permit.permit` call.  


### fillOrderRFQTo
```solidity
function fillOrderRFQTo(
  struct OrderRFQMixin.Order order,
  bytes signature,
  uint256 makingAmount,
  uint256 takingAmount,
  address target
) public returns (uint256, uint256)
```
Same as `fillOrderRFQ` but allows to specify funds destination instead of `msg.sender`


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`order` | struct OrderRFQMixin.Order | Order quote to fill  
|`signature` | bytes | Signature to confirm quote ownership  
|`makingAmount` | uint256 | Making amount  
|`takingAmount` | uint256 | Taking amount  
|`target` | address | Address that will receive swap funds 


## Events
### OrderFilledRFQ
```solidity
event OrderFilledRFQ(
  bytes32 orderHash,
  uint256 makingAmount
)
```
Emitted when RFQ gets filled

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`orderHash` | bytes32 | 
|`makingAmount` | uint256 | 

