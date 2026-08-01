---
name: reverse-engineer
description: "Extract PRDs, design docs, and architecture diagrams from existing codebases. Reverse-engineer undocumented projects into structured documentation. Triggered by: reverse engineer, extract PRD, generate requirements, document existing code, what does this codebase do, create PRD from code, extract requirements, onboarding documentation."
user-invocable: true
argument-hint: "[discover|prd|design-doc|full|verify] [path]"
tags: [documentation]
---

# Reverse Engineer

Extracts structured documentation (PRDs, design docs, architecture diagrams) from existing codebases. Turns undocumented code into actionable requirements and design references.

Output is a strong starting point, not a finished product. Expect 15-30 minutes of human review and refinement after generation.

For large codebases, consider creating a handoff between phases using `/session-handoff`.

---

## Context

PROJECT ROOT:
```
!`pwd`
```

TECH STACK INDICATORS:
```
!`ls package.json Cargo.toml go.mod pyproject.toml requirements.txt Gemfile pom.xml build.gradle 2>/dev/null || echo "No standard manifest found"`
```

DIRECTORY STRUCTURE (top 2 levels):
```
!`find . -maxdepth 2 -type d -not -path '*/\.*' -not -path '*/node_modules/*' -not -path '*/vendor/*' -not -path '*/__pycache__/*' | head -40`
```

EXISTING DOCS:
```
!`find . -maxdepth 3 \( -name 'README*' -o -name '*.md' \) -not -path '*/node_modules/*' 2>/dev/null | head -20`
```

---

## Mode Selection

Determine which mode applies based on user request:

| Mode | When to Use | Input | Output |
|------|-------------|-------|--------|
| `discover` | Understand codebase scope | Target path (optional) | Scope report: functional units, confidence, relationships |
| `prd` | Generate PRD from code | Target path or prior scope report | PRD markdown document |
| `design-doc` | Generate design documentation | Target path or prior PRD | Design doc + C4 diagrams |
| `full` | Complete documentation suite | Target path | Scope report -> PRD -> Design doc (sequential) |
| `verify` | Check doc-code alignment | Doc path + code path | Consistency report with classifications |

If no mode is specified, ask: "Which output do you need? discover (scope analysis), prd (requirements doc), design-doc (technical design), full (all three), or verify (check existing docs against code)?"

---

## Mode: discover

Delegates to the `scope-analyzer` agent for read-only exploration.

### Steps

1. Invoke the `scope-analyzer` agent with:
   - `target_path`: user-specified path, or project root
   - `focus_area`: optional constraint (e.g., "authentication only", "API layer")
2. Agent performs multi-source discovery per `references/scope-discovery-sources.md`
3. Agent returns structured scope report
4. Present summary to user:
   - Functional units found (name, description, confidence)
   - Relationship map (which units depend on which)
   - Uncertain areas that need human input
   - Tech stack summary
5. Save scope report to `docs/reverse-engineer/scope-report.md` (or user-specified location)

### Scope Report Format

```markdown
# Scope Report: [Project Name]

Generated: [date]

## Tech Stack
[Languages, frameworks, databases, external services identified]

## Functional Units

| Unit | Description | Confidence | Entry Points |
|------|-------------|------------|--------------|
| [name] | [what it does] | High/Medium/Low | [key files] |

## Relationship Map
[Which units depend on which, shared resources]

## Uncertain Areas
[What could not be determined from code analysis alone]

## Discovery Saturation
[Which sources were checked, when saturation was reached]
```

---

## Mode: prd

Generates a Product Requirements Document from code analysis.

### Steps

1. Check for existing scope report at `docs/reverse-engineer/scope-report.md`. If absent, run `discover` first.
2. For each functional unit in the scope report:
   a. Read entry points and related files
   b. Read test files for expected behaviors (tests encode requirements)
   c. Classify each requirement claim using confidence gating (see `references/confidence-gating.md`):
      - **Verified**: Direct code observation + test confirmation, or code + documentation match
      - **Inferred**: Single source or pattern matching only — mark with `[Inferred: <brief rationale>]`
      - **Unverified**: Speculation or no direct evidence — list only in "Undetermined Items", never state as fact
   d. Write functional requirements as user stories
3. Generate PRD following `references/prd-template.md`
4. Run `scripts/validate_prd.py` on the output file
5. Quality gate: 80%+ of core requirements must be Verified. If below threshold, flag the gap and list the Unverified items.
6. Save to `docs/reverse-engineer/prd.md` (or user-specified location)

### Confidence Gate Enforcement

Before writing each requirement:
- Cite at least one file path as evidence
- If only one source exists, mark as `[Inferred: ...]`
- If no direct evidence, move to "Undetermined Items" section only
- Max 15% of core requirements may be Inferred
- Zero Unverified claims in the main requirements body

---

## Mode: design-doc

Generates a technical design document from code analysis.

### Steps

1. Check for existing PRD at `docs/reverse-engineer/prd.md`. If absent, run `prd` first.
2. Analyze codebase architecture:
   - Module boundaries and dependency graph
   - Data flow patterns (request lifecycle, event flow)
   - Integration points (APIs, databases, external services, message queues)
   - Error handling patterns (how errors propagate, what gets logged)
   - State management approach (in-process, external cache, database)
3. Generate design doc following `references/design-doc-template.md`
4. Delegate architecture diagrams to `/c4-architecture` skill:
   - Provide the scope analysis and component list as context
   - Request: "Generate C4 Context and Container diagrams for this system"
   - If `/c4-architecture` is not available, generate inline mermaid diagrams instead
5. Run `scripts/validate_design_doc.py` on the output file
6. Save to `docs/reverse-engineer/design-doc.md` (or user-specified location)

### Architecture diagrams

Architecture diagrams are generated using the `/c4-architecture` skill. See that skill for diagram customization options. If unavailable, fall back to mermaid `graph TD` diagrams showing component relationships.

---

## Mode: full

Sequential execution of all three phases.

### Steps

1. Run `discover` -> save scope report -> present summary, continue automatically
2. Run `prd` using scope report output -> save PRD -> present summary, continue automatically
3. Run `design-doc` using PRD output -> save design doc -> present final summary

Interrupt at any phase if the user signals a stop. Each phase output is independent and usable on its own.

### Final Summary Format

```
Reverse engineering complete.

Generated:
- docs/reverse-engineer/scope-report.md ([N] functional units, [H] high / [M] medium / [L] low confidence)
- docs/reverse-engineer/prd.md ([N] requirements, [X]% Verified)
- docs/reverse-engineer/design-doc.md ([N] components documented)

Review recommended: Check "Undetermined Items" sections in both documents for questions requiring human input.
```

---

## Mode: verify

Checks alignment between existing documentation and current code.

### Steps

1. Accept: document path + code path. Auto-detect from `docs/reverse-engineer/` if not specified.
2. For each verifiable claim in the document:
   a. Search codebase for supporting evidence (at least 2 independent search strategies)
   b. Classify as:
      - **Match**: Code directly implements what the doc describes
      - **Drift**: Code has evolved beyond what the doc describes (doc is outdated)
      - **Gap**: Doc describes something not found in code (may be planned or deleted)
      - **Conflict**: Code behavior directly contradicts the doc
   c. Assign confidence: High (3+ independent sources), Medium (2 sources), Low (1 source)
3. Calculate consistency score: `(match_count / total_claims) * 100`, weighted by severity (Conflicts reduce score more than Gaps)
4. Report:
   - Overall score (0-100)
   - Classified discrepancy list with file references
   - Prioritized recommendations
5. Quality gate:
   - Score >= 70: PASS
   - Score 50-69: FLAGGED — review recommended before using doc for planning
   - Score < 50: INTERVENTION — doc requires significant update before use

### Verify Output Format

```markdown
# Verification Report: [Document Name]

Date: [date]
Score: [N]/100 — [PASS|FLAGGED|INTERVENTION]

## Summary
[N] claims checked: [M] Match, [D] Drift, [G] Gap, [C] Conflict

## Discrepancies

### Conflicts (highest priority)
- Claim: "[quoted text]" | Evidence: [file:line] contradicts this | Confidence: High

### Gaps
- Claim: "[quoted text]" | Search: checked [patterns] | No implementation found

### Drift
- Claim: "[quoted text]" | Code at [file:line] now does [actual behavior]

## Recommendations
1. [Highest priority fix]
2. ...
```

---

## Output Location Convention

Default output directory: `docs/reverse-engineer/` in the target project root.

```
docs/reverse-engineer/
    scope-report.md          # From discover mode
    prd.md                   # From prd mode
    design-doc.md            # From design-doc mode
    verification-report.md   # From verify mode
```

Override with an explicit path argument: `/reverse-engineer prd src/payments --output docs/payments-prd.md`

---

## Integration Points

- **`/c4-architecture`**: The `design-doc` mode delegates C4 diagram generation to this skill. Graceful fallback to inline mermaid diagrams if unavailable.
- **`/session-handoff`**: For large codebases, the full mode may span multiple sessions. Create a handoff between phases to preserve context.
- **`scope-analyzer` agent**: The `discover` mode delegates to this read-only agent. It uses restricted tools (Read, Grep, Glob, LS) to enforce safe exploration.
- **`codebase-pattern-finder` agent**: Covers similar ground with different goals (code patterns vs functional units). Prior output from that agent can be provided as context to the `discover` mode.
- **Discover-Plan-Implement workflow**: The `discover` mode output maps directly to the Discovery phase. PRD and design doc output feeds the Plan phase.

---

## References

- `references/confidence-gating.md` — Classification rules for Verified/Inferred/Unverified
- `references/scope-discovery-sources.md` — 10-source discovery matrix with priorities
- `references/prd-template.md` — PRD template with section guidance
- `references/design-doc-template.md` — Design doc template with section guidance
- `scripts/validate_prd.py` — Structural validation for generated PRDs
- `scripts/validate_design_doc.py` — Structural validation for generated design docs
- `assets/example-prd.md` — Example PRD output for reference
