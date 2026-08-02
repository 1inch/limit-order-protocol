#!/usr/bin/env bash
set -euo pipefail

FORMAT="markdown"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --format) shift; FORMAT="${1:-markdown}" ;;
    --format=*) FORMAT="${1#*=}" ;;
    --format-env) FORMAT="env" ;;
    env|markdown|json) FORMAT="$1" ;;
    -h|--help)
      cat <<'USAGE'
Usage: detect-project-stack.sh [--format env|markdown|json]

Detects the framework profile, host language, module system, and the stack
preservation baseline of the Solidity repository in the current directory.

Formats:
  markdown  human-readable report (default)
  env       KEY=value lines, shell-quoted
  json      single JSON object, all values are strings

Exit codes:
  0  detection completed (the profile may still be `unknown`)
  2  usage error
  4  python3 missing
USAGE
      exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
case "$FORMAT" in
  env|markdown|json) ;;
  *) echo "Unknown format: $FORMAT (expected env, markdown, or json)" >&2; exit 2 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/manifest.sh
. "$SCRIPT_DIR/lib/manifest.sh"
require_python3

EVIDENCE=()
AMBIGUITY=()
note_evidence() { EVIDENCE+=("$1"); }
note_ambiguity() { AMBIGUITY+=("$1"); }
join_notes() {
  local out="" item
  for item in "$@"; do
    [[ -n "$item" ]] || continue
    out="${out:+$out; }$item"
  done
  printf '%s' "$out"
}
join_commas() {
  local out="" item
  for item in "$@"; do
    [[ -n "$item" ]] || continue
    out="${out:+$out,}$item"
  done
  printf '%s' "$out"
}

# ---------------------------------------------------------------- package.json

json_value() {
  local key="$1"
  python3 - "$key" <<'PY'
import json, sys
key = sys.argv[1]
try:
    with open('package.json', encoding='utf-8') as f:
        p = json.load(f)
except Exception:
    print('')
    raise SystemExit
if key in ('type', 'packageManager'):
    print(p.get(key, ''))
elif key == 'scripts':
    print('\n'.join(str(v) for v in p.get('scripts', {}).values()))
else:
    for section in ('dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'):
        if key in p.get(section, {}):
            print(p[section][key])
            break
    else:
        print('')
PY
}

installed_version() {
  python3 - "$1" <<'PY'
import json, os, sys
p = os.path.join('node_modules', *sys.argv[1].split('/'), 'package.json')
try:
    print(json.load(open(p, encoding='utf-8')).get('version', ''))
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

count_files() {
  local pattern="$1"; shift
  local count=0 d
  for d in "$@"; do
    [[ -n "$d" && -d "$d" ]] || continue
    while IFS= read -r _; do count=$((count + 1)); done < <(
      find "$d" -type f -name "$pattern" -not -path '*/node_modules/*' -not -path '*/lib/forge-std/*' -print 2>/dev/null
    )
  done
  echo "$count"
}

has_file() {
  local pattern="$1"; shift
  local d
  for d in "$@"; do
    [[ -n "$d" && -d "$d" ]] || continue
    find "$d" -type f -name "$pattern" -not -path '*/node_modules/*' -print -quit 2>/dev/null | grep -q . && return 0
  done
  return 1
}

dedupe() {
  local seen=() item candidate
  for item in "$@"; do
    [[ -n "$item" ]] || continue
    for candidate in ${seen[@]+"${seen[@]}"}; do
      [[ "$candidate" == "$item" ]] && continue 2
    done
    seen+=("$item")
  done
  printf '%s\n' ${seen[@]+"${seen[@]}"}
}

HAS_PACKAGE_JSON=0
[[ -f package.json ]] && HAS_PACKAGE_JSON=1

HH_CONFIG="$(first_existing hardhat.config.ts hardhat.config.mts hardhat.config.cts hardhat.config.js hardhat.config.mjs hardhat.config.cjs)"
HH_DECLARED="$(json_value hardhat)"
HH_INSTALLED="$(installed_version hardhat)"
HH_VERSION="${HH_INSTALLED:-$HH_DECLARED}"
HH_MAJOR="$(version_major "$HH_VERSION")"
HH_VERSION_SOURCE=""
if [[ -n "$HH_INSTALLED" ]]; then HH_VERSION_SOURCE="node_modules"
elif [[ -n "$HH_DECLARED" ]]; then HH_VERSION_SOURCE="package.json"
fi
PKG_TYPE="$(json_value type)"
PKG_MANAGER_FIELD="$(json_value packageManager)"
PKG_SCRIPTS="$(json_value scripts)"

FOUNDRY_CONFIG="$(first_existing foundry.toml)"
REMAP_FILE="$(first_existing remappings.txt)"

# ---------------------------------------------------------------- foundry.toml

FOUNDRY_FACTS=""
if [[ -n "$FOUNDRY_CONFIG" ]]; then
  FOUNDRY_FACTS="$(python3 - "$FOUNDRY_CONFIG" <<'PY'
import os, re, sys

path = sys.argv[1]

def emit(key, value):
    if value is None:
        return
    if isinstance(value, bool):
        value = 'true' if value else 'false'
    elif isinstance(value, (list, tuple)):
        value = ','.join(str(v) for v in value)
    value = str(value).replace('\t', ' ').replace('\n', ' ').strip()
    if value:
        print('%s\t%s' % (key, value))

def fallback_parse(text):
    """Minimal TOML subset parser used only when tomllib is unavailable."""
    data_root = {}
    cursor = data_root
    for raw in text.splitlines():
        line = raw.split('#', 1)[0].strip()
        if not line:
            continue
        if line.startswith('[['):
            name = line.strip('[]').strip()
            cursor = {}
            node = data_root
            parts = name.split('.')
            for part in parts[:-1]:
                node = node.setdefault(part, {})
            node.setdefault(parts[-1], []).append(cursor)
            continue
        if line.startswith('['):
            name = line.strip('[]').strip()
            node = data_root
            for part in name.split('.'):
                nxt = node.get(part)
                if not isinstance(nxt, dict):
                    nxt = {}
                    node[part] = nxt
                node = nxt
            cursor = node
            continue
        if '=' not in line:
            continue
        key, value = line.split('=', 1)
        key, value = key.strip().strip('"\''), value.strip()
        if value.startswith('['):
            items = re.findall(r'"([^"]*)"|\'([^\']*)\'', value)
            cursor[key] = [a or b for a, b in items]
        elif value in ('true', 'false'):
            cursor[key] = value == 'true'
        else:
            cursor[key] = value.strip('"\'')
    return data_root

try:
    import tomllib
    with open(path, 'rb') as handle:
        data = tomllib.load(handle)
except Exception:
    try:
        with open(path, encoding='utf-8') as handle:
            data = fallback_parse(handle.read())
    except Exception:
        raise SystemExit

profiles = data.get('profile') or {}
default = profiles.get('default') or {}

def pick(key, *fallbacks):
    for source in (default, data):
        if key in source:
            return source[key]
    for name in fallbacks:
        for source in (default, data):
            if name in source:
                return source[name]
    return None

emit('PROFILES', sorted(profiles.keys()))
emit('SRC', pick('src') or 'src')
emit('TEST', pick('test') or 'test')
emit('SCRIPT', pick('script') or 'script')
emit('OUT', pick('out') or 'out')
libs = pick('libs') or ['lib']
emit('LIBS', libs)
remappings = pick('remappings') or []
emit('REMAPPINGS_COUNT', len(remappings))
emit('FFI', pick('ffi'))
emit('SOLC', pick('solc', 'solc_version'))
emit('AUTO_DETECT_SOLC', pick('auto_detect_solc'))
emit('OPTIMIZER', pick('optimizer'))
emit('OPTIMIZER_RUNS', pick('optimizer_runs'))
emit('VIA_IR', pick('via_ir'))
emit('EVM_VERSION', pick('evm_version'))

perms = []
raw_perms = pick('fs_permissions') or []
if isinstance(raw_perms, list):
    for item in raw_perms:
        if isinstance(item, dict):
            perms.append('%s:%s' % (item.get('access', '?'), item.get('path', '?')))
emit('FS_PERMISSIONS', ';'.join(perms))

rpc = data.get('rpc_endpoints') or {}
emit('RPC_ALIASES', sorted(rpc.keys()))
env_vars = set()
for value in rpc.values():
    if isinstance(value, str):
        env_vars.update(re.findall(r'\$\{([A-Za-z_][A-Za-z0-9_]*)\}', value))
    elif isinstance(value, dict):
        env_vars.update(re.findall(r'\$\{([A-Za-z_][A-Za-z0-9_]*)\}', str(value)))
emit('RPC_ENV_VARS', sorted(env_vars))

def nested(name, key):
    for source in (default, data):
        block = source.get(name)
        if isinstance(block, dict) and key in block:
            return block[key]
    return None

emit('FUZZ_RUNS', nested('fuzz', 'runs'))
emit('INVARIANT_RUNS', nested('invariant', 'runs'))
emit('INVARIANT_DEPTH', nested('invariant', 'depth'))
emit('INVARIANT_FAIL_ON_REVERT', nested('invariant', 'fail_on_revert'))
PY
)" || FOUNDRY_FACTS=""
fi

fget() {
  [[ -n "$FOUNDRY_FACTS" ]] || { echo ""; return; }
  printf '%s\n' "$FOUNDRY_FACTS" | awk -F '\t' -v k="$1" '$1==k{print $2; exit}'
}

FOUNDRY_SRC="$(fget SRC)"
FOUNDRY_TEST_PATH="$(fget TEST)"
FOUNDRY_SCRIPT_PATH="$(fget SCRIPT)"
FOUNDRY_OUT="$(fget OUT)"
FOUNDRY_LIBS="$(fget LIBS)"
FOUNDRY_PROFILES="$(fget PROFILES)"
FOUNDRY_FFI="$(fget FFI)"
FOUNDRY_FS_PERMISSIONS="$(fget FS_PERMISSIONS)"
FOUNDRY_RPC_ALIASES="$(fget RPC_ALIASES)"
FOUNDRY_SOLC="$(fget SOLC)"
FOUNDRY_AUTO_DETECT_SOLC="$(fget AUTO_DETECT_SOLC)"
FOUNDRY_OPTIMIZER="$(fget OPTIMIZER)"
FOUNDRY_OPTIMIZER_RUNS="$(fget OPTIMIZER_RUNS)"
FOUNDRY_VIA_IR="$(fget VIA_IR)"
FOUNDRY_EVM_VERSION="$(fget EVM_VERSION)"
FOUNDRY_FUZZ_RUNS="$(fget FUZZ_RUNS)"
FOUNDRY_INVARIANT_RUNS="$(fget INVARIANT_RUNS)"
FOUNDRY_INVARIANT_DEPTH="$(fget INVARIANT_DEPTH)"
FOUNDRY_INVARIANT_FAIL_ON_REVERT="$(fget INVARIANT_FAIL_ON_REVERT)"
FOUNDRY_TOML_REMAPPING_COUNT="$(fget REMAPPINGS_COUNT)"

# Foundry-configured paths, always widened with the conventional alternatives so
# the score check and the file counts read the same directories.
mapfile -t SOL_TEST_DIRS < <(dedupe "$FOUNDRY_TEST_PATH" test tests)
mapfile -t SOL_SCRIPT_DIRS < <(dedupe "$FOUNDRY_SCRIPT_PATH" script scripts)

# ------------------------------------------------------------------- scoring

HH_SCORE=0
if [[ -n "$HH_VERSION" ]]; then
  HH_SCORE=$((HH_SCORE + 3))
  note_evidence "hardhat ${HH_VERSION} resolved from ${HH_VERSION_SOURCE}"
fi
if [[ -n "$HH_CONFIG" ]]; then
  HH_SCORE=$((HH_SCORE + 2))
  note_evidence "hardhat config ${HH_CONFIG}"
fi
HH_IN_SCRIPTS=0
if grep -qiE '(^|[[:space:]])(npx[[:space:]]+)?hardhat([[:space:]]|$)' <<<"$PKG_SCRIPTS"; then
  HH_SCORE=$((HH_SCORE + 1)); HH_IN_SCRIPTS=1
  note_evidence "package.json scripts invoke hardhat"
fi

FOUNDRY_SCORE=0
if [[ -n "$FOUNDRY_CONFIG" ]]; then
  FOUNDRY_SCORE=$((FOUNDRY_SCORE + 3))
  note_evidence "foundry.toml present"
fi
if [[ -n "$REMAP_FILE" ]]; then
  FOUNDRY_SCORE=$((FOUNDRY_SCORE + 1))
  note_evidence "remappings.txt present"
fi

CORROBORATION=0
FORGE_STD_DIR=""
for libdir in ${FOUNDRY_LIBS:-lib}; do
  IFS=',' read -r -a _libs <<<"$libdir"
  for l in "${_libs[@]}"; do
    [[ -d "$l/forge-std" ]] && FORGE_STD_DIR="$l/forge-std"
  done
done
[[ -z "$FORGE_STD_DIR" && -d lib/forge-std ]] && FORGE_STD_DIR="lib/forge-std"
if [[ -n "$FORGE_STD_DIR" ]]; then
  FOUNDRY_SCORE=$((FOUNDRY_SCORE + 1)); CORROBORATION=$((CORROBORATION + 1))
  note_evidence "forge-std vendored at ${FORGE_STD_DIR}"
fi
if has_file '*.t.sol' ${SOL_TEST_DIRS[@]+"${SOL_TEST_DIRS[@]}"}; then
  FOUNDRY_SCORE=$((FOUNDRY_SCORE + 1)); CORROBORATION=$((CORROBORATION + 1))
  note_evidence "*.t.sol under $(join_commas "${SOL_TEST_DIRS[@]}")"
fi
if has_file '*.s.sol' ${SOL_SCRIPT_DIRS[@]+"${SOL_SCRIPT_DIRS[@]}"}; then
  FOUNDRY_SCORE=$((FOUNDRY_SCORE + 1)); CORROBORATION=$((CORROBORATION + 1))
  note_evidence "*.s.sol under $(join_commas "${SOL_SCRIPT_DIRS[@]}")"
fi
if grep -qiE '(^|[[:space:]])forge([[:space:]]|$)' <<<"$PKG_SCRIPTS"; then
  FOUNDRY_SCORE=$((FOUNDRY_SCORE + 2)); CORROBORATION=$((CORROBORATION + 1))
  note_evidence "package.json scripts invoke forge"
fi
if [[ -d .github/workflows ]] && grep -RqiE '(^|[[:space:]])forge (build|test|coverage|snapshot|script)' .github/workflows 2>/dev/null; then
  FOUNDRY_SCORE=$((FOUNDRY_SCORE + 2)); CORROBORATION=$((CORROBORATION + 1))
  note_evidence "CI workflows invoke forge"
fi

# `foundry.toml` on its own is not proof of an active Foundry suite: Hardhat
# repositories carry one purely for remappings. Require corroboration.
FOUNDRY_STRONG=0
if [[ -n "$FOUNDRY_CONFIG" && "$CORROBORATION" -ge 1 ]]; then
  FOUNDRY_STRONG=1
elif [[ -n "$FOUNDRY_CONFIG" ]]; then
  note_ambiguity "foundry.toml present with no corroborating forge signal; treated as configuration-only, not an active Foundry suite"
elif [[ "$CORROBORATION" -ge 1 ]]; then
  note_ambiguity "forge signals present without foundry.toml; verify whether a Foundry suite exists"
fi

# ----------------------------------------------------------- profile decision

FRAMEWORK="unknown"
if [[ "$HH_MAJOR" == "2" && "$FOUNDRY_STRONG" -eq 1 ]]; then
  FRAMEWORK="hybrid-hardhat2-foundry"
elif [[ "$HH_MAJOR" == "3" && "$FOUNDRY_STRONG" -eq 1 ]]; then
  FRAMEWORK="hybrid-hardhat3-foundry"
elif [[ "$HH_MAJOR" == "2" ]]; then
  FRAMEWORK="hardhat2"
elif [[ "$HH_MAJOR" == "3" ]]; then
  FRAMEWORK="hardhat3"
elif [[ "$FOUNDRY_STRONG" -eq 1 ]]; then
  # No resolvable Hardhat version. A leftover Hardhat config does not demote a
  # corroborated Foundry repository to `unknown`; it is reported as ambiguity.
  FRAMEWORK="foundry"
  if [[ -n "$HH_CONFIG" ]]; then
    note_ambiguity "hardhat config ${HH_CONFIG} exists but no hardhat version resolves; treated as stale tooling — confirm before implementation"
  fi
  if [[ -n "$HH_VERSION" ]]; then
    note_ambiguity "hardhat version '${HH_VERSION}' does not resolve to a supported major"
  fi
fi

if [[ -n "$HH_VERSION" && -z "$HH_MAJOR" ]]; then
  note_ambiguity "hardhat version '${HH_VERSION}' has no numeric major; pin it or pass --framework"
fi
if [[ -n "$HH_MAJOR" && "$HH_MAJOR" != "2" && "$HH_MAJOR" != "3" ]]; then
  note_ambiguity "hardhat major ${HH_MAJOR} is outside the supported set {2,3}"
fi
if [[ -n "$HH_CONFIG" && -z "$HH_VERSION" && "$FOUNDRY_STRONG" -eq 0 ]]; then
  note_ambiguity "hardhat config ${HH_CONFIG} exists but no hardhat version resolves; install dependencies or declare hardhat"
fi
if [[ "$FRAMEWORK" == "unknown" ]]; then
  note_ambiguity "no framework profile satisfies the evidence; do not guess — report evidence and stop"
fi
if [[ "$HH_MAJOR" == "3" && "$FOUNDRY_STRONG" -eq 0 ]] && has_file '*.t.sol' ${SOL_TEST_DIRS[@]+"${SOL_TEST_DIRS[@]}"}; then
  note_ambiguity "Solidity tests under Hardhat 3 are native; .t.sol alone does not make this repository hybrid"
fi
[[ ${#EVIDENCE[@]} -eq 0 ]] && note_evidence "no framework evidence found"

# ------------------------------------------------------- language and modules

CONFIG_EXT="${HH_CONFIG##*.}"
[[ -z "$HH_CONFIG" ]] && CONFIG_EXT=""

HOST_DIRS=(test tests scripts deploy deployments tasks ignition)
NODE_TEST_DIRS=(test tests)

TS_HOST="$(count_files '*.ts' "${HOST_DIRS[@]}")"
JS_PLAIN_HOST="$(count_files '*.js' "${HOST_DIRS[@]}")"
CJS_HOST="$(count_files '*.cjs' "${HOST_DIRS[@]}")"
MJS_HOST="$(count_files '*.mjs' "${HOST_DIRS[@]}")"
JS_HOST=$((JS_PLAIN_HOST + CJS_HOST + MJS_HOST))

TS_TEST="$(count_files '*.ts' "${NODE_TEST_DIRS[@]}")"
JS_TEST=$(( $(count_files '*.js' "${NODE_TEST_DIRS[@]}") + $(count_files '*.cjs' "${NODE_TEST_DIRS[@]}") + $(count_files '*.mjs' "${NODE_TEST_DIRS[@]}") ))
SOL_TEST_COUNT="$(count_files '*.t.sol' ${SOL_TEST_DIRS[@]+"${SOL_TEST_DIRS[@]}"})"

HOST_LANGUAGE="unknown"
if [[ "$TS_HOST" -gt 0 && "$JS_HOST" -gt 0 ]]; then HOST_LANGUAGE="mixed-js-ts"
elif [[ "$TS_HOST" -gt 0 || "$CONFIG_EXT" =~ ^(ts|mts|cts)$ ]]; then HOST_LANGUAGE="typescript"
elif [[ "$JS_HOST" -gt 0 || "$CONFIG_EXT" =~ ^(js|mjs|cjs)$ ]]; then HOST_LANGUAGE="javascript"
elif [[ "$FRAMEWORK" == "foundry" || "$SOL_TEST_COUNT" -gt 0 ]]; then HOST_LANGUAGE="solidity"
fi

# Node resolves `.js` by the nearest package.json `type` field, and the absence
# of that field means CommonJS. The answer is therefore always definite when a
# package.json exists.
MODULE_SYSTEM="not-applicable"
MODULE_SYSTEM_SOURCE="no package.json and no Node host code to preserve"
if [[ "$HAS_PACKAGE_JSON" -eq 1 ]]; then
  case "$PKG_TYPE" in
    module)
      MODULE_SYSTEM="esm"
      MODULE_SYSTEM_SOURCE='package.json "type": "module"' ;;
    commonjs)
      MODULE_SYSTEM="commonjs"
      MODULE_SYSTEM_SOURCE='package.json "type": "commonjs"' ;;
    "")
      MODULE_SYSTEM="commonjs"
      MODULE_SYSTEM_SOURCE='package.json has no "type" field, so Node treats .js as CommonJS' ;;
    *)
      MODULE_SYSTEM="commonjs"
      MODULE_SYSTEM_SOURCE="package.json \"type\": \"$PKG_TYPE\" is not recognised, so Node falls back to CommonJS" ;;
  esac
elif [[ "$JS_HOST" -gt 0 || "$TS_HOST" -gt 0 || -n "$CONFIG_EXT" ]]; then
  MODULE_SYSTEM="commonjs"
  MODULE_SYSTEM_SOURCE='no package.json, so Node treats .js as CommonJS'
fi

MODULE_FILE_OVERRIDES="none"
if [[ "$CJS_HOST" -gt 0 || "$MJS_HOST" -gt 0 ]]; then
  MODULE_FILE_OVERRIDES="cjs=$CJS_HOST mjs=$MJS_HOST"
fi

HARDHAT_CONFIG_MODULE="not-applicable"
case "$CONFIG_EXT" in
  cjs|cts) HARDHAT_CONFIG_MODULE="commonjs" ;;
  mjs|mts) HARDHAT_CONFIG_MODULE="esm" ;;
  js|ts)   HARDHAT_CONFIG_MODULE="inherits-project-default" ;;
esac

# --------------------------------------------------- preservation baseline

TOOLBOX_VIEM="$(json_value '@nomicfoundation/hardhat-toolbox-viem')"
TOOLBOX_ETHERS="$(json_value '@nomicfoundation/hardhat-toolbox-mocha-ethers')"
ETHERS_VERSION="$(json_value ethers)"
VIEM_VERSION="$(json_value viem)"

FORGE_VERSION=""
if command -v forge >/dev/null 2>&1; then
  FORGE_VERSION="$(forge --version 2>/dev/null | head -n1 || true)"
fi

LOCKFILE="$(first_existing pnpm-lock.yaml yarn.lock package-lock.json bun.lock bun.lockb)"
PACKAGE_MANAGER=""
case "$LOCKFILE" in
  pnpm-lock.yaml) PACKAGE_MANAGER="pnpm" ;;
  yarn.lock) PACKAGE_MANAGER="yarn" ;;
  package-lock.json) PACKAGE_MANAGER="npm" ;;
  bun.lock|bun.lockb) PACKAGE_MANAGER="bun" ;;
esac
[[ -n "$PKG_MANAGER_FIELD" ]] && PACKAGE_MANAGER="${PKG_MANAGER_FIELD%%@*}"
if [[ -z "$PACKAGE_MANAGER" && "$HAS_PACKAGE_JSON" -eq 1 ]]; then
  PACKAGE_MANAGER="unknown"
  note_ambiguity "package.json exists with no lockfile and no packageManager field; confirm the package manager before running any install"
fi

REMAPPINGS_SOURCE="none"
REMAPPINGS_COUNT=0
if [[ -n "$REMAP_FILE" ]]; then
  REMAPPINGS_SOURCE="$REMAP_FILE"
  REMAPPINGS_COUNT="$(grep -cvE '^[[:space:]]*(#|$)' "$REMAP_FILE" || true)"
elif [[ -n "${FOUNDRY_TOML_REMAPPING_COUNT:-}" && "${FOUNDRY_TOML_REMAPPING_COUNT:-0}" -gt 0 ]]; then
  REMAPPINGS_SOURCE="foundry.toml"
  REMAPPINGS_COUNT="$FOUNDRY_TOML_REMAPPING_COUNT"
fi

FORGE_STD_VERSION=""
FORGE_STD_SOURCE=""
if [[ -n "$FORGE_STD_DIR" ]]; then
  if [[ -f "$FORGE_STD_DIR/package.json" ]]; then
    FORGE_STD_VERSION="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1],encoding="utf-8")).get("version",""))' "$FORGE_STD_DIR/package.json" 2>/dev/null || true)"
    [[ -n "$FORGE_STD_VERSION" ]] && FORGE_STD_SOURCE="$FORGE_STD_DIR/package.json"
  fi
  if [[ -z "$FORGE_STD_VERSION" ]] && command -v git >/dev/null 2>&1; then
    FORGE_STD_VERSION="$(git -C "$FORGE_STD_DIR" describe --tags --always 2>/dev/null || true)"
    [[ -n "$FORGE_STD_VERSION" ]] && FORGE_STD_SOURCE="git describe in $FORGE_STD_DIR"
  fi
  if [[ -z "$FORGE_STD_VERSION" && -f .gitmodules ]] && grep -q 'forge-std' .gitmodules 2>/dev/null; then
    FORGE_STD_VERSION="submodule-pinned"
    FORGE_STD_SOURCE=".gitmodules"
  fi
fi

# Hardhat compiler settings live inside an executable config; they cannot be
# extracted statically. Report that instead of guessing.
if [[ -n "$HH_CONFIG" && -n "$FOUNDRY_CONFIG" ]]; then
  SOLC_SOURCE="foundry.toml+manual-inspection-required"
elif [[ -n "$HH_CONFIG" ]]; then
  SOLC_SOURCE="manual-inspection-required"
elif [[ -n "$FOUNDRY_CONFIG" ]]; then
  SOLC_SOURCE="foundry.toml"
else
  SOLC_SOURCE="none"
fi

RPC_ENV_VARS="$(fget RPC_ENV_VARS)"
if [[ -n "$HH_CONFIG" ]]; then
  HH_ENV_VARS="$(grep -oE 'process\.env\.[A-Za-z_][A-Za-z0-9_]*' "$HH_CONFIG" 2>/dev/null | sed 's/^process\.env\.//' | grep -iE 'rpc|url|alchemy|infura|fork|node|archive' | sort -u | paste -sd, - || true)"
  if [[ -n "$HH_ENV_VARS" ]]; then
    RPC_ENV_VARS="${RPC_ENV_VARS:+$RPC_ENV_VARS,}$HH_ENV_VARS"
  fi
fi

# ------------------------------------------------------------------- output

FIELD_NAMES=()
FIELD_VALUES=()
setf() { FIELD_NAMES+=("$1"); FIELD_VALUES+=("${2:-}"); }

setf FRAMEWORK_PROFILE "$FRAMEWORK"
setf DETECTION_EVIDENCE "$(join_notes ${EVIDENCE[@]+"${EVIDENCE[@]}"})"
setf AMBIGUITY_REASON "$(join_notes ${AMBIGUITY[@]+"${AMBIGUITY[@]}"})"
setf HARDHAT_VERSION "$HH_VERSION"
setf HARDHAT_MAJOR "$HH_MAJOR"
setf HARDHAT_VERSION_SOURCE "$HH_VERSION_SOURCE"
setf HARDHAT_CONFIG "$HH_CONFIG"
setf HARDHAT_CONFIG_MODULE "$HARDHAT_CONFIG_MODULE"
setf HARDHAT_SCORE "$HH_SCORE"
setf FOUNDRY_CONFIG "$FOUNDRY_CONFIG"
setf FOUNDRY_SCORE "$FOUNDRY_SCORE"
setf FOUNDRY_CORROBORATION "$CORROBORATION"
setf FOUNDRY_VERSION "$FORGE_VERSION"
setf HOST_LANGUAGE "$HOST_LANGUAGE"
setf MODULE_SYSTEM "$MODULE_SYSTEM"
setf MODULE_SYSTEM_SOURCE "$MODULE_SYSTEM_SOURCE"
setf MODULE_FILE_OVERRIDES "$MODULE_FILE_OVERRIDES"
setf PACKAGE_TYPE "$PKG_TYPE"
setf PACKAGE_MANAGER "$PACKAGE_MANAGER"
setf LOCKFILE "$LOCKFILE"
setf TOOLBOX_VIEM_VERSION "$TOOLBOX_VIEM"
setf TOOLBOX_MOCHA_ETHERS_VERSION "$TOOLBOX_ETHERS"
setf ETHERS_VERSION "$ETHERS_VERSION"
setf VIEM_VERSION "$VIEM_VERSION"
setf TS_HOST_FILES "$TS_HOST"
setf JS_HOST_FILES "$JS_HOST"
setf TS_TEST_FILES "$TS_TEST"
setf JS_TEST_FILES "$JS_TEST"
setf SOLIDITY_TEST_FILES "$SOL_TEST_COUNT"
setf NODE_TEST_DIRS "$(IFS=,; echo "${NODE_TEST_DIRS[*]}")"
setf FOUNDRY_SRC_PATH "$FOUNDRY_SRC"
setf FOUNDRY_TEST_PATH "$FOUNDRY_TEST_PATH"
setf FOUNDRY_SCRIPT_PATH "$FOUNDRY_SCRIPT_PATH"
setf FOUNDRY_OUT_PATH "$FOUNDRY_OUT"
setf FOUNDRY_LIBS "$FOUNDRY_LIBS"
setf FOUNDRY_PROFILES "$FOUNDRY_PROFILES"
setf REMAPPINGS_SOURCE "$REMAPPINGS_SOURCE"
setf REMAPPINGS_COUNT "$REMAPPINGS_COUNT"
setf FORGE_STD_VERSION "$FORGE_STD_VERSION"
setf FORGE_STD_SOURCE "$FORGE_STD_SOURCE"
setf FOUNDRY_FFI "$FOUNDRY_FFI"
setf FOUNDRY_FS_PERMISSIONS "$FOUNDRY_FS_PERMISSIONS"
setf FOUNDRY_RPC_ALIASES "$FOUNDRY_RPC_ALIASES"
setf RPC_ENV_VARS "$RPC_ENV_VARS"
setf FOUNDRY_SOLC "$FOUNDRY_SOLC"
setf FOUNDRY_AUTO_DETECT_SOLC "$FOUNDRY_AUTO_DETECT_SOLC"
setf FOUNDRY_OPTIMIZER "$FOUNDRY_OPTIMIZER"
setf FOUNDRY_OPTIMIZER_RUNS "$FOUNDRY_OPTIMIZER_RUNS"
setf FOUNDRY_VIA_IR "$FOUNDRY_VIA_IR"
setf FOUNDRY_EVM_VERSION "$FOUNDRY_EVM_VERSION"
setf FOUNDRY_FUZZ_RUNS "$FOUNDRY_FUZZ_RUNS"
setf FOUNDRY_INVARIANT_RUNS "$FOUNDRY_INVARIANT_RUNS"
setf FOUNDRY_INVARIANT_DEPTH "$FOUNDRY_INVARIANT_DEPTH"
setf FOUNDRY_INVARIANT_FAIL_ON_REVERT "$FOUNDRY_INVARIANT_FAIL_ON_REVERT"
setf SOLC_SOURCE "$SOLC_SOURCE"

if [[ "$FORMAT" == "env" ]]; then
  for i in "${!FIELD_NAMES[@]}"; do
    printf '%s=%q\n' "${FIELD_NAMES[$i]}" "${FIELD_VALUES[$i]}"
  done
  exit 0
fi

if [[ "$FORMAT" == "json" ]]; then
  for i in "${!FIELD_NAMES[@]}"; do
    printf '%s\t%s\n' "${FIELD_NAMES[$i]}" "${FIELD_VALUES[$i]}"
  done | python3 -c '
import json, sys
out = {"schema_version": 1}
for line in sys.stdin.read().splitlines():
    key, _, value = line.partition("\t")
    out[key] = value
print(json.dumps(out, indent=2, sort_keys=False))
'
  exit 0
fi

echo "# Detected Solidity project stack"
echo
echo "| Field | Value |"
echo "|---|---|"
for i in "${!FIELD_NAMES[@]}"; do
  value="${FIELD_VALUES[$i]}"
  case "${FIELD_NAMES[$i]}" in
    DETECTION_EVIDENCE|AMBIGUITY_REASON|MODULE_SYSTEM_SOURCE)
      printf '| `%s` | %s |\n' "${FIELD_NAMES[$i]}" "${value:-none}" ;;
    *)
      printf '| `%s` | `%s` |\n' "${FIELD_NAMES[$i]}" "${value:-not found}" ;;
  esac
done

cat <<'MD'

## Reading this report

- Detection is evidence-based but advisory. Verify anything reported under `AMBIGUITY_REASON` before implementation.
- A `.t.sol` file alone does not imply Foundry: Hardhat 3 runs Solidity tests natively.
- `foundry.toml` alone does not imply an active Foundry suite; it is often carried only for remappings.
- `*_HOST_FILES` count `test/ tests/ scripts/ deploy/ deployments/ tasks/ ignition/`. `*_TEST_FILES` count test directories only.
- `SOLC_SOURCE=manual-inspection-required` means the Solidity compiler settings live in an executable Hardhat config and cannot be extracted statically. Read the config and record them by hand.
- `FOUNDRY_VERSION` is empty when `forge` is not installed. That is not evidence against a Foundry repository.
MD
