#!/usr/bin/env bash
set -euo pipefail

FORMAT="markdown"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --format) shift; FORMAT="${1:-markdown}" ;;
    --format=*) FORMAT="${1#*=}" ;;
    --format-env) FORMAT="env" ;;
    env|markdown) FORMAT="$1" ;;
    -h|--help) echo "Usage: detect-project-stack.sh [--format env|markdown]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

json_value() {
  local key="$1"
  python3 - "$key" <<'PY'
import json, os, sys
key = sys.argv[1]
try:
    with open('package.json', encoding='utf-8') as f:
        p = json.load(f)
except Exception:
    print('')
    raise SystemExit
if key == 'type':
    print(p.get('type',''))
elif key == 'scripts':
    print('\n'.join(str(v) for v in p.get('scripts',{}).values()))
else:
    for section in ('dependencies','devDependencies','peerDependencies','optionalDependencies'):
        if key in p.get(section,{}):
            print(p[section][key])
            break
    else:
        print('')
PY
}

installed_version() {
  local package_path="$1"
  python3 - "$package_path" <<'PY'
import json, os, sys
p = os.path.join('node_modules', *sys.argv[1].split('/'), 'package.json')
try:
    print(json.load(open(p, encoding='utf-8')).get('version',''))
except Exception:
    print('')
PY
}

first_existing() {
  for f in "$@"; do [[ -f "$f" ]] && { echo "$f"; return; }; done
  echo ""
}

version_major() {
  printf '%s' "$1" | sed -E 's/^[^0-9]*([0-9]+).*/\1/' | grep -E '^[0-9]+$' || true
}

HH_CONFIG="$(first_existing hardhat.config.ts hardhat.config.mts hardhat.config.cts hardhat.config.js hardhat.config.mjs hardhat.config.cjs)"
HH_DECLARED="$(json_value hardhat)"
HH_INSTALLED="$(installed_version hardhat)"
HH_VERSION="${HH_INSTALLED:-$HH_DECLARED}"
HH_MAJOR="$(version_major "$HH_VERSION")"
PKG_TYPE="$(json_value type)"
PKG_SCRIPTS="$(json_value scripts)"

FOUNDRY_CONFIG="$(first_existing foundry.toml)"
REMAP_FILE="$(first_existing remappings.txt)"

HH_SCORE=0
[[ -n "$HH_VERSION" ]] && HH_SCORE=$((HH_SCORE+3))
[[ -n "$HH_CONFIG" ]] && HH_SCORE=$((HH_SCORE+2))
grep -qiE '(^|[[:space:]])(npx[[:space:]]+)?hardhat([[:space:]]|$)' <<<"$PKG_SCRIPTS" && HH_SCORE=$((HH_SCORE+1)) || true

FOUNDRY_SCORE=0
[[ -n "$FOUNDRY_CONFIG" ]] && FOUNDRY_SCORE=$((FOUNDRY_SCORE+3))
[[ -n "$REMAP_FILE" ]] && FOUNDRY_SCORE=$((FOUNDRY_SCORE+1))
[[ -d lib/forge-std ]] && FOUNDRY_SCORE=$((FOUNDRY_SCORE+1))
find test -maxdepth 4 -type f -name '*.t.sol' -print -quit 2>/dev/null | grep -q . && FOUNDRY_SCORE=$((FOUNDRY_SCORE+1)) || true
find script -maxdepth 4 -type f -name '*.s.sol' -print -quit 2>/dev/null | grep -q . && FOUNDRY_SCORE=$((FOUNDRY_SCORE+1)) || true
grep -qiE '(^|[[:space:]])forge([[:space:]]|$)' <<<"$PKG_SCRIPTS" && FOUNDRY_SCORE=$((FOUNDRY_SCORE+2)) || true
if [[ -d .github/workflows ]]; then
  grep -RqiE '(^|[[:space:]])forge (build|test|coverage|snapshot|script)' .github/workflows 2>/dev/null && FOUNDRY_SCORE=$((FOUNDRY_SCORE+2)) || true
fi

FOUNDRY_STRONG=0
[[ "$FOUNDRY_SCORE" -ge 3 ]] && FOUNDRY_STRONG=1

FRAMEWORK="unknown"
if [[ "$HH_MAJOR" == "2" && "$FOUNDRY_STRONG" -eq 1 ]]; then
  FRAMEWORK="hybrid-hardhat2-foundry"
elif [[ "$HH_MAJOR" == "3" && "$FOUNDRY_STRONG" -eq 1 ]]; then
  FRAMEWORK="hybrid-hardhat3-foundry"
elif [[ "$HH_MAJOR" == "2" ]]; then
  FRAMEWORK="hardhat2"
elif [[ "$HH_MAJOR" == "3" ]]; then
  FRAMEWORK="hardhat3"
elif [[ "$FOUNDRY_STRONG" -eq 1 && "$HH_SCORE" -eq 0 ]]; then
  FRAMEWORK="foundry"
fi

CONFIG_EXT="${HH_CONFIG##*.}"
count_files() {
  local pattern="$1"; shift
  local count=0 d
  for d in "$@"; do
    [[ -d "$d" ]] || continue
    while IFS= read -r _; do count=$((count+1)); done < <(find "$d" -type f -name "$pattern" -print 2>/dev/null)
  done
  echo "$count"
}
TS_COUNT="$(count_files '*.ts' test tests scripts deploy deployments tasks ignition)"
JS_COUNT="$(count_files '*.js' test tests scripts deploy deployments tasks ignition)"
CJS_COUNT="$(count_files '*.cjs' test tests scripts deploy deployments tasks ignition)"
MJS_COUNT="$(count_files '*.mjs' test tests scripts deploy deployments tasks ignition)"
SOL_TEST_COUNT="$(count_files '*.t.sol' test tests)"

HOST_LANGUAGE="unknown"
if [[ "$TS_COUNT" -gt 0 && $((JS_COUNT+CJS_COUNT+MJS_COUNT)) -gt 0 ]]; then HOST_LANGUAGE="mixed-js-ts"
elif [[ "$TS_COUNT" -gt 0 || "$CONFIG_EXT" =~ ^(ts|mts|cts)$ ]]; then HOST_LANGUAGE="typescript"
elif [[ $((JS_COUNT+CJS_COUNT+MJS_COUNT)) -gt 0 || "$CONFIG_EXT" =~ ^(js|mjs|cjs)$ ]]; then HOST_LANGUAGE="javascript"
elif [[ "$FRAMEWORK" == "foundry" ]]; then HOST_LANGUAGE="solidity"
fi

MODULE_SYSTEM="not-applicable"
if [[ "$HOST_LANGUAGE" != "solidity" && "$HOST_LANGUAGE" != "unknown" ]]; then
  if [[ "$PKG_TYPE" == "module" || "$CONFIG_EXT" == "mjs" || "$CONFIG_EXT" == "mts" ]]; then
    MODULE_SYSTEM="esm"
  elif [[ "$CONFIG_EXT" == "cjs" || "$CONFIG_EXT" == "cts" ]]; then
    MODULE_SYSTEM="commonjs"
  else
    MODULE_SYSTEM="commonjs-or-project-defined"
  fi
fi

TOOLBOX_VIEM="$(json_value '@nomicfoundation/hardhat-toolbox-viem')"
TOOLBOX_ETHERS="$(json_value '@nomicfoundation/hardhat-toolbox-mocha-ethers')"
ETHERS_VERSION="$(json_value ethers)"
VIEM_VERSION="$(json_value viem)"

FORGE_VERSION=""
if command -v forge >/dev/null 2>&1; then
  FORGE_VERSION="$(forge --version 2>/dev/null | head -n1 || true)"
fi

LOCKFILE="$(first_existing pnpm-lock.yaml yarn.lock package-lock.json bun.lock bun.lockb)"

if [[ "$FORMAT" == "env" ]]; then
  emit() { printf '%s=%q\n' "$1" "$2"; }
  emit FRAMEWORK_PROFILE "$FRAMEWORK"
  emit HARDHAT_VERSION "$HH_VERSION"
  emit HARDHAT_MAJOR "$HH_MAJOR"
  emit HARDHAT_CONFIG "$HH_CONFIG"
  emit HARDHAT_SCORE "$HH_SCORE"
  emit FOUNDRY_CONFIG "$FOUNDRY_CONFIG"
  emit FOUNDRY_SCORE "$FOUNDRY_SCORE"
  emit FOUNDRY_VERSION "$FORGE_VERSION"
  emit HOST_LANGUAGE "$HOST_LANGUAGE"
  emit MODULE_SYSTEM "$MODULE_SYSTEM"
  emit PACKAGE_TYPE "$PKG_TYPE"
  emit TOOLBOX_VIEM_VERSION "$TOOLBOX_VIEM"
  emit TOOLBOX_MOCHA_ETHERS_VERSION "$TOOLBOX_ETHERS"
  emit ETHERS_VERSION "$ETHERS_VERSION"
  emit VIEM_VERSION "$VIEM_VERSION"
  emit TS_TEST_FILES "$TS_COUNT"
  emit JS_TEST_FILES "$JS_COUNT"
  emit SOLIDITY_TEST_FILES "$SOL_TEST_COUNT"
  emit LOCKFILE "$LOCKFILE"
  exit 0
fi

cat <<MD
# Detected Solidity project stack

| Field | Value |
|---|---|
| Framework profile | **$FRAMEWORK** |
| Hardhat version | \`${HH_VERSION:-not found}\` |
| Hardhat config | \`${HH_CONFIG:-not found}\` |
| Hardhat evidence score | $HH_SCORE |
| Foundry config | \`${FOUNDRY_CONFIG:-not found}\` |
| Foundry evidence score | $FOUNDRY_SCORE |
| Forge version | \`${FORGE_VERSION:-not available}\` |
| Host language | $HOST_LANGUAGE |
| Module system | $MODULE_SYSTEM |
| Solidity test files | $SOL_TEST_COUNT |
| TypeScript host files | $TS_COUNT |
| JavaScript host files | $((JS_COUNT+CJS_COUNT+MJS_COUNT)) |
| HH3 toolbox viem | \`${TOOLBOX_VIEM:-not declared}\` |
| HH3 toolbox mocha/ethers | \`${TOOLBOX_ETHERS:-not declared}\` |
| ethers | \`${ETHERS_VERSION:-not declared}\` |
| viem | \`${VIEM_VERSION:-not declared}\` |
| Lockfile | \`${LOCKFILE:-not found}\` |

> Detection is evidence-based but advisory. A \`.t.sol\` file alone does not imply Foundry because Hardhat 3 also supports Solidity tests. Verify ambiguous or stale tooling before implementation.
MD
