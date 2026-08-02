#!/usr/bin/env bash
# Shared manifest access layer. Source this file; do not execute it.
#
# Every script in this skill reaches skill-dependencies.json through
# manifest_query so the dependency graph is declared in exactly one place.

SKILL_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "$SKILL_LIB_DIR/../.." && pwd)"
SKILL_MANIFEST="${SKILL_MANIFEST:-$SKILL_ROOT/skill-dependencies.json}"
export SKILL_MANIFEST

# Keep __pycache__ out of the skill directory: these scripts must never modify
# the tree they are inspecting.
export PYTHONDONTWRITEBYTECODE=1

require_python3() {
  local why=""
  if ! command -v python3 >/dev/null 2>&1; then
    why="not found on PATH"
  elif ! python3 -c 'import json, argparse' >/dev/null 2>&1; then
    why="found at $(command -v python3) but cannot run a trivial stdlib import"
  fi
  [[ -z "$why" ]] && return 0
  cat >&2 <<ERR
python3 is required by solidity-protocol-reconstruction-orchestrator: $why.

It reads skill-dependencies.json and package.json using the Python standard
library only, so any working python3 >= 3.8 is enough.

  Debian/Ubuntu : sudo apt-get install -y python3
  macOS         : brew install python3
  Other         : install python3, or put a working interpreter on PATH.
ERR
  exit 4
}

manifest_query() {
  require_python3
  if [[ ! -f "$SKILL_MANIFEST" ]]; then
    echo "Manifest not found: $SKILL_MANIFEST" >&2
    exit 4
  fi
  local out
  if ! out="$(python3 "$SKILL_LIB_DIR/manifest.py" "$@" 2>&1)"; then
    [[ -n "$out" ]] && printf '%s\n' "$out" >&2
    echo "Manifest query failed: manifest.py $*" >&2
    exit 4
  fi
  [[ -n "$out" ]] && printf '%s\n' "$out"
  return 0
}
