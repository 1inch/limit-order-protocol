
## ExtensionLib

Library for retrieving extensions information for the IOrderMixin Interface.

### Types list
- [DynamicField](#dynamicfield)

### Functions list
- [makerAssetSuffix(extension) internal](#makerassetsuffix)
- [takerAssetSuffix(extension) internal](#takerassetsuffix)
- [makingAmountData(extension) internal](#makingamountdata)
- [takingAmountData(extension) internal](#takingamountdata)
- [predicate(extension) internal](#predicate)
- [makerPermit(extension) internal](#makerpermit)
- [preInteractionTargetAndData(extension) internal](#preinteractiontargetanddata)
- [postInteractionTargetAndData(extension) internal](#postinteractiontargetanddata)
- [customData(extension) internal](#customdata)

### Types
### DynamicField

```solidity
enum DynamicField {
  MakerAssetSuffix,
  TakerAssetSuffix,
  MakingAmountData,
  TakingAmountData,
  Predicate,
  MakerPermit,
  PreInteractionData,
  PostInteractionData,
  CustomData
}
```

### Functions
### makerAssetSuffix

```solidity
function makerAssetSuffix(bytes extension) internal pure returns (bytes)
```
Returns the MakerAssetSuffix from the provided extension calldata.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| extension | bytes | The calldata from which the MakerAssetSuffix is to be retrieved. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bytes | calldata Bytes representing the MakerAssetSuffix. |

### takerAssetSuffix

```solidity
function takerAssetSuffix(bytes extension) internal pure returns (bytes)
```
Returns the TakerAssetSuffix from the provided extension calldata.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| extension | bytes | The calldata from which the TakerAssetSuffix is to be retrieved. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bytes | calldata Bytes representing the TakerAssetSuffix. |

### makingAmountData

```solidity
function makingAmountData(bytes extension) internal pure returns (bytes)
```
Returns the MakingAmountData from the provided extension calldata.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| extension | bytes | The calldata from which the MakingAmountData is to be retrieved. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bytes | calldata Bytes representing the MakingAmountData. |

### takingAmountData

```solidity
function takingAmountData(bytes extension) internal pure returns (bytes)
```
Returns the TakingAmountData from the provided extension calldata.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| extension | bytes | The calldata from which the TakingAmountData is to be retrieved. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bytes | calldata Bytes representing the TakingAmountData. |

### predicate

```solidity
function predicate(bytes extension) internal pure returns (bytes)
```
Returns the order's predicate from the provided extension calldata.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| extension | bytes | The calldata from which the predicate is to be retrieved. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bytes | calldata Bytes representing the predicate. |

### makerPermit

```solidity
function makerPermit(bytes extension) internal pure returns (bytes)
```
Returns the maker's permit from the provided extension calldata.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| extension | bytes | The calldata from which the maker's permit is to be retrieved. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bytes | calldata Bytes representing the maker's permit. |

### preInteractionTargetAndData

```solidity
function preInteractionTargetAndData(bytes extension) internal pure returns (bytes)
```
Returns the pre-interaction from the provided extension calldata.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| extension | bytes | The calldata from which the pre-interaction is to be retrieved. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bytes | calldata Bytes representing the pre-interaction. |

### postInteractionTargetAndData

```solidity
function postInteractionTargetAndData(bytes extension) internal pure returns (bytes)
```
Returns the post-interaction from the provided extension calldata.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| extension | bytes | The calldata from which the post-interaction is to be retrieved. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bytes | calldata Bytes representing the post-interaction. |

### customData

```solidity
function customData(bytes extension) internal pure returns (bytes)
```
Returns extra suffix data from the provided extension calldata.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| extension | bytes | The calldata from which the extra suffix data is to be retrieved. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bytes | calldata Bytes representing the extra suffix data. |

