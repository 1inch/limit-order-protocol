
## TakerTraits

## TakerTraitsLib

This library to manage and check TakerTraits, which are used to encode the taker's preferences for an order in a single uint256.

_The TakerTraits are structured as follows:
High bits are used for flags
255 bit `_MAKER_AMOUNT_FLAG`           - If set, the taking amount is calculated based on making amount, otherwise making amount is calculated based on taking amount.
254 bit `_UNWRAP_WETH_FLAG`            - If set, the WETH will be unwrapped into ETH before sending to taker.
253 bit `_SKIP_ORDER_PERMIT_FLAG`      - If set, the order skips maker's permit execution.
252 bit `_USE_PERMIT2_FLAG`            - If set, the order uses the permit2 function for authorization.
251 bit `_ARGS_HAS_TARGET`             - If set, then first 20 bytes of args are treated as target address for maker’s funds transfer.
224-247 bits `ARGS_EXTENSION_LENGTH`   - The length of the extension calldata in the args.
200-223 bits `ARGS_INTERACTION_LENGTH` - The length of the interaction calldata in the args.
0-184 bits                             - The threshold amount (the maximum amount a taker agrees to give in exchange for a making amount)._

### Functions list
- [argsHasTarget(takerTraits) internal](#argshastarget)
- [argsExtensionLength(takerTraits) internal](#argsextensionlength)
- [argsInteractionLength(takerTraits) internal](#argsinteractionlength)
- [isMakingAmount(takerTraits) internal](#ismakingamount)
- [unwrapWeth(takerTraits) internal](#unwrapweth)
- [skipMakerPermit(takerTraits) internal](#skipmakerpermit)
- [usePermit2(takerTraits) internal](#usepermit2)
- [threshold(takerTraits) internal](#threshold)

### Functions
### argsHasTarget

```solidity
function argsHasTarget(TakerTraits takerTraits) internal pure returns (bool)
```
Checks if the args should contain target address.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| takerTraits | TakerTraits | The traits of the taker. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | result A boolean indicating whether the args should contain target address. |

### argsExtensionLength

```solidity
function argsExtensionLength(TakerTraits takerTraits) internal pure returns (uint256)
```
Retrieves the length of the extension calldata from the takerTraits.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| takerTraits | TakerTraits | The traits of the taker. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | uint256 | result The length of the extension calldata encoded in the takerTraits. |

### argsInteractionLength

```solidity
function argsInteractionLength(TakerTraits takerTraits) internal pure returns (uint256)
```
Retrieves the length of the interaction calldata from the takerTraits.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| takerTraits | TakerTraits | The traits of the taker. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | uint256 | result The length of the interaction calldata encoded in the takerTraits. |

### isMakingAmount

```solidity
function isMakingAmount(TakerTraits takerTraits) internal pure returns (bool)
```
Checks if the taking amount should be calculated based on making amount.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| takerTraits | TakerTraits | The traits of the taker. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | result A boolean indicating whether the taking amount should be calculated based on making amount. |

### unwrapWeth

```solidity
function unwrapWeth(TakerTraits takerTraits) internal pure returns (bool)
```
Checks if the order should unwrap WETH and send ETH to taker.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| takerTraits | TakerTraits | The traits of the taker. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | result A boolean indicating whether the order should unwrap WETH. |

### skipMakerPermit

```solidity
function skipMakerPermit(TakerTraits takerTraits) internal pure returns (bool)
```
Checks if the order should skip maker's permit execution.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| takerTraits | TakerTraits | The traits of the taker. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | result A boolean indicating whether the order don't apply permit. |

### usePermit2

```solidity
function usePermit2(TakerTraits takerTraits) internal pure returns (bool)
```
Checks if the order uses the permit2 instead of permit.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| takerTraits | TakerTraits | The traits of the taker. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | result A boolean indicating whether the order uses the permit2. |

### threshold

```solidity
function threshold(TakerTraits takerTraits) internal pure returns (uint256)
```
Retrieves the threshold amount from the takerTraits.
The maximum amount a taker agrees to give in exchange for a making amount.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| takerTraits | TakerTraits | The traits of the taker. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | uint256 | result The threshold amount encoded in the takerTraits. |

