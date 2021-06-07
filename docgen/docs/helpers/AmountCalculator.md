# AmountCalculator





## Functions

### `getMakerAmount(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapTakerAmount) → uint256`
Calculates maker amount


#### Return Values:
- Floored maker amount

### `getTakerAmount(uint256 orderMakerAmount, uint256 orderTakerAmount, uint256 swapMakerAmount) → uint256`
Calculates taker amount


#### Return Values:
- Ceiled taker amount

### `arbitraryStaticCall(address target, bytes data) → uint256`
Performs an arbitrary call to target with data


#### Return Values:
- Result bytes transmuted to uint256




