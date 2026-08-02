# Requirement entry template

Phase 2. One entry per requirement, under `docs/protocol-reconstruction/requirements/`.
Group related requirements in one file per subsystem.

Every field is mandatory. Where a field is unknown, write `unknown` and raise an
open question; do not omit the field.

---

## `FR-ORDER-001` — short imperative title

| Field | Content |
|---|---|
| ID | `FR-ORDER-001` — see [id-registry.md](../references/id-registry.md) |
| Criticality | `CRITICAL` \| `HIGH` \| `MEDIUM` \| `LOW` |
| Criticality rationale | why, in one sentence |
| Source | documentation file and section, code file and line, or `DIV-*` decision |
| Approval | reviewer and date, or `pending` |
| Status | `DRAFT` \| `APPROVED` \| `SUPERSEDED` \| `WITHDRAWN` |

### Statement

One sentence, in protocol domain language, stating what must hold. No Solidity,
no function selectors, no implementation detail.

### Actors and assets

| Field | Content |
|---|---|
| Actors | roles that participate, and which one initiates |
| Assets | tokens, collateral, fees, accounting balances affected |
| Entry points | `EP-*` through which it is reachable |

### Conditions

| Field | Content |
|---|---|
| Preconditions | what must be true before |
| Postconditions | what must be true after, including on the failure path |
| Invariants preserved | `INV-*` |
| State machine | `SM-*` states and transitions involved |

### Acceptance criteria

Numbered, each independently checkable, each with concrete values:

1. Given ..., when ..., then ... .
2. ...

### Verification

| Field | Content |
|---|---|
| Verification method | test, invariant, fork test, manual review, static analysis |
| Owning harness | Hardhat or Foundry; exactly one in a hybrid repository |
| Scenarios | `SCN-*` |
| Existing coverage | Phase 6A verdict, once known |
| Tests | file and test name, once implemented |

### Risk

| Field | Content |
|---|---|
| Security impact | what an attacker gains if this is violated |
| Economic impact | value at risk |
| Confidence | `HIGH` \| `MEDIUM` \| `LOW`, in the requirement's correctness |
| Confidence rationale | what would raise it |

### Notes

Related requirements, superseded IDs, open questions, and unenforceable
assumptions.

---

## Criticality

Criticality drives the completion contract: every `CRITICAL` requirement must
have executable verification, or an accepted entry in the traceability matrix's
unverifiable list.

| Level | Meaning |
|---|---|
| `CRITICAL` | Violation causes direct loss of funds, permanent freezing, unauthorized privilege, or protocol insolvency. |
| `HIGH` | Violation causes recoverable loss, incorrect accounting, denial of service, or bypass of a safety control. |
| `MEDIUM` | Violation causes incorrect but bounded behaviour with no direct asset impact. |
| `LOW` | Violation causes cosmetic, informational, or operational inconvenience only. |

Criticality is a property of the requirement, not of the confidence in it. A
low-confidence requirement about fund custody is still `CRITICAL`.
