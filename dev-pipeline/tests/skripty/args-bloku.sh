#!/usr/bin/env bash
# Funkční testy scripts/args-bloku.py nad dočasnými soubory: pokračování bloku PRD přes skript (základ z minulého volání),
# odmítnutí neschváleného výsledku PRD, profil do stavby, záložní cesta přes soubor .output z notifikace, odmítnutí obnova
# v --doplnit (s návodem na pokus), vynechání prázdných hodnot, _pole, podpříkaz rozhodnuti, odmítnutí args pro řez, jehož blok
# běží (kód 6, --i-kdyz-bezi), stálá pole .run-args.json v souboru bloku a bez_review kolečka z výsledků stavby. Spusť: dev-pipeline/tests/skripty/args-bloku.sh
set -uo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); plugin=$(cd "$here/../.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/args-bloku-test.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
proj="$tmp/proj"; mkdir -p "$proj/docs"
wfd="$tmp/tr/-p/sess-x/workflows"; mkdir -p "$wfd"
pass=0; fail=0
ok() { pass=$((pass+1)); }; ko() { fail=$((fail+1)); echo "FAIL $*"; }
ab() { DEV_PIPELINE_TRANSCRIPTS="$tmp/tr" python3 -I "$plugin/scripts/args-bloku.py" "$@" 2>&1; }
j() { jq -c "$1" "$2" 2>/dev/null; }
jq -n '{vize:"/p/docs/vize/v.md", produkt:"/p/docs/produkt.md", ne_cile:"y"}' > "$proj/docs/.run-args.json"

ROW='{"rez":5,"nazev":"Řez pět","body":["F1"]}'
STAVBA='{rez:"05", profil:"lehky", prd_path:"/p/docs/prd/rez-05.md", casti:[{id:"K1"},{id:"K2"}], e2e_sekce:[{nazev:"A",kriterii:3}], hypotezy:{ids:["N1"]}}'
jq -n "{status:\"completed\", workflowName:\"blok-prd\", args:{cwd:\"$proj\", rez:5, args_file:\"docs/.prd-05.json\"}, result:{ok:true, rez:\"05\", faze:\"architekt\", rozdelit_navrh:\"děl\", prd_path:\"/p/docs/prd/rez-05.md\", stavba:$STAVBA}}" > "$wfd/wf_arch-1.json"
jq -n "{status:\"completed\", workflowName:\"blok-prd\", args:{cwd:\"$proj\", rez:5, args_file:\"docs/.prd-05.json\"}, result:{ok:true, rez:\"05\", profil:\"lehky\", prd_path:\"/p/docs/prd/rez-05.md\", stavba:$STAVBA}}" > "$wfd/wf_full-2.json"
jq -n '{status:"completed", workflowName:"blok-prd", args:{cwd:"/x", rez:5, plan_row:{rez:5, nazev:"Z args běhu"}, hypotezy:["h-args"]}, result:{ok:true, rez:"05", prd_path:"/p/x.md", stavba:{rez:"05", prd_path:"/p/x.md"}}}' > "$wfd/wf_args-3.json"
jq -n '{status:"completed", workflowName:"blok-prd", result:{ok:false, rez:"05", duvod:"autor části K2 nevrátil výsledek", prd_path:"/p/x.md"}}' > "$wfd/wf_fail-4.json"
jq -n '{status:"completed", workflowName:"blok-prd", result:{ok:true, rez:"05", stavba:{rez:"05", casti:[]}}}' > "$wfd/wf_bezprd-5.json"
jq -n '{status:"completed", workflowName:"blok-prd", result:{ok:true, rez:"05", profil:"lehky", stavba:{rez:"05", prd_path:"/p/y.md"}}}' > "$wfd/wf_profil-6.json"

# 1. první volání bloku PRD: pole volání do .prd-05.json
o=$(ab prd "$proj" 5 --doplnit "{\"plan_row\":$ROW,\"hypotezy\":[\"h1\"],\"profil\":\"lehky\",\"prd_lehke\":true,\"follow_ups\":\"/p/f.md\"}"); rc=$?
[ $rc -eq 0 ] && [ "$(j '[.rez, .plan_row.nazev, .profil, .prd_lehke]' "$proj/docs/.prd-05.json")" = '["05","Řez pět","lehky",true]' ] && ok || ko "prd-prvni: rc=$rc $o"

# 2. pokračování od autorů podle šablony skillu (jen od_faze + --puvodni-run): plan_row a ostatní pole volání ze základu (N2)
o=$(ab prd "$proj" 5 --puvodni-run wf_arch-1 --doplnit '{"od_faze":"autori"}'); rc=$?
k=$(j '[.plan_row.nazev, .hypotezy, .profil, .prd_lehke, .follow_ups, .od_faze, .puvodni.faze, .puvodni.stavba.casti[1].id]' "$proj/docs/.prd-05.json")
[ $rc -eq 0 ] && [ "$k" = '["Řez pět",["h1"],"lehky",true,"/p/f.md","autori","architekt","K2"]' ] && printf '%s' "$o" | grep -q 'z minulého volání' && ok || ko "prd-od-faze-zaklad: rc=$rc $o $k"

# 3. zapracování podle šablony skillu: plan_row zůstává, od_faze z minula do základu nejde
o=$(ab prd "$proj" 5 --puvodni-run wf_full-2 --doplnit '{"rezim":"zapracovani","prd_path":"/p/docs/prd/rez-05.md","e2e_path":"/p/docs/e2e/rez-05.md","nalezy":["chybí pokrytí F1"]}'); rc=$?
k=$(j '[.plan_row.nazev, .rezim, .nalezy, has("od_faze"), .puvodni.profil]' "$proj/docs/.prd-05.json")
[ $rc -eq 0 ] && [ "$k" = '["Řez pět","zapracovani",["chybí pokrytí F1"],false,"lehky"]' ] && ok || ko "prd-zapracovani-zaklad: rc=$rc $o $k"

# 4. nový plan_row v --doplnit nahradí starý celý (neslučuje se)
o=$(ab prd "$proj" 5 --puvodni-run wf_full-2 --doplnit '{"rezim":"zapracovani","prd_path":"/p","nalezy":["x"],"plan_row":{"rez":5,"nazev":"Nový"}}'); rc=$?
[ $rc -eq 0 ] && [ "$(j '.plan_row' "$proj/docs/.prd-05.json")" = '{"rez":5,"nazev":"Nový"}' ] && ok || ko "prd-novy-plan-row: rc=$rc $o"

# 5. bez .prd-05.json: základ z args předchozího běhu
rm -f "$proj/docs/.prd-05.json"
o=$(ab prd "$proj" 5 --puvodni-run wf_args-3 --doplnit '{"od_faze":"autori"}'); rc=$?
[ $rc -eq 0 ] && [ "$(j '[.plan_row.nazev, .hypotezy]' "$proj/docs/.prd-05.json")" = '["Z args běhu",["h-args"]]' ] && ok || ko "prd-zaklad-z-args-behu: rc=$rc $o"

# 6. bez základu: zápis projde, hláška varuje před chybějícím plan_row
rm -f "$proj/docs/.prd-05.json"
o=$(ab prd "$proj" 5 --puvodni-run wf_arch-1 --doplnit '{"od_faze":"autori"}'); rc=$?
[ $rc -eq 0 ] && printf '%s' "$o" | grep -q 'POZOR: plan_row' && ok || ko "prd-bez-zakladu: rc=$rc $o"

# 7. základ jiného řezu se nebere
jq -n "{rez:\"06\", plan_row:{rez:6}}" > "$proj/docs/.prd-05.json"
o=$(ab prd "$proj" 5 --puvodni-run wf_arch-1 --doplnit '{"od_faze":"autori"}'); rc=$?
[ $rc -eq 0 ] && [ "$(j 'has("plan_row")' "$proj/docs/.prd-05.json")" = 'false' ] && ok || ko "prd-zaklad-jiny-rez: rc=$rc $o"

# 8. stavba odmítne neschválený výsledek PRD (N5): ok false, konec po architektovi, stavba bez prd_path
o=$(ab stavba "$proj" 5 --prd-run wf_fail-4); [ $? -eq 5 ] && printf '%s' "$o" | grep -q 'ok: false' && ok || ko "stavba-ok-false: $o"
o=$(ab stavba "$proj" 5 --prd-run wf_arch-1); [ $? -eq 5 ] && printf '%s' "$o" | grep -q 'po architektovi' && ok || ko "stavba-architekt: $o"
o=$(ab stavba "$proj" 5 --prd-run wf_bezprd-5); [ $? -eq 5 ] && printf '%s' "$o" | grep -q 'prd_path' && ok || ko "stavba-bez-prd-path: $o"
[ ! -e "$proj/docs/.stavba-05.json" ] && ok || ko "stavba-odmitnuta-nezapsala"

# 9. profil do stavby: ze stavba, u staršího výsledku z pole profil nahoře
o=$(ab stavba "$proj" 5 --prd-run wf_full-2); rc=$?
[ $rc -eq 0 ] && [ "$(j '[.profil, .casti[1].id, .e2e_sekce[0].nazev]' "$proj/docs/.stavba-05.json")" = '["lehky","K2","A"]' ] && ok || ko "stavba-profil: rc=$rc $o"
o=$(ab stavba "$proj" 5 --prd-run wf_profil-6); rc=$?
[ $rc -eq 0 ] && [ "$(j '.profil' "$proj/docs/.stavba-05.json")" = '"lehky"' ] && ok || ko "stavba-profil-nahore: rc=$rc $o"

# 10. záložní cesta přes soubor .output z notifikace ({summary, agentCount, logs, result})
jq -n "{summary:\"blok PRD\", agentCount:9, logs:[], result:{ok:true, rez:\"05\", souhrn:\"s\", stavba:$STAVBA}, totalTokens:1}" > "$tmp/wfx.output"
o=$(ab stavba "$proj" 5 --prd-vysledek "$tmp/wfx.output"); rc=$?
[ $rc -eq 0 ] && [ "$(j '[.prd_path, .casti[0].id]' "$proj/docs/.stavba-05.json")" = '["/p/docs/prd/rez-05.md","K1"]' ] && ok || ko "stavba-output: rc=$rc $o"
o=$(ab prd "$proj" 5 --puvodni-vysledek "$tmp/wfx.output" --doplnit "{\"rezim\":\"zapracovani\",\"prd_path\":\"/p\",\"nalezy\":[\"x\"],\"plan_row\":$ROW}"); rc=$?
[ $rc -eq 0 ] && [ "$(j '[.puvodni.souhrn, .plan_row.nazev]' "$proj/docs/.prd-05.json")" = '["s","Řez pět"]' ] && ok || ko "prd-puvodni-output: rc=$rc $o"
o=$(ab stavba "$proj" 5 --prd-run wf_nic-0); [ $? -eq 3 ] && printf '%s' "$o" | grep -q '\.output' && ok || ko "zaloha-hlaska-output: $o"
o=$(ab prd "$proj" 5 --puvodni-run wf_nic-0); [ $? -eq 3 ] && printf '%s' "$o" | grep -q -- '--puvodni-vysledek' && ok || ko "zaloha-puvodni-hlaska: $o"

# 11. skutečný soubor .output staršího běhu (jen čtení, když na stroji je): starý tvar výsledku se rozbalí
real=/private/tmp/claude-501/-Users-martinzeiler-Desktop-CK-Go2/b73320b0-1bca-4aa1-9727-1474b3b81387/tasks/wf1wa23ij.output
if [ -r "$real" ]; then
  rr=$(jq -r '.result.rez // empty' "$real")
  o=$(ab stavba "$proj" "$rr" --prd-vysledek "$real"); rc=$?
  [ $rc -eq 0 ] && [ "$(j '.prd_path | length > 0' "$proj/docs/.stavba-$rr.json")" = 'true' ] && ok || ko "stavba-skutecny-output: rc=$rc $o"
fi

# 12. obnova patří do volání bloku: --doplnit s ní skončí kódem 2 a soubor nevznikne ani nepřepíše starý; bez pokus ≥ 1
# hláška říká, odkud pokus vzít (číslo přerušeného pokusu, nikdy +1), s pokusem říká, že obnova patří do volání
rm -f "$proj/docs/.stavba-05.json"
o=$(ab stavba "$proj" 5 --prd-run wf_full-2 --doplnit '{"obnova":{}}'); rc=$?
[ $rc -eq 2 ] && printf '%s' "$o" | grep -q 'obnova bez pokus ≥ 1' && printf '%s' "$o" | grep -q 'číslo přerušeného pokusu' && printf '%s' "$o" | grep -q 'nikdy +1' && [ ! -e "$proj/docs/.stavba-05.json" ] && ok || ko "obnova-bez-pokusu: rc=$rc $o"
o=$(ab stavba "$proj" 5 --prd-run wf_full-2 --doplnit '{"obnova":{"od_faze":"deploy","znacka":"x","pokus":0}}'); [ $? -eq 2 ] && printf '%s' "$o" | grep -q 'bez pokus' && ok || ko "obnova-pokus-nula: $o"
o=$(ab stavba "$proj" 5 --prd-run wf_full-2 --doplnit '{"obnova":{"od_faze":"deploy","znacka":"x","pokus":"2"}}'); rc=$?
[ $rc -eq 2 ] && printf '%s' "$o" | grep -q 'obnova patří do volání bloku' && printf '%s' "$o" | grep -q '"pokus": "2"' && [ ! -e "$proj/docs/.stavba-05.json" ] && ok || ko "obnova-s-pokusem: rc=$rc $o"
o=$(ab kolecko "$proj" --doplnit '{"base":"main","obnova":{"od_faze":"deploy"}}'); [ $? -eq 2 ] && ok || ko "obnova-kolecko-odmitnuta: $o"
# 1.9.0: obnova.bez_cache (bool) a obnova.app_pristup (řetězec) projdou tvarem (hláška je opíše do volání bloku); jiný tvar
# a neznámý klíč skončí vlastní hláškou; app_pristup nad 1 500 znaků skončí kódem 2 v --doplnit, v obnově i v .run-args.json
o=$(ab stavba "$proj" 5 --prd-run wf_full-2 --doplnit '{"obnova":{"od_faze":"deploy","znacka":"x","pokus":2,"bez_cache":true,"app_pristup":"nové heslo v 1Password"}}'); rc=$?
[ $rc -eq 2 ] && printf '%s' "$o" | grep -q 'obnova patří do volání bloku' && printf '%s' "$o" | grep -q '"bez_cache": true' && printf '%s' "$o" | grep -q '"app_pristup": "nové heslo' && ok || ko "obnova-bez-cache-projde: rc=$rc $o"
o=$(ab stavba "$proj" 5 --prd-run wf_full-2 --doplnit '{"obnova":{"od_faze":"deploy","pokus":2,"bez_cache":"ano"}}'); [ $? -eq 2 ] && printf '%s' "$o" | grep -q 'bez_cache musí být true nebo false' && ok || ko "obnova-bez-cache-tvar: $o"
o=$(ab stavba "$proj" 5 --prd-run wf_full-2 --doplnit '{"obnova":{"od_faze":"deploy","pokus":2,"cache":false}}'); [ $? -eq 2 ] && printf '%s' "$o" | grep -q 'neznámé klíče cache' && ok || ko "obnova-neznamy-klic: $o"
o=$(ab stavba "$proj" 5 --prd-run wf_full-2 --doplnit '{"obnova":{"od_faze":"deploy","pokus":2,"rozhodnuti_majitele":["2026-10-26 10:00 nasazuj hned"]}}'); [ $? -eq 2 ] && printf '%s' "$o" | grep -q 'obnova patří do volání bloku' && printf '%s' "$o" | grep -q 'nasazuj hned' && ok || ko "obnova-rozhodnuti-projde: $o"
o=$(ab stavba "$proj" 5 --prd-run wf_full-2 --doplnit '{"obnova":{"od_faze":"deploy","pokus":2,"rozhodnuti_majitele":"nasazuj hned"}}'); [ $? -eq 2 ] && printf '%s' "$o" | grep -q 'rozhodnuti_majitele musí být seznam řetězců' && ok || ko "obnova-rozhodnuti-tvar: $o"
dlouhy=$(head -c 1600 /dev/zero | tr '\0' 'a')
o=$(ab stavba "$proj" 5 --prd-run wf_full-2 --doplnit "{\"obnova\":{\"od_faze\":\"deploy\",\"pokus\":2,\"app_pristup\":\"$dlouhy\"}}"); [ $? -eq 2 ] && printf '%s' "$o" | grep -q 'app_pristup má 1600 znaků, strop je 1500' && ok || ko "obnova-app-pristup-dlouhy: $o"
rm -f "$proj/docs/.stavba-05.json"
o=$(ab stavba "$proj" 5 --prd-run wf_full-2 --doplnit "{\"app_pristup\":\"$dlouhy\"}"); rc=$?
[ $rc -eq 2 ] && printf '%s' "$o" | grep -q -- '--doplnit: app_pristup má 1600 znaků' && printf '%s' "$o" | grep -q 'runbook' && [ ! -e "$proj/docs/.stavba-05.json" ] && ok || ko "doplnit-app-pristup-dlouhy: rc=$rc $o"
o=$(ab stavba "$proj" 5 --prd-run wf_full-2 --doplnit '{"app_pristup":"heslo v 1Password, položka web"}'); [ $? -eq 0 ] && ok || ko "doplnit-app-pristup-kratky: $o"
jq -n --arg a "$dlouhy" '{vize:"/p/docs/vize/v.md", app_pristup:$a}' > "$proj/docs/.run-args.json"
o=$(ab stavba "$proj" 5 --prd-run wf_full-2); [ $? -eq 2 ] && printf '%s' "$o" | grep -q 'docs/.run-args.json: app_pristup má 1600 znaků' && ok || ko "run-args-app-pristup-dlouhy: $o"
jq -n '{vize:"/p/docs/vize/v.md", produkt:"/p/docs/produkt.md", ne_cile:"y"}' > "$proj/docs/.run-args.json"
o=$(ab --help); [ $? -eq 0 ] && printf '%s' "$o" | grep -q 'args-bloku.py stavba' && ok || ko "help: $o"

# 13. (1.7.0) prázdné hodnoty (null, "", [], {}) se nepíšou, rez vždy; soubor nese i neprázdná stálá pole .run-args.json
# (spec H1, agent opisuje jediný soubor); _pole = klíče sloučeného souboru
jq -n '{vize:"/p/docs/vize/v.md", produkt:"", ne_cile:"y", rozhodnuti_majitele:["2026-10-06 12:50 bez čekání"], rychle_kontroly:"pnpm verify:arch", _pole:["stare"]}' > "$proj/docs/.run-args.json"
o=$(ab stavba "$proj" 5 --prd-run wf_full-2 --doplnit '{"prd_stale":[],"mazane_pozdeji":null,"hypotezy":{"text":[]},"profil":"","max_pokusu":1,"runtime_dopad":false}'); rc=$?
k=$(j '[has("prd_stale"), has("mazane_pozdeji"), .hypotezy.ids, .hypotezy.text, has("profil"), .max_pokusu, .runtime_dopad, .rez]' "$proj/docs/.stavba-05.json")
# profil z výsledku PRD je "lehky", prázdný --doplnit ho přepíše na "" a prázdné pole se nepíše; hypotezy {ids, text:[]} zůstává objektem
[ $rc -eq 0 ] && [ "$k" = '[false,false,["N1"],[],false,1,false,"05"]' ] && ok || ko "prazdne-hodnoty: rc=$rc $o $k"
p=$(j '._pole' "$proj/docs/.stavba-05.json")
ex=$(jq -c --argjson f "$(jq -c 'del(._pole) | keys' "$proj/docs/.stavba-05.json")" -n '$f + ["ne_cile","rozhodnuti_majitele","rychle_kontroly","vize"] | unique')
[ "$p" = "$ex" ] && ! printf '%s' "$p" | grep -q -e '"produkt"' -e '"_pole"' -e '"stare"' && ok || ko "pole-sjednoceni: $p (čekáno $ex)"
printf '%s' "$o" | grep -q '_pole' && ko "pole-ve-vypisu: $o" || ok
k=$(j '[.vize, .ne_cile, .rychle_kontroly, .rozhodnuti_majitele, has("produkt"), (._pole == (del(._pole) | keys))]' "$proj/docs/.stavba-05.json")
[ "$k" = '["/p/docs/vize/v.md","y","pnpm verify:arch",["2026-10-06 12:50 bez čekání"],false,true]' ] && ok || ko "stala-v-souboru: $k"
o=$(ab prd "$proj" 5 --doplnit "{\"plan_row\":$ROW,\"ne_cile\":\"z doplnit\"}"); [ "$(j '.ne_cile' "$proj/docs/.prd-05.json")" = '"z doplnit"' ] && ok || ko "stala-prednost-doplnit: $o"
# rozhodnutí majitele a rychlé kontroly jsou stálá pole: ze stavby z výsledku PRD se vynechají (mohla zastarat) a soubor je
# nese z .run-args.json
jq -n "{status:\"completed\", workflowName:\"blok-prd\", result:{ok:true, rez:\"05\", stavba:{rez:\"05\", prd_path:\"/p/z.md\", rozhodnuti_majitele:[\"x\"], rychle_kontroly:\"y\", obnova:{}}}}" > "$wfd/wf_stala-7.json"
o=$(ab stavba "$proj" 5 --prd-run wf_stala-7); rc=$?
[ $rc -eq 0 ] && [ "$(j '[.rozhodnuti_majitele, .rychle_kontroly, has("obnova")]' "$proj/docs/.stavba-05.json")" = '[["2026-10-06 12:50 bez čekání"],"pnpm verify:arch",false]' ] && ok || ko "stala-ze-stavby: rc=$rc $o"
# bez .run-args.json: _pole jen klíče souboru
rm -f "$proj/docs/.run-args.json"
o=$(ab kolecko "$proj" --doplnit '{"base":"main"}'); rc=$?
[ $rc -eq 0 ] && [ "$(j '._pole == (del(._pole) | keys)' "$proj/docs/.kolecko.json")" = 'true' ] && ok || ko "pole-bez-run-args: rc=$rc $o"

# 14. (1.7.0) podpříkaz rozhodnuti: připíše citaci s časem do .run-args.json, ostatní pole nechá, vypíše jen počet
jq -n '{vize:"/p/v.md", ne_cile:"y"}' > "$proj/docs/.run-args.json"
o=$(ab rozhodnuti "$proj" --text 've vizi jsme žádné   čekání neměli; "spouštěj ručně"'); rc=$?
[ $rc -eq 0 ] && [ "$o" = 'docs/.run-args.json: rozhodnuti_majitele 1 položek' ] && ok || ko "rozhodnuti-prvni: rc=$rc $o"
o=$(ab rozhodnuti "$proj" --text 'druhé'); rc=$?
k=$(j '[.vize, .ne_cile, (.rozhodnuti_majitele | length), (.rozhodnuti_majitele[0] | test("^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} ve vizi jsme žádné čekání neměli; \"spouštěj ručně\"$")), (.rozhodnuti_majitele[1] | endswith(" druhé"))]' "$proj/docs/.run-args.json")
[ $rc -eq 0 ] && [ "$k" = '["/p/v.md","y",2,true,true]' ] && ok || ko "rozhodnuti-druhe: rc=$rc $o $k"
o=$(ab stavba "$proj" 5 --prd-run wf_full-2); [ $? -eq 0 ] && [ "$(j '._pole | index("rozhodnuti_majitele") != null' "$proj/docs/.stavba-05.json")" = 'true' ] && ok || ko "rozhodnuti-v-pole: $o"
o=$(ab rozhodnuti "$proj" --text '   '); [ $? -eq 2 ] && ok || ko "rozhodnuti-prazdne: $o"
o=$(ab rozhodnuti "$proj" 've vizi'); [ $? -eq 2 ] && ok || ko "rozhodnuti-bez-text: $o"
echo '{neni' > "$proj/docs/.run-args.json"
o=$(ab rozhodnuti "$proj" --text 'x'); [ $? -eq 2 ] && [ "$(cat "$proj/docs/.run-args.json")" = '{neni' ] && ok || ko "rozhodnuti-nevalidni-nepreps: $o"
rm -f "$proj/docs/.run-args.json"
o=$(ab rozhodnuti "$proj" --text 'bez souboru'); rc=$?
[ $rc -eq 0 ] && printf '%s' "$o" | grep -q 'založen' && [ "$(j '.rozhodnuti_majitele | length' "$proj/docs/.run-args.json")" = 1 ] && ok || ko "rozhodnuti-bez-souboru: rc=$rc $o"

# běžící blok téhož typu a řezu (co-dela.sh --bezici nad session z markeru): kód 6 a soubor se nezapíše; jiný řez, jiný
# typ, doběhlý blok, blok bez známého řezu a --i-kdyz-bezi projdou; zombie (journal i agenti mlčí přes 2 h, stejně vypadá
# čekání na usage limit) blokuje s vlastní hláškou
jq -n '{session_id:"sess-x", started:"2026-10-29T10:00:00Z", vize:"docs/vize/v.md", slug:"v"}' > "$proj/docs/.orchestrator-run"
sx="$tmp/tr/-p/sess-x"; mkdir -p "$sx/workflows/scripts"
bezi() { # wf blok label(prázdný = jen launched)
  mkdir -p "$sx/subagents/workflows/$1"; printf "phases: [\n  { title: 'Vstup' },\n]\n" > "$sx/workflows/scripts/$2-$1.js"
  { jq -cn '{type:"launched"}'; [ -n "$3" ] && jq -cn --arg l "$3" '{type:"started", agentId:"a-\($l)", key:"k", label:$l, phase:"Vstup"}'; } > "$sx/subagents/workflows/$1/journal.jsonl"
}
bezi wf_bezi-7 blok-prd 'args:řez 07'
o=$(ab prd "$proj" 7 --doplnit "{\"plan_row\":$ROW}"); rc=$?
[ $rc -eq 6 ] && printf '%s' "$o" | grep -q 'co-dela.sh --kratce' && printf '%s' "$o" | grep -q 'wf_bezi-7' && [ ! -e "$proj/docs/.prd-07.json" ] && ok || ko "bezi-stejny-rez: rc=$rc $o"
o=$(ab prd "$proj" 7 --i-kdyz-bezi --doplnit "{\"plan_row\":$ROW}"); [ $? -eq 0 ] && [ -e "$proj/docs/.prd-07.json" ] && ok || ko "bezi-i-kdyz: $o"
o=$(ab prd "$proj" 8 --doplnit "{\"plan_row\":$ROW}"); [ $? -eq 0 ] && ok || ko "bezi-jiny-rez: $o"
o=$(ab stavba "$proj" 7 --prd-run wf_full-2); [ $? -eq 4 ] && ok || ko "bezi-jiny-typ (projde kontrolou, padne až na řezu výsledku): $o"
jq -n '{status:"completed", workflowName:"blok-prd", result:{ok:true}}' > "$sx/workflows/wf_bezi-7.json"
touch -t 202610290900 "$sx/subagents/workflows/wf_bezi-7/journal.jsonl"
o=$(ab prd "$proj" 7 --doplnit "{\"plan_row\":$ROW}"); [ $? -eq 0 ] && ok || ko "dobehly-neblokuje: $o"
bezi wf_bezi-8 blok-prd ''
o=$(ab prd "$proj" 9 --doplnit "{\"plan_row\":$ROW}"); [ $? -eq 0 ] && ok || ko "bez-rezu-neblokuje: $o"
rm -rf "$sx/subagents/workflows/wf_bezi-8"
# rez z args stavového souboru obnoveného běhu (journal o víc než 5 s novější než stavový soubor = běží)
bezi wf_bezi-10 blok-stavby ''
jq -n '{status:"completed", workflowName:"blok-stavby", args:{rez:"11", args_file:"docs/.stavba-11.json"}, result:{ok:true, vysledek:"zastaveno"}}' > "$sx/workflows/wf_bezi-10.json"
touch -t 202610290900 "$sx/workflows/wf_bezi-10.json"
o=$(ab stavba "$proj" 11 --prd-run wf_full-2); [ $? -eq 6 ] && ok || ko "rez-z-args-obnovy: $o"
rm -rf "$sx/subagents/workflows/wf_bezi-10" "$sx/workflows/wf_bezi-10.json" "$sx/workflows/scripts/blok-stavby-wf_bezi-10.js"
# zombie: journal i agent bez výsledku mlčí přes 2 h; blokuje, hláška zmíní usage limit a --i-kdyz-bezi
bezi wf_bezi-11 blok-prd 'args:řez 12'
touch -t 202610280900 "$sx/subagents/workflows/wf_bezi-11/journal.jsonl"
o=$(ab prd "$proj" 12 --doplnit "{\"plan_row\":$ROW}"); rc=$?
[ $rc -eq 6 ] && printf '%s' "$o" | grep -q 'mlčí přes 2 h' && printf '%s' "$o" | grep -q 'usage limit' && printf '%s' "$o" | grep -q -- '--i-kdyz-bezi' && ok || ko "zombie-blokuje: rc=$rc $o"
o=$(ab prd "$proj" 12 --i-kdyz-bezi --doplnit "{\"plan_row\":$ROW}"); [ $? -eq 0 ] && ok || ko "zombie-i-kdyz: $o"
rm -rf "$sx/subagents/workflows/wf_bezi-11"
bezi wf_bezi-9 blok-kolecko 'thermo:kolečko'
o=$(ab kolecko "$proj" --doplnit '{"base":"main"}'); [ $? -eq 6 ] && ok || ko "bezi-kolecko: $o"
rm -rf "$sx/subagents/workflows/wf_bezi-9"

# kolecko: bez_review ze souborů výsledku stavby (.vysledek-stavba-NN.json i -zastaveno.json, podle řezu, commit jednou,
# rez ze souboru, jinak z jména); --doplnit přepíše
jq -n '{rez:"07", vysledek:"hotovo", bez_review:[{commit:"bbb", popis:"oprava po E2E 40 ř."}, {commit:"aaa", popis:"znovu"}]}' > "$proj/docs/.vysledek-stavba-07.json"
jq -n '{rez:"05", vysledek:"hotovo", bez_review:[{commit:"aaa", popis:"fix brány po review"}]}' > "$proj/docs/.vysledek-stavba-05.json"
jq -n '{bez_review:[{commit:"ddd", popis:"pokus 1 nasadil"}], follow_ups:[]}' > "$proj/docs/.vysledek-stavba-10-zastaveno.json"
jq -n '{rez:"08", vysledek:"hotovo"}' > "$proj/docs/.vysledek-stavba-08.json"
o=$(ab kolecko "$proj" --doplnit '{"base":"main"}'); rc=$?
k=$(j '[(.bez_review | map(.rez + ":" + .commit)), (._pole | index("bez_review") != null)]' "$proj/docs/.kolecko.json")
[ $rc -eq 0 ] && [ "$k" = '[["05:aaa","07:bbb","10:ddd"],true]' ] && printf '%s' "$o" | grep -q 'bez_review: 3 commitů' && ok || ko "kolecko-bez-review: rc=$rc $o $k"
o=$(ab kolecko "$proj" --doplnit '{"base":"main","bez_review":[{"commit":"ccc","popis":"ručně"}]}'); [ "$(j '[.bez_review[].commit]' "$proj/docs/.kolecko.json")" = '["ccc"]' ] && ok || ko "kolecko-bez-review-doplnit: $o"
rm -f "$proj/docs/.vysledek-stavba-"*.json
o=$(ab kolecko "$proj" --doplnit '{"base":"main"}'); [ "$(j 'has("bez_review")' "$proj/docs/.kolecko.json")" = 'false' ] && ok || ko "kolecko-bez-review-zadne: $o"
rm -f "$proj/docs/.orchestrator-run"

echo "args-bloku: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
