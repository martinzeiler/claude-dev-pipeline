#!/usr/bin/env bash
# Funkční testy scripts/args-bloku.py nad dočasnými soubory (1.6.0, oprava P1): pokračování bloku PRD přes skript (základ
# z minulého volání, code-review N2), odmítnutí neschváleného výsledku PRD (N5), profil do stavby a záložní cesta přes
# soubor .output z notifikace. Spusť: dev-pipeline/tests/skripty/args-bloku.sh
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

# 11. skutečný soubor .output z běhu web-rijen (jen čtení, když na stroji je): starý tvar výsledku se rozbalí
real=/private/tmp/claude-501/-Users-martinzeiler-Desktop-CK-Go2/b73320b0-1bca-4aa1-9727-1474b3b81387/tasks/wf1wa23ij.output
if [ -r "$real" ]; then
  rr=$(jq -r '.result.rez // empty' "$real")
  o=$(ab stavba "$proj" "$rr" --prd-vysledek "$real"); rc=$?
  [ $rc -eq 0 ] && [ "$(j '.prd_path | length > 0' "$proj/docs/.stavba-$rr.json")" = 'true' ] && ok || ko "stavba-skutecny-output: rc=$rc $o"
fi

echo "args-bloku: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
