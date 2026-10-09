#!/usr/bin/env bash
# Funkční testy scripts/co-dela.sh nad syntetickou session (1.7.0): předávky jen z docs/.kontext.jsonl (za běh a za řez
# přes všechny bloky; v běhu sonnet-5-5 dával součet výsledků bloků 32 místo 46), bez logu záloha z výsledků bloků,
# název části z docs/.stavba-NN.json u labelu agenta a compacty orchestrátora z logu.
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

echo "co-dela: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
