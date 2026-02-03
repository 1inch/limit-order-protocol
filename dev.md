# Development Guide

## Selector Bruteforce Tool

When developing proxy contracts that need specific function selectors (e.g., matching `IERC20.transferFrom` selector `0x23b872dd`), use the selector bruteforce tool from:

**https://github.com/1inch/smart-contract-helper-utils/src**

### Usage Example

To find a function name with custom suffix that produces the `transferFrom` selector:

```bash
python selector_bruteforce.py \
  --target 0x23b872dd \
  --params "address,address,uint256,((address,uint256),uint256,uint256),bytes" \
  --prefix "func_" \
  --fast
```

This is used for contracts like `Permit2Proxy` and `Permit2WitnessProxy` where the proxy function must have the same selector as `transferFrom` to work with the limit order protocol's extension mechanism.
