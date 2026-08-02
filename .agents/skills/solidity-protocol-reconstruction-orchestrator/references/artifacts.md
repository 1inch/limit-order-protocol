# Output artifact map

Every phase writes to `docs/protocol-reconstruction/`. A reviewer standing at a
gate must be able to name the files being approved, so each phase declares its
outputs here. Do not invent alternative filenames.

## Map

| Path | Written by | Contents |
|---|---|---|
| `STATUS.md` | every phase | workflow state, approvals, next permitted phase |
| `00-baseline.md` | Phase 0 | git state, stack detection output, commands run, failures observed |
| `01-repository-inventory.md` | Phase 0 | contracts, configs, tests, scripts, deployments, tooling |
| `02-compliance-report.md` | Phase 1 | Spec IR, Code IR, alignment matrix, undocumented paths |
| `03-divergence-decisions.md` | Gate A | every material divergence with its human decision |
| `requirements/` | Phase 2 | one file per requirement group, `FR-*`/`SEC-*`/... entries |
| `architecture/` | Phase 3 | trust model, assets, state machines, flows, formulas |
| `04-entry-points-and-privileges.md` | Phase 4 | `EP-*` entry points and the effective privilege matrix |
| `05-behaviour-scenarios.md` | Phase 5 | `SCN-*` Gherkin scenarios and Example Mapping output |
| `06-existing-test-audit.md` | Phase 6A | inventory, baseline run, coverage/gas baseline, gap matrix |
| `07-test-strategy.md` | Phase 6 | `INV-*` catalogue and framework-aware test plan |
| `08-traceability-matrix.md` | Phase 6 | requirement to scenario to invariant to test mapping |
| `09-characterization-report.md` | Phase 7 | characterization tests added and behaviour pinned |
| `10-test-implementation-report.md` | Phases 8-9 | normative tests added, gaps, failures reported |
| `11-security-readiness.md` | Phase 11 | findings, cited requirements, required regressions |

Phase 3A writes into `architecture/` using the `arc42-c4` layout. Phase 10
writes ADRs into the repository's existing ADR location, not into
`docs/protocol-reconstruction/`.

## Templates

| Artifact | Template |
|---|---|
| `STATUS.md` | [assets/STATUS.template.md](../assets/STATUS.template.md) |
| `03-divergence-decisions.md` | [assets/divergence-decisions.template.md](../assets/divergence-decisions.template.md) |
| `06-existing-test-audit.md` | [assets/existing-test-audit.template.md](../assets/existing-test-audit.template.md) |
| `08-traceability-matrix.md` | [assets/traceability-matrix.template.md](../assets/traceability-matrix.template.md) |
| a requirement entry under `requirements/` | [assets/requirement.template.md](../assets/requirement.template.md) |

Copy the template, then fill it. Do not delete unfilled fields: write `unknown`,
`not applicable`, or `open question` so the gap stays visible.

## Numbering

The numeric prefix is the reading order, not the phase number. `06` is written
by Phase 6A because its gap matrix is an input to the Phase 6 test strategy in
`07`. Numbers are stable: never renumber an existing artifact.

## Git hygiene

`docs/protocol-reconstruction/` is working output of a review workflow, not
protocol source. The agent writes these files and proposes a commit; it does not
commit them.

Before proposing:

- confirm with the user whether the directory is committed, ignored, or kept
  local. Repositories that publish generated documentation from `docs/` may need
  a `.gitignore` entry or a different location;
- never stage contract, config, lockfile, or dependency changes together with
  documentation;
- keep test code commits separate from documentation commits;
- never commit RPC URLs, API keys, `.env` contents, or fork credentials picked
  up while recording the baseline.
