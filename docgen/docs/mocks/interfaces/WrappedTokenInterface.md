# WrappedTokenInterface





## Functions
### totalSupply
```solidity
function totalSupply(
) external returns (uint256)
```




### balanceOf
```solidity
function balanceOf(
  address account
) external returns (uint256)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`account` | address | 


### transfer
```solidity
function transfer(
  address recipient,
  uint256 amount
) external returns (bool)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`recipient` | address | 
|`amount` | uint256 | 


### allowance
```solidity
function allowance(
  address owner,
  address spender
) external returns (uint256)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`owner` | address | 
|`spender` | address | 


### approve
```solidity
function approve(
  address spender,
  uint256 amount
) external returns (bool)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`spender` | address | 
|`amount` | uint256 | 


### transferFrom
```solidity
function transferFrom(
  address sender,
  address recipient,
  uint256 amount
) external returns (bool)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`sender` | address | 
|`recipient` | address | 
|`amount` | uint256 | 


### deposit
```solidity
function deposit(
) external
```




### withdraw
```solidity
function withdraw(
  uint256 wad
) external
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`wad` | uint256 | 


## Events
### Transfer
```solidity
event Transfer(
  address from,
  address to,
  uint256 value
)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`from` | address | 
|`to` | address | 
|`value` | uint256 | 

### Approval
```solidity
event Approval(
  address owner,
  address spender,
  uint256 value
)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`owner` | address | 
|`spender` | address | 
|`value` | uint256 | 

### Deposit
```solidity
event Deposit(
  address dst,
  uint256 wad
)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`dst` | address | 
|`wad` | uint256 | 

### Withdrawal
```solidity
event Withdrawal(
  address src,
  uint256 wad
)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`src` | address | 
|`wad` | uint256 | 

