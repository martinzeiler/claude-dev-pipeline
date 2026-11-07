#!/usr/bin/env bash
# Funkční testy scripts/co-dela.sh nad syntetickou session: předávky jen z docs/.kontext.jsonl (za běh a za řez přes
# všechny bloky), bez logu záloha z výsledků bloků, název části z docs/.stavba-NN.json u labelu agenta, compacty
# orchestrátora z logu, zamítnuté dialogy (hook dialog-v-behu.sh), --zprava (čísla běhu jako JSON), řez s písmenem jako
# vlastní klíč, restarty z journalu se sjednocenou ztrátou a „čeká“ / „commit se suitou“ místo „píše před“.
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
  # zamítnuté dialogy (hook dialog-v-behu.sh): záznam živého agenta jeho kontext nepřepíše
  jq -cn '{ts:"2026-10-06T08:07:00Z", rez:"05", aid:"a1", typ:"implement", udalost:"dialog", nastroj:"Bash", prikaz:"X=(${(f)x})"}'
  jq -cn '{ts:"2026-10-06T08:08:00Z", rez:"-", aid:"", typ:"orchestrator", udalost:"dialog", nastroj:"Write", prikaz:"/p/.claude/settings.json"}'
} > "$proj/docs/.kontext.jsonl"

cd_run() { (cd "$proj" && CLAUDE_CONFIG_DIR="$tmp/cfg" bash "$plugin/scripts/co-dela.sh" "$@" 2>&1); }

o=$(cd_run)
printf '%s' "$o" | grep -q 'implement řez 05 · část K2 (runner: thinking a effort a m…) · pokus 1' && ok || ko "nazev-casti: $o"
# 1.9.0: čtení živého agenta z pole cteni_bajtu posledního záznamu (stráž čtení hlídače kontextu)
printf '%s' "$o" | grep -q 'kontext 90k · čtení 50 kB' && ok || ko "cteni-kb: $o"
printf '%s' "$o" | grep -q '^▶ stavba řezu 05 .* · předávek řezu 2$' && ok || ko "predavky-rezu-na-bloku: $o"
printf '%s' "$o" | grep -q 'předávek 5 · compactů orchestrátora 1 · zamítnutých dialogů 2$' && ok || ko "predavky-z-logu: $o"

o=$(cd_run --kratce); printf '%s' "$o" | grep -q 'část K2 (runner' && printf '%s' "$o" | grep -q 'předávek 5' && ok || ko "kratce: $o"
# --bezici: běžící bloky jako JSON s příznakem zombie (doběhlá stavba řezu 04 v něm není); bez markeru prázdné pole
o=$(cd_run --bezici); [ "$(printf '%s' "$o" | jq -c '.')" = '[{"wf":"wf_bezi-1","name":"blok-stavby","rez":"05","zombie":false}]' ] && ok || ko "bezici: $o"
# zombie: journal i jediný agent bez výsledku mlčí přes 2 h
touch -t 202610050800 "$sess/subagents/workflows/wf_bezi-1/journal.jsonl" "$sess/subagents/workflows/wf_bezi-1/agent-a1.jsonl"
o=$(cd_run --bezici); [ "$(printf '%s' "$o" | jq -c '.[0].zombie')" = 'true' ] && ok || ko "bezici-zombie: $o"
touch "$sess/subagents/workflows/wf_bezi-1/journal.jsonl" "$sess/subagents/workflows/wf_bezi-1/agent-a1.jsonl"
o=$(cd "$tmp" && bash "$plugin/scripts/co-dela.sh" --bezici 2>&1); [ "$o" = '[]' ] && ok || ko "bezici-bez-markeru: $o"
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
  jq -cn '{ts:"2026-10-06T08:09:00Z", rez:"04", aid:"x4", typ:"implement", udalost:"dialog", nastroj:"Bash", prikaz:"rm -rf $d"}'
} > "$proj/docs/.kontext.jsonl"
z=$(cd_run --zprava); rc=$?
k=$(printf '%s' "$z" | jq -r '[.cena_usd, .cena_podle_modelu["claude-opus-5-5"], .cena_podle_modelu["claude-sonnet-5-5"], .agentu, .compactu_orchestratora, .predavek, .bloky.hotovo, .rezy["04"].vysledek, .rezy["04"].pokusy, .od, .dialogu_zamitnuto] | @csv' 2>/dev/null)
[ $rc -eq 0 ] && [ "$k" = '13.1,12.0,1.1,2,1,1,1,"hotovo",,"2026-10-06T07:30:00Z",1' ] && ok || ko "zprava-json: rc=$rc $k $z"
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

# --- řez s písmenem, restarty a rozběhnutý Bash: session s jednou běžící stavbou 19a a doběhlou stavbou 19b
p19="$tmp/p19"; s19="$tmp/s19"; d19="$s19/subagents/workflows/wf_bezi-19"; h19="$s19/subagents/workflows/wf_hotovo-19"
mkdir -p "$p19/docs" "$d19" "$h19" "$s19/workflows/scripts"
printf "phases: [\n  { title: 'Části' },\n]\n" > "$s19/workflows/scripts/blok-stavby-wf_bezi-19.js"
cat > "$p19/docs/handoff.md" <<'H'
# Běh vize v
| # | název | stav |
|---|---|---|
| 19 | základ | hotovo |
| 19a | dashboard P1 | běží |
| 19b | chat | |
H
jq -n '{rez:"19a", casti:[{id:"K2", nazev:"přehled účtů"}]}' > "$p19/docs/.stavba-19a.json"
jq -n '{rez:"19", casti:[{id:"K2", nazev:"cizí část"}]}' > "$p19/docs/.stavba-19.json"
jq -n '{rez:"05a", casti:[{id:"K1", nazev:"menší řez"}]}' > "$p19/docs/.stavba-05a.json"
for r in 19a 19a 19b 19; do
  jq -cn --arg r "$r" '{ts:"2026-10-25T17:00:00Z", rez:$r, aid:"x", typ:"implement", kontext:250000, max:250000, compactu:0, udalost:"predavka"}'
done > "$p19/docs/.kontext.jsonl"
r19() { (cd "$p19" && TZ=UTC bash "$plugin/scripts/co-dela.sh" --session "$s19" --ted 2026-10-25T18:10:00Z "$@" 2>&1); }

zacni() { # adresář id key label čas_vzniku_transkriptu: záznam started a transkript s daným vznikem (touch do minulosti ho posune i u birthtime)
  jq -cn --arg a "$2" --arg k "$3" --arg l "$4" '{type:"started", agentId:$a, key:$k, label:$l}' >> "$1/journal.jsonl"
  [ -e "$1/agent-$2.jsonl" ] || : > "$1/agent-$2.jsonl"; touch -d "$5" "$1/agent-$2.jsonl"
}
# běžící blok: dva agenti restartovaní po témže výpadku, 33 min stěny (ne 66); nově startované pokusy mají výsledek
zacni "$d19" impl impl 'implement:řez 19a:K2:1' 2026-10-25T18:00:00Z
zacni "$d19" impl5a impl5a 'implement:řez 05a:K1:1' 2026-10-25T18:00:00Z
zacni "$d19" r1 kA 'security:kolečko:čočka' 2026-10-25T16:00:00Z
zacni "$d19" r3 kB 'security:kolečko:review' 2026-10-25T16:00:00Z
zacni "$d19" r2 kA 'security:kolečko:čočka' 2026-10-25T16:33:00Z
zacni "$d19" r4 kB 'security:kolečko:review' 2026-10-25T16:33:00Z
for a in r2 r4; do jq -cn --arg a "$a" '{type:"result", agentId:$a, result:{}}' >> "$d19/journal.jsonl"; done
# doběhlý blok bez řádků [stall] v logách: čtyři pokusy s částečným překryvem s běžícím blokem a jeden odděleně (25 min),
# a restart po limitu (syntetická odpověď), který se do ztráty nepočítá
zacni "$h19" h1 hA 'implement:řez 19b:1' 2026-10-25T16:20:00Z
zacni "$h19" h2 hA 'implement:řez 19b:1' 2026-10-25T16:40:00Z
zacni "$h19" h3 hB 'review:řez 19b:1' 2026-10-25T17:00:00Z
zacni "$h19" h4 hB 'review:řez 19b:1' 2026-10-25T17:05:00Z
jq -cn '{type:"assistant", message:{model:"<synthetic>", content:[{type:"text", text:"limit"}]}}' > "$h19/agent-h5.jsonl"
zacni "$h19" h5 hC 'verify:řez 19b:1' 2026-10-25T17:10:00Z
zacni "$h19" h6 hC 'verify:řez 19b:1' 2026-10-25T17:11:00Z
touch -d 2026-10-25T18:04:00Z "$h19/journal.jsonl"
jq -n '{status:"completed", workflowName:"blok-stavby", args:{rez:"19b"}, logs:["fáze Review"], result:{ok:true, vysledek:"hotovo"}}' > "$s19/workflows/wf_hotovo-19.json"
touch -d 2026-10-25T18:04:00Z "$s19/workflows/wf_hotovo-19.json"

# rozběhnutý Bash: agent verify:řez 19a:N s voláním z 18:00:00 („teď“ je 18:10), řádek v plném výpisu končí stavem
# (bez modelu, fáze i kontextu)
n=0
konec_epoch=$(python3 -c 'import calendar; print(calendar.timegm((2026, 10, 25, 18, 45, 0)))')
pust() { # příkaz: další agent s jediným rozběhnutým Bash; číslo agenta v $n
  n=$((n + 1))
  jq -cn --arg i "t$n" --arg m "m$n" --arg c "$1" '{type:"assistant", timestamp:"2026-10-25T18:00:00.123Z", message:{id:$m, content:[{type:"tool_use", id:$i, name:"Bash", input:{command:$c}}]}}' > "$d19/agent-v$n.jsonl"
  zacni "$d19" "v$n" "kv$n" "verify:řez 19a:$n" 2026-10-25T18:00:00Z
}
cek=""; cekej() { pust "$1"; cek="$cek$n|$2
"; }
cekej 'sleep 1800' 'čeká do 18:30'
cekej 'S=/tmp/x; sleep 900; curl -s localhost' 'čeká do 18:15'
cekej 'until [ -s /tmp/x ]; do sleep 10; done; cat /tmp/x' 'čeká'
cekej 'S=/tmp; for i in $(seq 1 120); do grep -q X $S/l && break; sleep 10; done; tail -2 $S/l' 'čeká do 18:20'
cekej "while [ \$(date +%s) -lt $konec_epoch ]; do sleep 20; done; date -u +%T" 'čeká do 18:45'
cekej "for i in \$(seq 1 600); do [ \$(date +%s) -ge $konec_epoch ] && break; sleep 10; done" 'čeká do 18:45'
cekej "sleep \$(( $konec_epoch - \$(date -u +%s) ))" 'čeká do 18:45'
cekej 'END=$(( $(date +%s) + 900 )); while [ $(date +%s) -lt $END ]; do sleep 20; done' 'čeká do 18:15'
cekej 'sleep 60; pnpm test' 'čeká'
cekej "gtimeout 580 zsh -c 'until ! pgrep -f sonda >/dev/null; do sleep 10; done'" 'čeká'
cekej $'python3 - <<\'PY\'\nimport time\nfor i in range(56):\n    time.sleep(10)\nPY' 'čeká'
cekej 'until ! pgrep -f "git commit" >/dev/null; do sleep 15; done; git log --oneline -2' 'čeká'
cekej "while [ \"\$(date +%s)\" -lt $konec_epoch ]; do sleep 20; done" 'čeká do 18:45'
cekej 'cd /p; git add -A && git commit -q -m "rez 19a: x; sleep 600" > /tmp/l 2>&1; echo $?' 'commit se suitou'
cekej "bash -c 'git commit -m x'" 'commit se suitou'
cekej "cd /p; git status --short | grep -c '^[AM]'; git commit -q -m \"rez 19a\" > /tmp/l 2>&1; git log -1 --format='%H %s'" 'commit se suitou'
cekej "until grep -c 'x' /tmp/l; do sleep 10; done" 'čeká'
cekej $'git -C /p commit -F - <<\'EOF\'\nrez 19a\nEOF' 'commit se suitou'
cekej 'cd /p; S=/tmp; timeout 590 git commit -m "rez 19a: x"' 'commit se suitou'
ne=""; necekej() { pust "$1"; ne="$ne$n "; }
necekej 'pnpm test > /tmp/l 2>&1; echo $?'
necekej 'sleep 2; agent-browser open x'
necekej 'pgrep -f "git commit"'
necekej 'git log --grep commit --oneline'
necekej 'git commit-tree HEAD^{tree}'
necekej 'echo "čekám na git commit a sleep 600 hotovo" > /tmp/x; pnpm test'
# hotový Bash: výsledek v transkriptu (i s pozdějším api-request-blob, který nese staré tool_use), čekání skončilo
pust 'sleep 1800'; ne="$ne$n "
jq -cn --arg i "t$n" '{type:"user", timestamp:"2026-10-25T18:00:01Z", message:{content:[{type:"tool_result", tool_use_id:$i, content:"x"}]}}' >> "$d19/agent-v$n.jsonl"
jq -cn '{type:"api-request-blob", message:{id:"blob", content:[{type:"tool_use", id:"jiny", name:"Bash", input:{command:"sleep 1800"}}]}}' >> "$d19/agent-v$n.jsonl"
touch -d 2026-10-25T18:00:01Z "$d19/agent-v$n.jsonl"
# novější zpráva s jiným nástrojem: dřívější Bash bez výsledku už neběží
pust 'sleep 1800'; ne="$ne$n "
jq -cn '{type:"assistant", timestamp:"2026-10-25T18:00:02Z", message:{id:"novejsi", content:[{type:"tool_use", id:"r1", name:"Read", input:{file_path:"/x"}}]}}' >> "$d19/agent-v$n.jsonl"
touch -d 2026-10-25T18:00:02Z "$d19/agent-v$n.jsonl"
# souběžná volání v jedné zprávě: rozhoduje čekací, i když poslední je jiný příkaz
pust 'sleep 900'; cek="$cek$n|čeká do 18:15
"
jq -cn --arg m "m$n" '{type:"assistant", timestamp:"2026-10-25T18:00:00Z", message:{id:$m, content:[{type:"tool_use", id:"soubeh", name:"Bash", input:{command:"curl -s localhost"}}]}}' >> "$d19/agent-v$n.jsonl"
touch -d 2026-10-25T18:00:00Z "$d19/agent-v$n.jsonl"
touch -d 2026-10-25T18:00:00Z "$d19/journal.jsonl"

o=$(r19)
# řez s písmenem: název z řádku 19a (ne 19b), části z .stavba-19a.json a .stavba-05a.json, předávky jen 19a
printf '%s\n' "$o" | grep -q '^▶ stavba řezu 19a „dashboard P1“ ' && ok || ko "19a-nazev: $o"
printf '%s\n' "$o" | grep -q '^ *implement řez 19a · část K2 (přehled účtů) · pokus 1' && ok || ko "19a-cast: $o"
printf '%s\n' "$o" | grep -q '^ *implement řez 05a · část K1 (menší řez) · pokus 1' && ok || ko "05a-cast: $o"
printf '%s\n' "$o" | grep -q '^▶ stavba řezu 19a .* · předávek řezu 2$' && ok || ko "19a-predavky-rezu: $o"
printf '%s\n' "$o" | grep -q 'předávek 4$' && ok || ko "19a-predavky-beh: $o"
# restarty: souběžné dva po 33 min = 33 min stěny; doběhlý blok z journalu, po limitu mimo ztrátu
printf '%s\n' "$o" | grep -q '^▶ stavba řezu 19a .* · restartů po stallu 2 (ztráta 33 min, poslední ' && ok || ko "restarty-bezici: $o"
printf '%s\n' "$o" | grep -qF '✓ stavba řezu 19b hotovo · restartů po stallu 2 (ztráta 25 min) · po limitu 1 · před' && ok || ko "restarty-hotove: $o"
# --zprava: sjednocení i přes bloky (16:00–16:40 a 17:00–17:05)
z=$(r19 --zprava); k=$(printf '%s' "$z" | jq -c '[.restartu_stall, .restartu_limit, .ztrata_restartu_min]' 2>/dev/null)
[ "$k" = '[4,1,45]' ] && ok || ko "restarty-zprava: $k $z"
# stav rozběhnutého Bash
while IFS='|' read -r c txt; do
  [ -n "$c" ] || continue
  printf '%s\n' "$o" | grep -qxF "    verify řez 19a · běh $c · $txt" && ok || ko "bash-stav $c: čekáno „$txt“: $(printf '%s\n' "$o" | grep -F "běh $c ")"
done <<EOF
$cek
EOF
for c in $ne; do
  printf '%s\n' "$o" | grep -qE "^    verify řez 19a · běh $c · píše před [0-9]" && ok || ko "bash-bez-stavu $c: $(printf '%s\n' "$o" | grep -F "běh $c ")"
done
# krátký výpis má stejný řádek agenta (je seříznutý na 12 řádků, proto stačí kterýkoli stav)
o=$(r19 --kratce); if printf '%s\n' "$o" | grep -qE '· (čeká|commit se suitou)'; then ok; else ko "kratce-stav: $o"; fi

echo "co-dela: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
