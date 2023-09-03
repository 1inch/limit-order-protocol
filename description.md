Limit order protocol v4
=======


# Overview

Limit orders are a fundamental part of financial trading, allowing traders to buy or sell assets at specific prices or better. The smart contracts of the 1inch limit order protocol implement logic to fill on-chain orders created off-chain. The protocol is extremely flexible and allows for the creation and execution of classic limit orders, as well as a wide variety of custom orders, including the exchange of non-ERC20 tokens, dynamic exchange rates, verification of conditions for order filling, execution of arbitrary code, and more. Additionally, the protocol is designed to be gas-efficient and consume the least possible amount of gas.

# Create an order

Orders are created off-chain and signed by maker. When creating an order a maker has a number of features he can utilize for the order

**Basic features**

- Choose an asset receiver for an order
- Allow or disallow partial and multiple fills
- Set conditions to verify to allow execution (e.g check the price of an asset)
- Set interactions (arbitrary maker’s code) to execute before and after order filling
- Choose approval scheme for token spend (approve, permit, permit2)
- Ask to unwrap WETH to ETH before (to sell ETH) or after swap (to get ETH)
- Make an order private by defining the only allowed taker’s address
- Set order’s expiration date
- Set an order’s nonce or epoch for easy canceling the order later

**Advanced features**

- Define a proxy for handling non-compliant with `IERC20` transfer functions, which allows to swap non-ERC20 tokens, for example, ERC721 or ERC1155.
- Define functions that calculate on-chain the exchange rate for maker and taker assets. For example, dutch auction (rate decreases with time) or range orders (rate depends on the volume already filled) can be implemented with it.

Order can be created with an utility library https://github.com/1inch/limit-order-protocol-utils/ or created and signed manually.

## How to build the order

Order struct is defined as

```solidity
struct Order {
    uint256 salt;
    Address maker;
    Address receiver;
    Address makerAsset;
    Address takerAsset;
    uint256 makingAmount;
    uint256 takingAmount;
    MakerTraits makerTraits;
}
```

where

| Parameter | Type | Description |
| --- | --- | --- |
| salt | `uint256` | order salt contains order salt and applicable extensions hash.<br> The highest 96 bits is salt.<br>The lowest 160 bit is extension hash. |
| maker | `address` | The maker’s address |
| receiver | `address` | The receiver’s address. The taker assets will be transferred to this address. |
| makerAsset | `address` | The maker’s asset address.  |
| takerAsset | `address` | The taker’s asset address.  |
| makingAmount | `uint256` | The amount of tokens maker will give |
| takingAmount | `uint256` | The amount of tokens maker wants to receive |
| makerTraits | `MakerTraits` (uint256) | Limit order options, coded as bit flags into uint256 number. |

> **Note**: Order becomes invalidated after fill. Salt should be different for orders that have all parameters equal. Thus, fill of one order won’t lead to all orders invalidation.
> 

## Order settings

The `makerTraits` property contain order settings as bit flags and numbers compacted in `uint256` number.
The bit flags are (from highest to lowest bit)

| Option name | Bit position | Description |
| --- | --- | --- |
| `NO_PARTIAL_FILLS` | 255 | If set, the order does not allow partial fills.<br/>Partial fill is a fill when only a part of required maker’s asset is swapped. It could be useful for large orders that can be hardly filled by only one taker. |
| `ALLOW_MULTIPLE_FILLS` | 254 | If set, the order permits multiple fills.<br/>More than one fill is only possible for an order that was partially filled previously. It is not possible to fill an order that was already fully filled. The flag usually works in combination with allowPartialFills flag. It doesn’t make sense to allow multiple fills without the permission for partial fills. |
| `NO_IMPROVE_RATE` | 253 | if set, the order does not allow taker interaction to improve rate.<br/>By default, a taker can return more tokens to a maker and limit order protocol allows it. But in some cases this may lead to unpredictable results. For example, if a maker wants to buy NFT changing amount will change NFT token that taker should transfer to the maker, because ERC721 standard implementation uses tokenId instead of amount. Use this flag to avoid it. |
| `PRE_INTERACTION_CALL` | 252 | if set, the order requires pre-interaction call.<br/>Set the flag to execute maker’s pre-interaction call. See <interactions> for details.  |
| `POST_INTERACTION_CALL` | 251 | if set, the order requires post-interaction call.<br/>Set the flag to execute maker’s post-interaction call. See <interactions> for details. |
| `NEED_CHECK_EPOCH_MANAGER` | 250 | if set, an order uses epoch manager for cancelling. See <cancel order> for details. |
| `HAS_EXTENSION` | 249 | if set, the order applies extension(s) logic during fill.<br/>See <extensions> for available extensions and usage details. |
| `USE_PERMIT2` | 248 | if set, the order uses permit2.  |
| `UNWRAP_WETH` | 247 | if set, the order requires to unwrap WETH |

The rest of the settings are located in lowest 200 bit of the number (from the lowest to highest)

| Option name | Size, bits | Description |
| --- | --- | --- |
| `ALLOWED_SENDER` | 80 | The option is used to make order private and restrict fill to only 1 specified taker. Option contains the last 10 bytes of allowed sender address. Zero value means that no restrictions will be applied. |
| `EXPIRATION` | 40 | Expiration timestamp for the order. Order cannot be filled after the expiration deadline. Zero value means that there is no expiration time for the order. |
| `NONCE_OR_EPOCH` | 40 | Nonce or epoch of the order.<br/>See <cancel order> for details. |
| `SERIES` | 40 | Series of the order. See <cancel order> for details. |

**Example**

Below is the example of order calldata

```bash
# salt
00000000 00000000 00000001 d5682f7a 55afc3a7 8fa42edc 4f15f6de 33a7b268 
#^^^^^^^ ^^^^^^^^ ^^^^^^^^ <= salt
#        extension hash => ^^^^^^^^ ^^^^^^^^ ^^^^^^^^ ^^^^^^^^ ^^^^^^^^

# maker address
00000000 00000000 00000000 70997970 c51812dc 3a010c7d 01b50e0d 17dc79c8 
# reciever address
00000000 00000000 00000000 3c44cddd b6a900fa 2b585dd2 99e03d12 fa4293bc
# maker token address (DAI)
00000000 00000000 00000000 6B175474 E89094C4 4Da98b95 4EedeAC4 95271d0F 
# taker token address (WETH)
00000000 00000000 00000000 C02aaA39 b223FE8D 0A0e5C4F 27eAD908 3C756Cc2
# maker amount (3500 ether, 18 decimals)
00000000 00000000 00000000 00000000 00000000 00000769 5a92c20d 6fe00000 
# taker amount (10 weth, 18 decimals)
00000000 00000000 00000000 00000000 00000000 00000000 8ac72304 89e80000

# MakerTraits
 46800000 00000000 00000001 00000000 010064f3 ba816ab8 827279cf ffb92266
#^^^ <= flags
#   ^^^^^ ^^^^^^ <= unused
#     series => ^^ ^^^^^^^^
#            nonce/epoch => ^^^^^^^^ ^^  
#              expiration timestamp => ^^^^^^ ^^^^
#                       allowed sender address => ^^^^ ^^^^^^^^ ^^^^^^^^

```

## Order extensions

Extensions are a features that consume more gas to execute but are not always necessary for a specific limit orders. Extensions have been introduced to avoid changing static order structure used for basic order and extract all dynamic parts outside the order. Order and extensions are separate structures and to ensure that an extension matches an order, the order contains extension hash in its salt value. If extension is not specified for the order than it’s logic is not executed.

> **Note**: The order structure itself doesn’t contain extensions. Extensions have to be stored and passed separately when filling the order. The order hash ensures that the passed extensions are correct since lowest 160 bit of order salt contains the extensions hash. The order `HAS_EXTENSION` flag must be set to process extensions when the order being filled.
> 

Available extensions are described in the sections below

**Non-ERC20 tokens swap**

- `MakerAssetSuffix` and `TakerAssetSuffix` - used when token’s transfer function signature does not comply with IERC20 interface `IERC20.transferFrom(from, to, amount)`.  In this case the transfer is called via proxy and additional arguments and encoded in the suffix (maker or taker).

**Runtime exchange rate**

- `MakingAmountGetter` and `TakingAmountGetter` define the functions that are used to calculate taking amount based on the requested making amount and vice versa. Basically, amount calculators are used for defining corresponding amounts when an order is filled partially or for calculations of custom amount depending on external factors. Currently implemented getters are
    - `AmountCalculator` - the default calculator used when no getter is set. Calculates amounts proportionally to the initial exchange rate.
    - `DutchAuctionCalculator` - calculates amounts based on the time passed since dutch auction start, the rate is decreasing proportionally to the time passed.
    - `RangeAmountCalculator` - calculates amounts based on the volumes filled and requested, exchange rate is changing in the price range from minimum to maximum based on the volumes filled.

**Order execution conditions**

- `Predicate` - a predicate to validate order against specified conditions in the moment of fill.
    
    link to section
    

**Permits and approvals**

- `MakerPermit` - a maker’s permit to avoid getting approval for a token spend.

**Interactions**

- `PreInteractionData` and `PostInteractionData` - maker defined interactions executed before assets transfer from maker to taker and after assets transfer from taker to maker. See interactions for details link to section

## Extensions structure

Extensions have dynamic length and should be packed in the following structure 

- First 32 bytes of calldata contain offsets for the extensions calldata,
- then follows the extensions calldata correspondingly

Offsets contain zero-based offset in calldata for each parameter and are packed as follows 

| Parameter | Location, bytes |
| --- | --- |
| MakerAssetSuffix | [0..3] |
| TakerAssetSuffix | [4..7] |
| MakingAmountGetter | [8..11] |
| TakingAmountGetter | [12..15] |
| Predicate | [16..19] |
| MakerPermit | [20..23] |
| PreInteractionData | [24..27] |
| PostInteractionData | [28..31] |

**Example**

For the order that have a predicate with a length 120 bytes and a permit (32 bytes) included the extension calldata should be packed as follows

| Offsets |  |  |  | Predicate offset | Maker permit offset |  |  | Predicate calldata | Permit calldata |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [0..3] | [4..7] | [8..11] | [12..15] | [16..19] | [20..23] | [24..27] | [28..31] | [32..151] | [152..183] |
| 0 | 0 | 0 | 0 | 120 | 152 | 152 | 152 | calldata (120 bytes) | calldata (32 bytes) |

Below is the final calldata number which contains the offsets.

```bash
#  28-31    24-27    20-23    16-19    12-15     8-11      4-7      0-3
00000098 00000098 00000098 00000078 00000000 00000000 00000000 00000000
#         predicate end => ^^^^^^^^ ^^^^^^^^ <= predicate start
#   permit end => ^^^^^^^^ ^^^^^^^^ <= permit start

# followed by
# 120 bytes of predicate calldata
# 32  bytes of permit
```

## **Non-ERC20 tokens swap**

To swap tokens with transfer function signature that does not comply with IERC20 interface `IERC20.transferFrom(from, to, amount)` it is needed to use proxy contract which takes `from`, `to`, `amount` arguments, maps them to token transfer function and adds additional parameters from suffix calldata.

In this case `makerAsset` and/or `takerAsset` should contain the address of proxy contract, and token address should be encoded into suffix with additional arguments. The suffix is a packed bytes of calldata of parameters passed to the proxy contract.  

Already implemented examples of such tokens are tokens based on the standards below

- ERC721 - `IERC721.transferFrom(from, to, tokenId)`
- ERC1155 - `IERC1155.safeTransferFrom(from, to, tokenId, amount, data)`

In order to implement your custom proxy

1. Implement a function that receives `from`, `to` and `amount` as first three parameters and additional parameters which will be passed with `makerAssetSuffix` and/or `takerAssetSuffix`
2. Find function name which selector equals to `transferFrom(from,to,amount)`
3. Implement `transferFrom` for the token

**Implementation example**

Below is the example how of ERC721 token proxy.

```solidity
contract ERC721Proxy is ImmutableOwner {
    error ERC721ProxyBadSelector();

    constructor(address _immutableOwner) ImmutableOwner(_immutableOwner) {
        if (ERC721Proxy.func_60iHVgK.selector != IERC20.transferFrom.selector) revert ERC721ProxyBadSelector();
    }

    /// @notice Proxy transfer method for `IERC721.transferFrom`. Selector must match `IERC20.transferFrom`.
    /// Note that `amount` is unused for security reasons to prevent unintended ERC-721 token sale via partial fill
    // keccak256("func_60iHVgK(address,address,uint256,uint256,address)") == 0x23b872dd (IERC20.transferFrom)
    function func_60iHVgK(address from, address to, uint256 /* amount */, uint256 tokenId, IERC721 token) external onlyImmutableOwner {
        token.transferFrom(from, to, tokenId);
    }
}
```

As you may see `amount` is not used but function has to accept it and two additional parameters are passed to the function `tokenId` and `token` which are needed to perform `transferFrom` operation.

In order to use this proxy the order should

1. contain the proxy address in the `makerAsset` or `takerAddress`
2. have the `HAS_EXTENSION` set
3. have extension with `makerAssetSuffix` or `takerAssetSuffix` set with packed `tokenId` and `token` address which will be passed to the proxy when order will be filled.

> **Note:** this extension is incompatible with `USE_PERMIT2_FLAG` setting.
> 

**Example**

The code that creates order

```jsx
const makerAssetSuffix = '0x' + erc721proxy.interface.encodeFunctionData(
    'func_60iHVgK',
    // ERC721Proxy arguments (2 last passed as extra) 
    // address from, address to, uint256 amount, uint256 tokenId, IERC721 token
    [addr1.address, constants.ZERO_ADDRESS, 0, 10, dai.address]
// leave only 2 extra arguments
).substring(202);

const takerAssetSuffix = '0x' + erc721proxy.interface.encodeFunctionData(
    'func_60iHVgK',
    // ERC721Proxy arguments (2 last passed as extra)
    // address from, address to, uint256 amount, uint256 tokenId, IERC721 token
    [constants.ZERO_ADDRESS, addr1.address, 0, 10, weth.address]
// leave only 2 extra arguments
).substring(202);

const order = buildOrder(
    {
	// put maker asset proxy address instead of maker asset address
        makerAsset: erc721proxy.address,
	// put taker asset proxy address instead of taker asset address
        takerAsset: erc721proxy.address,
        // making amount is not used by ERC721Proxy
        makingAmount: 1,
        // taking amount is not used by ERC721Proxy
        takingAmount: 1,
        maker: addr1.address,
    },
    {
        makerAssetSuffix,
        takerAssetSuffix,
    },
);
```

The extension’s calldata produced by the code is 

```bash
0000008000000080000000800000008000000080000000800000008000000040
000000000000000000000000000000000000000000000000000000000000000a
0000000000000000000000005fbdb2315678afecb367f032d93f642f64180aa3
000000000000000000000000000000000000000000000000000000000000000a
000000000000000000000000e7f1725e7734ce288f8367e1bb143e90bb3f0512
```

Below the calldata is split into structured parts to illustrate how it was formed.

```bash
# Extension offsets (32 bytes)
00000080 00000080 00000080 00000080 00000080 00000080 00000080 00000040
#                      makerAssetSuffix end offset =>          ^^^^^^^^
#                      takerAssetSuffix end offset => ^^^^^^^^

# additional parameters for makerAsset function
# 1st extra parameter (uint256 tokenId) 
00000000 00000000 00000000 00000000 00000000 00000000 00000000 0000000a
# 2nd extra parameter (address token)
00000000 00000000 00000000 5fbdb231 5678afec b367f032 d93f642f 64180aa3

# additional parameters for takerAsset function
# 1st extra parameter (uint256 tokenId)
00000000 00000000 00000000 00000000 00000000 00000000 00000000 0000000a
# 2nd extra parameter (address token)
00000000 00000000 00000000 e7f1725e 7734ce28 8f8367e1 bb143e90 bb3f0512
```

## Runtime exchange rate

Sometimes order exchange rate is known only on-chain, for example if order implements Dutch auction or maker wants to get rate based on oracle price. For that purpose a maker can set getter functions to calculate rate on-chain, and then pass the getters to `makerAmountGetter` and `takerAmountGetter` extension. The getters are used for

- `makerAmountGetter` calculates the maker amount based on the provided taking amount
- `takerAmountGetter` calculates the taker amount based on the provided making amount

Basically, both getters should be implemented to get consistent results because it is a taker who decides the way how the amounts are calculated (based on the making or taking amounts) when order is executed. See order fill for details

Both getters extension calldata has the following structure

| Address | Selector | Packed arguments |
| --- | --- | --- |
| 20 bytes | 4 bytes | variable size calldata |

When the order is executed and the protocol calculates amount the selector on the provided contract address is called and packed arguments passed, additionally the arguments calldata is extended with

- `requestedAmount` - the requested amount to calculate making or taking amount for
- `remainingMakingAmount` - remaining making amount for the order (can be different from an order’s `makingAmount` it the order was partially filled previously)
- `orderHash` - the order’s hash

So the final call would be as the following

```solidity
address.selector(*<arguments from calldata>*, requestedAmount, remainingMakingAmount, orderHash)
```

The expected return value is a `uint256` number which represents making or taking and corresponds to the passed `requestedAmount`

**Example**

The code creates an order that uses `RangeAmountCalculator` to calculate making and taking amount 

```jsx
// Order: 10 weth -> 35000 dai with price range: 3000 -> 4000
const makingAmount = ether('10');
const takingAmount = ether('35000');
const startPrice = ether('3000');
const endPrice = ether('4000');

const makingAmountGetter = rangeAmountCalculator.address + trim0x(cutLastArg(cutLastArg(
    rangeAmountCalculator.interface.encodeFunctionData('getRangeMakerAmount', [startPrice, endPrice, makingAmount, 0, 0], 64),
)));

const takingAmountGetter = rangeAmountCalculator.address + trim0x(cutLastArg(cutLastArg(
    rangeAmountCalculator.interface.encodeFunctionData('getRangeTakerAmount', [startPrice, endPrice, makingAmount, 0, 0], 64),
)))
```

The extension’s calldata produced by the code is 

```bash
000000f0000000f0000000f0000000f0000000f0000000780000000000000000
2279B7A0a67DB372996a5FaB50D91eAA73d2eBe690c666d10000000000000000
000000000000000000000000000000a2a15d09519be000000000000000000000
000000000000000000000000000000d8d726b7177a8000000000000000000000
000000000000000000000000000000008ac7230489e800002279B7A0a67DB372
996a5FaB50D91eAA73d2eBe6acaf531600000000000000000000000000000000
00000000000000a2a15d09519be0000000000000000000000000000000000000
00000000000000d8d726b7177a80000000000000000000000000000000000000
00000000000000008ac7230489e80000
```

Below the calldata is splitted into structured parts to illustrate how it was formed

```bash
# Extension offsets (32 bytes)
000000f0 000000f0 000000f0 000000f0 000000f0 00000078 00000000 00000000
#    makerAssetGetter end offset =>          ^^^^^^^^
#    takerAssetGetter end offset => ^^^^^^^^

# makerAssetGetter address
2279B7A0 a67DB372 996a5FaB 50D91eAA 73d2eBe6
# makerAssetGetter selector
# getRangeMakerAmount(uint256,uint256,uint256,uint256,uint256)
90c666d1
# 1st argument - uint256 priceStart
00000000 00000000 00000000 00000000 00000000 000000a2 a15d0951 9be00000
# 2nd argument - uint256 priceEnd
00000000 00000000 00000000 00000000 00000000 000000d8 d726b717 7a800000
# 3rd argument - uint256 totalLiquidity
00000000 00000000 00000000 00000000 00000000 00000000 8ac72304 89e80000

# takerAssetGetter address
2279B7A0 a67DB372 996a5FaB 50D91eAA 73d2eBe6
# takerAssetGetter selector
# getRangeTakerAmount(uint256,uint256,uint256,uint256,uint256)
acaf5316
# 1st argument - uint256 priceStart
00000000 00000000 00000000 00000000 00000000 000000a2 a15d0951 9be00000
# 2nd argument - uint256 priceEnd
00000000 00000000 00000000 00000000 00000000 000000d8 d726b717 7a800000
# 3rd argument - uint256 totalLiquidity
00000000 00000000 00000000 00000000 00000000 00000000 8ac72304 89e80000
```

## Predicates

Predicates allow to evaluate arbitrary conditions on-chain during order execution and allow or reject order fill. Some examples are

- Do not allow to fill order until particular date (checks the block timestamp during order execution)
- Do not allow to fill order if chainlink price is less or than particular amount

The limit order protocol provides a number of helper functions to create conditions from basic primitives, designed to chain them to any required complexity

1. Equality
    - `eq(uint256 value, bytes calldata data)` - returns `true` if the calldata execution result is equal to the `value`
    - `lt(uint256 value, bytes calldata data)` - returns `true` if the calldata execution result is less than the `value`
    - `qt(uint256 value, bytes calldata data)` - returns `true` if the calldata execution result is greater than the `value`
2. Logical operators
    - `and(uint256 offsets, bytes calldata data)` - combines several predicates and returns `true` when all predicates are valid. To prepare data for `and` predicate you need to pack predicates calldata sequentially into `data` variable and store their offsets as `uint32` numbers into `offsets` with the same order as calldata was packed.
        
        > **Note**: The `and` predicate is limited with 8 operands. Chain several predicates to extend the limit
        > 
        
        **Packing example**
        
        For `and(predicate1, predicate2, predicate3)`, where
        
        | Predicate | Length |
        | --- | --- |
        | predicate1 | 64 bytes |
        | predicate2 | 256 bytes |
        | predicate3 | 128 bytes |
        
        The calldata and offsets structure will be the following:
        
        | calldata |  |  |
        | --- | --- | --- |
        | 1-64 bytes | 65-320 bytes | 321-448 bytes |
        | calldata (predicate1) | calldata (predicate2) | calldata (predicate2) |
        
        | offsets (uint256) |  |  |  |
        | --- | --- | --- | --- |
        | 12-32 bytes | 9-12 byte | 5-8 byte | 1-4 byte |
        | 00…000 | 448 (predicate3 offset) | 320 (predicate2 offset) | 64 (predicate1 offset) |
        
        The final calldata for the offsets in hex is
        
        ```bash
        # offsets
        00000000 00000000 00000000 00000000 00000000 000001C0 00000140 00000040
        # calldata content offset
        00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000040
        # calldata content length
        00000000 00000000 00000000 00000000 00000000 00000000 00000000 000001C0
        # followed by
        # 64 bytes  of predicate 1 calldata
        # 256 bytes of predicate 2 calldata
        # 128 bytes of predicate 3 calldata
        ```
        
    - `or(uint256 offsets, bytes calldata data)` - combines several predicates and returns `true` when at least one predicate is valid. The packing logic is the same as for `and` predicate.
        
        > **Note**: The `or` predicate is limited with 8 operands. Chain several and predicates to extend the limit.
        > 
    - `not(bytes calldata data)` - returns `true` if the calldata execution result is 0.
3. Custom conditions
    - `arbitraryStaticCall(address target, bytes calldata data)` - the calldata is executed on third-party contract (`target`) and should return any `uint256` number.
        
        > **Note**: The call is executed with `staticcall` and reverts if state change happens. That means that only view calls are allowed.
        > 

**Example 1**

Stop-loss and take profit conditions for the single limit order

```jsx
// Build condition => (daiPrice < 1000) or (daiPrice > 2000)
// Init
const LimitOrderProtocol = await ethers.getContractFactory('LimitOrderProtocol');
const swap = await LimitOrderProtocol.deploy(weth.address);
await swap.deployed();
// Build predicate
// 1. Create calldata to call oracle to get latest DAI price
const priceCall = swap.interface.encodeFunctionData('arbitraryStaticCall', [
            daiOracle.address,
            daiOracle.interface.encodeFunctionData('latestAnswer'),
        ]);
// 2. Create calldata for condition that price should be less then 1000
const comparelt = swap.interface.encodeFunctionData('lt', [ether('1000'), priceCall])
// 3. Create calldata for condition that price should be more then 2000
const comparegt = swap.interface.encodeFunctionData('gt', [ether('2000'), priceCall])
// 4. Add `or` condition (joinStaticCalls - concatenates calldata)
const { offsets, data } = joinStaticCalls([comparelt, comparegt]);
**predicate** = swap.interface.encodeFunctionData('or', [offsets, data]);
```

> **Note**: In order to use predicates, the flag HAS_EXTENSIONS has to be set to true. Otherwise, if a predicate is defined for an order and the flag is not set, then order fill will be reverted.
> 

**Example 2**

The example demonstrates the principals how the predicate calldata is assembled. The order has the only extension which is the predicated assembled by the code below: 

```jsx
// Predicate = (5 < call result < 15) = or(5 < call result, 15 > call result)
const arbitaryFunction = arbitraryPredicate.interface.encodeFunctionData('copyArg', [10]);
// Create predicate:  (arbitary call result < 15 || arbitary call result > 5)
const arbitraryCallPredicate = swap.interface.encodeFunctionData('arbitraryStaticCall', [
    arbitraryPredicate.address,
    arbitaryFunction,
]);
const comparelt = swap.interface.encodeFunctionData('lt', [15, arbitraryCallPredicate]);
const comparegt = swap.interface.encodeFunctionData('gt', [5, arbitraryCallPredicate]);

const { offsets, data } = joinStaticCalls([comparelt, comparegt]);
const predicate = swap.interface.encodeFunctionData('or', [offsets, data]);
```

The extension’s calldata produced by the code is

```
0x000002c4000002c4000002c4000002c4000000000000000000000000000000
0074261145000000000000000000000000000000000000000000000000000002
4800000124000000000000000000000000000000000000000000000000000000
0000000040000000000000000000000000000000000000000000000000000000
0000000248ca4ece220000000000000000000000000000000000000000000000
00000000000000000f0000000000000000000000000000000000000000000000
0000000000000000400000000000000000000000000000000000000000000000
0000000000000000a4bf15fcd80000000000000000000000005fc8d32690cc91
d4c39d9d3abcbd16989f87570700000000000000000000000000000000000000
0000000000000000000000004000000000000000000000000000000000000000
000000000000000000000000241ae4f1b6000000000000000000000000000000
000000000000000000000000000000000a000000000000000000000000000000
0000000000000000000000000000000000000000000000000000000000000000
0000000000000000004f38e2b800000000000000000000000000000000000000
0000000000000000000000000500000000000000000000000000000000000000
0000000000000000000000004000000000000000000000000000000000000000
000000000000000000000000a4bf15fcd80000000000000000000000005fc8d3
2690cc91d4c39d9d3abcbd16989f875707000000000000000000000000000000
0000000000000000000000000000000040000000000000000000000000000000
00000000000000000000000000000000241ae4f1b60000000000000000000000
00000000000000000000000000000000000000000a0000000000000000000000
0000000000000000000000000000000000000000000000000000000000000000
0000000000000000000000000000000000000000000000000000000000000000
0000000000
```

Below the calldata is splitted into structured parts to illustrate how it was formed. There is the length in bytes for each calldata string.

```bash
   |-
   | # Extension offsets (32 bytes)
32 | 000002c4 000002c4 000002c4 000002c4 00000000 00000000 00000000 00000000
   |
   | # predicate extension calldata
   | |-
   | | # or(...) selector
 4 | | 74261145
   | | 
   | | # or(uint256 offsets, ...)
32 | | 00000000 00000000 00000000 00000000 00000000 00000000 00000248 00000124
   | | # or(..., bytes data) offset
32 | | 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000040
   | | # or(..., bytes data) length
32 | | 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000248
   | | 
   | | # or(..., bytes data) content
   | | |-
   | | | # lt(...) selector
 4 | | | ca4ece22
   | | | # lt(uint256 value, ...) static argument (15)
32 | | | 00000000 00000000 00000000 00000000 00000000 00000000 00000000 0000000f
   | | | # lt(..., bytes data) offset
32 | | | 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000040
   | | | # lt(..., bytes data) length
32 | | | 00000000 00000000 00000000 00000000 00000000 00000000 00000000 000000a4
   | | |
   | | | # lt(..., bytes data) content
   | | | |-
   | | | | # arbitrary call predicate - copyArg(10) calldata
   | | | | # arbitraryStaticCall selector
 4 | | | | bf15fcd8
   | | | | # arbitraryStaticCall(address, ...)
32 | | | | 00000000 00000000 00000000 5fc8d326 90cc91d4 c39d9d3a bcbd1698 9f875707
   | | | | # arbitraryStaticCall(..., bytes) offset
32 | | | | 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000040
   | | | | # arbitraryStaticCall(..., bytes) length
32 | | | | 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000024
   | | | |
   | | | | # arbitraryStaticCall(..., bytes) content
   | | | | |-
   | | | | | # copyArg calldata
   | | | | | # copyArg selector
 4 | | | | | 1ae4f1b6
   | | | | | # copyArg(uint256)
32 | | | | | 00000000 00000000 00000000 00000000 00000000 00000000 00000000 0000000a
   | | | | | # padded to a multiple of 32 bytes for copyArg call
28 | | | | | 00000000 00000000 00000000 00000000 00000000 00000000 00000000
   | | | | | # 64 bytes total
   | | | | |_
   | | | |
   | | | | # padded to a multiple of 32 bytes for arbitrary call
28 | | | | 00000000 00000000 00000000 00000000 00000000 00000000 00000000
   | | | | # 192 bytes total
   | | | |_
   | | |
   | | | # 292 bytes total
   | | |_
   | |
   | | |-
   | | | # gt(...) selector
 4 | | | 4f38e2b8
   | | | # gt(uint256 value, ...) static argument (5)
32 | | | 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000005
   | | | # gt(..., bytes data) offset
32 | | | 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000040
   | | | # gt(..., bytes data) length
32 | | | 00000000 00000000 00000000 00000000 00000000 00000000 00000000 000000a4
   | | |
   | | | # gt(..., bytes data) content
   | | | |-
   | | | | # arbitrary call predicate - copyArg(10) calldata
   | | | | # arbitraryStaticCall selector
 4 | | | | bf15fcd8
   | | | | # arbitraryStaticCall(address, ...)
32 | | | | 00000000 00000000 00000000 5fc8d326 90cc91d4 c39d9d3a bcbd1698 9f875707
   | | | | # arbitraryStaticCall(..., bytes) offset
32 | | | | 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000040
   | | | | # arbitraryStaticCall(..., bytes) length
32 | | | | 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000024
   | | | |
   | | | | # arbitraryStaticCall(..., bytes) content
   | | | | |-
   | | | | | # copyArg calldata
   | | | | | # copyArg selector
 4 | | | | | 1ae4f1b6
   | | | | | # copyArg(uint256)
32 | | | | | 00000000 00000000 00000000 00000000 00000000 00000000 00000000 0000000a
   | | | | | # padded to a multiple of 32 bytes for copyArg call
28 | | | | | 00000000 00000000 00000000 00000000 00000000 00000000 00000000
   | | | | | # 64 bytes total
   | | | | |_
   | | | |
   | | | | # padded to a multiple of 32 bytes for arbitrary call
28 | | | | 00000000 00000000 00000000 00000000 00000000 00000000 00000000
   | | | | # 192 bytes total
   | | | |_
   | | |
   | | | # 292 bytes total
   | | |_
   | |
   | | # 584 bytes total (0x0248)
   | |_
   |
   | # 616 bytes total
   |_
```

## Interactions

Interactions are callbacks that allow to execute arbitrary code provided by maker (provided by order) or taker (provided on fill execution). There are several step in order execution logic which also includes interaction calls: 

1. Validate order
2. **Call maker pre-interaction**
3. Transfer maker asset to taker
4. **Call taker interaction**
5. Transfer taker asset to maker
6. **Call maker post-interaction**
7. Emit OrderFilled event

Calls are executed in the context of limit order protocol. Target contract should implement `IPreInteraction` or `IPostInteraction` interfaces for maker’s pre- and post- interactions and `ITakerInteraction` for taker’s interaction. These interfaces declare the single callback function for maker interactions and taker interactions respectively

```solidity
//Maker's pre-interaction
function preInteraction(
        IOrderMixin.Order calldata order,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external;

//Maker's post-interaction
function postInteraction(
        IOrderMixin.Order calldata order,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external;

//Taker's interaction
function takerInteraction(
        IOrderMixin.Order calldata order,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external returns(uint256 offeredTakingAmount);
```

In all cases callback function receives an order, order parameters and additional calldata for interaction  

| Parameter | Type | Description |
| --- | --- | --- |
| order | `IOrderMixin.Order` | Basic order structure |
| orderHash | `bytes32` | Order hash (orderHash = order.hash(_domainSeparatorV4())) |
| taker | `address` | The taker’s address who is filling the order |
| makingAmount | `uint256` | The actual making amount for the fill. May be different from Order.makingAmount if partial fills are allowed. |
| takingAmount | `uint256` | The actual taking amount for the fill. May be different from Order.takingAmount if partial fills are allowed. |
| remainingMakingAmount | `uint256` | The remaining amount left to fill for the order. May be different from Order.makingAmount if order was already partially filled. |
| extraData | `bytes` | Additional calldata passed to interaction.   |

Taker interaction additionally returns `offeredTakingAmount`. The return value may be used to improve rate for taker (if order allows it, `NO_IMPROVE_RATE` flag is not set). If the value returned is less then required `takingAmount` then the protocol ignores it and fill is done using calculated `takingAmount`.

Maker’s interactions are defined in order extensions `PreInteractionData` and `PostInteractionData`. The calldata structured as described below

- First 20 bytes of calldata is callback address
- The following bytes are extra calldata to be passed to interaction

> **Note:** To set up maker’s interaction the flag `HAS_EXTENSION` has to be set and `PreInteractionData` and/or `PostInteractionData` should contain interaction calldata.
> 

Taker’s interaction follows the same structure (20 bytes address and extra calldata) but is passed to the protocol when a taker fill an order.

**Example**

If the code to build interactions is

```jsx
// interactions is a contract that implements
// IPreInteraction, IPostInteraction, ITakerInteraction interfaces
const preInteraction = interactions.address + abiCoder.encode(['uint256'], [1]).substring(2);
const postInteraction = interactions.address + abiCoder.encode(['uint256'], [4]).substring(2);
const takerInteraction = interactions.address + abiCoder.encode(['uint256'], [3]).substring(2);
```

then the order’s extension calldata will be as follows

```bash
0000006800000034000000000000000000000000000000000000000000000000
0165878A594ca255338adfa4d48449f69242Eb8F000000000000000000000000
00000000000000000000000000000000000000010165878A594ca255338adfa4
d48449f69242Eb8F000000000000000000000000000000000000000000000000
0000000000000004
```

which is interpreted like

```bash
# Extension offsets (32 bytes)
00000068 00000034 00000000 00000000 00000000 00000000 00000000 00000000
#^^^^^^^          <= postInteraction end offset
#        ^^^^^^^^ <= preInteraction end offset

# preInteraction calldata
# target address
0165878A 594ca255 338adfa4 d48449f6 9242Eb8F
# extraData passed to the call
00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000001

# postInteraction calldata
# target address
0165878A 594ca255 338adfa4 d48449f6 9242Eb8F 
# extraData passed to the call
00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000004
```

and takerInteraction will be the following

```bash
# takerInteraction calldata
# target address
0165878A 594ca255 338adfa4 d48449f6 9242Eb8F
# extraData passed to the call
00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000003
```

# Fill order

## How to fill order

To fill an order a taker should call one function of the series defined in `IOrderMixin` interface and supply order and extensions (if any), filling amount, signature, and taker filling options. The functions defined by the interface differ depending on order is filled with extensions or without, taker is the fund receiver or not, and order is filled with taker’s permit or not. The full list is below

- `fillOrder` - fills simple order without extensions
- `fillOrderExt` - allows to specify extensions that are used for the order
- `fillOrderTo` - allows to specify maker’s funds destination instead of `msg.sender`
- `fillOrderToExt` - allows to specify maker’s funds destination and extensions that are used for the order
- `fillOrderToWithPermit` - allows to specify maker’s funds destination and calls permit before filling order.
- `fillContractOrder` - uses contract-based signatures.
- `fillContractOrderWithPermit` - uses contract-based signatures and taker’s permit.
- `fillContractOrderExt` - uses contract-based signatures and taker’s permit and allows to specify order’s extensions.

All the function have similar signature, below are the examples covering the possible arguments and their description

```solidity
// Fill from EOA
function fillOrderToExt(
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        TakerTraits takerTraits,
        address target,
        bytes calldata interaction,
        bytes calldata extension
    ) public payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash) {

// Fill from smart contract
function fillContractOrderExt(
        IOrderMixin.Order calldata order,
        bytes calldata signature,
        uint256 amount,
        TakerTraits takerTraits,
        address target,
        bytes calldata interaction,
        bytes calldata permit,
        bytes calldata extension
    ) public returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash)
```

| Argument | Type | Description |
| --- | --- | --- |
| order | `Order` (calldata) | The order structure to fill  |
| r | `bytes32` | r-component of the maker’s signature to check that order hash is signed by the maker.  |
| vs | `bytes32` | vs-component of the maker’s signature to check that order hash is signed by the maker. |
| signature | `bytes` calldata | signature to verify order. Used for contract signed orders only. |
| amount | `uint256` | The amount to fill order which can be treated as maker or taker amount depending on fill settings.<br/>If the amount is greater than the remaining amount to fill than fill will be executed only for the remaining amount.<br/>The fill will be reverted if amount doesn’t equal order making amount and partial fills aren’t allowed.<br/>The fill will be also reverted if making and taking amounts equal zero.|
| takerTraits | `TakerTraits` (uint256) | The taker’s setting for the order fill. See Fill settings for details. |
| target | `address` | The recipient address for maker assets transfer.. |
| interaction | `bytes` calldata | Taker interaction to execute during the fill. See interactions for details. |
| extension | `bytes` calldata | The order’s extension calldata. The extension keccak256 hash has to be equal to the 160-lower bit of order’s salt. |
| permit | `bytes` calldata | a taker’s permit for taker assets transfer. |

The return values are

| Return value | Type | Description |
| --- | --- | --- |
| makingAmount | `uint256` | The actual amount the maker received  |
| takingAmount | `uint256` | The actual amount the taker recieved |
| orderHash | `bytes32` | The hash of the order |

## Fill settings

Taker has a number of options to provide during each fill which are contained in the `takerTraits` argument. The `takerTraits` contain settings as bit flags and numbers compacted in `uint256` number. The bit flags are (from highest to lowest bit)

| Option name | Bit position | Description |
| --- | --- | --- |
| `MAKER_AMOUNT_FLAG` | 255 bit | If set, the protocol implies that passed amount is making amount and taking amount will be calculated based on making amount, otherwise the passed amount is taking amount and making amount is calculated based on taking amount. The amount is calculated with AmountCalculator is getters are not set, or with getters provided with extension by maker. |
| `UNWRAP_WETH_FLAG` | 254 bit | If set, the WETH will be unwrapped into ETH before sending to taker’s target address. |
| `SKIP_ORDER_PERMIT_FLAG` | 253 bit | If set, the order skips maker's permit application. Can be useful to skip maker’s permit application if during recursive fill the permit was already applied. |
| `USE_PERMIT2_FLAG` | 252 bit | If set, the order uses the uniswap permit2. |
| `THRESHOLD_AMOUNT` | 0-251 bit (uint252) | The maximum amount a taker agrees to give in exchange for a making amount. If the calculated taker amount is less then threshold than the transaction will be reverted. Zero (0) threshold skips the check.<br/>The evaluated equation<br/>$$  threshold ≤ amount*{takingAmount \over makingAmount} $$ |

# Cancel order

There are a number of ways an order can be cancelled.

Automatically (indirect ways)

- Cancel by expiration deadline - the simplest way to cancel order automatically is to set expiration deadline using order’s `MakerTraits`. There is no way to fill an order after the expiration date has passed. 
The fill attempts will be reverted with `OrderExpired` error.
- Cancel by a condition defined in predicate - the order can become obsolete if the condition defined by order’s predicate evaluates to false on each check.
In this case the fill attempts will be reverted with `PredicateIsNotTrue` error.

or manually (direct ways)

- Cancel by hash - the order is cancelled by direct call to `cancelOrder` function and passing `orderHash` and `makerTraits` of the order.
    
    > **Note**: Orders are cancelled using different invalidators depending on the maker traits flags `ALLOW_MULTIPLE_FILLS` and `NO_PARTIAL_FILL` that means that passing wrong traits may result that call will have no effect and an order will not be cancelled.
    > 
    
    The fill attempts will be reverted with `BitInvalidatedOrder` error if an order doesn’t allow either partial or multiple fills, or with `InvalidatedOrder` error otherwise.
    
- Cancel by nonce - the order is cancelled by changing order nonce. It could be used for mass order cancellation.
    
    Each order can have series and nonce specified which stand for the
    
    - **series** specifies the application that issued order
    - **nonce** specifies the order’s generation
    
     At the same time each maker has a unique nonce set for each series which can be incremented up to 255 units. When the order’s flag `NEED_CHECK_EPOCH_MANAGER` is set the protocol checks if maker’s nonce matches order’s nonce and reverts with `WrongSeriesNonce` error if it doesn’t. It allows mass cancellation. For example, if a maker issued several orders with his actual nonce for a specific series, and later maker’s nonce was increased for that series the order’s nonce doesn’t equal the maker nonce anymore and the orders cannot be filled.
    
    > **Note:** To use nonce cancellation the flag `NEED_CHECK_EPOCH_MANAGER` must be set and partial and multiple fills should be allowed, otherwise the any order fill attempt will be reverted with `EpochManagerAndBitInvalidatorsAreIncompatible` error.
    > 
    
    From the very beginning each maker has a nonce equal to zero for all series. In order to change actual maker’s nonce, the maker should call `increaseEpoch` or `advanceEpoch`. The difference is the first increases nonce by 1, and the second increases nonce by any amount below 256.
    
    This concept allows also prepare a sequence of orders with increasing nonce and increase nonce under some condition to make the following orders valid.
    For example, there are 2 orders with nonces 0 and 1, correspondingly. And the maker sets up post-interaction which increases his actual nonce by 1 when order is filled. In this case at the start the maker has actual nonce equal to zero, and anybody can fill the first order, but not the second order. But when the first order is filled, the post-interaction changes actual makers nonce to 1 and the second order becomes valid.