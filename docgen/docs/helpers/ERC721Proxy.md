# ERC721Proxy






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


### func_60iHVgK
```solidity
function func_60iHVgK(
  address from,
  address to,
  uint256 ,
  uint256 tokenId,
  contract IERC721 token
) external
```
Proxy transfer method for `IERC721.transferFrom`. Selector must match `IERC20.transferFrom`.
Note that `amount` is unused for security reasons to prevent unintended ERC-721 token sale via partial fill

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`from` | address | 
|`to` | address | 
|`` | uint256 | 
|`tokenId` | uint256 | 
|`token` | contract IERC721 | 


