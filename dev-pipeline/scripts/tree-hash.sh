#!/usr/bin/env bash
# Hash pracovního stromu projektu (trackované i netrackované soubory mimo .gitignore),
# nezávislý na indexu a na commitech: po `git commit` beze změny souborů vyjde stejný.
# docs/.verify-passed se do hashe nepočítá. Použití: tree-hash.sh [cesta v repu]
set -euo pipefail
cd "${1:-.}"
root=$(git rev-parse --show-toplevel) || { echo "není git repo" >&2; exit 2; }
cd "$root"
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
idx="$(git rev-parse --git-dir)/index"
[ -f "$idx" ] && cp "$idx" "$tmp"
# Bez pathspecu: `git add -A -- . ':(exclude)…'` vrací chybu, když je marker gitignorovaný
# („The following paths are ignored“), a hash by se nespočítal. Marker se z dočasného indexu odebere.
GIT_INDEX_FILE="$tmp" git add -A -- . >/dev/null 2>&1
GIT_INDEX_FILE="$tmp" git rm --cached -q --ignore-unmatch -- docs/.verify-passed >/dev/null 2>&1
GIT_INDEX_FILE="$tmp" git write-tree
