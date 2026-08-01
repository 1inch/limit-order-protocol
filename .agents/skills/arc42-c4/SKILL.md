---
name: arc42-c4
description: "arc42 architecture documentation template (all 12 sections) combined with C4 diagrams (Context, Container, Component, Deployment) in PlantUML. The standard for architecture documentation in this setup. Maps each section to the Claude skills that help fill it."
---

# arc42 + C4 Skill

arc42 is a template for architecture documentation with 12 sections. C4 is a diagram model (Context → Container → Component → Code) that maps directly into arc42's structural sections.

> Do not use arc42 for projects under 10 files — use a simple README instead.

## When to Activate

- Generating or updating project architecture documentation
- Onboarding a new engineer to the system architecture
- After a major architectural decision (ADR) that changes the structure
- Before a large feature that touches multiple system layers
- When someone asks "how does this system actually work?"

---

## arc42 Sections — Quick Reference

| # | Section | C4 Diagram | Claude Skill |
|---|---------|-----------|--------------|
| 1 | Introduction & Goals | — | commands/prd.md (requirements) |
| 2 | Architecture Constraints | — | adr-writing (constraints documented) |
| 3 | System Scope & Context | C4 Level 1: Context | — |
| 4 | Solution Strategy | — | agents/solution-designer |
| 5 | Building Block View | C4 Level 2: Container + Level 3: Component | — |
| 6 | Runtime View | Sequence Diagrams | skills/api-contract |
| 7 | Deployment View | C4 Deployment Diagram | skills/kubernetes-patterns, deployment-patterns |
| 8 | Cross-cutting Concepts | — | observability, security-review, multi-tenancy, caching-patterns |
| 9 | Architecture Decisions | — | skills/adr-writing, commands/explore |
| 10 | Quality Requirements | — | skills/load-testing |
| 11 | Risks & Technical Debt | — | — |
| 12 | Glossary | — | — |

---

## Full arc42 Document Template

Full template (all 12 sections with C4 PlantUML diagrams): `docs/templates/arc42-template.md`

Save the generated document to: `docs/architecture/arc42.md`
Diagrams to: `docs/architecture/diagrams/*.puml`

---

## Maintenance Rules

- **Update Section 3** when: system integrates a new external service
- **Update Section 5** when: a new container (service, DB, cache) is added or removed
- **Update Section 7** when: deployment infrastructure changes (new region, k8s upgrade)
- **Update Section 8** when: a new cross-cutting pattern is established (new logging standard, new auth flow)
- **Update Section 9** when: a new ADR is accepted — add it to the index table
- **Update Section 11** when: a new risk is identified or debt is resolved

## Anti-Patterns

- Writing Section 5 without a real diagram — prose alone is insufficient for building blocks
- Putting implementation details in Section 6 (runtime view) instead of sequence diagrams
- Keeping ADRs only in Section 9 without their own `docs/decisions/` file — always both
- Letting arc42 go stale — out-of-date architecture docs are worse than none (mislead new engineers)
