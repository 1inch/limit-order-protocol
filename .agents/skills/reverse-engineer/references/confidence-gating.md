# Confidence Gating Reference

Classification guide for requirement and design claim confidence levels used in PRD and design doc generation.

---

## The Three Levels

### Verified

**Definition**: Direct code observation supported by at least one independent corroborating source.

**Corroborating sources (any one qualifies):**
- Test file that exercises the behavior
- Existing documentation that matches the observed code
- Configuration file that confirms the behavior (e.g., feature flag set to enabled, API route registered)
- Multiple independent code paths that all point to the same behavior

**How to write it**: State as fact. No qualification tag needed.

```
REQ-007: Users can reset their password via email link.
Evidence: src/auth/password-reset.ts, tests/auth/password-reset.test.ts
```

---

### Inferred

**Definition**: Single source only, or pattern matching without direct confirmation. Reasonable professional judgment based on available evidence, but not directly confirmed.

**Common scenarios:**
- Code exists but no test covers this path
- Code exists, no test, no docs — observed behavior only
- Naming conventions strongly imply behavior (e.g., `emailVerified` field on user model)
- Partial implementation suggests planned or ongoing feature

**How to write it**: Include the `[Inferred: <brief rationale>]` tag immediately after the requirement statement.

```
REQ-012: The system rate-limits authentication attempts. [Inferred: Redis TTL keys observed in auth/rate-limit.ts, no test coverage found]
Evidence: src/auth/rate-limit.ts:34-67
```

**Threshold**: Maximum 15% of core requirements in a PRD may be Inferred. If you exceed this, reduce scope — move excess Inferred items to "Undetermined Items."

---

### Unverified

**Definition**: Speculation, hearsay (e.g., comment saying "TODO: add this"), or no direct evidence found despite reasonable search.

**How to write it**: Never state as a requirement in the main body. List only in the "Undetermined Items" section with explicit language.

```
## Undetermined Items

1. The codebase contains a TODO comment referencing "bulk export" functionality (src/export/index.ts:12),
   but no implementation was found. It is unclear whether this is planned, in progress, or abandoned.
   Human input required: Is bulk export in scope? If so, where is the implementation?
```

**Limit**: Maximum 5 high-priority items in the Undetermined Items section. If more exist, collapse related items or note that discovery was incomplete.

---

## Decision Tree

Use this tree for each claim before writing it:

```
Does code for this behavior exist?
├── YES
│   ├── Is there a test that covers it?
│   │   ├── YES → VERIFIED (cite code + test)
│   │   └── NO
│   │       ├── Is there documentation or config that confirms it?
│   │       │   ├── YES → VERIFIED (cite code + doc/config)
│   │       │   └── NO → INFERRED (cite code, note no test/doc)
└── NO
    ├── Is it referenced in config but no implementation found?
    │   └── → Gap candidate (Unverified, list in Undetermined Items)
    ├── Is it only in a comment or TODO?
    │   └── → Unverified (list in Undetermined Items with comment reference)
    └── No evidence at all
        └── → Omit entirely (do not speculate)
```

---

## Verify Mode Classifications

When running in `verify` mode, use these classifications for existing document claims:

| Classification | Meaning | Action |
|----------------|---------|--------|
| **Match** | Code directly implements what doc describes | No action needed |
| **Drift** | Code has evolved beyond doc description | Update doc to reflect current behavior |
| **Gap** | Doc describes something not found in code | Investigate: was it removed, never built, or behind a flag? |
| **Conflict** | Code behavior directly contradicts the doc | High priority: one of them is wrong, determine which |

Confidence for verify classifications:
- **High** (3+ independent code locations or sources confirm the classification)
- **Medium** (2 sources agree)
- **Low** (single source — report finding but flag for manual verification)

---

## Common Pitfalls

| Pitfall | Problem | Fix |
|---------|---------|-----|
| Treating comments as Verified | Comments describe intent, not behavior | Require code + test or code + docs |
| Over-inferring from naming | A field named `isAdmin` doesn't confirm admin features exist | Read the actual logic |
| Marking partial implementations as Verified | 50% implemented code still means the behavior is incomplete | Mark as Inferred or Unverified |
| Inflating Verified count | Artificially passing the 80% quality gate | Gate exists for a reason — honest assessment only |
| Missing negative evidence | A test asserting the feature does NOT work is evidence too | Check for negative test cases |

---

## Example Application

**Scenario**: Reviewing an e-commerce checkout flow.

```
# Evidence found:
# - src/checkout/cart.ts: addItem(), removeItem(), calculateTotal()
# - src/checkout/cart.test.ts: tests for addItem and removeItem
# - No test for calculateTotal
# - src/checkout/tax.ts: calculateTax() exists, no test
# - README mentions "support for discount codes" but no code found

REQ-001: Users can add and remove items from their cart.
[VERIFIED] Evidence: src/checkout/cart.ts, src/checkout/cart.test.ts

REQ-002: The cart calculates an order total.
[INFERRED: calculateTotal() observed in cart.ts, no test coverage confirms behavior under edge cases]
Evidence: src/checkout/cart.ts:87

REQ-003: Tax is calculated on checkout.
[INFERRED: calculateTax() observed in tax.ts, no tests or integration with checkout flow found]
Evidence: src/checkout/tax.ts

# Undetermined Items:
# 1. README mentions discount codes. No implementation found. Is this planned, removed, or documented incorrectly?
```
