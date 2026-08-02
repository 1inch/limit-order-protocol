# Behaviour specification policy

Phase 5 produces `05-behaviour-scenarios.md`. This policy replaces an external
BDD specialist: the workflow needs Gherkin as living documentation for a
Solidity protocol, in English, with IDs that link to requirements and tests.

## Example Mapping

Work one requirement at a time. For each, produce four kinds of card:

1. **Rule** — a constraint the protocol enforces. Comes from a `FR-*`, `SEC-*`,
   `ACC-*`, `ECON-*`, `MATH-*`, `TIME-*`, `STATE-*`, `UPG-*`, `OPS-*`, or `INT-*`
   requirement.
2. **Example** — a concrete case that illustrates the rule, with real values.
   Becomes a scenario.
3. **Question** — something the documentation and code do not settle. Becomes an
   open question in `STATUS.md`; never becomes a scenario until answered.
4. **Assumption** — something taken as true without proof, especially about an
   external contract. Becomes an `INT-*` requirement or an unenforceable
   assumption in the architecture model.

A rule with no examples is unverifiable. A rule with more than about five
examples is usually several rules.

## Gherkin conventions

```gherkin
@SCN-014 @FR-ORDER-003 @SEC-005 @EP-012
Scenario: Filling an expired order reverts
  Given an order signed by maker with expiry at block timestamp 1700000000
  And the current block timestamp is 1700000001
  When taker calls fillOrder with a valid signature
  Then the call reverts with OrderExpired
  And no tokens are transferred
  And the order remains unfilled
```

Rules:

- One behaviour per scenario. If `Then` contains "and then", split it.
- `Given` is state, `When` is exactly one state-changing call, `Then` is
  observable outcome. Never put an action in `Given` that the scenario is
  actually testing.
- Write in protocol domain language: maker, taker, order, collateral, epoch. Do
  not write in Solidity: no `msg.sender`, no storage slot names, no function
  selectors, no `require` text in the scenario body.
- Name the actor in every step. "The caller" hides an access-control question.
- Assert the specific error. `Then the call reverts` is incomplete; name the
  custom error and, where it carries them, its arguments.
- Assert asset movement and resulting state, not only the revert or the event.
- Use `Scenario Outline` with an `Examples` table for boundary values, one row
  per boundary: below, at, and above.
- Concrete values only. "A large amount" is not an example; `type(uint256).max`
  is.
- Tag every scenario with its `SCN-*` ID and every requirement, `EP-*`, and
  `INV-*` it exercises. See [id-registry.md](id-registry.md).

## Required coverage

Phase 5 is complete when scenarios exist for:

- each user-facing flow, including the multi-step and multi-transaction ones;
- each role: authorized success and unauthorized failure for every privileged
  entry point in `04-entry-points-and-privileges.md`;
- governance and parameter changes, including the bounds on each parameter;
- upgrade and initialization, including re-initialization attempts;
- pause, unpause, and emergency withdrawal;
- oracle, token, callback, and other integration behaviour, including
  fee-on-transfer, rebasing, non-standard ERC-20 returns, and reentrant callbacks
  where reachable;
- timing and ordering: expiry, delays, deadlines, replay, nonce reuse,
  same-block sequences;
- boundaries: zero, one, maximum, rounding direction, empty arrays, duplicate
  entries;
- every error path an entry point can produce.

## Tooling

Gherkin here is living documentation, not an executable artifact.

- Do not add Cucumber, `cucumber-js`, or any BDD runner unless the user
  explicitly approves it. Mocha, `node:test`, and Forge tests implement these
  scenarios directly.
- The link between a scenario and its test is the `SCN-*` ID in the test title
  or function name, plus the row in `08-traceability-matrix.md`.
- Do not restructure existing tests into Given/When/Then naming. The scenarios
  document behaviour; the repository's test style stays as it is.

## Handling divergence

A scenario describes behaviour the reviewer has accepted as canonical. When
documentation and code disagree:

- if Gate A decided `CODE_BUG`, write the scenario for the intended behaviour and
  mark it as expected-to-fail against current code, citing the `DIV-*` decision;
- if Gate A decided `DOCUMENTATION_BUG` or `ACCEPTED_CURRENT_BEHAVIOUR`, write
  the scenario for the actual behaviour and cite the decision;
- if the divergence is unresolved, do not write a scenario. Record a question.
