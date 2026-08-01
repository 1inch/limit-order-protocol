#!/usr/bin/env bash
set -euo pipefail

APPLY=0
FRAMEWORK="auto"
ALL_FRAMEWORKS=0
WITH_ARC42=0
WITH_ADRS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --framework) shift; FRAMEWORK="${1:-}" ;;
    --framework=*) FRAMEWORK="${1#*=}" ;;
    --all-frameworks) ALL_FRAMEWORKS=1 ;;
    --with-arc42) WITH_ARC42=1 ;;
    --with-adrs) WITH_ADRS=1 ;;
    --with-optional) WITH_ARC42=1; WITH_ADRS=1 ;;
    -h|--help)
      echo "Usage: install-dependencies.sh [--apply] [--framework auto|...] [--all-frameworks] [--with-optional]"
      exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$ALL_FRAMEWORKS" -eq 0 && "$FRAMEWORK" == "auto" ]]; then
  eval "$($SCRIPT_DIR/detect-project-stack.sh --format env)"
  FRAMEWORK="$FRAMEWORK_PROFILE"
fi
if [[ "$ALL_FRAMEWORKS" -eq 0 ]]; then
  case "$FRAMEWORK" in hardhat2|hardhat3|foundry|hybrid-hardhat2-foundry|hybrid-hardhat3-foundry) ;; *) echo "Cannot resolve framework: $FRAMEWORK" >&2; exit 3;; esac
fi

# Skills are grouped by source repository so each repo is cloned once and its
# skills are installed with a single `--skill a b c` invocation, instead of one
# `npx skills add` call (and one clone) per skill.
SOURCES=()
SOURCE_SKILLS=()

add_skill(){
  local src="$1" skill="$2" idx=-1 i
  for i in "${!SOURCES[@]}"; do
    [[ "${SOURCES[$i]}" == "$src" ]] && { idx=$i; break; }
  done
  if [[ "$idx" -eq -1 ]]; then
    SOURCES+=("$src")
    SOURCE_SKILLS+=("$skill")
  else
    case " ${SOURCE_SKILLS[$idx]} " in
      *" $skill "*) ;;
      *) SOURCE_SKILLS[$idx]="${SOURCE_SKILLS[$idx]} $skill" ;;
    esac
  fi
}

add_skill "https://github.com/trailofbits/skills" "spec-to-code-compliance"
add_skill "TrevorEdris/fellowship-of-the-workflows" "reverse-engineer"
add_skill "https://github.com/trailofbits/skills" "audit-context-building"
add_skill "https://github.com/trailofbits/skills" "entry-point-analyzer"
add_skill "https://github.com/wondelai/skills" "working-with-legacy-code"
add_skill "https://github.com/trailofbits/skills" "property-based-testing"
add_skill "https://github.com/trailofbits/skills" "secure-workflow-guide"
add_skill "majiayu000/claude-skill-registry" "bdd-practices"

add_hh2(){ add_skill "https://github.com/wshobson/agents" "web3-testing"; }
add_hh3(){
  add_skill "nomicfoundation/hardhat-skills" "hardhat"
  if [[ "$ALL_FRAMEWORKS" -eq 1 ]]; then
    add_skill "nomicfoundation/hardhat-skills" "hardhat-toolbox-viem"
    add_skill "nomicfoundation/hardhat-skills" "hardhat-toolbox-mocha-ethers"
  else
    eval "$($SCRIPT_DIR/detect-project-stack.sh --format env)"
    if [[ -n "${TOOLBOX_VIEM_VERSION:-}" ]]; then add_skill "nomicfoundation/hardhat-skills" "hardhat-toolbox-viem"; fi
    if [[ -n "${TOOLBOX_MOCHA_ETHERS_VERSION:-}" ]]; then add_skill "nomicfoundation/hardhat-skills" "hardhat-toolbox-mocha-ethers"; fi
  fi
  return 0
}
add_foundry(){ add_skill "tenequm/skills" "foundry-solidity"; }

if [[ "$ALL_FRAMEWORKS" -eq 1 ]]; then add_hh2; add_hh3; add_foundry
else
  case "$FRAMEWORK" in
    hardhat2) add_hh2 ;;
    hardhat3) add_hh3 ;;
    foundry) add_foundry ;;
    hybrid-hardhat2-foundry) add_hh2; add_foundry ;;
    hybrid-hardhat3-foundry) add_hh3; add_foundry ;;
  esac
fi

[[ "$WITH_ARC42" -eq 1 ]] && add_skill "marvinrichter/clarc" "arc42-c4"
[[ "$WITH_ADRS" -eq 1 ]] && add_skill "addyosmani/agent-skills" "documentation-and-adrs"

COMMANDS=()
for i in "${!SOURCES[@]}"; do
  COMMANDS+=("npx skills@latest add ${SOURCES[$i]} --skill ${SOURCE_SKILLS[$i]} --agent cursor")
done

if [[ "$APPLY" -eq 0 ]]; then
  printf 'Framework selection: %s\n\nCommands:\n\n' "$([[ "$ALL_FRAMEWORKS" -eq 1 ]] && echo all || echo "$FRAMEWORK")"
  printf '%s\n' "${COMMANDS[@]}"
  echo; echo "Re-run with --apply to execute."
  exit 0
fi
for c in "${COMMANDS[@]}"; do echo; echo "> $c"; bash -lc "$c"; done
