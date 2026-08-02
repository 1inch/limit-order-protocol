#!/usr/bin/env bash
# Shared manifest access layer. Source this file; do not execute it.
#
# Every script in this skill reaches skill-dependencies.json through
# manifest_query so the dependency graph is declared in exactly one place.

SKILL_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "$SKILL_LIB_DIR/../.." && pwd)"
SKILL_MANIFEST="${SKILL_MANIFEST:-$SKILL_ROOT/skill-dependencies.json}"
export SKILL_MANIFEST

require_python3() {
  if ! command -v python3 >/dev/null 2>&1; then
    cat >&2 <<'ERR'
python3 is required by solidity-protocol-reconstruction-orchestrator but was not found on PATH.

It reads skill-dependencies.json and package.json; both use the Python standard
library only, so any python3 >= 3.8 works.

  Debian/Ubuntu : sudo apt-get install -y python3
  macOS         : brew install python3
  Other         : install python3 and re-run, or set PATH to an existing interpreter.
ERR
    exit 4
  fi
}

manifest_query() {
  require_python3
  if [[ ! -f "$SKILL_MANIFEST" ]]; then
    echo "Manifest not found: $SKILL_MANIFEST" >&2
    exit 4
  fi
  python3 "$SKILL_LIB_DIR/manifest.py" "$@"
}
