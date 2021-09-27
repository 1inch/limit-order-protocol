# WrappedTokenMock





## Functions
### constructor
```solidity
function constructor(
  string name,
  string symbol
) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`name` | string | 
|`symbol` | string | 


### receive
```solidity
function receive(
) external
```




### mint
```solidity
function mint(
  address account,
  uint256 amount
) external
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`account` | address | 
|`amount` | uint256 | 


### burn
```solidity
function burn(
  address account,
  uint256 amount
) external
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`account` | address | 
|`amount` | uint256 | 


### getChainId
```solidity
function getChainId(
) external returns (uint256)
```




### deposit
```solidity
function deposit(
) public
```




### withdraw
```solidity
function withdraw(
  uint256 wad
) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`wad` | uint256 | 


## Events
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

