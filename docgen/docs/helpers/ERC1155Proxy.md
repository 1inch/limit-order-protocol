# ERC1155Proxy






## Derives
- [ImmutableOwner](helpers/ImmutableOwner.md)

## Functions
### constructor
```solidity
function constructor(
  address _immutableOwner
) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_immutableOwner` | address | 


### func_301JL5R
```solidity
function func_301JL5R(
  address from,
  address to,
  uint256 amount,
  contract IERC1155 token,
  uint256 tokenId,
  bytes data
) external
```
Proxy transfer method for `IERC1155.safeTransferFrom`. Selector must match `IERC20.transferFrom`

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`from` | address | 
|`to` | address | 
|`amount` | uint256 | 
|`token` | contract IERC1155 | 
|`tokenId` | uint256 | 
|`data` | bytes | 


