# Identifier registry

Every ID used anywhere in this workflow is defined here. A test may only cite an
ID from this registry. If a new namespace is needed, add it here first.

## Format

```text
<PREFIX>-<NNN>            FR-001, INV-014, SCN-007
<PREFIX>-<AREA>-<NNN>     FR-ORDER-001, INV-VAULT-003
```

Zero-padded to three digits. Numbers are allocated once and never reused: a
withdrawn ID is marked `WITHDRAWN` and left in place, because tests, reports,
and approvals reference it.

## Requirement namespaces (Phase 2)

| Prefix | Definition |
|---|---|
| `FR` | Functional requirement: behaviour the protocol must exhibit. |
| `SEC` | Security requirement: an attack that must be prevented or bounded. |
| `ACC` | Access-control requirement: who may call what, under which conditions. |
| `ECON` | Economic requirement: fees, incentives, liquidation, solvency terms. |
| `MATH` | Mathematical requirement: a formula, unit, precision, or rounding rule. |
| `TIME` | Time requirement: deadlines, delays, expiry, block or timestamp dependence. |
| `STATE` | State requirement: which stored state is legal and how it may change. |
| `UPG` | Upgrade requirement: proxy, storage-layout, and initialization constraints. |
| `OPS` | Operational requirement: pause, emergency, governance, and admin procedure. |
| `INT` | Integration requirement: an assumption about an external contract or oracle. |
| `NFR` | Non-functional requirement: gas, size, latency, operability limits. |

## Analysis and specification namespaces

| Prefix | Phase | Definition |
|---|---|---|
| `DIV` | 1 / Gate A | A divergence between documentation and code, with its decision. |
| `EP` | 4 | A state-changing external entry point, callback, hook, or initializer. |
| `SCN` | 5 | A behaviour scenario in Gherkin, derived from Example Mapping. |
| `INV` | 6 | A property that must hold across all reachable states. |
| `FLOW` | 3 | A multi-step protocol flow across contracts or transactions. |
| `SM` | 3 | A state-machine state or transition in the architecture model. |
| `GAP` | 6A | A coverage gap found in the existing test suite. |
| `REG` | 7-9 | A regression test pinned to a specific historical defect or finding. |

`STATE-*` is a requirement prefix only. State-machine states use `SM-*`. Earlier
revisions of this skill used `STATE-*` for both, which made a test citation
ambiguous; a Phase 8 test citing `STATE-004` now unambiguously cites a
requirement, and a test pinning a state-machine transition cites `SM-004`.

## Citation rules

- Every normative test cites at least one `SCN-*` or requirement ID.
- A test that pins an invariant also cites `INV-*`.
- A test that pins a flow or a state transition also cites `FLOW-*` or `SM-*`.
- A test written for a specific defect cites `REG-*` and the issue or finding it
  reproduces.
- A characterization test cites the behaviour it pins and, when it contradicts
  documentation, the `DIV-*` decision that permits it.
- `GAP-*` appears in `06-existing-test-audit.md` and in the traceability matrix,
  not in test code: a closed gap is represented by the test that closed it.

Place the citation where the test framework will print it: in the `it`/`describe`
title for Mocha and `node:test`, and in the function name or a NatSpec comment
for Solidity tests.

## Cross-references

Each ID records its own provenance:

- a requirement lists the `DIV-*` decisions and documentation sources it came from;
- an `EP-*` lists the requirements and invariants that constrain it;
- an `SCN-*` lists the requirements it exercises;
- an `INV-*` lists the requirements and `SM-*` states it protects;
- a `GAP-*` lists the requirement, `EP-*`, or `INV-*` that is under-covered.

The traceability matrix in `08-traceability-matrix.md` is the join of these
links. If an ID appears in a test but not in the matrix, the matrix is wrong.
