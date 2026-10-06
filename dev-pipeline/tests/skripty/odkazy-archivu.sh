#!/usr/bin/env bash
# Testy scripts/odkazy-archivu.py a jeho napojení v orchestrate-setup.sh (archivace předchozí vize). Každý případ
# v dočasném git repu; skutečný projekt se nedotkne. Historie: vize A (rez-01 A), archivace A, vize B (rez-01 B),
# nová vize C. Odkaz z doby A musí vést do archivu A, odkaz z doby B do archivu B (běh sonnet-5-5-a-cache, Surya).
set -u
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
plugin=$(cd "$here/../.." && pwd)
skript="$plugin/scripts/odkazy-archivu.py"
setup="${SETUP_SKRIPT:-$plugin/scripts/orchestrate-setup.sh}"
pass=0; fail=0
ok() { pass=$((pass + 1)); }
ko() { fail=$((fail + 1)); echo "FAIL: $*"; }
ma() { grep -qF -- "$2" "$1" && ok || ko "$1 nemá: $2"; }
nema() { grep -qF -- "$2" "$1" && ko "$1 nemá mít: $2" || ok; }

repo() {
  r=$(mktemp -d "${TMPDIR:-/tmp}/odkazy-archivu.XXXXXX")
  cd "$r" || exit 1
  git init -q -b main
  git config user.email t@t; git config user.name t; git config commit.gpgsign false
  mkdir -p docs/e2e docs/prd src
  printf '# Běh vize A\n' > docs/handoff.md
  printf 'A rez-01\n' > docs/e2e/rez-01.md
  printf 'A prd\n' > docs/prd/rez-01-a.md
  git add -A; git commit -qm 'vize A: řez 01'
  printf '// viz docs/e2e/rez-01.md\n' > src/a.ts
  printf '// PRD `docs/prd/rez-01-a.md`\n' > src/p.ts
  git add -A; git commit -qm 'vize A: kód'
  mkdir -p docs/archive/A/e2e docs/archive/A/prd
  git mv docs/e2e/rez-01.md docs/archive/A/e2e/rez-01.md
  git mv docs/prd/rez-01-a.md docs/archive/A/prd/rez-01-a.md
  printf '# Běh vize B\n' > docs/handoff.md
  git add -A; git commit -qm 'běh: start vize B (archiv:A)'
  printf 'B rez-01\n' > docs/e2e/rez-01.md
  printf 'B rez-02\n' > docs/e2e/rez-02.md
  printf '// konvence `docs/e2e/rez-01.md` a docs/e2e/rez-02.md\n' > src/b.ts
  printf -- '- [řez 01] viz docs/e2e/rez-01.md\n' > docs/follow-ups.md
  printf 'deník docs/e2e/rez-01.md\n' > docs/journal.md
  printf '// neexistuje docs/e2e/rez-99.md\n' > src/z.ts
  git add -A; git commit -qm 'vize B: řez 01'
  mkdir -p docs/vize/C
  printf '# Vize C\nE2E docs/e2e/rez-01.md\n' > docs/vize/C.md
  printf 'příloha docs/e2e/rez-01.md\n' > docs/vize/C/priloha.md
  git add -A; git commit -qm 'vize: C'
  mkdir -p dist; printf 'docs/e2e/rez-01.md\n' > dist/x.js   # netrackovaný build
}

# 1. samotný skript: cíl podle vize, ve které odkaz vznikl
repo
out=$(python3 -I "$skript" "$r" B docs/vize/C.md); rc=$?
[ "$rc" -eq 0 ] && ok || ko "rc=$rc"
ma src/a.ts 'docs/archive/A/e2e/rez-01.md'
ma src/p.ts '`docs/archive/A/prd/rez-01-a.md`'
ma src/b.ts '`docs/archive/B/e2e/rez-01.md`'
ma src/b.ts 'docs/archive/B/e2e/rez-02.md'
ma docs/follow-ups.md 'docs/archive/B/e2e/rez-01.md'
ma docs/journal.md 'deník docs/e2e/rez-01.md'          # historický dokument v docs/ zůstává
ma docs/vize/C.md 'E2E docs/e2e/rez-01.md'              # nová vize mluví o svém budoucím dokumentu
ma docs/vize/C/priloha.md 'příloha docs/e2e/rez-01.md'
ma dist/x.js 'docs/e2e/rez-01.md'                       # netrackovaný soubor se neprohledává
ma src/z.ts 'docs/e2e/rez-99.md'                        # nevyřešené zůstává
printf '%s\n' "$out" | grep -q 'nevyřešeno: src/z.ts' && ok || ko "chybí nevyřešené src/z.ts: $out"
printf '%s\n' "$out" | grep -q 'přepsáno 5 v 4 souborech' && ok || ko "souhrn: $out"
git diff --cached --name-only | grep -qx 'src/a.ts' && ok || ko "src/a.ts není v indexu"
git diff --cached --name-only | grep -qx 'docs/journal.md' && ko "journal nemá být v indexu" || ok
# druhý běh nic nepřepíše (archivní cesta docs/e2e/ neobsahuje)
out2=$(python3 -I "$skript" "$r" B docs/vize/C.md)
printf '%s\n' "$out2" | grep -q 'přepsáno 0 v 0 souborech' && ok || ko "druhý běh přepisoval: $out2"
cd /; rm -rf "$r"

# 2. bez odkazů a se špatnými argumenty
r=$(mktemp -d "${TMPDIR:-/tmp}/odkazy-archivu.XXXXXX"); cd "$r"; git init -q -b main
out=$(python3 -I "$skript" "$r" B docs/vize/C.md); [ "$out" = "odkazy na archiv: žádné" ] && ok || ko "prázdné repo: $out"
python3 -I "$skript" "$r" 2>/dev/null; [ $? -eq 2 ] && ok || ko "bez argumentů nemá rc 2"
cd /; rm -rf "$r"

# 3. celý setup: archivace B s přepsanými odkazy projde jedním commitem
repo
printf '# Vize C\n\n## Plán řezů\n\n| # | název | body vize | definice hotového | závislosti | poznámka |\n|---|---|---|---|---|---|\n| 01 | první | C1 | funguje | – | – |\n' > docs/vize/C.md
mkdir -p docs/prd; printf -- '---\nvize: docs/vize/B.md\n---\n# PRD B\n' > docs/prd/rez-01-b.md
git add -A; git commit -qm 'vize: C (plán)'
printf '{"session_id":"test-sid"}\n' > docs/.orchestrator-session
printf '{"session_id":"stara","slug":"B"}\n' > docs/.orchestrator-run
log=$(mktemp); HOME="$r/home" bash "$setup" docs/vize/C.md > "$log" 2>&1; rc=$?
[ "$rc" -eq 0 ] && ok || { ko "setup rc=$rc"; sed -n '1,30p' "$log"; }
ma "$log" 'odkazy na archiv: přepsáno'
ma src/b.ts '`docs/archive/B/e2e/rez-01.md`'
ma src/a.ts 'docs/archive/A/e2e/rez-01.md'
[ -f docs/archive/B/e2e/rez-01.md ] && ok || ko "archiv B nevznikl"
[ -z "$(git status --porcelain -- src docs/archive docs/e2e)" ] && ok || ko "necommitnuto: $(git status --porcelain | head -5)"
git log -1 --format=%s | grep -q 'start vize C' && ok || ko "poslední commit: $(git log -1 --format=%s)"
git show --stat HEAD | grep -q 'src/b.ts' && ok || ko "odkazy nejsou v commitu setupu"
rm -f "$log"; cd /; rm -rf "$r"

echo "odkazy-archivu: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
