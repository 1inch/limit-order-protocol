#!/usr/bin/env bash
set -euo pipefail

APPLY=0
FRAMEWORK="auto"
ALL_FRAMEWORKS=0
WITH_ARC42=0
WITH_ADRS=0
AGENT=""
YES=0

usage() {
  cat <<'USAGE'
Usage: install-dependencies.sh [--apply] [--framework PROFILE] [--all-frameworks]
                               [--with-arc42] [--with-adrs] [--with-optional]
                               [--agent NAME[,NAME...]] [--yes]

Without --apply the script only prints the commands it would run.

  --framework   auto (default) | hardhat2 | hardhat3 | foundry
                | hybrid-hardhat2-foundry | hybrid-hardhat3-foundry
  --agent       agent target passed through to `npx skills add`. Defaults to the
                identifier whose project path matches the directory this
                orchestrator is installed under, so specialists land next to it
                (`.agents/skills/` -> universal, `.cursor/skills/` -> cursor,
                `.claude/skills/` -> claude-code). Use '*' for every agent, or
                `--agent auto` to let the CLI auto-detect.
  --yes         pass --yes to `npx skills add`.

Exit codes:
  0  preview printed, or install and re-check succeeded
  1  install applied but check-dependencies.sh still reports missing skills
  2  usage error
  3  framework profile could not be resolved
  4  python3 missing or manifest unreadable
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --framework) shift; FRAMEWORK="${1:-}" ;;
    --framework=*) FRAMEWORK="${1#*=}" ;;
    --all-frameworks) ALL_FRAMEWORKS=1 ;;
    --with-arc42) WITH_ARC42=1 ;;
    --with-adrs) WITH_ADRS=1 ;;
    --with-optional) WITH_ARC42=1; WITH_ADRS=1 ;;
    --agent) shift; AGENT="${1:-}" ;;
    --agent=*) AGENT="${1#*=}" ;;
    --yes|-y) YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/manifest.sh
. "$SCRIPT_DIR/lib/manifest.sh"
require_python3

DETECTED=""
detect_field() {
  [[ -n "$DETECTED" ]] || DETECTED="$("$SCRIPT_DIR/detect-project-stack.sh" --format env)"
  awk -F= -v k="$1" '$1==k{sub(/^[^=]*=/,""); print}' <<<"$DETECTED" | sed -e "s/^'//" -e "s/'$//"
}

if [[ "$ALL_FRAMEWORKS" -eq 0 && "$FRAMEWORK" == "auto" ]]; then
  FRAMEWORK="$(detect_field FRAMEWORK_PROFILE)"
fi

TARGET="$FRAMEWORK"
if [[ "$ALL_FRAMEWORKS" -eq 1 ]]; then
  TARGET="all"
elif ! manifest_query profiles | grep -qx -- "$FRAMEWORK"; then
  echo "Cannot resolve framework: ${FRAMEWORK:-<empty>}" >&2
  echo "Run scripts/detect-project-stack.sh, then pass --framework explicitly." >&2
  exit 3
fi

# The orchestrator lives under `<repo>/<agent-dir>/skills/<name>`. Install the
# specialists into that same directory rather than assuming an agent name: the
# CLI's agent-to-path mapping is version-dependent (`--agent cursor` has meant
# both `.cursor/skills/` and `.agents/skills/`), and hardcoding one is what
# previously scattered skills across two roots.
#
# `universal` is the CLI identifier whose project path is `.agents/skills/`.
detect_agent() {
  local dir
  dir="$(cd "$SCRIPT_DIR/../../.." && pwd)"      # .../<agent-dir>/skills -> <agent-dir>
  case "$(basename "$dir")" in
    .agents) echo "universal" ;;
    .cursor) echo "cursor" ;;
    .claude) echo "claude-code" ;;
    *) echo "" ;;
  esac
}

if [[ -z "$AGENT" ]]; then
  AGENT="$(detect_agent)"
fi
AGENT_ARG=""
AGENT_NOTE="CLI auto-detection"
case "$AGENT" in
  ""|auto) ;;
  # Quoted because '*' means "every agent" and must not be glob-expanded.
  *) AGENT_ARG=" --agent '$AGENT'"; AGENT_NOTE="$AGENT" ;;
esac
YES_ARG=""
[[ "$YES" -eq 1 ]] && YES_ARG=" --yes"

CONDITIONAL_ARGS=()
if [[ "$TARGET" == *hardhat3* || "$TARGET" == "all" ]]; then
  [[ -n "$(detect_field TOOLBOX_VIEM_VERSION)" ]] && CONDITIONAL_ARGS+=(--toolbox-viem)
  [[ -n "$(detect_field TOOLBOX_MOCHA_ETHERS_VERSION)" ]] && CONDITIONAL_ARGS+=(--toolbox-mocha-ethers)
fi

COMMANDS=()
while IFS=$'\t' read -r source skills; do
  [[ -n "$source" ]] || continue
  COMMANDS+=("npx skills@latest add $source --skill $skills$AGENT_ARG$YES_ARG")
done < <(
  manifest_query install --framework "$TARGET" \
    $([[ "$WITH_ARC42" -eq 1 ]] && echo --with-arc42) \
    $([[ "$WITH_ADRS" -eq 1 ]] && echo --with-adrs) \
    ${CONDITIONAL_ARGS[@]+"${CONDITIONAL_ARGS[@]}"}
)

if [[ "$APPLY" -eq 0 ]]; then
  printf 'Framework selection: %s\n' "$TARGET"
  printf 'Agent target:        %s\n' "$AGENT_NOTE"
  printf 'Manifest:            %s\n\n' "$SKILL_MANIFEST"
  printf 'Commands:\n\n'
  printf '%s\n' "${COMMANDS[@]}"
  cat <<'NOTE'

Re-run with --apply to execute.
If skills-lock.json already pins this exact set, `npx skills experimental_install`
restores it without resolving sources again.
NOTE
  exit 0
fi

for c in "${COMMANDS[@]}"; do
  echo
  echo "> $c"
  bash -lc "$c"
done

echo
echo "> re-checking installed skills"
CHECK_ARGS=(full)
[[ "$ALL_FRAMEWORKS" -eq 0 ]] && CHECK_ARGS+=(--framework "$FRAMEWORK")
[[ "$WITH_ARC42" -eq 1 ]] && CHECK_ARGS+=(--with-arc42)
[[ "$WITH_ADRS" -eq 1 ]] && CHECK_ARGS+=(--with-adrs)
if "$SCRIPT_DIR/check-dependencies.sh" "${CHECK_ARGS[@]}"; then
  echo
  echo "Install complete: every requested skill resolves."
  exit 0
fi
echo
echo "Install ran but check-dependencies.sh still reports missing skills. Resolve them before starting a phase." >&2
exit 1
