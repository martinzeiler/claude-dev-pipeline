#!/usr/bin/env bash
# Funkční testy scripts/follow-ups.py nad syntetickým docs/follow-ups.md: značka osudu jako druhý token, položky bez osudu,
# přeškrtnuté se nepočítají, řez z nadpisu, kolečko, víceřádková položka, cesty, filtry --osud/--oblast/--rez a --json.
# Spusť: dev-pipeline/tests/skripty/follow-ups.sh
set -uo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); plugin=$(cd "$here/../.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/follow-ups-test.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
proj="$tmp/proj"; mkdir -p "$proj/docs"
pass=0; fail=0
ok() { pass=$((pass+1)); }; ko() { fail=$((fail+1)); echo "FAIL $*"; }
fu() { python3 -I "$plugin/scripts/follow-ups.py" "$@" 2>&1; }

cat > "$proj/docs/follow-ups.md" <<'EOF'
# Follow-ups

Kontinuální backlog napříč vizemi.

## Řez 03 Knihovna

- [řez 03 · api] [oprava] Odstranit past: roll-up v `apps/web/src/lib/hotelDestinationOptions.ts` bere
  jen první zemi; druhý řádek položky.
- [řez 03 · api] [oprava] `apps/web/src/lib/slugy.ts` nehlídá diakritiku.
- [řez 03 · web] [rozhodnutí] Majitel rozhodne, jestli „Další destinace“ řadit podle počtu zájezdů (Povolení P2).
- [řez 03 · obsah] [obsah] Texty pro 6 hotelů bez podkladů dodá majitel.
- ~~[řez 03 · web] [oprava] Hotovo `apps/web/src/a.ts`~~ VYŘEŠENO 2026-10-19: kolečko
- [řez 03 · web] Položka bez osudu ze staršího běhu v `apps/web/src/b.ts`.

## Řez 06 Lidé

- [E2E kosmetika řez 06] `ohlasy.mjs plochy` hlásí na `/` úsek `ohlasy-uvod`
- [řez 06 · web] [nápad] Rozbalovací medailonek by mohl mít animaci.
- Položka bez značky pod nadpisem řezu 06.

## Kolečko

- [kolečko · bezpečnost] [oprava] `apps/api/src/auth.ts` loguje token.
- [oprava] [kolečko · web] Osud jako první značka v `apps/web/src/c.ts`.
- [oprava] N3 (FOLLOW-UP z review) holý osud bez řezu v `apps/web/src/d.ts`.
- [nápad] [oprava] Dvě značky osudu: druhá se nebere jako oblast.
EOF

# 1. přehled: počty, uzavřené, seznam rozhodnutí
o=$(fu "$proj"); rc=$?
[ $rc -eq 0 ] && printf '%s' "$o" | grep -q '^follow-ups: 12 otevřených položek, 1 uzavřených' && ok || ko "prehled-hlava: rc=$rc $o"
printf '%s' "$o" | grep -q '^\[rozhodnutí\] (1):' && printf '%s' "$o" | grep -q -- '- řez 03 · web: Majitel rozhodne' && ok || ko "prehled-rozhodnuti: $o"
printf '%s' "$o" | grep -q '3 položek bez osudu' && ok || ko "prehled-bez-osudu: $o"
printf '%s' "$o" | grep -E '^api ' | grep -q '  2$' && ok || ko "prehled-tabulka-api: $o"

# 2. --json: pole položek, řez z nadpisu, kolečko, víceřádková položka, cesty
j=$(fu "$proj" --json); rc=$?
[ $rc -eq 0 ] && [ "$(printf '%s' "$j" | jq -r '[.otevrene, .uzavrene, (.polozky | length)] | @csv')" = '12,1,12' ] && ok || ko "json-pocty: rc=$rc $j"
# osud jako první značka, holý osud bez řezu (řez z nadpisu, oblast ?), dvě značky osudu
[ "$(printf '%s' "$j" | jq -r '.polozky[] | select(.text | test("první značka")) | [.rez, .oblast, .osud] | @csv')" = '"kolecko","web","oprava"' ] && ok || ko "json-osud-prvni: $(printf '%s' "$j" | jq -c '.polozky[] | select(.text | test("první značka"))')"
[ "$(printf '%s' "$j" | jq -r '.polozky[] | select(.text | test("holý osud")) | [.rez, .oblast, .osud] | @csv')" = '"kolecko","?","oprava"' ] && ok || ko "json-osud-holy: $(printf '%s' "$j" | jq -c '.polozky[] | select(.text | test("holý osud"))')"
[ "$(printf '%s' "$j" | jq -r '.polozky[] | select(.text | test("Dvě značky")) | [.rez, .oblast, .osud, (.text | startswith("[oprava]"))] | @csv')" = '"kolecko","?","nápad",true' ] && ok || ko "json-osud-dvakrat: $(printf '%s' "$j" | jq -c '.polozky[] | select(.text | test("Dvě značky"))')"
[ "$(printf '%s' "$j" | jq -r '[.polozky[].oblast] | map(select(. == "oprava" or . == "nápad")) | length')" = 0 ] && ok || ko "json-osud-neni-oblast"
[ "$(printf '%s' "$j" | jq -r '.polozky[0] | [.rez, .oblast, .osud, (.cesty | join(",")), (.text | test("druhý řádek položky"))] | @csv')" = '"03","api","oprava","apps/web/src/lib/hotelDestinationOptions.ts",true' ] && ok || ko "json-prvni: $(printf '%s' "$j" | jq -c '.polozky[0]')"
[ "$(printf '%s' "$j" | jq -r '.polozky[] | select(.text | test("Položka bez značky")) | [.rez, .oblast, .osud] | @csv')" = '"06","?","bez osudu"' ] && ok || ko "json-bez-znacky"
[ "$(printf '%s' "$j" | jq -r '.polozky[] | select(.text | test("ohlasy.mjs")) | [.rez, .oblast] | @csv')" = '"06","E2E kosmetika"' ] && ok || ko "json-e2e-znacka: $(printf '%s' "$j" | jq -c '.polozky[] | select(.text | test("ohlasy"))')"
[ "$(printf '%s' "$j" | jq -r '.polozky[] | select(.oblast == "bezpečnost") | [.rez, .osud] | @csv')" = '"kolecko","oprava"' ] && ok || ko "json-kolecko"
[ "$(printf '%s' "$j" | jq -r '.pocty.api.oprava')" = 2 ] && ok || ko "json-pocty-api"

# 3. --osud oprava: seskupení podle oblasti a adresáře cesty
o=$(fu "$proj" --osud oprava); rc=$?
[ $rc -eq 0 ] && printf '%s' "$o" | grep -q '^follow-ups: 5 otevřených' && printf '%s' "$o" | grep -q '^## api (2)' && printf '%s' "$o" | grep -q '^### apps/web/src/lib (2)' && printf '%s' "$o" | grep -q '^### apps/api/src (1)' && printf '%s' "$o" | grep -q '^## ? (1)' && ok || ko "osud-oprava: rc=$rc $o"
o=$(fu "$proj" --osud napad); printf '%s' "$o" | grep -q '^follow-ups: 2 otevřených' && ok || ko "osud-bez-diakritiky: $o"
o=$(fu "$proj" --osud 'bez osudu' --json); [ "$(printf '%s' "$o" | jq -r '.otevrene')" = 3 ] && ok || ko "osud-bez-osudu: $o"
o=$(fu "$proj" --osud neznamy); [ $? -eq 2 ] && ok || ko "osud-neznamy: $o"

# 4. --rez a --oblast
o=$(fu "$proj" --rez 6 --json); [ "$(printf '%s' "$o" | jq -r '.otevrene')" = 3 ] && ok || ko "rez-6: $o"
o=$(fu "$proj" --rez kolecko --json); [ "$(printf '%s' "$o" | jq -r '.otevrene')" = 4 ] && ok || ko "rez-kolecko: $o"
o=$(fu "$proj" --oblast WEB --json); [ "$(printf '%s' "$o" | jq -r '.otevrene')" = 4 ] && ok || ko "oblast-web: $o"

# 5. chybějící soubor a --help
o=$(fu "$tmp/neni"); [ $? -eq 2 ] && ok || ko "chybi-soubor: $o"
o=$(fu --help); [ $? -eq 0 ] && printf '%s' "$o" | grep -q -- '--osud' && ok || ko "help: $o"

echo "follow-ups: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
