# ERC721Proxy





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


### func_602HzuS
```solidity
function func_602HzuS(
  address from,
  address to,
  uint256 tokenId,
  contract IERC721 token
) external
```
Proxy transfer method for `IERC721.transferFrom`. Selector must match `IERC20.transferFrom`.
Note that `uint256` encodes token id unlike `IERC20` which expects amount there.

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`from` | address | 
|`to` | address | 
|`tokenId` | uint256 | 
|`token` | contract IERC721 | 


