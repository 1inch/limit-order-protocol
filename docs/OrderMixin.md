
## OrderMixin

### Functions list
- [constructor(weth) internal](#constructor)
- [bitInvalidatorForOrder(maker, slot) external](#bitinvalidatorfororder)
- [remainingInvalidatorForOrder(maker, orderHash) external](#remaininginvalidatorfororder)
- [rawRemainingInvalidatorForOrder(maker, orderHash) external](#rawremaininginvalidatorfororder)
- [simulate(target, data) external](#simulate)
- [cancelOrder(makerTraits, orderHash) public](#cancelorder)
- [cancelOrders(makerTraits, orderHashes) external](#cancelorders)
- [bitsInvalidateForOrder(makerTraits, additionalMask) external](#bitsinvalidatefororder)
- [hashOrder(order) external](#hashorder)
- [checkPredicate(predicate) public](#checkpredicate)
- [fillOrder(order, r, vs, amount, takerTraits) external](#fillorder)
- [fillOrderArgs(order, r, vs, amount, takerTraits, args) external](#fillorderargs)
- [fillContractOrder(order, signature, amount, takerTraits) external](#fillcontractorder)
- [fillContractOrderArgs(order, signature, amount, takerTraits, args) external](#fillcontractorderargs)

### Functions
### constructor

```solidity
constructor(contract IWETH weth) internal
```

### bitInvalidatorForOrder

```solidity
function bitInvalidatorForOrder(address maker, uint256 slot) external view returns (uint256)
```
See {IOrderMixin-bitInvalidatorForOrder}.

### remainingInvalidatorForOrder

```solidity
function remainingInvalidatorForOrder(address maker, bytes32 orderHash) external view returns (uint256)
```
See {IOrderMixin-remainingInvalidatorForOrder}.

### rawRemainingInvalidatorForOrder

```solidity
function rawRemainingInvalidatorForOrder(address maker, bytes32 orderHash) external view returns (uint256)
```
See {IOrderMixin-rawRemainingInvalidatorForOrder}.

### simulate

```solidity
function simulate(address target, bytes data) external
```
See {IOrderMixin-simulate}.

### cancelOrder

```solidity
function cancelOrder(MakerTraits makerTraits, bytes32 orderHash) public
```
See {IOrderMixin-cancelOrder}.

### cancelOrders

```solidity
function cancelOrders(MakerTraits[] makerTraits, bytes32[] orderHashes) external
```
See {IOrderMixin-cancelOrders}.

### bitsInvalidateForOrder

```solidity
function bitsInvalidateForOrder(MakerTraits makerTraits, uint256 additionalMask) external
```
See {IOrderMixin-bitsInvalidateForOrder}.

### hashOrder

```solidity
function hashOrder(struct IOrderMixin.Order order) external view returns (bytes32)
```
See {IOrderMixin-hashOrder}.

### checkPredicate

```solidity
function checkPredicate(bytes predicate) public view returns (bool)
```
See {IOrderMixin-checkPredicate}.

### fillOrder

```solidity
function fillOrder(struct IOrderMixin.Order order, bytes32 r, bytes32 vs, uint256 amount, TakerTraits takerTraits) external payable returns (uint256, uint256, bytes32)
```
See {IOrderMixin-fillOrder}.

### fillOrderArgs

```solidity
function fillOrderArgs(struct IOrderMixin.Order order, bytes32 r, bytes32 vs, uint256 amount, TakerTraits takerTraits, bytes args) external payable returns (uint256, uint256, bytes32)
```
See {IOrderMixin-fillOrderArgs}.

### fillContractOrder

```solidity
function fillContractOrder(struct IOrderMixin.Order order, bytes signature, uint256 amount, TakerTraits takerTraits) external returns (uint256, uint256, bytes32)
```
See {IOrderMixin-fillContractOrder}.

### fillContractOrderArgs

```solidity
function fillContractOrderArgs(struct IOrderMixin.Order order, bytes signature, uint256 amount, TakerTraits takerTraits, bytes args) external returns (uint256, uint256, bytes32)
```
See {IOrderMixin-fillContractOrderArgs}.

