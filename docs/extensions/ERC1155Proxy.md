
## ERC1155Proxy

### Functions list
- [constructor(_immutableOwner) public](#constructor)
- [func_301JL5R(from, to, amount, token, tokenId, data) external](#func_301jl5r)

### Errors list
- [ERC1155ProxyBadSelector() ](#erc1155proxybadselector)

### Functions
### constructor

```solidity
constructor(address _immutableOwner) public
```

### func_301JL5R

```solidity
function func_301JL5R(address from, address to, uint256 amount, contract IERC1155 token, uint256 tokenId, bytes data) external
```
Proxy transfer method for `IERC1155.safeTransferFrom`. Selector must match `IERC20.transferFrom`

### Errors
### ERC1155ProxyBadSelector

```solidity
error ERC1155ProxyBadSelector()
```

