
## SeriesNonceManager

### Functions list
- [increaseNonce(series) external](#increasenonce)
- [advanceNonce(series, amount) public](#advancenonce)
- [nonceEquals(series, makerAddress, makerNonce) public](#nonceequals)
- [timestampBelow(time) public](#timestampbelow)
- [timestampBelowAndNonceEquals(timeNonceSeriesAccount) public](#timestampbelowandnonceequals)

### Events list
- [NonceIncreased(maker, series, newNonce) ](#nonceincreased)

### Errors list
- [AdvanceNonceFailed() ](#advancenoncefailed)

### Functions
### increaseNonce

```solidity
function increaseNonce(uint8 series) external
```
Advances nonce by one

### advanceNonce

```solidity
function advanceNonce(uint256 series, uint256 amount) public
```
Advances nonce by specified amount

### nonceEquals

```solidity
function nonceEquals(uint256 series, address makerAddress, uint256 makerNonce) public view returns (bool)
```
Checks if `makerAddress` has specified `makerNonce` for `series`

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | Result True if `makerAddress` has specified nonce. Otherwise, false |

### timestampBelow

```solidity
function timestampBelow(uint256 time) public view returns (bool)
```
Checks passed time against block timestamp

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | Result True if current block timestamp is lower than `time`. Otherwise, false |

### timestampBelowAndNonceEquals

```solidity
function timestampBelowAndNonceEquals(uint256 timeNonceSeriesAccount) public view returns (bool)
```

### Events
### NonceIncreased

```solidity
event NonceIncreased(address maker, uint256 series, uint256 newNonce)
```

### Errors
### AdvanceNonceFailed

```solidity
error AdvanceNonceFailed()
```

