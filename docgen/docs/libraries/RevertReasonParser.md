# RevertReasonParser


Library that allows to parse unsuccessful arbitrary calls revert reasons.
See https://solidity.readthedocs.io/en/latest/control-structures.html#revert for details.
Note that we assume revert reason being abi-encoded as Error(string) so it may fail to parse reason
if structured reverts appear in the future.

All unsuccessful parsings get encoded as Unknown(data) string




## Functions
### parse
```solidity
function parse(
  bytes data,
  string prefix
) internal returns (string)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`data` | bytes | 
|`prefix` | string | 


