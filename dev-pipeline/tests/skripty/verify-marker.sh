#!/usr/bin/env bash
# Testy scripts/verify-marker.sh: běžný režim beze změny, přenos markeru --zvedni (shoda, neshoda, chybějící marker),
# odmítnutí s kódem 3 bez jediné změny (dvě shody literálu, soubor v docs/, tokeny, soubor mimo repo) a to, že po přenosu
# sedí tree-hash.sh s markerem a změnil se jen ten jeden soubor.
# Spusť: bash dev-pipeline/tests/skripty/verify-marker.sh
set -uo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); plugin=$(cd "$here/../.." && pwd)
vm="$plugin/scripts/verify-marker.sh"; th="$plugin/scripts/tree-hash.sh"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/verify-marker-test.XXXXXX"); tmp=$(cd "$tmp" && pwd -P); trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
ok() { pass=$((pass+1)); }; ko() { fail=$((fail+1)); echo "FAIL $*"; }

novy_repo() { # čistý commit se dvěma zdroji; docs/.verify-passed gitignorovaný jako v běhu
  r="$tmp/repo-$1"; mkdir -p "$r/src" "$r/docs"
  git -C "$r" init -q
  printf 'export const __BUILD_VERSION__ = "rez05-2026:a";\n' > "$r/src/verze.ts"
  printf 'export const x = 1;\n' > "$r/src/x.ts"
  printf 'rez05-2026:a\n' > "$r/docs/popis.md"
  printf 'docs/.verify-passed\n' > "$r/.gitignore"
  git -C "$r" add -A; git -C "$r" -c user.name=t -c user.email=t@t commit -q -m start
}
# Otisk všech souborů mimo .git (i s markerem): odmítnutí nesmí změnit ani bajt.
otisk() { (cd "$1" && find . -path ./.git -prune -o -type f -print | LC_ALL=C sort | xargs shasum); }
odmita() { # název repo očekávaný_text_na_stderr soubor stary novy
  local jm=$1 r=$2 txt=$3 pred po e rc; shift 3
  pred=$(otisk "$r"); e=$(bash "$vm" --zvedni "$r" "$@" 2>&1 >/dev/null); rc=$?; po=$(otisk "$r")
  [ "$rc" = 3 ] && [ "$pred" = "$po" ] && printf '%s' "$e" | grep -qF -- "$txt" && ok || ko "$jm: rc=$rc stderr=$e zmena=$([ "$pred" = "$po" ] && echo ne || echo ano)"
}
pole() { jq -r "$2" "$1/docs/.verify-passed"; }

# --- běžný režim beze změny: tvar {tree, at, log}, výstup hash
novy_repo bezny; r=$r
o=$(bash "$vm" "$r" /log/brana.md); rc=$?
[ $rc -eq 0 ] && [ "$o" = "$(bash "$th" "$r")" ] && [ "$(jq -c 'keys' "$r/docs/.verify-passed")" = '["at","log","tree"]' ] \
  && [ "$(pole "$r" .tree)" = "$o" ] && [ "$(pole "$r" .log)" = /log/brana.md ] && grep -q "\"tree\":\"$o\"" "$r/docs/.verify-passed" && ok || ko "bezny: rc=$rc $o"

# --- shoda: marker se přenese, tree-hash sedí, změnil se jen jeden soubor
novy_repo shoda; r=$r
stary=$(bash "$vm" "$r" /log/brana.md); git -C "$r" diff --quiet || ko "shoda-predpoklad"
o=$(bash "$vm" --zvedni "$r" src/verze.ts rez05-2026:a rez05-2026:a-opr1 2>/dev/null); rc=$?
[ $rc -eq 0 ] && [ "$o" = "marker přenesen" ] && ok || ko "shoda-vystup: rc=$rc $o"
novy=$(bash "$th" "$r")
[ "$novy" != "$stary" ] && [ "$(pole "$r" .tree)" = "$novy" ] && ok || ko "shoda-tree: $novy / $(cat "$r/docs/.verify-passed")"
# pre-commit projektu hledá v markeru doslova "tree":"<hash>"
grep -q "\"tree\":\"$novy\"" "$r/docs/.verify-passed" && ok || ko "shoda-tvar-pro-hook: $(cat "$r/docs/.verify-passed")"
[ "$(pole "$r" .log)" = /log/brana.md ] && [ "$(pole "$r" .zvednuti.z)" = "$stary" ] && [ "$(pole "$r" .zvednuti.soubor)" = src/verze.ts ] \
  && [ -n "$(pole "$r" .at)" ] && ok || ko "shoda-pole: $(cat "$r/docs/.verify-passed")"
[ "$(git -C "$r" status --porcelain)" = " M src/verze.ts" ] && ok || ko "shoda-jen-jeden-soubor: $(git -C "$r" status --porcelain)"
grep -qF '"rez05-2026:a-opr1";' "$r/src/verze.ts" && ok || ko "shoda-nahrada: $(cat "$r/src/verze.ts")"
[ "$(git -C "$r" diff --numstat -- src/verze.ts | cut -f1,2)" = "1	1" ] && ok || ko "shoda-numstat"
# marker leží v docs/ pod cwd jako v běžném režimu: cwd v podadresáři repa marker nemá, náhrada projde
o=$(bash "$vm" --zvedni "$r/src" "$r/src/verze.ts" a-opr1 a-opr2 2>/dev/null); [ "$o" = "marker nesedí" ] && grep -qF a-opr2 "$r/src/verze.ts" && ok || ko "cwd-podadresar-bez-markeru: $o"
# absolutní cesta s „..“ uvnitř repa projde, do markeru jde cesta od kořene repa
bash "$vm" "$r" > /dev/null
o=$(bash "$vm" --zvedni "$r" "$r/src/../src/verze.ts" a-opr2 a-opr3 2>/dev/null); [ "$o" = "marker přenesen" ] && [ "$(pole "$r" .zvednuti.soubor)" = src/verze.ts ] && [ "$(pole "$r" .tree)" = "$(bash "$th" "$r")" ] && ok || ko "absolutni-cesta: $o $(cat "$r/docs/.verify-passed")"
# výkonný bit přežije a výstup nezávisí na locale
novy_repo mod; r=$r; printf '#!/bin/sh\necho v1.0\n' > "$r/src/s.sh"; chmod 755 "$r/src/s.sh"; bash "$vm" "$r" > /dev/null
o=$(LC_ALL=C bash "$vm" --zvedni "$r" src/s.sh v1.0 v1.1 2>/dev/null); rc=$?
[ $rc -eq 0 ] && [ "$o" = "marker přenesen" ] && [ -x "$r/src/s.sh" ] && [ "$(pole "$r" .tree)" = "$(bash "$th" "$r")" ] && ok || ko "mod-a-locale: rc=$rc $o"

# --- neshoda: náhrada proběhne, marker zůstane
novy_repo neshoda; r=$r
bash "$vm" "$r" /log/x > /dev/null; printf 'export const y = 2;\n' > "$r/src/x.ts"; m=$(cat "$r/docs/.verify-passed")
o=$(bash "$vm" --zvedni "$r" src/verze.ts rez05-2026:a rez05-2026:b 2>/dev/null); rc=$?
[ $rc -eq 0 ] && [ "$o" = "marker nesedí" ] && [ "$(cat "$r/docs/.verify-passed")" = "$m" ] && grep -qF 'rez05-2026:b' "$r/src/verze.ts" && ok || ko "neshoda: rc=$rc $o"
# marker jen s nečitelným obsahem se bere jako neshoda
novy_repo rozbity; r=$r; printf 'nejde o json' > "$r/docs/.verify-passed"
o=$(bash "$vm" --zvedni "$r" src/verze.ts rez05-2026:a rez05-2026:b 2>/dev/null); rc=$?
[ $rc -eq 0 ] && [ "$o" = "marker nesedí" ] && [ "$(cat "$r/docs/.verify-passed")" = "nejde o json" ] && ok || ko "rozbity-marker: rc=$rc $o"

# --- chybějící marker: náhrada proběhne, marker nevznikne
novy_repo bez; r=$r
o=$(bash "$vm" --zvedni "$r" src/verze.ts rez05-2026:a rez05-2026:b 2>/dev/null); rc=$?
[ $rc -eq 0 ] && [ "$o" = "marker nesedí" ] && [ ! -e "$r/docs/.verify-passed" ] && grep -qF 'rez05-2026:b' "$r/src/verze.ts" && ok || ko "bez-markeru: rc=$rc $o"

# --- cizí změna mezi výpočty stromu: tree-hash podstrčený před skript změní jiný soubor; marker se nepřenese
novy_repo cizi; r=$r
bash "$vm" "$r" > /dev/null; m=$(cat "$r/docs/.verify-passed")
mkdir -p "$tmp/podstrceny"; cp "$vm" "$tmp/podstrceny/verify-marker.sh"
cat > "$tmp/podstrceny/tree-hash.sh" <<POD
#!/usr/bin/env bash
if [ -e "$tmp/podstrceny/druhe" ]; then printf 'export const z = 3;\n' > "$r/src/x.ts"; else : > "$tmp/podstrceny/druhe"; fi
exec bash "$th" "\$@"
POD
o=$(bash "$tmp/podstrceny/verify-marker.sh" --zvedni "$r" src/verze.ts rez05-2026:a rez05-2026:b 2>/dev/null); rc=$?
[ $rc -eq 0 ] && [ "$o" = "marker nesedí" ] && [ "$(cat "$r/docs/.verify-passed")" = "$m" ] && ok || ko "cizi-zmena: rc=$rc $o"

# --- odmítnutí, kód 3, nic se nezmění (marker sedí, aby žádná větev nešla přes neshodu)
novy_repo odm; r=$r; bash "$vm" "$r" /log/x > /dev/null
printf 'a=1.2.3 b=1.2.3\n' > "$r/src/dve.ts"; printf 'v1.1.1\n' > "$r/src/prekryv.ts"; printf 'export const POZADUJ_AUTH = false;\n' > "$r/src/auth.ts"
ln -s ../docs/popis.md "$r/src/odkaz-docs.md"; ln -s "$tmp/mimo.txt" "$r/src/odkaz-mimo.txt"; printf 'rez05-2026:a\n' > "$tmp/mimo.txt"
bash "$vm" "$r" /log/x > /dev/null
odmita dve-shody "$r" "2×" src/dve.ts 1.2.3 1.2.4
odmita prekryv "$r" "2×" src/prekryv.ts 1.1 1.2
odmita zadna-shoda "$r" "0×" src/verze.ts neni-tu-1 novy-1
# token bez číslice není verze: false → true by změnilo chování a marker by potvrdil strom, který brána neměřila
odmita bez-cislice "$r" "nenese číslici" src/auth.ts false true
odmita bez-cislice-novy "$r" "nenese číslici" src/verze.ts rez05-2026:a latest
odmita docs "$r" "pod docs/" docs/popis.md rez05-2026:a rez05-2026:b
odmita docs-marker "$r" "pod docs/" docs/.verify-passed log1 x1
odmita docs-pres-tecky "$r" "pod docs/" src/../docs/popis.md rez05-2026:a rez05-2026:b
odmita docs-absolutne "$r" "pod docs/" "$r/docs/popis.md" rez05-2026:a rez05-2026:b
odmita docs-symlink "$r" "pod docs/" src/odkaz-docs.md rez05-2026:a rez05-2026:b
if [ -e "$r/DOCS/popis.md" ]; then odmita docs-velka-pismena "$r" "pod " DOCS/popis.md rez05-2026:a rez05-2026:b; else ok; fi
odmita git "$r" "pod .git/" .git/HEAD ref1 ref2
odmita token-mezera "$r" "stary" src/verze.ts 'rez05 a' novy
odmita token-mezera-novy "$r" "novy" src/verze.ts rez05-2026:a 'rez05 b'
odmita token-zavorka "$r" "stary" src/verze.ts 'rez05(a)' novy
odmita token-zavorka-novy "$r" "novy" src/verze.ts rez05-2026:a 'rez05)'
odmita token-prazdny "$r" "novy" src/verze.ts rez05-2026:a ''
odmita token-regex "$r" "stary" src/verze.ts 'rez05.*' novy
odmita token-novy-radek "$r" "novy" src/verze.ts rez05-2026:a $'b\n'
odmita mimo-repo-tecky "$r" "mimo repo" ../mimo.txt rez05-2026:a rez05-2026:b
odmita mimo-repo-absolutne "$r" "mimo repo" "$tmp/mimo.txt" rez05-2026:a rez05-2026:b
odmita mimo-repo-symlink "$r" "mimo repo" src/odkaz-mimo.txt rez05-2026:a rez05-2026:b
odmita neexistuje "$r" "neexistuje" src/neni.ts a1 b1
odmita adresar "$r" "neexistuje" src a1 b1
o=$(bash "$vm" --zvedni "$r" src/verze.ts a 2>&1); [ $? -eq 3 ] && printf '%s' "$o" | grep -qF 'použití' && ok || ko "malo-argumentu: $o"
o=$(bash "$vm" --zvedni "$tmp/neni" src/verze.ts a1 b1 2>&1); [ $? -eq 3 ] && printf '%s' "$o" | grep -qF 'není adresář' && ok || ko "cwd-neexistuje: $o"
mkdir -p "$tmp/bez-gitu"; o=$(bash "$vm" --zvedni "$tmp/bez-gitu" a b c 2>&1); [ $? -eq 3 ] && ok || ko "cwd-bez-gitu: $o"
# soubor mimo repo zůstal, jak byl
[ "$(cat "$tmp/mimo.txt")" = rez05-2026:a ] && ok || ko "mimo-repo-beze-zmeny"
# po celé sérii odmítnutí marker pořád sedí se stromem
[ "$(pole "$r" .tree)" = "$(bash "$th" "$r")" ] && ok || ko "odmitnuti-strom-beze-zmeny"

# --- tree-hash: změna stejné velikosti v téže vteřině jako commit se projeví i v hashi počítaném až v další vteřině
na_zacatek_vteriny() { python3 -I -c 'import time; time.sleep(1.02 - time.time() % 1)'; }
na_zacatek_vteriny; novy_repo racy; r=$r; pred=$(bash "$th" "$r"); printf 'export const y = 2;\n' > "$r/src/x.ts"
na_zacatek_vteriny; po=$(bash "$th" "$r")
[ "$pred" != "$po" ] && ok || ko "racy-stejna-velikost: hash $po se nezměnil"

echo "verify-marker: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
