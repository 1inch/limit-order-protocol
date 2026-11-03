# Deployments

Addresses of contracts deployed from this repository. Preferred over scattering the same tables in the README.

The Limit Order Protocol v4 ships as part of the 1inch Aggregation Router v6, so the protocol and the router share one address on each network. HyperEVM and zkSync Era do not use the shared address. The verifying contract is part of the EIP-712 domain an order is signed against, so always take the address of the network you are signing for.

Helper and extension addresses come from the hardhat-deploy records under `deployments/<network>/`.

TODO(repository-review): the `deployments/` records also hold standalone `LimitOrderProtocol` (and `LimitOrderProtocolPro`) deployments that predate v4 (for example Ethereum `0x119c71D3BbAC22029622cbaEc24854d3D32D2828`, compiled with solc 0.8.10). They are left out here until the team confirms which version each one is. The Avalanche `SafeOrderBuilder` record repeats the `OrderRegistrator` address and is left out for the same reason. The Cronos chain id (25) could not be confirmed from a repository source; confirm before relying on it.

## Ethereum (1)

| Contract | Address |
|---|---|
| LimitOrderProtocol v4 (inside Aggregation Router v6) | `0x111111125421cA6dc452d289314280a0f8842A65` |
| FeeTaker | `0xc0DFdB9E7a392c3dBBE7c6FBe8FBC1789C9FE05e` |
| NativeOrderFactory | `0xe12E0f117d23a5ccc57f8935CD8c4E80cD91FF01` |
| OrderRegistrator | `0x2339f78e2Ec15C47Cf042F2460C532C0D7ff1CCE` |
| SafeOrderBuilder | `0x370De82413251A9d204DCEAB50dB2d7ec3Bd1769` |
| SeriesNonceManager | `0x303389f541FF2D620E42832F180A08E767B28E10` |
| PriorityFeeLimiter | `0x5E92d4021e49f9A2967b4EA1d20213B3A1c7c912` |

## BNB Smart Chain (56)

| Contract | Address |
|---|---|
| LimitOrderProtocol v4 (inside Aggregation Router v6) | `0x111111125421cA6dc452d289314280a0f8842A65` |
| FeeTaker | `0xc0DFdB9E7a392c3dBBE7c6FBe8FBC1789C9FE05e` |
| NativeOrderFactory | `0xe12E0f117d23a5ccc57f8935CD8c4E80cD91FF01` |
| OrderRegistrator | `0x2339f78e2Ec15C47Cf042F2460C532C0D7ff1CCE` |
| SafeOrderBuilder | `0x370De82413251A9d204DCEAB50dB2d7ec3Bd1769` |
| SeriesNonceManager | `0x58Ce0e6eF670c9a05622F4188Faa03a9E12ee2e4` |

## Polygon (137)

| Contract | Address |
|---|---|
| LimitOrderProtocol v4 (inside Aggregation Router v6) | `0x111111125421cA6dc452d289314280a0f8842A65` |
| FeeTaker | `0xc0DFdB9E7a392c3dBBE7c6FBe8FBC1789C9FE05e` |
| NativeOrderFactory | `0xe12E0f117d23a5ccc57f8935CD8c4E80cD91FF01` |
| OrderRegistrator | `0x2339f78e2Ec15C47Cf042F2460C532C0D7ff1CCE` |
| SafeOrderBuilder | `0x370De82413251A9d204DCEAB50dB2d7ec3Bd1769` |
| SeriesNonceManager | `0xa5eb255EF45dFb48B5d133d08833DEF69871691D` |

## Optimism (10)

| Contract | Address |
|---|---|
| LimitOrderProtocol v4 (inside Aggregation Router v6) | `0x111111125421cA6dc452d289314280a0f8842A65` |
| FeeTaker | `0xc0DFdB9E7a392c3dBBE7c6FBe8FBC1789C9FE05e` |
| NativeOrderFactory | `0xe12E0f117d23a5ccc57f8935CD8c4E80cD91FF01` |
| OrderRegistrator | `0x2339f78e2Ec15C47Cf042F2460C532C0D7ff1CCE` |
| SafeOrderBuilder | `0x370De82413251A9d204DCEAB50dB2d7ec3Bd1769` |
| SeriesNonceManager | `0x32d12a25f539E341089050E2d26794F041fC9dF8` |

## Arbitrum One (42161)

| Contract | Address |
|---|---|
| LimitOrderProtocol v4 (inside Aggregation Router v6) | `0x111111125421cA6dc452d289314280a0f8842A65` |
| FeeTaker | `0xc0DFdB9E7a392c3dBBE7c6FBe8FBC1789C9FE05e` |
| NativeOrderFactory | `0xe12E0f117d23a5ccc57f8935CD8c4E80cD91FF01` |
| OrderRegistrator | `0x2339f78e2Ec15C47Cf042F2460C532C0D7ff1CCE` |
| SafeOrderBuilder | `0x370De82413251A9d204DCEAB50dB2d7ec3Bd1769` |
| SeriesNonceManager | `0xD7936052D1e096d48C81Ef3918F9Fd6384108480` |

## Gnosis Chain (100)

| Contract | Address |
|---|---|
| LimitOrderProtocol v4 (inside Aggregation Router v6) | `0x111111125421cA6dc452d289314280a0f8842A65` |
| FeeTaker | `0xc0DFdB9E7a392c3dBBE7c6FBe8FBC1789C9FE05e` |
| NativeOrderFactory | `0xe12E0f117d23a5ccc57f8935CD8c4E80cD91FF01` |
| OrderRegistrator | `0x2339f78e2Ec15C47Cf042F2460C532C0D7ff1CCE` |
| SafeOrderBuilder | `0x370De82413251A9d204DCEAB50dB2d7ec3Bd1769` |
| SeriesNonceManager | `0x11431a89893025D2a48dCA4EddC396f8C8117187` |

## Avalanche (43114)

| Contract | Address |
|---|---|
| LimitOrderProtocol v4 (inside Aggregation Router v6) | `0x111111125421cA6dc452d289314280a0f8842A65` |
| FeeTaker | `0xc0DFdB9E7a392c3dBBE7c6FBe8FBC1789C9FE05e` |
| NativeOrderFactory | `0xe12E0f117d23a5ccc57f8935CD8c4E80cD91FF01` |
| OrderRegistrator | `0x2339f78e2Ec15C47Cf042F2460C532C0D7ff1CCE` |
| SeriesNonceManager | `0x2EC255797FEF7669fA243509b7a599121148FFba` |

## Fantom (250)

| Contract | Address |
|---|---|
| LimitOrderProtocol v4 (inside Aggregation Router v6) | `0x111111125421cA6dc452d289314280a0f8842A65` |
| FeeTaker | `0x01e520D4E77DBe6833c8257cb8a05DbD24a4D332` |
| OrderRegistrator | `0x2339f78e2Ec15C47Cf042F2460C532C0D7ff1CCE` |
| SafeOrderBuilder | `0x370De82413251A9d204DCEAB50dB2d7ec3Bd1769` |
| SeriesNonceManager | `0x7871769b3816b23dB12E83a482aAc35F1FD35D4B` |

## Aurora (1313161554)

| Contract | Address |
|---|---|
| LimitOrderProtocol v4 (inside Aggregation Router v6) | `0x111111125421cA6dc452d289314280a0f8842A65` |
| FeeTaker | `0xc0DFdB9E7a392c3dBBE7c6FBe8FBC1789C9FE05e` |
| OrderRegistrator | `0x2339f78e2Ec15C47Cf042F2460C532C0D7ff1CCE` |
| SafeOrderBuilder | `0x370De82413251A9d204DCEAB50dB2d7ec3Bd1769` |
| SeriesNonceManager | `0x7F069df72b7A39bCE9806e3AfaF579E54D8CF2b9` |

## Kaia (8217)

| Contract | Address |
|---|---|
| LimitOrderProtocol v4 (inside Aggregation Router v6) | `0x111111125421cA6dc452d289314280a0f8842A65` |
| FeeTaker | `0xc0DFdB9E7a392c3dBBE7c6FBe8FBC1789C9FE05e` |
| OrderRegistrator | `0x2339f78e2Ec15C47Cf042F2460C532C0D7ff1CCE` |
| SafeOrderBuilder | `0x370De82413251A9d204DCEAB50dB2d7ec3Bd1769` |
| SeriesNonceManager | `0x7871769b3816b23dB12E83a482aAc35F1FD35D4B` |

## Base (8453)

| Contract | Address |
|---|---|
| LimitOrderProtocol v4 (inside Aggregation Router v6) | `0x111111125421cA6dc452d289314280a0f8842A65` |
| FeeTaker | `0xc0DFdB9E7a392c3dBBE7c6FBe8FBC1789C9FE05e` |
| NativeOrderFactory | `0xe12E0f117d23a5ccc57f8935CD8c4E80cD91FF01` |
| OrderRegistrator | `0x2339f78e2Ec15C47Cf042F2460C532C0D7ff1CCE` |
| SafeOrderBuilder | `0x370De82413251A9d204DCEAB50dB2d7ec3Bd1769` |
| SeriesNonceManager | `0xD9Cc0A957cAC93135596f98c20Fbaca8Bf515909` |

## Linea (59144)

| Contract | Address |
|---|---|
| LimitOrderProtocol v4 (inside Aggregation Router v6) | `0x111111125421cA6dc452d289314280a0f8842A65` |
| FeeTaker | `0xc0DFdB9E7a392c3dBBE7c6FBe8FBC1789C9FE05e` |
| NativeOrderFactory | `0xe12E0f117d23a5ccc57f8935CD8c4E80cD91FF01` |
| OrderRegistrator | `0xb81e7Ab02D761D3C250169619d5599dde07d8E80` |
| SafeOrderBuilder | `0x7Be0Cc9D2690933445cA56dB217e1366BF68841c` |
| SeriesNonceManager | `0xE93293A6088d3a8abDDf62e6CA1A085Cec97D06F` |

## Sonic (146)

| Contract | Address |
|---|---|
| LimitOrderProtocol v4 (inside Aggregation Router v6) | `0x111111125421cA6dc452d289314280a0f8842A65` |
| FeeTaker | `0xc0DFdB9E7a392c3dBBE7c6FBe8FBC1789C9FE05e` |
| NativeOrderFactory | `0xe12E0f117d23a5ccc57f8935CD8c4E80cD91FF01` |
| OrderRegistrator | `0xE4E0552452e5cC1306A2bF5B2Fd9b1eA19418795` |
| SafeOrderBuilder | `0x3193c5Ce03359E7Ce5C21B4524087CDd1B9d76f7` |
| SeriesNonceManager | `0xE9bb60e96c40F35CdC4e84db85Ac0BFad63120ba` |

## Unichain (130)

| Contract | Address |
|---|---|
| LimitOrderProtocol v4 (inside Aggregation Router v6) | `0x111111125421cA6dc452d289314280a0f8842A65` |
| FeeTaker | `0xc0DFdB9E7a392c3dBBE7c6FBe8FBC1789C9FE05e` |
| NativeOrderFactory | `0xe12E0f117d23a5ccc57f8935CD8c4E80cD91FF01` |
| OrderRegistrator | `0x929d800861d4da158A8FEdeAE119cF219658a617` |
| SafeOrderBuilder | `0xE4E0552452e5cC1306A2bF5B2Fd9b1eA19418795` |
| SeriesNonceManager | `0x9488795C688d0AAe98F2056467C13a051C954657` |

## Cronos (25)

| Contract | Address |
|---|---|
| LimitOrderProtocol v4 (inside Aggregation Router v6) | `0x111111125421cA6dc452d289314280a0f8842A65` |

## Monad (143)

| Contract | Address |
|---|---|
| LimitOrderProtocol v4 (inside Aggregation Router v6) | `0x111111125421cA6dc452d289314280a0f8842A65` |

## HyperEVM (999)

| Contract | Address |
|---|---|
| LimitOrderProtocol v4 (inside Aggregation Router v6) | `0x5281602aDc446A94eb48D055f514A6d8D5bee176` |

## zkSync Era (324)

| Contract | Address |
|---|---|
| LimitOrderProtocol v4 (inside Aggregation Router v6) | `0x6fd4383cB451173D5f9304F041C7BCBf27d561fF` |
| FeeTaker | `0xC9dEf4d74915cd48e49D2EF9d3E1B30E8C1fbfAb` |
| NativeOrderFactory | `0xFd1d18173D2f179a45Bf21F755a261AAe7C2d769` |
