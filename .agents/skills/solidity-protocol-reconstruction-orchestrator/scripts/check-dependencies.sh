#!/usr/bin/env bash
set -euo pipefail

MODE="full"
FRAMEWORK="auto"
WITH_ARC42=0
WITH_ADRS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    check|analyze|implement-tests|security-review|full) MODE="$1" ;;
    --framework) shift; FRAMEWORK="${1:-}" ;;
    --framework=*) FRAMEWORK="${1#*=}" ;;
    --with-arc42) WITH_ARC42=1 ;;
    --with-adrs) WITH_ADRS=1 ;;
    --with-optional) WITH_ARC42=1; WITH_ADRS=1 ;;
    -h|--help)
      echo "Usage: check-dependencies.sh [mode] [--framework auto|hardhat2|hardhat3|foundry|hybrid-hardhat2-foundry|hybrid-hardhat3-foundry] [--with-optional]"
      exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$FRAMEWORK" == "auto" ]]; then
  eval "$($SCRIPT_DIR/detect-project-stack.sh --format env)"
  FRAMEWORK="$FRAMEWORK_PROFILE"
fi

case "$FRAMEWORK" in
  hardhat2|hardhat3|foundry|hybrid-hardhat2-foundry|hybrid-hardhat3-foundry) ;;
  *) echo "Cannot resolve framework profile: $FRAMEWORK" >&2; exit 3 ;;
esac

case "$MODE" in
  check|full) REQUIRED=(spec-to-code-compliance reverse-engineer audit-context-building entry-point-analyzer bdd-practices working-with-legacy-code property-based-testing secure-workflow-guide) ;;
  analyze) REQUIRED=(spec-to-code-compliance reverse-engineer audit-context-building entry-point-analyzer bdd-practices property-based-testing) ;;
  implement-tests) REQUIRED=(working-with-legacy-code property-based-testing) ;;
  security-review) REQUIRED=(entry-point-analyzer secure-workflow-guide) ;;
esac

if [[ "$MODE" != "security-review" ]]; then
  case "$FRAMEWORK" in
    hardhat2) REQUIRED+=(web3-testing) ;;
    hardhat3) REQUIRED+=(hardhat) ;;
    foundry) REQUIRED+=(foundry-solidity) ;;
    hybrid-hardhat2-foundry) REQUIRED+=(web3-testing foundry-solidity) ;;
    hybrid-hardhat3-foundry) REQUIRED+=(hardhat foundry-solidity) ;;
  esac
fi
[[ "$WITH_ARC42" -eq 1 ]] && REQUIRED+=(arc42-c4)

ROOTS=("$PWD/.cursor/skills" "$PWD/.agents/skills" "$PWD/.claude/skills" "$HOME/.cursor/skills" "$HOME/.agents/skills" "$HOME/.claude/skills")
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
for root in "${ROOTS[@]}"; do
  [[ -d "$root" ]] || continue
  while IFS= read -r file; do
    name="$(awk 'BEGIN{y=0} NR==1&&$0=="---"{y=1;next} y&&$0=="---"{exit} y&&/^name:[[:space:]]*/{sub(/^name:[[:space:]]*/,"");gsub(/^[\047\"]|[\047\"]$/,"");print;exit}' "$file")"
    [[ -n "$name" ]] && printf '%s\t%s\n' "$name" "$file" >> "$TMP"
  done < <(find "$root" -type f -name SKILL.md 2>/dev/null)
done
find_exact(){ awk -F '\t' -v s="$1" '$1==s{print $2;exit}' "$TMP"; }

missing=0
printf 'Mode: %s\nFramework: %s\n\n' "$MODE" "$FRAMEWORK"
for skill in "${REQUIRED[@]}"; do
  match="$(find_exact "$skill")"
  if [[ -n "$match" ]]; then printf 'OK      %-36s %s\n' "$skill" "$match"; else printf 'MISSING %-36s\n' "$skill"; missing=1; fi
done

# Hardhat 3 companion skills are required only if the packages are present.
if [[ "$FRAMEWORK" == *hardhat3* && "$MODE" != "security-review" ]]; then
  eval "$($SCRIPT_DIR/detect-project-stack.sh --format env)"
  if [[ -n "${TOOLBOX_VIEM_VERSION:-}" ]]; then
    s=hardhat-toolbox-viem; m="$(find_exact "$s")"; [[ -n "$m" ]] && printf 'OK      %-36s %s\n' "$s" "$m" || { printf 'MISSING %-36s (detected package)\n' "$s"; missing=1; }
  fi
  if [[ -n "${TOOLBOX_MOCHA_ETHERS_VERSION:-}" ]]; then
    s=hardhat-toolbox-mocha-ethers; m="$(find_exact "$s")"; [[ -n "$m" ]] && printf 'OK      %-36s %s\n' "$s" "$m" || { printf 'MISSING %-36s (detected package)\n' "$s"; missing=1; }
  fi
fi

if [[ "$WITH_ADRS" -eq 1 ]]; then
  ADR_NAMES=(documentation-and-adrs adr-writing adr-skill architecture-decision-records create-architectural-decision-record adr-creating)
  found=""
  for s in "${ADR_NAMES[@]}"; do m="$(find_exact "$s")"; [[ -n "$m" ]] && { found="$m ($s)"; break; }; done
  [[ -n "$found" ]] && printf 'OK      %-36s %s\n' 'adr-writing capability' "$found" || { printf 'MISSING %-36s\n' 'adr-writing capability'; missing=1; }
fi

if [[ "$missing" -ne 0 ]]; then
  flags=""
  [[ "$WITH_ARC42" -eq 1 ]] && flags+=" --with-arc42"
  [[ "$WITH_ADRS" -eq 1 ]] && flags+=" --with-adrs"
  echo; echo "Missing requested skills. Preview exact commands with scripts/install-dependencies.sh --framework $FRAMEWORK$flags."; exit 1
fi
echo; echo "All requested skills were discovered."
