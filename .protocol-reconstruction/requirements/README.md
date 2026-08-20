# Canonical requirements — index

Phase 2, produced with the `reverse-engineer` specialist. These are the
authoritative statements of what the protocol must do. Later phases verify
against these, not against `description.md`.

Every requirement follows
[assets/requirement.template.md](../../.agents/skills/solidity-protocol-reconstruction-orchestrator/assets/requirement.template.md).
Identifiers come from the id-registry; no prefix is invented.

## Files

| File | Namespaces | Count |
|---|---|---|
| [`01-core-protocol.md`](01-core-protocol.md) | `FR-*`, `MATH-*`, `TIME-*`, `STATE-*` | 24 |
| [`02-access-security-integration.md`](02-access-security-integration.md) | `ACC-*`, `OPS-*`, `SEC-*`, `INT-*` | 18 |
| [`03-economics.md`](03-economics.md) | `ECON-*` | 4 |

46 requirements total.

## Sources and how intent was established

Two kinds of requirement appear here, and the difference matters when reading
the Confidence field.

**Specified.** A statement of intent exists in `description.md`, `README.md` or
`native-swap.md`, the code agrees with it, and Phase 1 recorded the alignment.
These carry confidence `HIGH`. Verifying them can genuinely detect a bug,
because requirement and implementation have independent origins.

**Reverse-engineered.** No statement of intent exists; the requirement was
derived from the implementation under a Gate A decision. These carry confidence
`LOW` and say so in the Confidence rationale. Verifying them cannot detect a
bug: the requirement was read off the thing it is being used to check. They pin
behaviour and nothing more.

The whole `ECON-*` group is reverse-engineered, under `DIV-010`
("ACCEPTED_CURRENT_BEHAVIOUR — reverse-engineer fee intent from the code and
mark those requirements low-confidence", `camoseed`, 2026-08-03). `OPS-001` and
parts of `ACC-003` are reverse-engineered under `DIV-004`.

## Confidence distribution

| Confidence | Count | Meaning here |
|---|---|---|
| `HIGH` | 33 | Documented intent, code agrees, Phase 1 evidence |
| `MEDIUM` | 9 | Single-source or partially documented; rationale states what would raise it |
| `LOW` | 4 | Reverse-engineered from code alone under a Gate A decision |

`reverse-engineer`'s own quality gate asks that at least 80% of core
requirements be Verified rather than Inferred, with at most 15% Inferred. On
that mapping 72% are `HIGH` and 20% `MEDIUM`. The gate is **not met**, and the
reason is a real property of the repository rather than an analysis shortfall:
`description.md` specifies the core and says nothing about the extensions, so
every extension requirement is single-source by construction. The shortfall is
concentrated exactly where `DIV-010` predicted it would be.

## Criticality distribution

| Criticality | Count |
|---|---|
| `CRITICAL` | 11 |
| `HIGH` | 18 |
| `MEDIUM` | 13 |
| `LOW` | 4 |

Each of the 11 `CRITICAL` requirements must reach executable verification by the
end of Phase 9, or be recorded in the traceability matrix's unverifiable list
with an accepted reason. That is the completion contract.

## Status

All entries are `DRAFT` with Approval `pending`. They become `APPROVED` at
Gate B, not before. Fields that depend on later phases — `EP-*` entry points,
`SCN-*` scenarios, `INV-*` invariants, existing coverage, test names — are
written `pending Phase N` rather than omitted, so the gap stays visible.

## Deliberate exclusions

Recorded so their absence is a decision rather than an oversight.

| Excluded | Reason |
|---|---|
| `UPG-*` (upgrade requirements) | No proxy, initializer, storage gap or upgrade mechanism exists. `NativeOrderFactory` deploys implementations but they are not upgradeable. Phase 0 established this |
| RFQ order requirements | Deprecated in v4 per `README.md` line 51; no RFQ code path exists. The stale NatSpec is `DIV-013`, a documentation fix, not a requirement |
| Rate improvement / `NO_IMPROVE_RATE` | `DIV-001` decided `DOCUMENTATION_BUG`: the feature does not exist and was not intended to. `INT-002` states the actual callback contract instead |
| `SafeOrderBuilder`, `OrderRegistrator`, `SeriesNonceManager`, `Permit2*Proxy`, ERC721/1155 proxies, `ApprovalPreInteraction`, `OrderIdInvalidator`, `PriorityFeeLimiter`, `NativeOrder*` | Peripheral contracts outside the fill path. Not excluded on merit — they are simply not covered by this pass, and Phase 6A will report them as uncovered rather than pretending otherwise |

The last row is the honest limit of this requirement set: it covers the core
protocol, the amount getters and `FeeTaker`. Eleven peripheral contracts have no
requirements. If Gate B expects full-repository coverage, this set is not yet
complete and needs a second Phase 2 pass.
