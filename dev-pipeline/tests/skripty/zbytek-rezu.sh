#!/usr/bin/env bash
# Testy scripts/zbytek-rezu.sh v dočasných git repech (nikdy nad skutečným projektem). Spusť: bash dev-pipeline/tests/skripty/zbytek-rezu.sh
# Pokrývá review 1.6.0 N7 (diakritika, mezery, přidaný a dál upravený soubor, přejmenování, ověření git status) a N8
# (binární a nad 1 MB netrackované soubory zůstávají ve stromu mimo patch).
set -uo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); skript="$here/../../scripts/zbytek-rezu.sh"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/zbytek-rezu-test.XXXXXX"); trap 'chmod -R u+w "$tmp" 2>/dev/null; rm -rf "$tmp"' EXIT
pass=0; fail=0
ok() { pass=$((pass+1)); }; ko() { fail=$((fail+1)); echo "FAIL $*"; }
repo() { # nové repo s commitem: eslint.config.js, apps/čeština.ts, apps/a b.ts, apps/x.ts, docs/handoff.md
  local r="$tmp/$1"; mkdir -p "$r/apps" "$r/docs"
  (cd "$r" && git init -q && git config user.email t@t && git config user.name t \
    && echo 'export default [];' > eslint.config.js && echo puvodni > 'apps/čeština.ts' && echo puvodni > 'apps/a b.ts' \
    && echo x > apps/x.ts && echo '# h' > docs/handoff.md && git add -A && git commit -qm init)
  echo "$r"
}
cisty() { [ -z "$(git -C "$1" -c core.quotePath=false status --porcelain -- . ':(exclude)docs')" ]; }

# 1. Diakritika a mezery: změněné sledované i netrackované, roundtrip přes git apply.
r=$(repo diakritika)
(cd "$r" && echo zmena > 'apps/čeština.ts' && echo zmena > 'apps/a b.ts' && echo novy > 'apps/nový soubor.ts' && echo novy2 > 'apps/žluťoučký.mjs')
o=$(bash "$skript" "$r" 12 2>&1); rc=$?
[ $rc -eq 0 ] && cisty "$r" && [ ! -e "$r/apps/nový soubor.ts" ] && [ "$(cat "$r/apps/čeština.ts")" = puvodni ] \
  && printf '%s' "$o" | grep -q 'uložené soubory (4)' && printf '%s' "$o" | grep -q 'ověřeno git status' && ok || ko "diakritika-uloz: rc=$rc $o"
grep -q 'apps/čeština.ts' "$r/docs/e2e/rez-12-zbytek.patch" && grep -q 'apps/nový soubor.ts' "$r/docs/e2e/rez-12-zbytek.patch" && ok || ko "diakritika-v-patchi"
(cd "$r" && git apply docs/e2e/rez-12-zbytek.patch) && [ "$(cat "$r/apps/čeština.ts")" = zmena ] && [ "$(cat "$r/apps/a b.ts")" = zmena ] \
  && [ "$(cat "$r/apps/nový soubor.ts")" = novy ] && [ "$(cat "$r/apps/žluťoučký.mjs")" = novy2 ] && ok || ko "diakritika-obnova"

# 2. Nový soubor v indexu, který je dál upravený (git rm --cached bez -f ho odmítne).
r=$(repo pridany)
(cd "$r" && echo v1 > apps/novy.ts && git add apps/novy.ts && echo v2 > apps/novy.ts && echo zmena > eslint.config.js)
o=$(bash "$skript" "$r" 5 2>&1); rc=$?
[ $rc -eq 0 ] && cisty "$r" && [ ! -e "$r/apps/novy.ts" ] && [ -z "$(git -C "$r" diff --cached --name-only)" ] && ok || ko "pridany-upraveny: rc=$rc $o"
(cd "$r" && git apply docs/e2e/rez-05-zbytek.patch) && [ "$(cat "$r/apps/novy.ts")" = v2 ] && [ "$(cat "$r/eslint.config.js")" = zmena ] && ok || ko "pridany-obnova"

# 3. Přejmenování přes git mv (staged) i přes mv (smazaný + netrackovaný), včetně diakritiky.
r=$(repo prejmenovani)
(cd "$r" && git mv apps/x.ts 'apps/y ž.ts' && mv 'apps/a b.ts' 'apps/c č.ts')
o=$(bash "$skript" "$r" 7 2>&1); rc=$?
[ $rc -eq 0 ] && cisty "$r" && [ -f "$r/apps/x.ts" ] && [ -f "$r/apps/a b.ts" ] && [ ! -e "$r/apps/y ž.ts" ] && [ ! -e "$r/apps/c č.ts" ] && ok || ko "prejmenovani: rc=$rc $o"
(cd "$r" && git apply docs/e2e/rez-07-zbytek.patch) && [ ! -e "$r/apps/x.ts" ] && [ "$(cat "$r/apps/y ž.ts")" = x ] && [ ! -e "$r/apps/a b.ts" ] && [ "$(cat "$r/apps/c č.ts")" = puvodni ] && ok || ko "prejmenovani-obnova"

# 4. Binární a velký netrackovaný soubor zůstávají ve stromu, do patche nejdou; malý textový jde.
r=$(repo velke)
(cd "$r" && printf '\000\001\002PNG\000' > apps/obr.png && head -c 1100000 /dev/zero | tr '\0' 'a' > apps/data.json && echo maly > apps/maly.json && echo zmena > eslint.config.js)
o=$(bash "$skript" "$r" 12 2>&1); rc=$?
p="$r/docs/e2e/rez-12-zbytek.patch"
[ $rc -eq 0 ] && [ -f "$r/apps/obr.png" ] && [ -f "$r/apps/data.json" ] && [ ! -e "$r/apps/maly.json" ] \
  && printf '%s' "$o" | grep -q 'ponecháno ve stromu, rozhodne majitel' && printf '%s' "$o" | grep -q 'apps/obr.png (binární)' \
  && printf '%s' "$o" | grep -q 'apps/data.json (1100000 B, nad 1 MB)' && ok || ko "velke-ponechane: rc=$rc $o"
! grep -q '^diff --git a/apps/obr.png' "$p" && ! grep -q '^diff --git a/apps/data.json' "$p" && grep -q '^diff --git a/apps/maly.json' "$p" \
  && grep -q '^# ponechaný ve stromu (není v patchi): apps/obr.png' "$p" && ok || ko "velke-patch"
[ "$(git -C "$r" status --porcelain -- apps | tr '\n' '|')" = '?? apps/data.json|?? apps/obr.png|' ] && ok || ko "velke-status: $(git -C "$r" status --porcelain | tr '\n' '|')"

# 5. Jen ponechané soubory: nic do patche, rc 0, výpis ponechaných.
r=$(repo jen-ponechane)
(cd "$r" && printf '\000bin' > apps/jen.bin)
o=$(bash "$skript" "$r" 3 2>&1); rc=$?
[ $rc -eq 0 ] && [ ! -e "$r/docs/e2e/rez-03-zbytek.patch" ] && [ -f "$r/apps/jen.bin" ] && printf '%s' "$o" | grep -q 'nic neuloženo' \
  && printf '%s' "$o" | grep -q 'apps/jen.bin (binární)' && ok || ko "jen-ponechane: rc=$rc $o"

# 6. docs/ zůstává mimo výchozí rozsah; cesta za -- smí do docs/.
r=$(repo docs)
(cd "$r" && echo '# h2' > docs/handoff.md && echo zmena > eslint.config.js)
o=$(bash "$skript" "$r" 4 2>&1); rc=$?
[ $rc -eq 0 ] && [ "$(cat "$r/docs/handoff.md")" = '# h2' ] && [ "$(cat "$r/eslint.config.js")" = 'export default [];' ] && ok || ko "docs-vynechane: rc=$rc $o"
o=$(bash "$skript" "$r" 4 -- docs/handoff.md 2>&1); rc=$?
[ $rc -eq 0 ] && [ "$(cat "$r/docs/handoff.md")" = '# h' ] && [ -f "$r/docs/e2e/rez-04-zbytek-2.patch" ] && ok || ko "docs-cesta: rc=$rc $o"

# 7. Vrácení selže (soubor v adresáři bez práva zápisu): rc 4, patch uložený, výpis toho, co zůstalo.
r=$(repo selhani)
(cd "$r" && mkdir -p apps/ro && echo t > apps/ro/zbyl.txt && chmod 555 apps/ro)
o=$(bash "$skript" "$r" 9 2>&1); rc=$?
chmod 755 "$r/apps/ro"
[ $rc -eq 4 ] && [ -f "$r/docs/e2e/rez-09-zbytek.patch" ] && [ -f "$r/apps/ro/zbyl.txt" ] && printf '%s' "$o" | grep -q 'apps/ro/zbyl.txt' \
  && ! printf '%s' "$o" | grep -q 'strom vrácen na HEAD' && ok || ko "selhani-rc4: rc=$rc $o"

# 8. Argumenty.
bash "$skript" "$tmp/neni-repo" 3 >/dev/null 2>&1; [ $? -eq 2 ] && ok || ko "neni-repo"
bash "$skript" "$tmp" x >/dev/null 2>&1; [ $? -eq 2 ] && ok || ko "spatne-cislo"

echo "zbytek-rezu: pass=$pass fail=$fail"
[ $fail -eq 0 ]
