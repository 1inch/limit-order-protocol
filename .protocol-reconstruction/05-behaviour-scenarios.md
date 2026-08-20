# 05 — Behaviour scenarios

Phase 5, under [`references/bdd-policy.md`](../.agents/skills/solidity-protocol-reconstruction-orchestrator/references/bdd-policy.md).
Gherkin here is living documentation, not an executable artifact. No Cucumber or
BDD runner is proposed; the link to tests is the `SCN-*` tag in the test title
plus the row in `08-traceability-matrix.md`.

42 scenarios. Every scenario states actual behaviour, because Gate A produced no
`CODE_BUG` decision — nothing here is expected to fail against current code.

## Example Mapping summary

| Card type | Count | Disposition |
|---|---|---|
| Rules | 46 | The Phase 2 requirements |
| Examples | 42 | The scenarios below |
| Questions | 3 | `OQ-2`, `OQ-3`, `OQ-4` in `STATUS.md`; none became a scenario |
| Assumptions | 13 | `A1`-`A13` in `architecture/04-assets-math-and-assumptions.md` |

Three rules produced no example and are recorded here rather than silently
dropped: `INT-007` (getter consistency) is unenforceable by the protocol, so its
example is a property test rather than a scenario; `ECON-003` and `ECON-004`
depend on `OQ-3` for their intended semantics and are pinned by characterization
instead.

---

## Order identity and extension binding

```gherkin
@SCN-001 @FR-ORDER-001 @EP-001
Scenario: The same order on two chains has two identities
  Given maker signs an order for 1000 DAI against 1 WETH on chain 1
  When the identical order fields are hashed by the deployment on chain 137
  Then the two order hashes differ
  And the chain-1 signature does not authorise a fill on chain 137

@SCN-002 @FR-ORDER-002 @EP-002
Scenario: An order declaring an extension cannot be filled without one
  Given maker signs an order that declares it has an extension
  When taker calls fill supplying no extension bytes
  Then the call reverts with MissingOrderExtension
  And no tokens are transferred

@SCN-003 @FR-ORDER-002 @EP-002
Scenario: A substituted extension is rejected
  Given maker signs an order committing to an extension with a predicate
  And taker constructs a different extension with no predicate
  When taker calls fill supplying the substituted extension
  Then the call reverts with InvalidExtensionHash
  And no tokens are transferred

@SCN-004 @FR-ORDER-002 @EP-002
Scenario: An extension supplied for an order that declares none is rejected
  Given maker signs an order that declares no extension
  When taker calls fill supplying 32 bytes of extension data
  Then the call reverts with UnexpectedOrderExtension

@SCN-005 @FR-ORDER-003 @EP-001
Scenario: An order with no named receiver pays the maker
  Given maker signs an order for 1000 DAI against 1 WETH with the receiver left empty
  When taker fills the order completely
  Then maker's WETH balance increases by 1 WETH
  And no tokens are sent to the zero address
```

## Authorisation

```gherkin
@SCN-006 @ACC-001 @EP-001
Scenario: A signature from another account is rejected
  Given maker signs an order for 1000 DAI against 1 WETH
  And attacker produces a signature over the same order hash using attacker's key
  When taker calls fill with attacker's signature
  Then the call reverts with BadSignature
  And no tokens are transferred

@SCN-007 @ACC-001 @EP-001
Scenario: The signature is checked only on the first fill
  Given maker signs an order for 1000 DAI allowing partial and multiple fills
  And taker has filled 400 DAI of the order with a valid signature
  When taker fills a further 300 DAI supplying signature bytes of all zeroes
  Then the fill succeeds
  And maker's DAI balance decreases by a further 300 DAI

@SCN-008 @ACC-001 @EP-003
Scenario: A contract maker that declines the signature blocks the fill
  Given a contract maker whose signature validation returns a value other than the ERC-1271 magic value
  When taker calls the contract fill entry point
  Then the call reverts with BadSignature

@SCN-009 @ACC-002 @EP-001
Scenario: A private order rejects an unnamed taker
  Given maker signs an order naming resolver A as the only allowed sender
  When resolver B calls fill with a valid signature
  Then the call reverts with PrivateOrder
  And no tokens are transferred

@SCN-010 @ACC-002 @EP-001
Scenario: A private order accepts the named taker
  Given maker signs an order naming resolver A as the only allowed sender
  When resolver A calls fill with a valid signature
  Then the fill succeeds
```

## Amounts, rounding and thresholds

```gherkin
@SCN-011 @MATH-001 @EP-001
Scenario: The making amount rounds down
  Given maker signs an order offering 3 units of token A for 2 units of token B
  When taker fills requesting to give 1 unit of token B
  Then taker receives 1 unit of token A
  And taker does not receive 2 units of token A

@SCN-012 @MATH-002 @EP-001
Scenario: The taking amount rounds up
  Given maker signs an order offering 2 units of token A for 3 units of token B
  When taker fills requesting to take 1 unit of token A
  Then taker pays 2 units of token B
  And taker does not pay 1 unit of token B

@SCN-013 @MATH-003 @EP-001
Scenario Outline: The taker's maximum payment is enforced at the boundary
  Given maker signs an order whose computed taking amount for the requested fill is 1000 DAI
  When taker fills by making amount with a threshold of <threshold> DAI
  Then the outcome is <outcome>

  Examples:
    | threshold | outcome                                   |
    | 999       | the call reverts with TakingAmountTooHigh |
    | 1000      | the fill succeeds                         |
    | 1001      | the fill succeeds                         |
    | 0         | the fill succeeds with no price check     |

@SCN-014 @MATH-004 @EP-001
Scenario Outline: The taker's minimum receipt is enforced at the boundary
  Given maker signs an order whose computed making amount for the requested fill is 1 WETH
  When taker fills by taking amount with a threshold of <threshold>
  Then the outcome is <outcome>

  Examples:
    | threshold     | outcome                                  |
    | 1 WETH plus 1 | the call reverts with MakingAmountTooLow |
    | 1 WETH        | the fill succeeds                        |
    | 1 WETH less 1 | the fill succeeds                        |
    | 0             | the fill succeeds with no price check    |

@SCN-015 @FR-FILL-004 @EP-001
Scenario: A fill computing zero on either side is rejected
  Given maker signs an order whose price causes the counter-amount to floor to zero for a dust fill
  When taker fills for that dust amount
  Then the call reverts with SwapWithZeroAmount
  And the order remains fillable at its original remaining amount

@SCN-016 @FR-FILL-003 @EP-001
Scenario: An all-or-nothing order rejects a partial fill
  Given maker signs an order for 1000 DAI that disallows partial fills
  When taker fills for 500 DAI
  Then the call reverts with PartialFillNotAllowed
  And the order remains unfilled
```

## Fill sequencing and callbacks

```gherkin
@SCN-017 @FR-FILL-002 @INT-001 @EP-002
Scenario: The maker's pre-interaction runs before either transfer
  Given maker signs an order with a pre-interaction pointed at an observing contract
  When taker fills the order
  Then the observing contract records that neither maker nor taker balance has changed at the time it ran

@SCN-018 @FR-FILL-002 @EP-002
Scenario: The taker's interaction runs between the two transfers
  Given maker signs an order and taker supplies an observing taker interaction
  When taker fills the order
  Then the observing contract records that the maker's asset has arrived and the taker's asset has not yet left

@SCN-019 @FR-FILL-002 @INT-001 @EP-002
Scenario: The maker's post-interaction runs after both transfers
  Given maker signs an order with a post-interaction pointed at an observing contract
  When taker fills the order
  Then the observing contract records that both transfers have settled

@SCN-020 @FR-FILL-001 @EP-001
Scenario: A failure on the taker's leg rolls back the maker's leg
  Given maker signs an order for 1000 DAI against 1 WETH
  And taker has approved only 0.5 WETH to the protocol
  When taker fills the order completely
  Then the call reverts with TransferFromTakerToMakerFailed
  And maker's DAI balance is unchanged
  And the order remains unfilled

@SCN-021 @INT-001 @EP-002
Scenario: A callback built to the old seven-argument shape breaks the fill
  Given maker signs an order with a post-interaction pointed at a contract implementing the callback without the extension parameter
  When taker fills the order
  Then the call reverts
  And no tokens are transferred

@SCN-022 @INT-002 @EP-002
Scenario: A value returned by the taker interaction is ignored
  Given maker signs an order whose computed taking amount is 1000 DAI
  And taker supplies an interaction contract that returns 1 as though offering a better rate
  When taker fills the order
  Then taker pays exactly 1000 DAI
  And the fill event reports 1000 DAI
```

## Invalidation and cancellation

```gherkin
@SCN-023 @FR-CANCEL-001 @STATE-001 @EP-005
Scenario: A cancelled order cannot be filled
  Given maker signs an order for 1000 DAI
  And maker cancels the order
  When taker calls fill with a valid signature
  Then the call reverts with InvalidatedOrder
  And no tokens are transferred

@SCN-024 @FR-CANCEL-001 @EP-005
Scenario: Cancelling with another maker's order hash has no effect on that maker
  Given maker A signs an order and publishes its hash
  When maker B calls cancel supplying maker A's order hash and traits
  Then the call succeeds
  And maker A's order remains fillable

@SCN-025 @STATE-003 @EP-001
Scenario: A single-fill order cannot be filled twice
  Given maker signs an order for 1000 DAI that disallows multiple fills
  And taker has filled the order completely
  When taker calls fill again with the same signature
  Then the call reverts with BitInvalidatedOrder

@SCN-026 @STATE-002 @EP-001
Scenario: The remaining amount decreases by exactly the amount filled
  Given maker signs an order for 1000 DAI allowing partial and multiple fills
  When taker fills 300 DAI and then fills a further 300 DAI
  Then the order's remaining amount is 400 DAI
  And the sum of all fills is 600 DAI

@SCN-027 @STATE-002 @EP-001
Scenario: An exhausted order rejects further fills
  Given maker signs an order for 1000 DAI allowing partial fills
  And taker has filled the full 1000 DAI across three fills
  When taker attempts a further fill of 1 DAI
  Then the call reverts with InvalidatedOrder

@SCN-028 @FR-CANCEL-003 @EP-007
Scenario: A maker invalidates several nonces in one call
  Given maker has three unfilled single-fill orders using nonces 5, 6 and 7 in the same slot
  When maker mass-invalidates nonce 5 with a mask covering nonces 6 and 7
  Then all three orders become unfillable
  And no previously invalidated nonce becomes usable again

@SCN-029 @FR-CANCEL-002 @EP-006
Scenario: Mismatched array lengths cancel nothing
  Given maker has two unfilled orders
  When maker calls batch cancel with two trait entries and one order hash
  Then the call reverts with MismatchArraysLengths
  And both orders remain fillable
```

## Time, expiry and epochs

```gherkin
@SCN-030 @TIME-001 @EP-001
Scenario Outline: Expiry is inclusive of its own second
  Given maker signs an order expiring at timestamp 1700000000
  And the current block timestamp is <now>
  When taker calls fill with a valid signature
  Then the outcome is <outcome>

  Examples:
    | now        | outcome                             |
    | 1699999999 | the fill succeeds                   |
    | 1700000000 | the fill succeeds                   |
    | 1700000001 | the call reverts with OrderExpired  |

@SCN-031 @TIME-001 @EP-001
Scenario: An order with no expiry never expires
  Given maker signs an order with the expiration field left at zero
  And the current block timestamp is ten years after signing
  When taker calls fill with a valid signature
  Then the fill succeeds

@SCN-032 @STATE-004 @TIME-002 @EP-008
Scenario: Advancing an epoch invalidates that series in bulk
  Given maker has signed five orders in series 1 at epoch 0, all epoch-checked
  When maker increases the epoch for series 1
  Then all five orders revert with WrongSeriesNonce when filled
  And maker's orders in series 2 remain fillable

@SCN-033 @STATE-004 @EP-001
Scenario: Epoch checking is incompatible with single-fill orders
  Given maker signs an order that is epoch-checked and disallows partial fills
  When taker calls fill with a valid signature
  Then the call reverts with EpochManagerAndBitInvalidatorsAreIncompatible

@SCN-034 @TIME-002 @EP-009
Scenario Outline: The epoch advance step is bounded
  Given maker has an epoch of 0 for series 1
  When maker advances the epoch by <amount>
  Then the outcome is <outcome>

  Examples:
    | amount | outcome                                    |
    | 0      | the call reverts with AdvanceEpochFailed   |
    | 1      | the epoch becomes 1                        |
    | 255    | the epoch becomes 255                      |
    | 256    | the call reverts with AdvanceEpochFailed   |

@SCN-035 @STATE-004 @FR-FILL-002 @EP-002
Scenario: A post-interaction that advances the epoch unlocks the next order
  Given maker has signed order one at epoch 0 and order two at epoch 1, both epoch-checked in series 1
  And order one carries a post-interaction that advances maker's epoch by 1
  When taker fills order one
  Then order two becomes fillable
  And order one cannot be filled again
```

## Conditions and oracles

```gherkin
@SCN-036 @SEC-003 @INT-005 @EP-002
Scenario: An order whose condition is false cannot be filled
  Given maker signs an order with a predicate requiring the oracle price to be above 2000
  And the oracle reports 1900
  When taker fills the order
  Then the call reverts with PredicateIsNotTrue
  And no tokens are transferred

@SCN-037 @SEC-003 @EP-002
Scenario: A predicate that attempts to write state fails the fill
  Given maker signs an order whose predicate targets a contract that attempts a storage write
  When taker fills the order
  Then the call reverts with PredicateIsNotTrue
  And the target contract's storage is unchanged

@SCN-038 @TIME-003 @EP-002
Scenario Outline: A stale oracle price blocks the fill
  Given maker signs an order priced from a Chainlink feed
  And the feed's answer was last updated <age> ago
  When taker fills the order
  Then the outcome is <outcome>

  Examples:
    | age                    | outcome                                |
    | 3 hours 59 minutes     | the fill succeeds                      |
    | exactly 4 hours        | the fill succeeds                      |
    | 4 hours and 1 second   | the call reverts with StaleOraclePrice |
```

## Native ETH

```gherkin
@SCN-039 @SEC-005 @EP-001
Scenario: Overpaying in ETH returns the excess
  Given maker signs an order selling 1000 DAI for 1 WETH
  When taker fills the order sending 1.5 ETH
  Then taker's net ETH cost is 1 ETH plus gas
  And the protocol holds no ETH after the transaction

@SCN-040 @SEC-005 @EP-001
Scenario: Sending ETH for a non-WETH order is rejected
  Given maker signs an order selling 1000 DAI for 500 USDC
  When taker fills the order sending 1 ETH
  Then the call reverts with InvalidMsgValue
  And no tokens are transferred
```

## Operations

```gherkin
@SCN-041 @ACC-003 @OPS-001 @EP-015
Scenario: A paused protocol blocks fills but not cancellation
  Given the owner has paused the protocol
  And maker has an unfilled order
  When taker calls fill with a valid signature
  Then the call reverts with EnforcedPause
  When maker cancels the same order
  Then the cancellation succeeds

@SCN-042 @ACC-003 @EP-015
Scenario: A non-owner cannot pause the protocol
  Given the protocol is active
  When an account that is not the owner calls pause
  Then the call reverts with OwnableUnauthorizedAccount
  And the protocol remains active
```

---

## Required-coverage self-assessment

The policy lists nine areas Phase 5 must cover. Being honest about which are
thin matters more than claiming completeness.

| Area | Status |
|---|---|
| User-facing flows, including multi-transaction | Covered — `SCN-026`, `SCN-035` are multi-transaction |
| Every role: authorised success and unauthorised failure | Covered for owner (`SCN-041`, `SCN-042`) and maker (`SCN-024`). **Thin** for `FeeTaker` and `NativeOrder*` privileged entry points |
| Governance and parameter bounds | Covered for the epoch bound (`SCN-034`). No other protocol parameters exist |
| Upgrade and initialisation | **Not applicable** — no proxy, no initializer. Recorded as a deliberate exclusion |
| Pause, unpause, emergency withdrawal | Covered for pause; `rescueFunds` on `FeeTaker` and `NativeOrderFactory` is **uncovered** |
| Oracle, token, callback, reentrancy integration | Partly covered. Oracle `SCN-038`, callbacks `SCN-017`-`SCN-022`. **Fee-on-transfer, rebasing and non-standard ERC-20 returns have no scenario** — they are assumption `A2`, which the protocol cannot enforce, but the resulting behaviour is untested and should be |
| Timing and ordering: expiry, replay, nonce reuse, same-block | Covered — `SCN-025`, `SCN-030`, `SCN-032` |
| Boundaries: zero, one, maximum, rounding, empty arrays | Covered by four `Scenario Outline` blocks. Maximum-value boundaries (`type(uint256).max`) are **not** covered and belong in property tests rather than scenarios |
| Every error path an entry point can produce | **Not met.** `IOrderMixin` declares 19 custom errors; these scenarios assert 14 of them. Unasserted: `TakingAmountExceeded`, `OrderIsNotSuitableForMassInvalidation`, `ReentrancyDetected`, `InvalidPermit2Transfer`, `SimulationResults` |

The last row is the clearest gap and feeds directly into the Phase 6 test plan
rather than being written off here.
