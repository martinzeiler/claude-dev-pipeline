#!/usr/bin/env bash
# Funkční testy scripts/co-dela.sh nad syntetickou session: předávky jen z docs/.kontext.jsonl (za běh a za řez přes
# všechny bloky), bez logu záloha z výsledků bloků, název části z docs/.stavba-NN.json u labelu agenta, compacty
# orchestrátora z logu a --zprava (čísla běhu jako JSON).
# Spusť: dev-pipeline/tests/skripty/co-dela.sh
set -uo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); plugin=$(cd "$here/../.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/co-dela-test.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
proj="$tmp/proj"; mkdir -p "$proj/docs"
SID=sess-codela
pass=0; fail=0
ok() { pass=$((pass+1)); }; ko() { fail=$((fail+1)); echo "FAIL $*"; }
jq -n --arg s "$SID" '{session_id:$s, started:"2026-10-06T07:30:00Z", vize:"docs/vize/v.md", slug:"v"}' > "$proj/docs/.orchestrator-run"
slug=$(cd "$proj" && pwd | sed 's/[^a-zA-Z0-9]/-/g')
sess="$tmp/cfg/projects/$slug/$SID"
mkdir -p "$sess/subagents/workflows/wf_bezi-1" "$sess/subagents/workflows/wf_hotovo-2" "$sess/workflows/scripts"
printf "phases: [\n  { title: 'Implementace' },\n  { title: 'Části' },\n]\n" > "$sess/workflows/scripts/blok-stavby-wf_bezi-1.js"

# běžící stavba řezu 05: živá část K2 bez výsledku
jq -cn '{type:"started", agentId:"a1", key:"k1", label:"implement:řez 05:K2:1", phase:"Části"}' > "$sess/subagents/workflows/wf_bezi-1/journal.jsonl"
jq -cn '{type:"assistant", timestamp:"2026-10-06T08:00:00Z", message:{content:[{type:"tool_use", name:"Bash", input:{command:"pnpm test"}}]}}' > "$sess/subagents/workflows/wf_bezi-1/agent-a1.jsonl"
# doběhlá stavba řezu 04: výsledek hlásí 1 předávku (log jich má víc: blok PRD řezu 04 a obnova)
jq -cn '{type:"started", agentId:"b1", key:"b1", label:"implement:řez 04:1", phase:"Implementace"}' > "$sess/subagents/workflows/wf_hotovo-2/journal.jsonl"
touch -t 202610060800 "$sess/subagents/workflows/wf_hotovo-2/journal.jsonl"
jq -n '{status:"completed", workflowName:"blok-stavby", args:{rez:"04"}, result:{ok:true, vysledek:"hotovo", predavky:1}}' > "$sess/workflows/wf_hotovo-2.json"
touch -t 202610060801 "$sess/workflows/wf_hotovo-2.json"

jq -n '{rez:"05", casti:[{id:"K1", nazev:"evidence nákladů"}, {id:"K2", nazev:"runner: thinking a effort a mnohem delší název části"}]}' > "$proj/docs/.stavba-05.json"
{
  jq -cn '{ts:"2026-10-06T07:59:00Z", rez:"05", aid:"a1", typ:"implement", kontext:90000, max:90000, compactu:0, udalost:"mereni", cteni_bajtu:51200, zamitnuto:1}'
  jq -cn '{ts:"2026-10-06T08:00:00Z", rez:"05", aid:"x1", typ:"implement", kontext:120000, max:120000, compactu:0, udalost:"mereni"}'
  jq -cn '{ts:"2026-10-06T08:01:00Z", rez:"05", aid:"x1", typ:"implement", kontext:260000, max:260000, compactu:0, udalost:"predavka", soubor:"docs/reviews/predavka-x1.md"}'
  jq -cn '{ts:"2026-10-06T08:02:00Z", rez:"05", aid:"x2", typ:"prd", kontext:250000, max:250000, compactu:0, udalost:"predavka", soubor:"docs/reviews/predavka-x2.md"}'
  jq -cn '{ts:"2026-10-06T08:03:00Z", rez:"04", aid:"x3", typ:"prd", kontext:250000, max:250000, compactu:0, udalost:"predavka", soubor:"docs/reviews/predavka-x3.md"}'
  jq -cn '{ts:"2026-10-06T08:04:00Z", rez:"04", aid:"x4", typ:"implement", kontext:250000, max:250000, compactu:0, udalost:"predavka", soubor:"docs/reviews/predavka-x4.md"}'
  jq -cn '{ts:"2026-10-06T08:05:00Z", rez:"kolecko", aid:"x5", typ:"fix", kontext:250000, max:250000, compactu:0, udalost:"predavka", soubor:"docs/reviews/predavka-x5.md"}'
  jq -cn '{ts:"2026-10-06T08:06:00Z", rez:"-", aid:"orchestrator", typ:"orchestrator", udalost:"compact", trigger:"auto"}'
} > "$proj/docs/.kontext.jsonl"

cd_run() { (cd "$proj" && CLAUDE_CONFIG_DIR="$tmp/cfg" bash "$plugin/scripts/co-dela.sh" "$@" 2>&1); }

o=$(cd_run)
printf '%s' "$o" | grep -q 'implement řez 05 · část K2 (runner: thinking a effort a m…) · pokus 1' && ok || ko "nazev-casti: $o"
# 1.9.0: čtení živého agenta z pole cteni_bajtu posledního záznamu (stráž čtení hlídače kontextu)
printf '%s' "$o" | grep -q 'kontext 90k · čtení 50 kB' && ok || ko "cteni-kb: $o"
printf '%s' "$o" | grep -q '^▶ stavba řezu 05 .* · předávek řezu 2$' && ok || ko "predavky-rezu-na-bloku: $o"
printf '%s' "$o" | grep -q 'předávek 5 · compactů orchestrátora 1$' && ok || ko "predavky-z-logu: $o"

o=$(cd_run --kratce); printf '%s' "$o" | grep -q 'část K2 (runner' && printf '%s' "$o" | grep -q 'předávek 5' && ok || ko "kratce: $o"
o=$(jq -cn --arg t "$sess.jsonl" '{transcript_path:$t}' | (cd "$proj" && CLAUDE_CONFIG_DIR="$tmp/cfg" bash "$plugin/scripts/co-dela.sh" --status 2>&1))
case "$o" in "▶ 1 · implement:řez 05:K2:1 · "*) ok ;; *) ko "status: $o" ;; esac

# bez názvu v args stavby a bez souboru: holé „část K2“
jq -n '{rez:"05", casti:[{id:"K2"}]}' > "$proj/docs/.stavba-05.json"
o=$(cd_run); printf '%s' "$o" | grep -q 'implement řez 05 · část K2 · pokus 1' && ok || ko "bez-nazvu: $o"
rm "$proj/docs/.stavba-05.json"
o=$(cd_run); printf '%s' "$o" | grep -q 'implement řez 05 · část K2 · pokus 1' && ok || ko "bez-souboru: $o"

# bez logu: záloha z výsledků doběhlých bloků a labelů nástupců (tady 1 z výsledku řezu 04)
rm "$proj/docs/.kontext.jsonl"
o=$(cd_run); printf '%s' "$o" | grep -q 'kontext agentů: předávek 1$' && ok || ko "bez-logu-zaloha: $o"
printf '%s' "$o" | grep -q 'předávek řezu' && ko "bez-logu-blok: $o" || ok

# --zprava: čísla běhu jako JSON (cena z usage posledního záznamu zprávy, syntetická odpověď se nepočítá; od z markeru)
jq -cn '{type:"assistant", message:{id:"o1", model:"claude-opus-5-5", usage:{input_tokens:1, output_tokens:0}}}' > "$sess.jsonl"
jq -cn '{type:"assistant", message:{id:"o1", model:"claude-opus-5-5", usage:{input_tokens:1000000, output_tokens:0, cache_creation_input_tokens:1000000, cache_creation:{ephemeral_1h_input_tokens:1000000}}}}' >> "$sess.jsonl"
jq -cn '{type:"assistant", message:{id:"o2", model:"<synthetic>", usage:{input_tokens:5000000}}}' >> "$sess.jsonl"
jq -cn '{type:"assistant", message:{id:"b1", model:"claude-sonnet-5-5", usage:{input_tokens:0, output_tokens:100000, cache_read_input_tokens:1000000}}}' > "$sess/subagents/workflows/wf_hotovo-2/agent-b1.jsonl"
{
  jq -cn '{ts:"2026-10-06T08:06:00Z", rez:"-", aid:"orchestrator", typ:"orchestrator", udalost:"compact", trigger:"auto"}'
  jq -cn '{ts:"2026-10-06T08:04:00Z", rez:"04", aid:"x4", typ:"implement", kontext:250000, max:250000, compactu:0, udalost:"predavka", soubor:"docs/reviews/predavka-x4.md"}'
} > "$proj/docs/.kontext.jsonl"
z=$(cd_run --zprava); rc=$?
k=$(printf '%s' "$z" | jq -r '[.cena_usd, .cena_podle_modelu["claude-opus-5-5"], .cena_podle_modelu["claude-sonnet-5-5"], .agentu, .compactu_orchestratora, .predavek, .bloky.hotovo, .rezy["04"].vysledek, .rezy["04"].pokusy, .od] | @csv' 2>/dev/null)
[ $rc -eq 0 ] && [ "$k" = '13.1,12.0,1.1,2,1,1,1,"hotovo",,"2026-10-06T07:30:00Z"' ] && ok || ko "zprava-json: rc=$rc $k $z"
rm -f "$sess.jsonl"

# 1.9.0: nové labely dávek balíčku a polovin Kontraktu po stropu předávek se vypisují čitelně, pokus z labelu poloviny
mkdir -p "$sess/subagents/workflows/wf_bezi-4"
printf "phases: [\n  { title: 'Kontrakt' },\n  { title: 'Review' },\n]\n" > "$sess/workflows/scripts/blok-stavby-wf_bezi-4.js"
{
  jq -cn '{type:"started", agentId:"d1", key:"d1", label:"fix:řez 06:kolo 1:balíček 2:dávka 3", phase:"Review"}'
  jq -cn '{type:"started", agentId:"d2", key:"d2", label:"implement:řez 06:kontrakt:2:b", phase:"Kontrakt"}'
} > "$sess/subagents/workflows/wf_bezi-4/journal.jsonl"
o=$(cd_run)
printf '%s' "$o" | grep -q 'fix řez 06 · kolo 1 · balíček 2 · dávka 3' && ok || ko "label-davka: $o"
printf '%s' "$o" | grep -q 'implement řez 06 · kontrakt · pokus 2 · polovina b' && ok || ko "label-polovina: $o"
printf '%s' "$o" | grep -q '^▶ stavba řezu 06 · pokus 2 ' && ok || ko "pokus-z-poloviny: $o"
rm -rf "$sess/subagents/workflows/wf_bezi-4" "$sess/workflows/scripts/blok-stavby-wf_bezi-4.js"

# 1.9.0: zmrazená kopie journalu stavby s částmi (tests/co-dela/, běh s výsledkem části K1 nesoucím surové U+2028/U+2029):
# agent s result není živý, fáze Části je hotová, živí jsou jen agenti bez výsledku; „teď“ dává --ted
fx="$plugin/tests/co-dela/wf_ece928d4-9a1"; s16="$tmp/sess16"; d16="$s16/subagents/workflows/wf_ece928d4-9a1"
mkdir -p "$d16" "$s16/workflows/scripts"
cp "$fx/journal.jsonl" "$d16/"; touch -d 2026-10-25T18:07:00Z "$d16/journal.jsonl"
while IFS=$'\t' read -r aid b m; do
  : > "$d16/agent-$aid.jsonl"; touch -d "$m" "$d16/agent-$aid.jsonl"; cp "$fx/meta/agent-$aid.meta.json" "$d16/"
done < "$fx/casy.tsv"
{ printf 'phases: [\n'; sed "s/.*/  { title: '&' },/" "$fx/faze.txt"; printf ']\n'; } > "$s16/workflows/scripts/blok-stavby-wf_ece928d4-9a1.js"
fx_run() { (cd "$tmp" && bash "$plugin/scripts/co-dela.sh" --session "$s16" --ted 2026-10-25T18:07:00Z "$@" 2>&1); }
o=$(fx_run --kratce)
printf '%s' "$o" | grep -q 'část K1' && ko "fixture-k1-zivy: $o" || ok
printf '%s' "$o" | grep -q 'hotové: .*Části' && ok || ko "fixture-casti-hotove: $o"
printf '%s' "$o" | grep -q 'fix řez 16 · kolo 1 · balíček 1 · opus · píše před 0:00' && printf '%s' "$o" | grep -q 'kolo 1 · balíček 2' && ok || ko "fixture-zivi-fix: $o"
printf '%s' "$o" | grep -q 'mlčí' && ko "fixture-mlci: $o" || ok
printf '%s' "$o" | grep -q '^▶ stavba řezu 16 .* · fáze 7/13 Review' && ok || ko "fixture-faze: $o"
o=$(fx_run); if printf '%s' "$o" | grep -q 'implement řez 16'; then ko "fixture-plny-implement: $o"; else ok; fi
# review C N4: --ted bez zóny je UTC (stejný obraz jako se Z), nečitelný tvar hlásí a nic nevypisuje
o=$(cd "$tmp" && bash "$plugin/scripts/co-dela.sh" --session "$s16" --ted 2026-10-25T18:07:00 --kratce 2>&1)
printf '%s' "$o" | grep -q 'balíček 1 · opus · píše před 0:00' && ok || ko "ted-bez-zony: $o"
o=$(cd "$tmp" && bash "$plugin/scripts/co-dela.sh" --session "$s16" --ted vcera --kratce 2>&1)
[ "$o" = "co-dela: --ted 'vcera' není ISO 8601 (čekám tvar RRRR-MM-DDThh:mm:ssZ)" ] && ok || ko "ted-nevalidni: $o"

echo "co-dela: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
