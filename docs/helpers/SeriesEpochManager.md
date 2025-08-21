
## SeriesEpochManager

### Functions list
- [epoch(maker, series) public](#epoch)
- [increaseEpoch(series) external](#increaseepoch)
- [advanceEpoch(series, amount) public](#advanceepoch)
- [epochEquals(maker, series, makerEpoch) public](#epochequals)

### Events list
- [EpochIncreased(maker, series, newEpoch) ](#epochincreased)

### Errors list
- [AdvanceEpochFailed() ](#advanceepochfailed)

### Functions
### epoch

```solidity
function epoch(address maker, uint96 series) public view returns (uint256)
```
Returns nonce for `maker` and `series`

### increaseEpoch

```solidity
function increaseEpoch(uint96 series) external
```
Advances nonce by one

### advanceEpoch

```solidity
function advanceEpoch(uint96 series, uint256 amount) public
```
Advances nonce by specified amount

### epochEquals

```solidity
function epochEquals(address maker, uint256 series, uint256 makerEpoch) public view returns (bool)
```
Checks if `maker` has specified `makerEpoch` for `series`

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | Result True if `maker` has specified epoch. Otherwise, false |

### Events
### EpochIncreased

```solidity
event EpochIncreased(address maker, uint256 series, uint256 newEpoch)
```

### Errors
### AdvanceEpochFailed

```solidity
error AdvanceEpochFailed()
```

