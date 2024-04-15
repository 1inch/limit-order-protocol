Limit order protocol v4
=======

# Table of contents

- [Overview](#overview)
- [Create an order](#create-an-order)
    - [How to build an order](#how-to-build-an-order)
    - [Order settings](#order-settings)
    - [Order extensions](#order-extensions)
        - [Extensions structure](#extensions-structure)
        - [Non-ERC20 tokens swap](#non-erc20-tokens-swap)
        - [Runtime exchange rate](#runtime-exchange-rate)
        - [Predicates](#predicates)
        - [Interactions](#interactions)
- [Filling an order](#filling-an-order)
    - [How to fill an order](#how-to-fill-an-order)
    - [Fill settings](#fill-settings)
- [Cancelling an order](#cancelling-an-order)

# Overview

Limit orders are a fundamental part of financial trading, allowing traders to buy or sell assets at specific prices or better. The smart contracts of the 1inch limit order protocol implement logic to fill on-chain orders created off-chain. The protocol is extremely flexible and allows for the creation and execution of classic limit orders, as well as a wide variety of custom orders, including the exchange of non-ERC20 tokens, dynamic exchange rates, verification of conditions for order filling, execution of arbitrary code, and more. Additionally, the protocol is designed to be gas-efficient and consume the least possible amount of gas.

# Create an order

The process begins off-chain and is initiated by the order creator, also known as the maker, and ends with the order being signed. When creating an order, the maker can benefit from various features for the order.

**Basic features**

- Specify the receiving wallet for an order.
- Choose whether to allow or disallow partial and multiple fills.
- Define conditions that must be met before execution can proceed (e.g. stop-loss, take-profit orders).
- Specify interactions (arbitrary maker's code) to execute before and after order filling.
- Choose an approval method for token allowance (approve, permit, permit2).
- Request that ETH/WETH be wrapped/unwrapped either before or after the swap
- Make an order private by specifying the only allowed taker's address.
- Set the order's expiration date.
- Assign a nonce or epoch to the order for easy cancellation later.

**Advanced features**

- Define a proxy to handle transfers of assets that are not compliant with `IERC20`, allowing the swapping of non-ERC20 tokens, such as ERC721 or ERC1155.
- Define functions to calculate, on-chain, the exchange rate for maker and taker assets. These functions can be used to implement dutch auctions (where the rate decreases over time) or range orders (where the rate depends on the volume already filled), among others.

> **Note:** An order can be created using a utility library, such as https://github.com/1inch/limit-order-protocol-utils/, or it can be created and signed manually.
> 

## How to build an order

The order struct is defined as follows

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

**Parameter descriptions:**

| Parameter | Type | Description |
| --- | --- | --- |
| salt | `uint256` | Order salt contains order salt and applicable extensions hash.<br/> The highest 96 bits represent salt, and the lowest 160 bit represent extension hash. |
| maker | `address` | The maker’s address |
| receiver | `address` | The receiver’s address. The taker assets will be transferred to this address. |
| makerAsset | `address` | The maker’s asset address.  |
| takerAsset | `address` | The taker’s asset address.  |
| makingAmount | `uint256` | The amount of tokens maker will give |
| takingAmount | `uint256` | The amount of tokens maker wants to receive |
| makerTraits | `MakerTraits` (uint256) | Limit order options, coded as bit flags into uint256 number. |

> **Note:** The order becomes invalidated after it is filled. Therefore, the salt should be different for orders that have all parameters equal. This ensures that the fill of one order does not invalidate all orders.
> 

## Order settings

The `makerTraits` property contains order settings as bit flags and compacted numbers in a `uint256` format. The bit flags are listed from highest to lowest bit, starting from zero.

| Option name | Bit position | Description |
| --- | --- | --- |
| NO_PARTIAL_FILLS | 255 | If set, the order does not allow partial fills.<br/>Partial fill only occurs when part of the required maker’s asset amount is swapped. This could be useful for large orders that can be hardly filled by only one taker. |
| ALLOW_MULTIPLE_FILLS | 254 | If set, the order permits multiple fills.<br/>More than one fill is only possible for an order that was partially filled previously. It is not possible to fill an order that was already fully filled. The flag usually works in combination with allowPartialFills flag. It doesn’t make sense to allow multiple fills without the permission for partial fills. |
| unused | 253 | Reserved for future use. |
| PRE_INTERACTION_CALL | 252 | If set, the order requires pre-interaction call.<br/>Set the flag to execute maker’s pre-interaction call.<br/>See [Interactions](#interactions) section for details. |
| POST_INTERACTION_CALL | 251 | If set, the order requires post-interaction call.<br/>Set the flag to execute maker’s post-interaction call.<br/>See [Interactions](#interactions) section for details. |
| NEED_CHECK_EPOCH_MANAGER | 250 | If set, an order uses epoch manager for cancelling.<br/>See [Cancelling an order](#cancelling-an-order) for details. |
| HAS_EXTENSION | 249 | If set, the order applies extension(s) logic during fill.<br/>See [Order extensions](#order-extensions) for available extensions and usage details. |
| USE_PERMIT2 | 248 | If set, the order uses [Uniswap Permit2](https://github.com/Uniswap/permit2)  |
| UNWRAP_WETH | 247 | If set, the order requires unwrapping WETH |

The rest of the settings are located in the lowest 200 bits of the number, from lowest to highest.

| Option name | Size, bits | Location, bits | Description |
| --- | --- | --- | --- |
| ALLOWED_SENDER | 80 | [0..79] | This option is used to make an order private and restrict filling to only one specified taker address. The option consists of the last 10 bytes of the allowed sender's address. A value of zero means that no restrictions will be applied. |
| EXPIRATION | 40 | [80..119] | Expiration timestamp for the order. Order cannot be filled after the expiration deadline. Zero value means that there is no expiration time for the order. |
| NONCE_OR_EPOCH | 40 | [120..159] | The nonce or epoch of the order. See [Cancelling an order](#cancelling-an-order) for details. |
| SERIES | 40 | [160..199] | The series of the order. See [Cancelling an order](#cancelling-an-order) for details. |

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

Extensions are features that consume more gas to execute, but are not always necessary for a specific limit order. They have been introduced to avoid changing the static order structure used for basic orders and to extract all dynamic parts outside the order. Orders and extensions are separate structures, and to ensure that an extension matches an order, the order contains an extension hash in its salt value. If an extension is not specified for the order, then its logic is not executed. 

> **Note:** The order structure itself doesn't contain extensions. Extensions have to be stored and passed separately when filling the order. The order hash ensures that the passed extensions are correct, since the lowest 160 bits of the order salt contain the extension hash. The order `HAS_EXTENSION` flag must be set to process extensions when the order is being filled.
> 

Here are the available order extensions:

**Non-ERC20 tokens swap**

- `MakerAssetSuffix` and `TakerAssetSuffix` - used when a token's transfer function signature does not comply with the IERC20 interface `IERC20.transferFrom(from,to,amount)`. In this case, the transfer is called via proxy, and additional arguments are encoded in the suffix (maker or taker).

**Runtime exchange rate**

- `MakingAmountGetter` and `TakingAmountGetter` define the functions that are used to calculate the taking amount based on the requested making amount and vice versa. Basically, amount calculators are used for defining corresponding amounts when an order is filled partially or for calculations of custom amounts depending on external factors. Currently implemented getters are:
    - `AmountCalculator` - the default calculator used when no getter is set. Calculates amounts proportionally to the initial exchange rate.
    - `DutchAuctionCalculator` - calculates amounts based on the time passed since the Dutch auction start. The rate is decreasing proportionally to the time passed.
    - `RangeAmountCalculator` - calculates amounts based on the volumes filled and requested. The exchange rate is changing in the price range from minimum to maximum based on the volumes filled.

**Order execution conditions**

- `Predicate` - a predicate to validate the order against specified conditions at the moment of fill.

**Permits and approvals**

- `MakerPermit` - a maker’s permit to avoid getting approval for a token spend.

**Interactions**

- `PreInteractionData` and `PostInteractionData` - maker-defined interactions executed before and after assets transfer from maker to taker, and from taker to maker, respectively.

**Custom data**

- `CustomData` can be utilized by protocol extensions and is also passed to `takerInteraction` as part of extension calldata.

### Extensions structure

Extensions have a dynamic length and should be packed in the following structure:

- The first 32 bytes of the calldata contain offsets for the extensions calldata. The offset for a specific parameter is coded as the offset of the end of the parameter's calldata. The offset of the start of the calldata is either the offset of the previous parameter, or zero for the first one.
- Then, the extensions calldata follows correspondingly.

Offsets contain a zero-based offset in calldata for each parameter and are packed as follows:

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

The `CustomData` calldata is located after all extensions. Its start is defined as the end offset for `PostInteractionData`, and its end is the offset of the end of the calldata.

**Example**

For orders that have a predicate with a length of 120 bytes, a permit of 32 bytes included, and 32 bytes of custom data, the extension calldata should be packed as follows:

| Offsets |  | MakerPermit offset | Predicate offset |  |  |  |  | Predicate calldata | Permit calldata | Custom data calldata |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [28..31] | [24..27] | [20..23] | [16..19] | [12..15] | [8..11] | [4..7] | [0..3] | [32..151] | [152..183] | [184..216] |
| 152 | 152 | 152 | 120 | 0 | 0 | 0 | 0 | calldata (120 bytes) | calldata (32 bytes) | calldata (32 bytes) |

The following is the final calldata which includes the offsets.

```bash
#  28-31    24-27    20-23    16-19    12-15     8-11      4-7      0-3
00000098 00000098 00000098 00000078 00000000 00000000 00000000 00000000
# The offset for a specific parameter is coded as the offset of the end of the parameter's calldata.
# The offset of the start of the calldata is either the offset of the previous parameter, or zero for the first one.
#         predicate end => ^^^^^^^^ ++++++++ <= predicate starts with this offset
#   permit end => ^^^^^^^^ ++++++++ <= permit starts with this offset

# followed by
# 120 bytes of predicate calldata
# 32  bytes of permit
# 32  bytes of custom data
```

### **Non-ERC20 tokens swap**

To swap tokens with a transfer function signature that do not comply with the IERC20 interface `IERC20.transferFrom(from, to, amount)`, you need to use a proxy contract. The proxy contract takes `from`, `to`, and `amount` arguments, maps them to the token transfer function, and adds additional parameters from the suffix calldata.

In this case, `makerAsset` and/or `takerAsset` should contain the address of the proxy contract, and the token address should be encoded into the suffix with additional arguments. The suffix consists of packed bytes representing the calldata of parameters that are passed to the proxy contract.

Examples of tokens that have already implemented this method are based on the following standards:

- ERC721 - `IERC721.transferFrom(from, to, tokenId)`
- ERC1155 - `IERC1155.safeTransferFrom(from, to, tokenId, amount, data)`

To implement your custom proxy:

1. Implement a function that receives `from`, `to`, and `amount` as the first three parameters, along with additional parameters that will be passed with `makerAssetSuffix` and/or `takerAssetSuffix`.
2. Compute and select a function name whose selector matches `transferFrom(from,to,amount)`.
3. Implement your own `transferFrom` method in the function from item 2 for the token

**Implementation example**

In this example, we are using an ERC721 token proxy contract:

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

As you can see, the `amount` parameter is not used, but the function still needs to accept it. Additionally, two extra parameters, `tokenId` and `token`, are passed to the function to perform the `transferFrom` operation.

**To use this proxy, the order should:**

1. Include the proxy address in the `makerAsset` or `takerAddress` field.
2. Have the `HAS_EXTENSION` flag set.
3. Include an extension with either `makerAssetSuffix` or `takerAssetSuffix` set, with the packed `tokenId` and `token` address. This information will be passed to the proxy when the order is filled.

> Note: This extension is incompatible with the `USE_PERMIT2_FLAG` setting.
> 

**Example**

Here is the sample code that creates an order, serving as an example for the previously described `ERC721Proxy` implementation:

```javascript
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

The calldata produced by the code for the extension is:

```bash
0000008000000080000000800000008000000080000000800000008000000040
000000000000000000000000000000000000000000000000000000000000000a
0000000000000000000000005fbdb2315678afecb367f032d93f642f64180aa3
000000000000000000000000000000000000000000000000000000000000000a
000000000000000000000000e7f1725e7734ce288f8367e1bb143e90bb3f0512
```

To illustrate how it was formed, here is the calldata above, split into structured parts:

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

### Runtime exchange rate

In some scenarios, the order exchange rate is only known on-chain, for example, if the order implements Dutch auction or the maker wants to get a rate based on an oracle price. To achieve this, the maker can set getter functions to calculate the rate on-chain and then pass them to the `makerAmountGetter` and `takerAmountGetter` extensions. 

These getters are used for:

- `makerAmountGetter`, calculates the maker amount based on the provided taking amount
- `takerAmountGetter`, calculates the taker amount based on the provided making amount

Both getters should be implemented to retrieve consistent results because it is the taker who decides how the amounts are calculated (based on the making or taking amounts) when the order is executed. See the order fill for details.

Both getters extension calldata have the following structure:

| Address | Selector | Packed arguments |
| --- | --- | --- |
| 20 bytes | 4 bytes | variable size calldata |

When the order is executed and the protocol calculates the amount, the selector on the provided contract address is called, and the packed arguments are passed. Additionally the arguments calldata is extended with:

- `requestedAmount` is the requested amount to calculate making or taking amount for.
- `remainingMakingAmount` is the remaining making amount for the order, which can be different from an order's `makingAmount` if the order was partially filled previously.
- `orderHash` is the order’s hash.

Therefore, the final call would be as follows:

```solidity
address.selector(<arguments from calldata>, requestedAmount, remainingMakingAmount, orderHash)
```

The function is expected to return a `uint256` value that corresponds to the passed `requestedAmount`.

**Example**

The code creates an order that uses `RangeAmountCalculator` to calculate the making and taking amounts.

```javascript
// Order: 10 weth -> 35000 dai with price range: 3000 -> 4000
const makingAmount = ether('10');
const takingAmount = ether('35000');
const startPrice = ether('3000');
const endPrice = ether('4000');

const rangeAmountCalculator = await ethers.getContractFactory('RangeAmountCalculator');

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

The following shows how the calldata was formed by splitting it into structured parts

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

### Predicates

Predicates enable the evaluation of arbitrary on-chain conditions during order execution. They can either allow or reject order fills. 

Examples include:

- Preventing order fills until a specific date (checking the block timestamp during order execution)
- Preventing order fills if the Chainlink price is less than or equal to a certain amount

The limit order protocol offers several helper functions for creating conditions from basic primitives, allowing for the chaining of conditions to any required level of complexity.

1. **Equality**
    - `eq(uint256 value, bytes calldata data)` - returns `true` if the calldata execution result is equal to the `value`
    - `lt(uint256 value, bytes calldata data)` - returns `true` if the calldata execution result is less than the `value`
    - `gt(uint256 value, bytes calldata data)` - returns `true` if the calldata execution result is greater than the `value`
2. **Logical operators**
    - `and(uint256 offsets, bytes calldata data)` - combines several predicates and returns `true` when all predicates are valid. To prepare data for the `and` predicate, pack the predicates' calldata sequentially into the `data` variable and store their offsets as `uint32` numbers into `offsets` with the same order as the calldata was packed.
    
        > **Note:** The `and` predicate is limited to 8 operands. Chain several predicates together to extend the limit.
        > 

        **Packing example**

        For `and(predicate1, predicate2, predicate3)`, where:

        | Predicate | Length |
        | --- | --- |
        | predicate1 | 64 bytes |
        | predicate2 | 256 bytes |
        | predicate3 | 128 bytes |

        The structure of calldata and offsets will be the following:
    
        | calldata |  |  |
        | --- | --- | --- |
        | 1-64 bytes | 65-320 bytes | 321-448 bytes |
        | calldata (predicate1) | calldata (predicate2) | calldata (predicate3) |

        | offsets (uint256) |  |  |  |
        | --- | --- | --- | --- |
        | 12-32 bytes | 9-12 byte | 5-8 byte | 1-4 byte |
        | 00…000 | 448 (predicate3 offset) | 320 (predicate2 offset) | 64 (predicate1 offset) |

        The final calldata for the predicate in hexadecimal is

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

    - `or(uint256 offsets, bytes calldata data)` - combines several predicates and returns `true` when at least one predicate is valid. The packing logic is the same as for the `and` predicate.
        
        > **Note:** The `or` predicate is limited to 8 operands. To extend the limit, chain several `or` predicates.
        > 
    
    - `not(bytes calldata data)` - returns `true` if the calldata execution result is 0.

3. Custom conditions
    - `arbitraryStaticCall(address target, bytes calldata data)` - executes the `calldata` on a third-party contract (`target`) and should return a `uint256` number.
        
        > **Note:** The call is executed using `staticcall` and will revert if any state changes occur. Therefore, only view calls are permitted.
        > 
        

**Example 1**

Stop-loss and take profit conditions can be set for a limit order:

```javascript
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
// 2. Create calldata for condition that price should be less than 1000
const comparelt = swap.interface.encodeFunctionData('lt', [ether('1000'), priceCall])
// 3. Create calldata for condition that price should be more than 2000
const comparegt = swap.interface.encodeFunctionData('gt', [ether('2000'), priceCall])
// 4. Add `or` condition (joinStaticCalls - concatenates calldata)
const { offsets, data } = joinStaticCalls([comparelt, comparegt]);
predicate = swap.interface.encodeFunctionData('or', [offsets, data]);
```

> **Note**: To use predicates, the `HAS_EXTENSIONS` flag must be set to true. Otherwise, if a predicate is defined for an order and the flag is not set, order fill will be reverted.
> 

**Example 2**

The example demonstrates the principles of how the predicate calldata is assembled. The only extension to the order is the predicate assembled by the code below:

```javascript
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

The calldata produced by the code is:

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

The calldata is split into structured parts below to illustrate how it was formed. The length in bytes for each calldata string is also provided.

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

### Interactions

Interactions are callbacks that enable the execution of arbitrary code, which is provided by the maker’s order or taker’s fill execution. 

The order execution logic includes several steps that also involve interaction calls:

1. Validate the order
2. **Call the maker's pre-interaction**
3. Transfer the maker's asset to the taker
4. **Call the taker's interaction**
5. Transfer the taker's asset to the maker
6. **Call the maker's post-interaction**
7. Emit the OrderFilled event

Calls are executed in the context of the limit order protocol. The target contract should implement the `IPreInteraction` or `IPostInteraction` interfaces for the maker's pre- and post-interactions and the `ITakerInteraction` interface for the taker's interaction. These interfaces declare the single callback function for maker and taker interactions, respectively.

Here is how the maker’s pre- & post- interactions and the taker’s interaction are defined in the interfaces:

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

In all cases, the callback function receives an order, its parameters, and additional calldata for interaction.

| Parameter | Type | Description |
| --- | --- | --- |
| order | IOrderMixin.Order | Basic order structure |
| orderHash | `bytes32` | The order hash, which is calculated as<br/>`orderHash = order.hash(_domainSeparatorV4())` |
| taker | `address` | The address of the taker who is filling the order |
| makingAmount | `uint256` | The actual amount of the making asset to fill. It may differ from Order.makingAmount if partial fills are allowed. |
| takingAmount | `uint256` | The actual amount of the taking asset to fill. It may differ from Order.takingAmount if partial fills are allowed. |
| remainingMakingAmount | `uint256` | The remaining amount left to fill for the order. It may differ from Order.makingAmount if the order has already been partially filled |
| extraData | `bytes` | Additional calldata passed to interaction.   |

The `offeredTakingAmount` is also returned in the taker’s interaction. This value can be used to improve the rate for the maker, provided that the `NO_IMPROVE_RATE` flag is not set in the order. If the returned value is less than the required `takingAmount`, the protocol ignores it and fills the order using the calculated `takingAmount`. 

The maker's interactions are defined in the order extensions `PreInteractionData` and `PostInteractionData`. The calldata is structured as follows:

- The first 20 bytes of the calldata is the callback address.
- The following bytes are extra calldata to be passed to the interaction.

> **Note:** To set up maker's interaction, the flag `HAS_EXTENSION` must be set and `PreInteractionData` and/or `PostInteractionData` must contain interaction calldata.
> 

The taker's interaction follows the same structure (20 bytes address and extra calldata), but is passed to the protocol when a taker fills an order.

**Example**

For the code that builds interactions as:

```javascript
// interactions is a contract that implements
// IPreInteraction, IPostInteraction, ITakerInteraction interfaces
const preInteraction = interactions.address + abiCoder.encode(['uint256'], [1]).substring(2);
const postInteraction = interactions.address + abiCoder.encode(['uint256'], [4]).substring(2);
const takerInteraction = interactions.address + abiCoder.encode(['uint256'], [3]).substring(2);
```

The extension's calldata for this order will be:

```bash
0000006800000034000000000000000000000000000000000000000000000000
0165878A594ca255338adfa4d48449f69242Eb8F000000000000000000000000
00000000000000000000000000000000000000010165878A594ca255338adfa4
d48449f69242Eb8F000000000000000000000000000000000000000000000000
0000000000000004
```

The above calldata is structured as:

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

In addition, the `takerInteraction` will be:

```bash
# takerInteraction calldata
# target address
0165878A 594ca255 338adfa4 d48449f6 9242Eb8F
# extraData passed to the call
00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000003
```

# Filling an order

## How to fill an order

To fill an order, a taker should call one of the functions defined in the `IOrderMixin` interface and supply the order along with any extensions, the filling amount, a signature, and taker filling options. The functions defined by the interface vary, depending on: whether the order is filled with or without extensions, whether the taker is the fund receiver or not, and whether the order is filled with the taker's permit or not. 

The full list is as follows:

- `fillOrder` - fills a simple order without extensions, taker interaction, and changing target.
- `fillOrderArgs` - allows the specification of extensions taker interaction used for the order and maker asset target specification.
- `fillContractOrder` - the same as `fillOrder`, but uses contract-based signatures.
- `fillContractOrderArgs` - the same as `fillOrderArgs`, but uses contract-based signatures .

All the functions have a similar signature. The difference between functions with and without args  is that args calldata can be omitted to save gas. Here are examples showing the possible arguments and their descriptions:

```solidity
// Fill from EOA
function fillOrderArgs(
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        TakerTraits takerTraits,
        bytes calldata args,
    ) public payable returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash)

// Fill from smart contract
function fillContractOrderArgs(
        IOrderMixin.Order calldata order,
        bytes calldata signature,
        uint256 amount,
        TakerTraits takerTraits,
        bytes calldata args,
    ) public returns(uint256 makingAmount, uint256 takingAmount, bytes32 orderHash)
```

| Argument | Type | Description |
| --- | --- | --- |
| order | `Order` (calldata) | The order structure to be filled.  |
| r | `bytes32` | The r-component of the maker’s signature to check that the order hash is signed by the maker. |
| vs | `bytes32` | The vs-component of the maker’s signature to check that the order hash is signed by the maker. |
| signature | `bytes calldata` | The signature used to verify the order. It is used for contract-signed orders only. See [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) for validation details. |
| amount | `uint256` | The amount to fill the order, which can be treated as the maker or taker amount, depending on fill settings. If the amount is greater than the remaining amount to fill, the fill will be executed only for the remaining amount. When partial fills are not allowed, the fill will be reverted if the amount does not equal the order making amount. The fill will also be reverted if calculated making or taking amounts are equal to zero. |
| takerTraits | `TakerTraits` (uint256) | The taker’s setting for the order fill. See [Fill settings](#fill-settings) for details. |
| target | `address` | The recipient address for maker assets transfer. |
| args | `bytes calldata` | The calldata with order extension, taker interaction to execute during the fill, and target for maker assets transfer if needed. For an extension keccak256 hash has to be equal to the 160-lower bit of order’s salt. |

The return values are:

| Return value | Type | Description |
| --- | --- | --- |
| makingAmount | `uint256` | The actual amount the maker received  |
| takingAmount | `uint256` | The actual amount the taker received |
| orderHash | `bytes32` | The hash of the order |

The `args` calldata has flexible structure which is defined by `TakerTraits` and contains:

| Parameter | Size | Comment |
| --- | --- | --- |
| target | 20 bytes | The address to transfer maker funds to. |
| extension | variable length | The order’s extension calldata. The extension’s keccak256 hash has to be equal to the 160-lower bit of order’s salt. See [Order extensions](#order-extensions) section for details|
| takerInteraction | variable length | The taker interaction to execute during the fill. See [Interactions](#interactions) section for details. |

The parameters in the calldata are packed sequentially according to the `TakerTraits` settings: `ARGS_HAS_TARGET`, `ARGS_EXTENSION_LENGTH`, `ARGS_INTERACTION_LENGTH`

## Fill settings

The `takerTraits` argument provides a number of options for the taker to choose from during each fill. These options are stored as bit flags and numbers compacted in a `uint256` number. The bit flags in `takerTraits` are arranged in descending order of significance, with the highest bit first, starting from zero.



| Option name | Bit position | Size, bits | Description |
| --- | --- | --- | --- |
| MAKER_AMOUNT_FLAG | 255 bit | 1 | If set, the protocol implies that the passed amount is the making amount, and the taking amount will be calculated based on the making amount. Otherwise, the passed amount is the taking amount, and the making amount is calculated based on the taking amount. The amount is calculated with AmountCalculator if getters are not set, or with getters provided with an extension by the maker. |
| UNWRAP_WETH_FLAG | 254 bit | 1 | If set, the WETH will be unwrapped into ETH before sending to the taker's target address. |
|  | 253 bit | 1 | Unused |
| USE_PERMIT2_FLAG | 252 bit | 1 | If set, the order uses the [Uniswap Permit 2](https://github.com/Uniswap/permit2). |
| ARGS_HAS_TARGET | 251 bit | 1 | If set, then first 20 bytes of args are treated as target address for maker’s funds transfer |
| ARGS_EXTENSION_LENGTH | 224-247 | 24 | Extension calldata coded in args argument length |
| ARGS_INTERACTION_LENGTH | 200-223 | 24 | Taker’s interaction calldata coded in args argument length |
| THRESHOLD | 0-184 | 184 | Depending on the MAKER_AMOUNT_FLAG, this can be the maximum amount the taker agrees to give in exchange for the making amount (flag is 1) or the minimum amount the taker agrees to receive (flag is 0). If the calculated taker amount does not satisfy the threshold, then the transaction will be reverted. A zero (0) threshold skips the check. To pass the check the equation should be evaluated to `true`.<br/>For flag = 1<br/>$$  threshold ≥ amount*{takingAmount \over makingAmount} $$<br/>For flag = 0<br/>$$  threshold ≤ amount*{makingAmount \over takingAmount } $$ |

# Cancelling an order

There are several ways to cancel an order:

### Automatically (indirect ways)

- **Cancel by expiration deadline**: The simplest way to cancel an order automatically is to set an expiration deadline using the order's `MakerTraits`. Once the expiration date has passed, it is no longer possible to fill the order. Any fill attempts will be reverted with an `OrderExpired` error.
- **Cancellation by a condition defined in a predicate**: If the condition defined by the order's predicate starts evaluating to false on each check, the order becomes obsolete and cannot be filled anymore. Any fill attempts will be reverted with a `PredicateIsNotTrue` error.

### Manually (direct ways)

Manual methods require sending a cancel transaction, which requires spending gas.

- **Cancel by hash or nonce:** The order can be cancelled by directly calling the `cancelOrder` function and passing the `orderHash` and `makerTraits` of the order.

    > **Note**: Orders are cancelled using different invalidators depending on the maker traits flags `ALLOW_MULTIPLE_FILLS` and `NO_PARTIAL_FILL`. Passing wrong traits may result in the call having no effect, and the order will not be cancelled.
    > 

    If partial or multiple fills are not allowed then the protocol uses `BitInvalidator` for cancelling an order, and `RemainingInvalidator` otherwise.
    Thus, if an order uses `BitInvalidator` it will be cancelled by nonce provided in `makerTraits` argument, and if it uses `RemainingInvalidator` it will be cancelled by provided `orderHash`.
    The cancelled order fill attempts will be reverted with a `BitInvalidatedOrder` error if an order uses `BitInvalidator`, or with an `InvalidatedOrder` error otherwise.

- **Cancel by epoch:** the order is cancelled by changing the owner's current epoch. This method can be used for mass order cancellation. Each order can have a series and epochs specified. They are defined as:
    - **series** - specifies the application that issued the order
    - **epoch** - specifies the order’s generation

    At the same time, each maker has a unique nonce set for each series, which can be incremented up to 255 units. When the order’s flag `NEED_CHECK_EPOCH_MANAGER` is set, the protocol checks if the maker’s epoch matches the order’s epoch and reverts with a `WrongSeriesNonce` error if it doesn’t. This allows for mass cancellation. For example, if a maker issued several orders with his actual epoch for a specific series, and later maker’s epoch was increased for that series, the order’s epoch doesn’t equal the maker epoch anymore and the orders cannot be filled.

    > **Note:** To use epoch cancellation, the flag `NEED_CHECK_EPOCH_MANAGER` must be set, and partial and multiple fills should be allowed. Otherwise, any order fill attempt will be reverted with an `EpochManagerAndBitInvalidatorsAreIncompatible` error.
    > 

    At the start, each maker has an epoch equal to zero for all series. To update the maker's epoch, they should call either `increaseEpoch` or `advanceEpoch`. The former increases the epoch by 1 unit, while the latter can increase it by any amount up to 256 units.

    This concept also allows for the preparation of a sequence of orders with an increasing epoch and increase epoch under some condition to make the following orders valid. For example, there are two orders with epochs 0 and 1, correspondingly. And the maker sets up post-interaction that increases his actual epoch by 1 when the order is filled. In this case, at the start, the maker has an actual epoch equal to zero, and anybody can fill the first order, but not the second order. However, when the first order is filled, the post-interaction changes the actual maker's epoch to 1, and the second order becomes valid.
