# Protocol architecture and trust model — index

Phase 3, produced with the `audit-context-building` specialist in pure
context-building mode: comprehension only, no findings, no severities, no fix
proposals. Those belong to Phase 11.

| File | Contents |
|---|---|
| [`01-trust-and-actors.md`](01-trust-and-actors.md) | On-chain/off-chain boundary, actors, roles, trust boundaries, privilege map |
| [`02-contracts-and-storage.md`](02-contracts-and-storage.md) | Inheritance, storage layout, delegatecall, deployment topology |
| [`03-flows-and-state-machines.md`](03-flows-and-state-machines.md) | `FLOW-*` end-to-end flows and `SM-*` states and transitions |
| [`04-assets-math-and-assumptions.md`](04-assets-math-and-assumptions.md) | Asset and accounting model, formulas, units, rounding, external calls, and the assumptions the code cannot enforce |

## The one-paragraph model

The 1inch Limit Order Protocol is a stateless matching engine with no custody.
Makers sign orders entirely off-chain; the protocol holds no order book, no
balances and no collateral. Its only persistent state is a per-maker record of
which orders have been consumed. A fill is a single atomic transaction in which
the protocol, acting purely as a permissioned mover of other people's tokens,
pulls the maker's asset to the taker and the taker's asset to the maker's
receiver, invoking up to three caller-supplied callbacks along the way. Almost
all flexibility — pricing curves, conditions, fees, non-ERC20 assets — lives in
extensions that are hashed into the order's salt rather than in the core.

The consequences of that shape dominate everything else in this phase. Because
the protocol never holds funds, it cannot become insolvent, and there is no
liability side to the accounting model. Because it moves funds under standing
ERC-20 allowances, the maker's entire allowance, not just the order size, is the
value at risk from any authorisation defect. And because extensions are
arbitrary code chosen by the maker and invoked in the protocol's own transaction,
the trust boundary sits inside the fill rather than around it.

## Anchored facts

Carried forward from Phases 0-2 and treated as established for the rest of this
workflow.

| Fact | Established in |
|---|---|
| No proxy, no initializer, no storage gap, no upgrade path | Phase 0 |
| Exactly two persistent state mappings, both keyed by maker | Phase 1 Code-IR |
| One `delegatecall` in the whole protocol, in `simulate`, always reverted | Phase 1 |
| One privileged role, `owner`, whose only power is pause and unpause | Phase 1, `DIV-004` |
| Signature is verified on the first fill only | Phase 2 `ACC-001` |
| Rounding always favours the maker | Phase 2 `MATH-001`, `MATH-002` |
| 173 tests pass, 5 pending, 0 failing at the baseline commit | Phase 3 (test run) |

## Corrections to earlier assumptions

The context-building method requires that superseded beliefs be stated rather
than quietly replaced.

**Earlier I expected the pause mechanism to be untested.** Phase 2 wrote
"expected uncovered" against `ACC-003` and `OPS-001`. The baseline test run
contradicts that: `test/LimitOrderProtocol.js` has a `Pause` block with three
tests, and the gas report records two `pause` and one `unpause` call. Phase 6A
will record the real verdict; the Phase 2 note was a guess and was wrong.
