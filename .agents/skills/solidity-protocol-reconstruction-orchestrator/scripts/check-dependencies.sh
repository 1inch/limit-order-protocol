#!/usr/bin/env bash
set -euo pipefail

MODE="full"
FRAMEWORK="auto"
WITH_ARC42=0
WITH_ADRS=0

usage() {
  cat <<'USAGE'
Usage: check-dependencies.sh [mode] [--framework PROFILE] [--with-arc42] [--with-adrs] [--with-optional]

Modes:   check | analyze | implement-tests | security-review | full | resume
Profiles: auto | hardhat2 | hardhat3 | foundry | hybrid-hardhat2-foundry | hybrid-hardhat3-foundry

Exit codes:
  0  every requested skill resolved
  1  at least one requested skill is missing
  2  usage error
  3  framework profile could not be resolved
  4  python3 missing or manifest unreadable
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    check|analyze|implement-tests|security-review|full|resume) MODE="$1" ;;
    --mode) shift; MODE="${1:-}" ;;
    --mode=*) MODE="${1#*=}" ;;
    --framework) shift; FRAMEWORK="${1:-}" ;;
    --framework=*) FRAMEWORK="${1#*=}" ;;
    --with-arc42) WITH_ARC42=1 ;;
    --with-adrs) WITH_ADRS=1 ;;
    --with-optional) WITH_ARC42=1; WITH_ADRS=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/manifest.sh
. "$SCRIPT_DIR/lib/manifest.sh"

KNOWN_MODES="$(manifest_query modes)"
if ! grep -qx -- "$MODE" <<<"$KNOWN_MODES"; then
  echo "Unknown mode: $MODE" >&2
  echo "Known modes: $(tr '\n' ' ' <<<"$KNOWN_MODES")" >&2
  exit 2
fi

DETECTED=""
detect() {
  [[ -n "$DETECTED" ]] && return 0
  DETECTED="$("$SCRIPT_DIR/detect-project-stack.sh" --format env)"
}
detect_field() {
  detect
  awk -F= -v k="$1" '$1==k{sub(/^[^=]*=/,""); print}' <<<"$DETECTED" | sed -e "s/^'//" -e "s/'$//"
}

if [[ "$FRAMEWORK" == "auto" ]]; then
  FRAMEWORK="$(detect_field FRAMEWORK_PROFILE)"
  AMBIGUITY="$(detect_field AMBIGUITY_REASON)"
fi

if ! manifest_query profiles | grep -qx -- "$FRAMEWORK"; then
  echo "Cannot resolve framework profile: ${FRAMEWORK:-<empty>}" >&2
  [[ -n "${AMBIGUITY:-}" ]] && echo "Detector ambiguity: ${AMBIGUITY//\\/}" >&2
  echo "Run scripts/detect-project-stack.sh for the evidence, then pass --framework explicitly and record the reason in STATUS.md." >&2
  exit 3
fi

# Collected with a read loop: bash 3.2 has no builtin that slurps lines into an
# array.
REQUIRED=()
while IFS= read -r skill; do
  if [[ -n "$skill" ]]; then REQUIRED+=("$skill"); fi
done < <(
  manifest_query required --mode "$MODE" --framework "$FRAMEWORK" \
    $([[ "$WITH_ARC42" -eq 1 ]] && echo --with-arc42)
)

# ------------------------------------------------------------- skill lookup
#
# Prefer the install root that already contains this orchestrator: if a stale
# copy of a skill exists under another root, the orchestrator's own root is the
# one the agent is actually running from.
PREFERRED_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ROOTS=(
  "$PREFERRED_ROOT"
  "$PWD/.agents/skills" "$PWD/.cursor/skills" "$PWD/.claude/skills"
  "$HOME/.agents/skills" "$HOME/.cursor/skills" "$HOME/.claude/skills"
)

# An explicit template: BSD mktemp on macOS does not accept a bare `mktemp`.
TMP="$(mktemp "${TMPDIR:-/tmp}/spro-skills.XXXXXX")"; trap 'rm -f "$TMP"' EXIT
SEEN_ROOTS=()
for root in "${ROOTS[@]}"; do
  [[ -d "$root" ]] || continue
  root="$(cd "$root" && pwd)"
  skip=0
  for prior in ${SEEN_ROOTS[@]+"${SEEN_ROOTS[@]}"}; do
    [[ "$prior" == "$root" ]] && skip=1
  done
  [[ "$skip" -eq 1 ]] && continue
  SEEN_ROOTS+=("$root")
  while IFS= read -r file; do
    name="$(awk 'BEGIN{y=0} NR==1&&$0=="---"{y=1;next} y&&$0=="---"{exit} y&&/^name:[[:space:]]*/{sub(/^name:[[:space:]]*/,"");gsub(/^[\047\"]|[\047\"]$/,"");print;exit}' "$file")"
    [[ -n "$name" ]] && printf '%s\t%s\t%s\n' "$name" "$file" "$root" >> "$TMP"
  done < <(find "$root" -type f -name SKILL.md 2>/dev/null)
done

find_all() { awk -F '\t' -v s="$1" '$1==s{print $2}' "$TMP"; }

CONFLICTS=()
report() {
  local skill="$1" label="${2:-$1}" note="${3:-}"
  local matches=()
  local match_line
  while IFS= read -r match_line; do
    if [[ -n "$match_line" ]]; then matches+=("$match_line"); fi
  done < <(find_all "$skill")
  if [[ "${#matches[@]}" -eq 0 ]]; then
    printf 'MISSING %-36s %s\n' "$label" "$note"
    return 1
  fi
  printf 'OK      %-36s %s%s\n' "$label" "${matches[0]}" "${note:+  $note}"
  if [[ "${#matches[@]}" -gt 1 ]]; then
    CONFLICTS+=("$skill")
    local extra
    for extra in "${matches[@]:1}"; do
      printf '        %-36s also found at %s\n' "" "$extra"
    done
  fi
  return 0
}

missing=0
printf 'Mode:      %s\n' "$MODE"
printf 'Phases:    %s\n' "$(manifest_query mode-phases --mode "$MODE")"
printf 'Framework: %s\n' "$FRAMEWORK"
printf 'Root:      %s\n\n' "$PREFERRED_ROOT"

for skill in "${REQUIRED[@]}"; do
  report "$skill" || missing=1
done

# Hardhat 3 companions are required only when their package is present.
if [[ "$FRAMEWORK" == *hardhat3* ]]; then
  while IFS=$'\t' read -r name field package; do
    [[ -n "$name" ]] || continue
    [[ -n "$(detect_field "$field")" ]] || continue
    report "$name" "$name" "(detected $package)" || missing=1
  done < <(manifest_query conditional --framework "$FRAMEWORK")
fi

if [[ "$WITH_ADRS" -eq 1 ]]; then
  found=""
  while IFS= read -r alias; do
    match="$(find_all "$alias" | head -n1)"
    [[ -n "$match" ]] && { found="$match ($alias)"; break; }
  done < <(manifest_query adr-aliases)
  if [[ -n "$found" ]]; then
    printf 'OK      %-36s %s\n' 'adr-writing capability' "$found"
  else
    printf 'MISSING %-36s\n' 'adr-writing capability'
    missing=1
  fi
fi

# Skills this orchestrator must never activate. Presence is not an error, but
# the agent has to know they are on disk next to the skills it does load.
while IFS=$'\t' read -r name _source reason; do
  [[ -n "$name" ]] || continue
  match="$(find_all "$name" | head -n1)"
  [[ -n "$match" ]] && printf 'FORBIDDEN %-34s %s\n          %s\n' "$name" "$match" "$reason"
done < <(manifest_query forbidden)

if [[ "${#CONFLICTS[@]}" -gt 0 ]]; then
  echo
  echo "WARNING: duplicate installations detected for: ${CONFLICTS[*]}"
  echo "The first path listed above wins. Remove the stale copies, then record the resolved paths in STATUS.md."
fi

if [[ -n "${AMBIGUITY:-}" ]]; then
  echo
  echo "Detector ambiguity: ${AMBIGUITY//\\/}"
fi

if [[ "$missing" -ne 0 ]]; then
  flags=""
  [[ "$WITH_ARC42" -eq 1 ]] && flags+=" --with-arc42"
  [[ "$WITH_ADRS" -eq 1 ]] && flags+=" --with-adrs"
  echo
  echo "Missing requested skills. Preview exact commands with:"
  echo "  scripts/install-dependencies.sh --framework $FRAMEWORK$flags"
  exit 1
fi

echo
echo "All requested skills were discovered."
