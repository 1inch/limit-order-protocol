
## PriorityFeeLimiter

### Functions list
- [isPriorityFeeValid() public](#ispriorityfeevalid)

### Functions
### isPriorityFeeValid

```solidity
function isPriorityFeeValid() public view returns (bool)
```
Validates priority fee according to the spec
https://snapshot.org/#/1inch.eth/proposal/0xa040c60050147a0f67042ae024673e92e813b5d2c0f748abf70ddfa1ed107cbe
For blocks with baseFee <10.6 gwei – the priorityFee is capped at 70% of the baseFee.
For blocks with baseFee between 10.6 gwei and 104.1 gwei – the priorityFee is capped at 50% of the baseFee.
For blocks with baseFee >104.1 gwei – priorityFee is capped at 65% of the block’s baseFee.

