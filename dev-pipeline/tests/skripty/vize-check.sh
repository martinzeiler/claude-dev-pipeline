#!/usr/bin/env bash
# Funkční testy scripts/vize-check.py nad syntetickou vizí: správný tvar projde (exit 0, součet odhadů a délka běhu),
# každá vada dá exit 1 s řádkem problému (i Cíl, který by scripts/zprava.py nepřečetl), upozornění exit nemění;
# chybějící soubor exit 2.
# Spusť: dev-pipeline/tests/skripty/vize-check.sh
set -uo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); plugin=$(cd "$here/../.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/vize-check-test.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
ok() { pass=$((pass+1)); }; ko() { fail=$((fail+1)); echo "FAIL $*"; }
vc() { python3 -I "$plugin/scripts/vize-check.py" "$1" 2>&1; }

cat > "$tmp/v.md" <<'EOF'
# Vize v

## 1. Proč

Problém a pro koho.

## 2. Cíle

- **C1 Řazení.** Seznamy jsou abecedně česky.
- **C2 Česká URL.** Veřejné adresy jsou česky,
  i ve vyhledávání.

## 3. Ne-cíle

- Redakční pořadí zemí **není** součástí vize (R1).
- Přesměrování starých adres **nikdy** nemaže historii.

## 4. Uživatelské scénáře

### S1 Návštěvník hledá

Tok.

## 5. Funkční požadavky

### F1 Řazení

- **F1.1 Abeceda.** Řadí se podle české kolace. Kritérium: test nad vzorkem.
- **F1.2** Země zůstávají. Kritérium: pořadí zemí beze změny.

### F2 Česká URL

- **F2.1 Slugy.** Slug je česky,
  bez diakritiky. Kritérium: test slugů.

## 5b. Tvar UI a UI plochy

### P1 Seznam zájezdů

Hierarchie.

## 6. Technické mantinely

### Řazení

Text.

## 7. Rizika a rozhodnutí

- **R1 Abeceda obrací pořadí zemí.** Rozhodnuto: země zůstávají.

## 8. Mantinely a Povolení

Bez mantinelů; bez zápisu do živých systémů.

## 8b. Provozní poznámky pro orchestrátora

- **Čekání na čas:** žádné
- **Merge do main po běhu:** ano

## 9. Plán řezů

| # | Název | Body vize | Odhad řádků | Definice hotového | Závislosti | Poznámka |
|---|---|---|---|---|---|---|
| 1 | Řazení | C1; F1.1 až F1.2; R1; plocha P1 | ~3 k | seznam je abecedně | – | |
| 2 | Česká URL | C2; F2.1 | 4 500 | adresy jsou česky | 1 | |
| 3 | Úklid | C1 | ~2,5 k | staré řazení pryč | 1, 2 | |
EOF
zmen() { python3 - "$tmp/v.md" "$tmp/$1.md" "$2" "$3" <<'PY'
import sys
src, dst, a, b = sys.argv[1:5]
s = open(src, encoding="utf-8").read()
assert a in s, a
open(dst, "w", encoding="utf-8").write(s.replace(a, b, 1))
PY
}
# vada: soubor, očekávaný řádek výstupu
vada() { local o; o=$(vc "$tmp/$1.md"); local rc=$?; [ $rc -eq 1 ] && printf '%s' "$o" | grep -qF -- "$2" && ok || ko "$1: rc=$rc čekáno „$2“: $o"; }

# 1. správná vize
o=$(vc "$tmp/v.md"); rc=$?
[ $rc -eq 0 ] && printf '%s' "$o" | grep -q 'vize-check: chyb 0, upozornění 0; součet odhadů 10000 ř., odhad délky běhu ~10 h' && ok || ko "spravna: rc=$rc $o"

# 2. vady plánu
zmen bez-odhadu '| # | Název | Body vize | Odhad řádků |' '| # | Název | Body vize | Rozsah |'; vada bez-odhadu 'chyba: tabulka plánu bez sloupce „Odhad řádků“'
zmen velky '| ~3 k |' '| 6 000 |'; vada velky 'chyba: řez 1: odhad 6000 ř. je nad ~5 k'
zmen necitelny '| ~3 k |' '| hodně |'; vada necitelny 'chyba: řez 1: odhad řádků chybí nebo nejde přečíst'
zmen odkaz 'C2; F2.1 |' 'C2; F2.1, F9.9 |'; vada odkaz 'chyba: řez 2: odkaz na neexistující značku F9.9'
zmen rozsah 'F1.1 až F1.2' 'F1.1 až F1.7'; vada rozsah 'chyba: řez 1: rozsah končí neexistující značkou F1.7'
zmen pokryti '| 2 | Česká URL | C2; F2.1 |' '| 2 | Česká URL | F2.1 |'; vada pokryti 'chyba: Cíl C2 nemá v plánu žádný řez'
zmen zavislost '| 1, 2 |' '| 1, 7 |'; vada zavislost 'chyba: řez 3: závislost na neexistujícím řádku 7'
zmen dvojity-rez '| 3 | Úklid |' '| 2 | Úklid |'; vada dvojity-rez 'chyba: řez 2 je v plánu dvakrát'
zmen bez-tabulky '| # | Název |' '| Číslo | Název |'; vada bez-tabulky 'chyba: Plán řezů nemá tabulku se sloupcem „#“'

# 3. vady Cílů, Ne-cílů, F, R a sekcí
zmen cil-tvar '- **C1 Řazení.** Seznamy' '- C1: Řazení. Seznamy'; vada cil-tvar 'chyba: odrážka v Cílech mimo tvar'
zmen cil-dvakrat '- **C1 Řazení.** Seznamy jsou abecedně česky.' '- **C1 Řazení.** Seznamy jsou abecedně česky.
- **C1 Znovu.** Text.'; vada cil-dvakrat 'chyba: Cíl C1 je dvakrát'
zmen necil 'Redakční pořadí zemí **není** součástí vize (R1).' 'Redakční pořadí zemí se neřeší.'; vada necil 'chyba: Ne-cíl bez tučného záporu'
zmen f-oblast '### F2 Česká URL' '### Česká URL'; vada f-oblast 'chyba: požadavky F2.x nemají oblast `### F2 Název`'
zmen f-tvar '- **F1.2** Země' '- **F1.2 Země zůstávají Kritérium: x'; vada f-tvar 'chyba: požadavek mimo tvar'
zmen r-dvakrat '- **R1 Abeceda obrací pořadí zemí.** Rozhodnuto: země zůstávají.' '- **R1 Abeceda.** A.
- **R1 Znovu.** B.'; vada r-dvakrat 'chyba: rozhodnutí R1 je dvakrát'
zmen otazky '## 9. Plán řezů' '## Otevřené otázky

- Jak řadit země?

## 9. Plán řezů'; vada otazky 'chyba: sekce Otevřené otázky není prázdná'
zmen provoz '- **Merge do main po běhu:** ano' '- Ostatní.'; vada provoz 'chyba: Provozní poznámky bez řádku „**Merge do main po běhu:** ano | ne“'
zmen bez-sekce '## 4. Uživatelské scénáře' '## 4. Scénáře uživatelů'; vada bez-sekce 'chyba: chybí sekce „Uživatelské scénáře“'

# 4. křížová kontrola se zprava.py (cile): Cíl, který zpráva nepřečte, i Cíl, který zpráva čte navíc
zmen cil-zalomeny '- **C2 Česká URL.** Veřejné' '- **C2 Česká URL s dlouhým
  názvem.** Veřejné'; vada cil-zalomeny 'chyba: Cíl C2: zpráva by Cíle nepřečetla'
zmen cil-navic '### S1 Návštěvník hledá' '### C3 Návštěvník hledá'; vada cil-navic 'chyba: zpráva by Cíle nepřečetla: čte navíc C3'

# 5. upozornění exit nemění
zmen hrana '| ~3 k |' '| 5 200 |'
o=$(vc "$tmp/hrana.md"); rc=$?; [ $rc -eq 0 ] && printf '%s' "$o" | grep -q 'upozornění: řez 1: odhad 5200 ř. je na hraně ~5 k' && ok || ko "hrana: rc=$rc $o"
zmen bez-kriteria 'Řadí se podle české kolace. Kritérium: test nad vzorkem.' 'Řadí se podle české kolace.'
o=$(vc "$tmp/bez-kriteria.md"); rc=$?; [ $rc -eq 0 ] && printf '%s' "$o" | grep -q 'upozornění: požadavek F1.1 bez věty s kritériem' && ok || ko "bez-kriteria: rc=$rc $o"

# 6. chybějící soubor, nápověda
o=$(vc "$tmp/neni.md"); [ $? -eq 2 ] && ok || ko "chybi-soubor: $o"
o=$(python3 -I "$plugin/scripts/vize-check.py" --help); [ $? -eq 0 ] && printf '%s' "$o" | grep -q 'Odhad řádků' && ok || ko "help"

echo "vize-check: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
