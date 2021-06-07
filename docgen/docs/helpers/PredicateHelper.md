# PredicateHelper





## Functions

### `or(address[] targets, bytes[] data) → bool`
Calls every target with corresponding data


#### Return Values:
- True if call to any target returned True. Otherwise, false

### `and(address[] targets, bytes[] data) → bool`
Calls every target with corresponding data


#### Return Values:
- True if calls to all targets returned True. Otherwise, false

### `eq(uint256 value, address target, bytes data) → bool`
Calls target with specified data and tests if it's equal to the value


#### Parameters:
- `value`: Value to test

#### Return Values:
- True if call to target returns the same value as `value`. Otherwise, false

### `lt(uint256 value, address target, bytes data) → bool`
Calls target with specified data and tests if it's lower than value


#### Parameters:
- `value`: Value to test

#### Return Values:
- True if call to target returns value which is lower than `value`. Otherwise, false

### `gt(uint256 value, address target, bytes data) → bool`
Calls target with specified data and tests if it's bigger than value


#### Parameters:
- `value`: Value to test

#### Return Values:
- True if call to target returns value which is bigger than `value`. Otherwise, false

### `timestampBelow(uint256 time) → bool`
Checks passed time against block timestamp


#### Return Values:
- True if current block timestamp is lower than `time`. Otherwise, false




