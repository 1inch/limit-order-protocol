#!/usr/bin/env bash
set -euo pipefail

FIX=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --fix) FIX=1 ;;
    -h|--help)
      cat <<'USAGE'
Usage: validate-package.sh [--fix]

Checks package structure, version agreement, manifest/documentation consistency,
artifact templates, and script syntax. The script never mutates the tree unless
--fix is given, which only sets the executable bit on scripts/*.sh.

Exit codes:
  0  all checks passed
  1  at least one check failed
  4  python3 missing or manifest unreadable
USAGE
      exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/manifest.sh
. "$SKILL_DIR/scripts/lib/manifest.sh"
require_python3

FAILURES=0
fail() { printf 'FAIL  %s\n' "$1" >&2; FAILURES=$((FAILURES + 1)); }
pass() { printf 'ok    %s\n' "$1"; }

# ------------------------------------------------------------ 1. file layout

required=(
  SKILL.md README.md CHANGELOG.md skill-dependencies.json
  references/dependencies.md references/framework-routing.md
  references/hardhat2-policy.md references/hardhat3-policy.md
  references/foundry-policy.md references/hybrid-policy.md
  references/artifacts.md references/id-registry.md
  references/bdd-policy.md references/test-audit-policy.md
  assets/STATUS.template.md
  assets/traceability-matrix.template.md
  assets/existing-test-audit.template.md
  assets/divergence-decisions.template.md
  assets/requirement.template.md
  scripts/detect-project-stack.sh scripts/check-dependencies.sh
  scripts/install-dependencies.sh scripts/validate-package.sh
  scripts/lib/manifest.py scripts/lib/manifest.sh
)
missing_files=()
for rel in "${required[@]}"; do
  [[ -f "$SKILL_DIR/$rel" ]] || missing_files+=("$rel")
done
if [[ "${#missing_files[@]}" -gt 0 ]]; then
  for rel in "${missing_files[@]}"; do fail "missing file: $rel"; done
else
  pass "all ${#required[@]} required files present"
fi

# ------------------------------------------------------------- 2. frontmatter

head -n1 "$SKILL_DIR/SKILL.md" | grep -qx -- '---' || fail "SKILL.md does not start with YAML frontmatter"
grep -q '^name: solidity-protocol-reconstruction-orchestrator$' "$SKILL_DIR/SKILL.md" \
  || fail "SKILL.md frontmatter name changed"
for key in description argument-hint disable-model-invocation; do
  grep -q "^${key}:" "$SKILL_DIR/SKILL.md" || fail "SKILL.md frontmatter missing '$key'"
done
grep -q '^disable-model-invocation: true$' "$SKILL_DIR/SKILL.md" \
  || fail "SKILL.md must set 'disable-model-invocation: true'"
pass "SKILL.md frontmatter"

# ----------------------------------------------------- 3. version agreement

VERSION="$(manifest_query version)"
BEFORE="$FAILURES"
[[ -n "$VERSION" ]] || fail "manifest has no package_version"
grep -q "version: \"$VERSION\"" "$SKILL_DIR/SKILL.md" \
  || fail "SKILL.md metadata.version is not $VERSION"
grep -q "^## $VERSION\$" "$SKILL_DIR/CHANGELOG.md" \
  || fail "CHANGELOG.md has no '## $VERSION' entry"
grep -qE "^# .*v${VERSION%%.*}\b" "$SKILL_DIR/README.md" \
  || fail "README.md title does not carry major version v${VERSION%%.*}"
if [[ "$FAILURES" -eq "$BEFORE" ]]; then
  pass "version $VERSION agrees across manifest, SKILL.md, README.md, CHANGELOG.md"
fi

# --------------------------------------- 4. manifest vs documentation parity

while IFS=$'\t' read -r name _source kind; do
  [[ -n "$name" ]] || continue
  grep -q -- "$name" "$SKILL_DIR/references/dependencies.md" \
    || fail "manifest skill '$name' ($kind) is absent from references/dependencies.md"
  grep -q -- "$name" "$SKILL_DIR/SKILL.md" \
    || fail "manifest skill '$name' ($kind) is absent from the SKILL.md routing table"
done < <(manifest_query all-skills)
pass "every manifest skill appears in references/dependencies.md and SKILL.md"

# Every skill the scripts can request must exist in the manifest.
KNOWN_SKILLS="$(manifest_query all-skills | cut -f1)"
for profile in $(manifest_query profiles) all; do
  while IFS=$'\t' read -r _source skills; do
    for skill in $skills; do
      grep -qx -- "$skill" <<<"$KNOWN_SKILLS" \
        || fail "install-dependencies would request unknown skill '$skill' for profile $profile"
    done
  done < <(manifest_query install --framework "$profile" --with-arc42 --with-adrs --toolbox-viem --toolbox-mocha-ethers)
done
for mode in $(manifest_query modes); do
  for profile in $(manifest_query profiles); do
    while IFS= read -r skill; do
      [[ -n "$skill" ]] || continue
      grep -qx -- "$skill" <<<"$KNOWN_SKILLS" \
        || fail "check-dependencies would require unknown skill '$skill' for $mode/$profile"
    done < <(manifest_query required --mode "$mode" --framework "$profile" --with-arc42)
  done
done
pass "every skill the scripts request is declared in the manifest"

# Skills the orchestrator must never activate have to be named in SKILL.md or a
# policy reference, otherwise the prohibition is unenforceable in practice.
while IFS=$'\t' read -r name _source _reason; do
  [[ -n "$name" ]] || continue
  grep -rq -- "$name" "$SKILL_DIR/SKILL.md" "$SKILL_DIR/references" \
    || fail "forbidden skill '$name' is never named in SKILL.md or references/"
done < <(manifest_query forbidden)
pass "forbidden skills are named in the documentation"

# -------------------------------------------- 5. artifacts have templates

# Every artifact path named in SKILL.md must be defined in references/artifacts.md.
while IFS= read -r artifact; do
  [[ -n "$artifact" ]] || continue
  grep -q -- "$artifact" "$SKILL_DIR/references/artifacts.md" \
    || fail "artifact '$artifact' named in SKILL.md is missing from references/artifacts.md"
done < <(grep -oE 'docs/protocol-reconstruction/[A-Za-z0-9./_-]+' "$SKILL_DIR/SKILL.md" | sed 's#docs/protocol-reconstruction/##' | sort -u)
pass "every artifact named in SKILL.md is defined in references/artifacts.md"

# Templated artifacts must actually ship a template.
declare -A TEMPLATE_FOR=(
  [STATUS.md]=assets/STATUS.template.md
  [03-divergence-decisions.md]=assets/divergence-decisions.template.md
  [06-existing-test-audit.md]=assets/existing-test-audit.template.md
  [08-traceability-matrix.md]=assets/traceability-matrix.template.md
)
for artifact in "${!TEMPLATE_FOR[@]}"; do
  template="${TEMPLATE_FOR[$artifact]}"
  [[ -f "$SKILL_DIR/$template" ]] || fail "artifact '$artifact' has no template at $template"
  grep -q -- "$template" "$SKILL_DIR/references/artifacts.md" \
    || fail "references/artifacts.md does not link '$artifact' to $template"
done
pass "templated artifacts have templates under assets/"

# ------------------------------------------- 6. references are reachable

while IFS= read -r ref; do
  [[ -f "$SKILL_DIR/$ref" ]] || fail "SKILL.md links missing file: $ref"
done < <(grep -oE '\((references|assets|scripts)/[A-Za-z0-9./_-]+\)' "$SKILL_DIR/SKILL.md" | tr -d '()' | sort -u)
for rel in "$SKILL_DIR"/references/*.md; do
  base="references/$(basename "$rel")"
  grep -q -- "$base" "$SKILL_DIR/SKILL.md" \
    || fail "$base is not linked from SKILL.md"
done
pass "SKILL.md links resolve and every reference is reachable"

# --------------------------------------------------- 7. SKILL.md size budget

LINES="$(wc -l < "$SKILL_DIR/SKILL.md")"
if [[ "$LINES" -ge 500 ]]; then
  fail "SKILL.md is $LINES lines; the budget is under 500 (move detail into references/)"
else
  pass "SKILL.md is $LINES lines (budget 500)"
fi

# --------------------------------------------------------- 8. script hygiene

for script in "$SKILL_DIR"/scripts/*.sh "$SKILL_DIR"/scripts/lib/*.sh; do
  bash -n "$script" || fail "syntax error: ${script#"$SKILL_DIR"/}"
done
python3 -m py_compile "$SKILL_DIR/scripts/lib/manifest.py" \
  || fail "syntax error: scripts/lib/manifest.py"
pass "all scripts parse"

# Assert, do not mutate. Validation that silently rewrites the tree hides the
# very drift it is supposed to report.
NOT_EXEC=()
for script in "$SKILL_DIR"/scripts/*.sh; do
  [[ -x "$script" ]] || NOT_EXEC+=("${script#"$SKILL_DIR"/}")
done
if [[ "${#NOT_EXEC[@]}" -gt 0 ]]; then
  if [[ "$FIX" -eq 1 ]]; then
    for rel in "${NOT_EXEC[@]}"; do chmod +x "$SKILL_DIR/$rel"; done
    pass "set the executable bit on: ${NOT_EXEC[*]}"
  else
    fail "not executable: ${NOT_EXEC[*]}"
    printf '      fix with: chmod +x %s\n' "$(printf '%s ' "${NOT_EXEC[@]}")" >&2
    printf '      or re-run: scripts/validate-package.sh --fix\n' >&2
  fi
else
  pass "scripts/*.sh are executable"
fi

echo
if [[ "$FAILURES" -ne 0 ]]; then
  printf 'Package validation FAILED with %d problem(s): %s\n' "$FAILURES" "$SKILL_DIR" >&2
  exit 1
fi
printf 'Package validation passed (version %s): %s\n' "$VERSION" "$SKILL_DIR"
