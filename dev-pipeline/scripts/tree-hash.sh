#!/usr/bin/env bash
# Hash pracovního stromu projektu (trackované i netrackované soubory mimo .gitignore),
# nezávislý na indexu a na commitech: po `git commit` beze změny souborů vyjde stejný.
# Adresář docs/ (handoff, journal, PRD, vize, marker) se do hashe nepočítá: dokumenty nemění chování
# kódu a souběžný blok PRD nebo zápis handoffu by jinak marker verify zneplatnil a commit by platil
# plnou suitu podruhé. Pre-commit hook projektu musí počítat stejně. Použití: tree-hash.sh [cesta v repu]
set -euo pipefail
cd "${1:-.}"
root=$(git rev-parse --show-toplevel) || { echo "není git repo" >&2; exit 2; }
cd "$root"
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
idx="$(git rev-parse --git-dir)/index"
[ -f "$idx" ] && cp "$idx" "$tmp"
# Bez pathspecu: `git add -A -- . ':(exclude)…'` vrací chybu, když je marker gitignorovaný
# („The following paths are ignored“), a hash by se nespočítal. Celý docs/ (i marker) se z dočasného
# indexu odebere; -f jen přeskakuje kontrolu shody s HEAD, pracovního stromu se --cached nedotkne.
GIT_INDEX_FILE="$tmp" git add -A -- . >/dev/null 2>&1
GIT_INDEX_FILE="$tmp" git rm -r -f --cached -q --ignore-unmatch -- docs >/dev/null 2>&1
GIT_INDEX_FILE="$tmp" git write-tree
