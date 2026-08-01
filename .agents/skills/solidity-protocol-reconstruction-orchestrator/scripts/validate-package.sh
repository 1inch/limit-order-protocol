#!/usr/bin/env bash
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
required=(
  SKILL.md README.md CHANGELOG.md skill-dependencies.yaml
  references/dependencies.md references/framework-routing.md
  references/hardhat2-policy.md references/hardhat3-policy.md
  references/foundry-policy.md references/hybrid-policy.md
  scripts/check-dependencies.sh scripts/install-dependencies.sh scripts/detect-project-stack.sh
)
for rel in "${required[@]}"; do [[ -f "$SKILL_DIR/$rel" ]] || { echo "Missing: $rel" >&2; exit 1; }; done
head -n1 "$SKILL_DIR/SKILL.md" | grep -qx -- '---'
grep -q '^name: solidity-protocol-reconstruction-orchestrator$' "$SKILL_DIR/SKILL.md"
grep -q 'version: "4.0.0"' "$SKILL_DIR/SKILL.md"
for term in bdd-practices arc42-c4 documentation-and-adrs web3-testing foundry-solidity 'name: hardhat'; do grep -q "$term" "$SKILL_DIR/skill-dependencies.yaml" || { echo "Missing dependency marker: $term" >&2; exit 1; }; done
for script in "$SKILL_DIR"/scripts/*.sh; do bash -n "$script"; chmod +x "$script"; done
printf 'Package validation passed: %s\n' "$SKILL_DIR"
