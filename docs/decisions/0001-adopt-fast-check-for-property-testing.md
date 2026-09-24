# ADR-0001: Adopt fast-check for property-based testing

## Status

Proposed

## Date

2026-08-03

## Note on convention

This repository had no ADR convention when this record was written: no
`docs/decisions/`, no `docs/adr/`, no `.adr-dir`, and no existing decision
records to match. This ADR therefore **proposes** the convention as well as the
decision:

- location `docs/decisions/`
- filename `NNNN-kebab-case-title.md`, sequential from `0001`
- the section headings used below

One consideration worth flagging before this is accepted. `docs/` is the
`solidity-docgen` output directory — `hardhat.config.js` sets
`docgen.outputDir: 'docs'` — and already holds 38 generated pages. A
`decisions/` subdirectory does not collide with any generated path, because
docgen mirrors the `contracts/` tree and there is no `contracts/decisions/`.
But it does mean hand-written and generated documentation share a root. If that
is unacceptable, a top-level `adr/` directory is the obvious alternative and
this file should move before the convention is set.

## Context

The repository had no property-based or fuzz testing of any kind. Verified
against `package.json` at commit `837c8f82`: no `fast-check`, no Foundry, no
Echidna, no Medusa. The entire suite was example-based Mocha over Hardhat.

Phase 6 of the protocol reconstruction workflow catalogued 16 invariants
(`INV-001` to `INV-016`). Thirteen of them need randomized input generation to
be meaningful — asserting a rounding rule or a round-trip identity against
three hand-picked values demonstrates very little.

The protocol has several components that are unusually good property-test
targets: `DutchAuctionCalculator` and `RangeAmountCalculator` expose `pure` and
`view` pricing functions with explicit arguments, so they need no chain state,
no time control and no per-case fixture.

The orchestrator's Hardhat 2 policy requires explicit approval before adding a
property tool or a Foundry sidecar, because the default posture is to preserve
the existing stack exactly.

## Decision

Add `fast-check` as a devDependency, pinned exactly at `3.23.2`, and place
property tests under `test/property/`.

## Alternatives considered

**Hand-rolled seeded loops using only installed packages.** Rejected. It adds no
dependency, which is its only advantage. It provides no shrinking, so a failure
surfaces as whatever random input happened to break rather than a minimal
counterexample, and no seed replay, so a failure is not reliably reproducible.
The value of this exercise turned out to depend entirely on shrinking — see
Consequences.

**A Foundry sidecar.** Rejected for now. Forge's invariant testing with
handlers, ghost variables and persisted failure corpora is genuinely stronger
for stateful multi-transaction properties, which is where the remaining
uncovered invariants sit. But it makes the repository hybrid: two toolchains,
two compilation paths, two CI jobs, and a standing question about which
framework owns which contract. That is a large structural change to buy
coverage of one test category, and it can still be revisited if the stateful
invariants become a priority.

**Do nothing.** Rejected. It would leave 13 of 16 invariants with no executable
verification beyond a handful of deterministic examples.

## Consequences

### Positive

The decision paid for itself immediately. On its first three runs the
round-trip property found a real defect in `RangeAmountCalculator`'s inverse
that had survived four security audits and 173 existing tests: it rounds in the
taker's favour, contradicting the protocol's own rounding policy. The three
regimes are recorded as `REG-001`, `REG-002` and `REG-003` in
`test/property/AmountCalculators.property.js`.

Shrinking is what made it actionable. The raw failures were on values like
`priceStart = 5695071670048274962060`; fast-check reduced them to
`priceStart = 100e18, priceEnd = 100e18 + 2, orderMakingAmount = 1e18 + 1`,
which is small enough to reason about by hand. It also defeated three
successive attempts at an error envelope by scaling one parameter — which is
how the missing `priceStart` factor in the error model was identified. A
hand-rolled loop would have reported a failure and left the diagnosis entirely
to a human.

### Negative

One more devDependency to keep current, and a second testing idiom in the
codebase alongside example-based Mocha.

Property tests are slower and their runtime depends on how many generated cases
a precondition discards. One property here needed its generators restructured
to produce valid inputs directly rather than filtering, after the filtered
version exceeded Mocha's 40-second timeout. That is a recurring maintenance
trap worth knowing about.

An envelope-style assertion — asserting measured behaviour with a tolerance
rather than the ideal invariant — is easy to weaken accidentally under
maintenance pressure. The one in this repository carries a comment stating the
ideal invariant and recording that it is false; that comment is the guard
against the tolerance quietly growing.

### Neutral

Dependency churn was confined: `yarn.lock` gained 12 lines with no removals,
the only transitive addition is `pure-rand@6.1.0`, and no existing version
changed. `yarn add` also re-sorted `@nomicfoundation/hardhat-ethers` into
alphabetical order in `package.json`, which is cosmetic.

## Compliance

Property tests live in `test/property/`, separate from specification tests in
the existing top-level layout and from characterization tests in
`test/characterization/`.

Every counterexample a property finds is committed as a deterministic
regression test with its seed, rather than left for the fuzzer to rediscover.
`REG-001`, `REG-002` and `REG-003` follow this pattern.

A property whose ideal invariant does not hold must say so in its own comments
and be reported as a finding, never silently narrowed until it passes.
