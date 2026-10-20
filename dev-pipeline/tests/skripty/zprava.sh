#!/usr/bin/env bash
# Funkční testy scripts/zprava.py nad syntetickým projektem: kostra zprávy z handoffu, vize (Cíle), zápisů nasazení
# (Dveře · Dosah), vize-spory (dotazník otázek, pořadí Proti vizi první), follow-ups (osud) a čísel z co-dela.sh --zprava;
# opakované spuštění zachová sekce orchestrátora a odpovědi pod „Odpověď:“. Spusť: dev-pipeline/tests/skripty/zprava.sh
set -uo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); plugin=$(cd "$here/../.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/zprava-test.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
proj="$tmp/proj"; mkdir -p "$proj/docs/vize" "$proj/docs/e2e"
SID=sess-zprava
pass=0; fail=0
ok() { pass=$((pass+1)); }; ko() { fail=$((fail+1)); echo "FAIL $*"; }
zp() { (cd "$proj" && CLAUDE_CONFIG_DIR="$tmp/cfg" python3 -I "$plugin/scripts/zprava.py" "$proj" --plugin-root "$plugin" "$@" 2>&1); }

jq -n --arg s "$SID" '{session_id:$s, started:"2026-10-17T06:00:00Z", vize:"docs/vize/v.md", slug:"v", branch:"vize/v"}' > "$proj/docs/.orchestrator-run"
cat > "$proj/docs/handoff.md" <<'EOF'
# Běh vize v
stav běhu: čeká: finální fáze
branch: vize/v · vize: docs/vize/v.md · start: 2026-10-17
session: sess-zprava

## Plán (živá kopie)

| # | Název | Body | Záv. | Stav | Commit / E2E / pozn. |
|---|---|---|---|---|---|
| 1 | Řazení a výběr | F1 (C1) | – | hotovo | 421c0b45 · E2E 32/34 |
| 2 | Česká URL | F2 (C2) | 1 | selhalo (E2E, 1 pokus) | cc43abb0 nasazeno |
EOF
cat > "$proj/docs/vize/v.md" <<'EOF'
# Vize v

## 2. Cíle

- **C1** Seznamy, ve kterých se hledá podle jména, jsou na webu i v adminu česky abecedně; pořadí zemí zůstává.
- **C2** Veřejné adresy webu jsou česky.

## 5. Funkční požadavky

### F1 Řazení
- **F1.1** detail
### F2 Česká URL a historie slugů

## 7. Rizika a rozhodnutí

- **R1 Abeceda obrací redakční pořadí zemí** ze světového katalogu.
EOF
cat > "$proj/docs/e2e/rez-01-nasazeni.md" <<'EOF'
# Řez 01: zápis nasazení

## Nasazení 1
- commit řezu: `421c0b45`
- Dveře: obousměrné · Dosah: web

## Nasazení 2
- Dveře: jednosměrné · Dosah: data
EOF
cat > "$proj/docs/vize-spory.md" <<'EOF'
# Spory a předpoklady k vizi v

## 2026-10-17 | řez 01 | prd architekt
**Rozpor nebo předpoklad:** vize §6 chce rozpočet hlavičky 60 KiB, ale produkce je nad ním už před řezem. Druhá věta.
**Jak jsem se zachoval:** podle návrhu: řez měří přírůstek, snížení patří samostatnému řezu.
**Hledal jsem ve vizi:** §6 mantinel 10, ř. 520
**Co by to rozhodlo:** majitel řekne, jestli snížení zařadit jako vlastní řez.

## 2026-10-17 | řez 02 | orchestrátor (rozhodnutí majitele)
**Rozpor nebo předpoklad:** odpověď na otázku k URL.
**Jak jsem se zachoval:** majitel doslovně: „ano“.
**Co by to rozhodlo:** rozhodnuto majitelem.

## 2026-10-18 | řez 02 | e2e-verifier
**Rozpor nebo předpoklad:** popis fotky je mezi AI texty, vize ho tam nemá.
**Jak jsem se zachoval:** podle návrhu: popis zůstává.
**Proti vizi:** ř. 366
**Co by to rozhodlo:** majitel potvrdí popis mezi AI texty.

## 2026-10-18 | řez 02 | prd architekt
**Rozpor nebo předpoklad:** fasety mají 404 místo 301.
**Jak jsem se zachoval:** podle návrhu: 301 na kanonickou adresu.
**Co by to rozhodlo:** majitel řekne, jestli 301.
**Rozhodnuto majitelem:** „ano, 301“
EOF
cat > "$proj/docs/follow-ups.md" <<'EOF'
# Follow-ups

## Řez 01 Řazení

- [řez 01 · web] [rozhodnutí] Majitel rozhodne o řazení Populárního hledání.
- [řez 01 · api] [oprava] `apps/api/src/a.ts` past.
EOF
# session orchestrátora: transkript s usage (opus 1 M vstupních tokenů = $4), agent (sonnet 1 M výstupních = $10), hotová stavba 01
slug=$(cd "$proj" && pwd | sed 's/[^a-zA-Z0-9]/-/g')
sess="$tmp/cfg/projects/$slug/$SID"; mkdir -p "$sess/subagents/workflows/wf_s01" "$sess/workflows"
jq -cn '{type:"assistant", timestamp:"2026-10-17T06:10:00Z", message:{id:"m1", model:"claude-opus-5-5", usage:{input_tokens:500000, output_tokens:0}}}' > "$sess.jsonl"
jq -cn '{type:"assistant", timestamp:"2026-10-17T06:10:01Z", message:{id:"m1", model:"claude-opus-5-5", usage:{input_tokens:1000000, output_tokens:0}}}' >> "$sess.jsonl"
jq -cn '{type:"assistant", timestamp:"2026-10-17T06:11:00Z", message:{id:"m2", model:"<synthetic>", usage:{input_tokens:9000000, output_tokens:0}}}' >> "$sess.jsonl"
jq -cn '{type:"assistant", timestamp:"2026-10-17T07:00:00Z", message:{id:"a1", model:"claude-sonnet-5-5", usage:{input_tokens:0, output_tokens:1000000, cache_read_input_tokens:0}}}' > "$sess/subagents/workflows/wf_s01/agent-a1.jsonl"
jq -cn '{type:"started", agentId:"a1", key:"k1", label:"implement:řez 01:1", phase:"Implementace"}' > "$sess/subagents/workflows/wf_s01/journal.jsonl"
jq -cn '{type:"result", agentId:"a1"}' >> "$sess/subagents/workflows/wf_s01/journal.jsonl"
jq -n '{status:"completed", workflowName:"blok-stavby", args:{rez:"01"}, result:{ok:true, rez:"01", vysledek:"hotovo", pokusy:2, dvere:"jednosměrné", dosah:"data"}}' > "$sess/workflows/wf_s01.json"
jq -n '{status:"completed", workflowName:"blok-stavby", args:{rez:"02"}, result:{ok:true, rez:"02", vysledek:"selhalo", pokusy:1, faze:"e2e"}}' > "$sess/workflows/wf_s02.json"

# 1. co-dela --zprava: cena a bloky
c=$(cd "$proj" && CLAUDE_CONFIG_DIR="$tmp/cfg" bash "$plugin/scripts/co-dela.sh" --zprava 2>&1); rc=$?
[ $rc -eq 0 ] && [ "$(printf '%s' "$c" | jq -r '[.cena_usd, .agentu, .bloky.hotovo, .bloky.selhalo, .rezy["01"].pokusy, .rezy["02"].vysledek, .od] | @csv')" = '14.0,1,1,1,2,"selhalo","2026-10-17T06:00:00Z"' ] && ok || ko "co-dela-zprava: rc=$rc $c"

# 2. kostra zprávy
o=$(zp); rc=$?
z="$proj/docs/zaverecna-zprava.md"
[ $rc -eq 0 ] && [ -f "$z" ] && printf '%s' "$o" | grep -q 'Cílů 5, řezů 2, otázek 2 z 4 záznamů, follow-ups 2, čísla ano' && ok || ko "zprava-vystup: rc=$rc $o"
grep -q '^- \*\*C1\*\* (Seznamy, ve kterých se hledá…)' "$z" && grep -q '^- \*\*F2\*\* (Česká URL a historie slugů)' "$z" && grep -q '^- \*\*R1\*\* (Abeceda obrací redakční pořadí zemí)' "$z" && ok || ko "zprava-cile: $(grep -n '^\- \*\*' "$z")"
grep -q '^| 01 | Řazení a výběr | hotovo | 2 | jednosměrné · data | 421c0b45 · E2E 32/34 |' "$z" && ok || ko "zprava-rez-01: $(grep '^| 01' "$z")"
grep -q '^| 02 | Česká URL | selhalo (E2E, 1 pokus) | 1 |  | cc43abb0 nasazeno |' "$z" && ok || ko "zprava-rez-02: $(grep '^| 02' "$z")"
grep -q '^- cena: \$14 (claude-sonnet-5-5 \$10, claude-opus-5-5 \$4)' "$z" && ok || ko "zprava-cena: $(grep '^- cena' "$z")"
grep -q 'plugin dev-pipeline [0-9]' "$z" && grep -q 'větev `vize/v`' "$z" && ok || ko "zprava-hlavicka: $(sed -n 3p "$z")"
# otázky: Proti vizi první, rozhodnuto majitelem vynecháno, prázdná Odpověď
prvni=$(grep -n '^### ' "$z" | head -1); printf '%s' "$prvni" | grep -q 'řez 02 · popis fotky je mezi AI texty' && ok || ko "otazky-poradi: $prvni"
[ "$(grep -c '^### ' "$z")" = 2 ] && grep -q '^Proti vizi: ř. 366' "$z" && grep -q '^Hledal jsem ve vizi: §6 mantinel 10' "$z" && [ "$(grep -c '^Odpověď:$' "$z")" = 2 ] && ok || ko "otazky-tvar: $(grep -n '^###\|^Proti\|^Odpověď' "$z")"
grep -q '^4 záznamů v docs/vize-spory.md (2 otázek výše, 2 rozhodnutých majitelem)' "$z" && grep -q 'fasety mají 404 místo 301 (rozhodnuto majitelem: „ano, 301“)' "$z" && ok || ko "spory-souhrn: $(grep -n 'záznamů\|fasety' "$z")"
grep -q '^2 otevřených (rozhodnutí 1, oprava 1), 0 uzavřených' "$z" && grep -q '^- řez 01 · web: Majitel rozhodne' "$z" && ok || ko "follow-ups: $(grep -n 'otevřených\|Majitel' "$z")"
grep -q '<!-- orchestrátor: Stav Cílů -->' "$z" && grep -q '<!-- orchestrátor: ROZHODNUTÍ PRO TEBE -->' "$z" && ok || ko "sekce-orchestratora"
grep -q 'příští' "$z" && ko "dovetek-priste" || ok

# 3. opakované spuštění zachová sekce orchestrátora a odpovědi
python3 - "$z" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p, encoding="utf-8").read()
s = re.sub(r"(<!-- orchestrátor: Stav Cílů -->\n).*?(\n<!-- /orchestrátor -->)", r"\1C1 hotovo, C2 selhalo.\2", s, flags=re.S)
s = s.replace("Proti vizi: ř. 366\n", "Proti vizi: ř. 366\n", 1)
s = re.sub(r"(### řez 02 · popis fotky[^\n]*\n(?:[^\n]*\n)*?)Odpověď:\n", r"\1Odpověď: nech popis.\n", s, count=1)
open(p, "w", encoding="utf-8").write(s)
PY
o=$(zp --bez-cisel); rc=$?
[ $rc -eq 0 ] && grep -q '^C1 hotovo, C2 selhalo.$' "$z" && grep -q '^Odpověď: nech popis.$' "$z" && [ "$(grep -c '^Odpověď:$' "$z")" = 1 ] && printf '%s' "$o" | grep -q 'zachováno 1 sekcí a 1 odpovědí' && ok || ko "opakovani: rc=$rc $o $(grep -n '^Odpověď\|^C1 hotovo' "$z")"
grep -q '^- nezjištěno (co-dela.sh --zprava nevrátil čísla' "$z" && ok || ko "bez-cisel: $(grep -n 'nezjištěno' "$z")"

# 4. bez handoffu i markeru: kód 2; --help
rm -rf "$tmp/prazdny"; mkdir -p "$tmp/prazdny/docs"
o=$(python3 -I "$plugin/scripts/zprava.py" "$tmp/prazdny" --plugin-root "$plugin" --bez-cisel 2>&1); [ $? -eq 2 ] && ok || ko "bez-handoffu: $o"
o=$(python3 -I "$plugin/scripts/zprava.py" --help); [ $? -eq 0 ] && printf '%s' "$o" | grep -q -- '--bez-cisel' && ok || ko "help"

echo "zprava: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
