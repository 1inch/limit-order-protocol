# NonceManager

A helper contract for managing nonce of tx sender

## Functions

### increaseNonce

```text
function increaseNonce(
) external
```

Advances nonce by one

### advanceNonce

```text
function advanceNonce(
  uint8 amount
) public
```

#### Parameters:

| Name | Type | Description |
| :--- | :--- | :--- |
| `amount` | uint8 |  |

### nonceEquals

```text
function nonceEquals(
  address makerAddress,
  uint256 makerNonce
) external returns (bool)
```

#### Parameters:

| Name | Type | Description |
| :--- | :--- | :--- |
| `makerAddress` | address |  |
| `makerNonce` | uint256 |  |

## Events

### NonceIncreased

```text
event NonceIncreased(
  address maker,
  uint256 newNonce
)
```

#### Parameters:

| Name | Type | Description |
| :--- | :--- | :--- |
| `maker` | address |  |
| `newNonce` | uint256 |  |

