
## ERC721Proxy

### Functions list
- [constructor(_immutableOwner) public](#constructor)
- [func_60iHVgK(from, to, , tokenId, token) external](#func_60ihvgk)

### Errors list
- [ERC721ProxyBadSelector() ](#erc721proxybadselector)

### Functions
### constructor

```solidity
constructor(address _immutableOwner) public
```

### func_60iHVgK

```solidity
function func_60iHVgK(address from, address to, uint256, uint256 tokenId, contract IERC721 token) external
```
Proxy transfer method for `IERC721.transferFrom`. Selector must match `IERC20.transferFrom`.
Note that `amount` is unused for security reasons to prevent unintended ERC-721 token sale via partial fill

### Errors
### ERC721ProxyBadSelector

```solidity
error ERC721ProxyBadSelector()
```

