
## MakerTraits

## MakerTraitsLib

A library to manage and check MakerTraits, which are used to encode the maker's preferences for an order in a single uint256.
@dev
The MakerTraits type is a uint256 and different parts of the number are used to encode different traits.
High bits are used for flags
255 bit `NO_PARTIAL_FILLS_FLAG`          - if set, the order does not allow partial fills
254 bit `ALLOW_MULTIPLE_FILLS_FLAG`      - if set, the order permits multiple fills
253 bit                                  - unused
252 bit `PRE_INTERACTION_CALL_FLAG`      - if set, the order requires pre-interaction call
251 bit `POST_INTERACTION_CALL_FLAG`     - if set, the order requires post-interaction call
250 bit `NEED_CHECK_EPOCH_MANAGER_FLAG`  - if set, the order requires to check the epoch manager
249 bit `HAS_EXTENSION_FLAG`             - if set, the order has extension(s)
248 bit `USE_PERMIT2_FLAG`               - if set, the order uses permit2
247 bit `UNWRAP_WETH_FLAG`               - if set, the order requires to unwrap WETH

Low 200 bits are used for allowed sender, expiration, nonceOrEpoch, and series
uint80 last 10 bytes of allowed sender address (0 if any)
uint40 expiration timestamp (0 if none)
uint40 nonce or epoch
uint40 series

### Functions list
- [hasExtension(makerTraits) internal](#hasextension)
- [isAllowedSender(makerTraits, sender) internal](#isallowedsender)
- [isExpired(makerTraits) internal](#isexpired)
- [nonceOrEpoch(makerTraits) internal](#nonceorepoch)
- [series(makerTraits) internal](#series)
- [allowPartialFills(makerTraits) internal](#allowpartialfills)
- [needPreInteractionCall(makerTraits) internal](#needpreinteractioncall)
- [needPostInteractionCall(makerTraits) internal](#needpostinteractioncall)
- [allowMultipleFills(makerTraits) internal](#allowmultiplefills)
- [useBitInvalidator(makerTraits) internal](#usebitinvalidator)
- [needCheckEpochManager(makerTraits) internal](#needcheckepochmanager)
- [usePermit2(makerTraits) internal](#usepermit2)
- [unwrapWeth(makerTraits) internal](#unwrapweth)

### Functions
### hasExtension

```solidity
function hasExtension(MakerTraits makerTraits) internal pure returns (bool)
```
Checks if the order has the extension flag set.

_If the `HAS_EXTENSION_FLAG` is set in the makerTraits, then the protocol expects that the order has extension(s)._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| makerTraits | MakerTraits | The traits of the maker. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | result A boolean indicating whether the flag is set. |

### isAllowedSender

```solidity
function isAllowedSender(MakerTraits makerTraits, address sender) internal pure returns (bool)
```
Checks if the maker allows a specific taker to fill the order.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| makerTraits | MakerTraits | The traits of the maker. |
| sender | address | The address of the taker to be checked. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | result A boolean indicating whether the taker is allowed. |

### isExpired

```solidity
function isExpired(MakerTraits makerTraits) internal view returns (bool)
```
Checks if the order has expired.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| makerTraits | MakerTraits | The traits of the maker. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | result A boolean indicating whether the order has expired. |

### nonceOrEpoch

```solidity
function nonceOrEpoch(MakerTraits makerTraits) internal pure returns (uint256)
```
Returns the nonce or epoch of the order.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| makerTraits | MakerTraits | The traits of the maker. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | uint256 | result The nonce or epoch of the order. |

### series

```solidity
function series(MakerTraits makerTraits) internal pure returns (uint256)
```
Returns the series of the order.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| makerTraits | MakerTraits | The traits of the maker. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | uint256 | result The series of the order. |

### allowPartialFills

```solidity
function allowPartialFills(MakerTraits makerTraits) internal pure returns (bool)
```
Determines if the order allows partial fills.

_If the _NO_PARTIAL_FILLS_FLAG is not set in the makerTraits, then the order allows partial fills._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| makerTraits | MakerTraits | The traits of the maker, determining their preferences for the order. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | result A boolean indicating whether the maker allows partial fills. |

### needPreInteractionCall

```solidity
function needPreInteractionCall(MakerTraits makerTraits) internal pure returns (bool)
```
Checks if the maker needs pre-interaction call.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| makerTraits | MakerTraits | The traits of the maker. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | result A boolean indicating whether the maker needs a pre-interaction call. |

### needPostInteractionCall

```solidity
function needPostInteractionCall(MakerTraits makerTraits) internal pure returns (bool)
```
Checks if the maker needs post-interaction call.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| makerTraits | MakerTraits | The traits of the maker. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | result A boolean indicating whether the maker needs a post-interaction call. |

### allowMultipleFills

```solidity
function allowMultipleFills(MakerTraits makerTraits) internal pure returns (bool)
```
Determines if the order allows multiple fills.

_If the _ALLOW_MULTIPLE_FILLS_FLAG is set in the makerTraits, then the maker allows multiple fills._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| makerTraits | MakerTraits | The traits of the maker, determining their preferences for the order. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | result A boolean indicating whether the maker allows multiple fills. |

### useBitInvalidator

```solidity
function useBitInvalidator(MakerTraits makerTraits) internal pure returns (bool)
```
Determines if an order should use the bit invalidator or remaining amount validator.

_The bit invalidator can be used if the order does not allow partial or multiple fills._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| makerTraits | MakerTraits | The traits of the maker, determining their preferences for the order. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | result A boolean indicating whether the bit invalidator should be used. True if the order requires the use of the bit invalidator. |

### needCheckEpochManager

```solidity
function needCheckEpochManager(MakerTraits makerTraits) internal pure returns (bool)
```
Checks if the maker needs to check the epoch.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| makerTraits | MakerTraits | The traits of the maker. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | result A boolean indicating whether the maker needs to check the epoch manager. |

### usePermit2

```solidity
function usePermit2(MakerTraits makerTraits) internal pure returns (bool)
```
Checks if the maker uses permit2.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| makerTraits | MakerTraits | The traits of the maker. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | result A boolean indicating whether the maker uses permit2. |

### unwrapWeth

```solidity
function unwrapWeth(MakerTraits makerTraits) internal pure returns (bool)
```
Checks if the maker needs to unwraps WETH.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| makerTraits | MakerTraits | The traits of the maker. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | result A boolean indicating whether the maker needs to unwrap WETH. |

