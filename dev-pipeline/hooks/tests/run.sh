#!/usr/bin/env bash
# Testy hooků dev-pipeline nad syntetickými vstupy. Spusť: dev-pipeline/hooks/tests/run.sh
set -uo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); hooks="$here/.."
mkdir -p "$HOME/.cache/dev-pipeline-tests"; tmp=$(mktemp -d "$HOME/.cache/dev-pipeline-tests/run.XXXXXX"); trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$tmp"' EXIT
proj="$tmp/proj"; mkdir -p "$proj/docs/vize" "$proj/docs/prd" "$proj/src"
SID="sess-orch"; OTHER="sess-other"
jq -n --arg s "$SID" '{session_id:$s, started:"2026-09-16T12:00:00Z", vize:"docs/vize/test.md", slug:"test"}' > "$proj/docs/.orchestrator-run"
cp "$proj/docs/.orchestrator-run" "$tmp/marker"; : > "$tmp/oldmarker"
seq 1 500 | sed 's/^/const x/' > "$proj/src/big.ts"; seq 1 100 > "$proj/src/small.ts"; seq 1 500 > "$proj/docs/big.md"
seq 1 500 | sed 's/^/x = /' > "$proj/src/big.py"
mkdir -p "$proj/.serena"; printf 'project_name: "t"\n# languages: [python]\nlanguage_servers:\n- typescript\nincluded_apis: []\n' > "$proj/.serena/project.yml"
echo "# vize" > "$proj/docs/vize/test.md"; echo "# prd" > "$proj/docs/prd/rez-01.md"
printf 'stav běhu: běží workflow blok-stavby řez 01\n| řez | stav |\n' > "$proj/docs/handoff.md"
pass=0; fail=0
ok() { pass=$((pass+1)); }; ko() { fail=$((fail+1)); echo "FAIL $*"; }
mkdir -p "$tmp/tmpdir"   # stav hlídače kontextu (guard-run do něj připisuje zamítnutí) mimo skutečný TMPDIR
run() { # name script json expect(allow|deny|block|ctx) [grep]
  local name=$1 script=$2 json=$3 expect=$4 grepfor=${5:-} out rc got=allow
  out=$(printf '%s' "$json" | TMPDIR="${TMPDIR_TEST:-$tmp/tmpdir}" CLAUDE_PROJECT_DIR="$proj" bash "$hooks/$script" 2>/dev/null); rc=$?
  if printf '%s' "$out" | grep -q '"permissionDecision": *"deny"'; then got=deny
  elif printf '%s' "$out" | grep -q '"decision": *"block"'; then got=block
  elif printf '%s' "$out" | grep -q 'additionalContext'; then got=ctx
  elif [ $rc -eq 2 ]; then got=deny; fi
  if [ "$got" = "$expect" ] && { [ -z "$grepfor" ] || printf '%s' "$out" | grep -q -- "$grepfor"; }; then pass=$((pass+1))
  else fail=$((fail+1)); echo "FAIL $name: čekáno $expect, dostal $got rc=$rc"; printf '   %s\n' "$(printf '%s' "$out" | head -c 300)"; fi
}
pre() { # sid agent tool [klíč hodnota]...  → JSON vstup PreToolUse
  local s=$1 a=$2 t=$3 obj='{}'; shift 3
  while [ $# -ge 2 ]; do obj=$(jq -cn --argjson o "$obj" --arg k "$1" --arg v "$2" '$o + {($k):$v}'); shift 2; done
  jq -n --arg s "$s" --arg a "$a" --arg t "$t" --argjson i "$obj" --arg c "$proj" \
    '{session_id:$s, cwd:$c, hook_event_name:"PreToolUse", tool_name:$t, tool_input:$i} + (if $a=="" then {} else {agent_id:$a} end)'
}
# --- orchestrátor
run ask-deny guard-run.sh "$(pre $SID '' AskUserQuestion questions "")" deny "autonomní"
run ask-other-session guard-run.sh "$(pre $OTHER '' AskUserQuestion questions "")" allow
run read-vize guard-run.sh "$(pre $SID '' Read file_path "$proj/docs/vize/test.md")" allow
run read-handoff guard-run.sh "$(pre $SID '' Read file_path "$proj/docs/handoff.md")" allow
run read-vize-spory guard-run.sh "$(pre $SID '' Read file_path "$proj/docs/vize-spory.md")" allow
run read-src-deny guard-run.sh "$(pre $SID '' Read file_path "$proj/src/small.ts")" deny "nečte projekt"
run read-prd-deny guard-run.sh "$(pre $SID '' Read file_path "$proj/docs/prd/rez-01.md")" deny
run read-plugin guard-run.sh "$(pre $SID '' Read file_path "$hooks/../skills/vize/SKILL.md")" allow
run grep-src-deny guard-run.sh "$(pre $SID '' Grep pattern "x" path "$proj/src")" deny
run grep-root-deny guard-run.sh "$(pre $SID '' Grep pattern "x")" deny
run grep-vize guard-run.sh "$(pre $SID '' Grep pattern "x" path "$proj/docs/vize")" allow
run bash-git-status guard-run.sh "$(pre $SID '' Bash command "git status --short")" allow
run bash-git-log guard-run.sh "$(pre $SID '' Bash command "git log --oneline -n 5")" allow
run bash-git-diff-deny guard-run.sh "$(pre $SID '' Bash command "git diff HEAD~1")" deny "diffy"
run bash-git-diff-stat guard-run.sh "$(pre $SID '' Bash command "git diff --stat HEAD~1")" allow
run bash-pnpm-deny guard-run.sh "$(pre $SID '' Bash command "pnpm test")" deny "nespouští"
run bash-cd-pnpm-deny guard-run.sh "$(pre $SID '' Bash command "cd $proj && pnpm turbo typecheck")" deny
run bash-cat-src-deny guard-run.sh "$(pre $SID '' Bash command "cat src/small.ts")" deny
run bash-cat-handoff guard-run.sh "$(pre $SID '' Bash command "cat docs/handoff.md")" allow
run bash-sed-vize guard-run.sh "$(pre $SID '' Bash command "sed -n '1,40p' docs/vize/test.md")" allow
run bash-find-src-deny guard-run.sh "$(pre $SID '' Bash command 'find src -name "*.ts"')" deny
run bash-mkdir-mv guard-run.sh "$(pre $SID '' Bash command "mkdir -p docs/archive/x && mv docs/journal.md docs/archive/x/")" allow
run bash-date guard-run.sh "$(pre $SID '' Bash command "date -u +%Y-%m-%dT%H:%M:%SZ")" allow
run write-src-deny guard-run.sh "$(pre $SID '' Write file_path "$proj/src/a.ts" content "x")" deny "needituje"
run edit-config-deny guard-run.sh "$(pre $SID '' Edit file_path "$proj/package.json" old_string "a" new_string "b")" deny
run write-handoff guard-run.sh "$(pre $SID '' Write file_path "$proj/docs/handoff.md" content "x")" allow
run write-memory-deny guard-run.sh "$(pre $SID '' Write file_path "$HOME/.claude/projects/x/memory/a.md" content "x")" deny "Auto-paměť"
run read-produkt guard-run.sh "$(pre $SID '' Read file_path "$proj/docs/produkt.md")" allow
run bash-cat-produkt guard-run.sh "$(pre $SID '' Bash command "cat docs/produkt.md")" allow
# --- orchestrátor a deník vad ~/dev-pipeline-feedback.md (dočasný HOME, ať soubory existují a skutečný domov zůstane netknutý)
fbh="$tmp/home"; mkdir -p "$fbh"; echo "# Zpětná vazba" > "$fbh/dev-pipeline-feedback.md"; echo x > "$fbh/jiny.md"
HOME="$fbh" run fb-read guard-run.sh "$(pre $SID '' Read file_path "$fbh/dev-pipeline-feedback.md")" allow
HOME="$fbh" run fb-write guard-run.sh "$(pre $SID '' Write file_path "$fbh/dev-pipeline-feedback.md" content "x")" allow
HOME="$fbh" run fb-bash-append guard-run.sh "$(pre $SID '' Bash command $'cat >> ~/dev-pipeline-feedback.md <<\'EOF\'\n## 2026-09-29 | test | krok\nEOF')" allow
HOME="$fbh" run fb-bash-append-slova guard-run.sh "$(pre $SID '' Bash command $'cat >> ~/dev-pipeline-feedback.md <<\'EOF\'\n## 2026-09-29 | Surya | wrangler preflight\npnpm test padl, curl vrátil 500\nEOF')" allow
run orch-heredoc-interpret-deny guard-run.sh "$(pre $SID '' Bash command $'bash <<\'EOF\'\npnpm test\nEOF')" deny
# --- orchestrátor: oddělovače v uvozovkách a heredoc do interpretu (1.5.0, falešné zásahy z běhu web-podzim 1. 10.)
c_alt=$(cat <<'EOF'
ls -la -t docs/reviews/ | grep 'rez-07' | head -5; date; ps -Ao pid,etime,command | grep -E 'agent-browser|curl|python3|node .*vitest|wrangler' | grep -v grep | cut -c1-160 | head -15
EOF
)
run orch-grep-alternace-ok guard-run.sh "$(pre $SID '' Bash command "$c_alt")" allow
c_py=$(cat <<'EOS'
python3 - <<'EOF'
p='docs/handoff.md'; s=open(p).read()
a="apps/web kotvy sekcí."
b="apps/web kotvy sekcí (WEB_SECTIONS v packages/shared), rail Podobné zájezdy; vitest projekt admin; měřidlo kes-html."
assert a in s; s=s.replace(a,b)
open(p,'w').write(s); print(len(s.encode()))
EOF
EOS
)
run orch-python-heredoc-ok guard-run.sh "$(pre $SID '' Bash command "$c_py")" allow
run orch-python-heredoc-pak-pnpm-deny guard-run.sh "$(pre $SID '' Bash command $'python3 - <<\'EOF\'\nprint(1)\nEOF\npnpm test')" deny "nespouští"
run orch-bash-c-pnpm-deny guard-run.sh "$(pre $SID '' Bash command "bash -c \"cd $proj; pnpm test\"")" deny "nespouští"
run orch-bash-c-jeden-deny guard-run.sh "$(pre $SID '' Bash command "bash -c 'pnpm test'")" deny "nespouští"
run orch-echo-strednik-v-uvozovkach-ok guard-run.sh "$(pre $SID '' Bash command 'echo "hotovo; pnpm test pustí brána" > /tmp/dp-poznamka.txt')" allow
run orch-cat-src-v-uvozovkach-deny guard-run.sh "$(pre $SID '' Bash command 'cat "src/small.ts"')" deny "nečte projekt"
HOME="$fbh" run fb-other-home-deny guard-run.sh "$(pre $SID '' Write file_path "$fbh/jiny.md" content "x")" deny "needituje"
# --- orchestrátor čte args bloků z disku (po compactu)
echo '{}' > "$proj/docs/.run-args.json"; echo '{}' > "$proj/docs/.stavba-05.json"
run read-run-args guard-run.sh "$(pre $SID '' Read file_path "$proj/docs/.run-args.json")" allow
run bash-cat-stavba-args guard-run.sh "$(pre $SID '' Bash command "cat docs/.stavba-05.json")" allow
# 1.6.0: args a výsledky bloků (args_file, plné seznamy stavby), log kontextu, skripty args-bloku.py a zbytek-rezu.sh
for f in .prd-05.json .prd-vysledek-05.json .kolecko.json .vysledek-stavba-05.json .kontext.jsonl; do echo '{}' > "$proj/docs/$f"; done
run read-prd-args guard-run.sh "$(pre $SID '' Read file_path "$proj/docs/.prd-05.json")" allow
run read-prd-vysledek guard-run.sh "$(pre $SID '' Read file_path "$proj/docs/.prd-vysledek-05.json")" allow
run read-kolecko-args guard-run.sh "$(pre $SID '' Read file_path "$proj/docs/.kolecko.json")" allow
run bash-cat-vysledek-stavby guard-run.sh "$(pre $SID '' Bash command "cat docs/.vysledek-stavba-05.json")" allow
run bash-tail-kontext guard-run.sh "$(pre $SID '' Bash command "tail -5 docs/.kontext.jsonl")" allow
run bash-args-bloku guard-run.sh "$(pre $SID '' Bash command "python3 -I $hooks/../scripts/args-bloku.py stavba $proj 05 --prd-run wf_abc-123 --doplnit '{\"prd_stale\":[],\"hypotezy\":{\"text\":[\"x; pnpm test\"]}}'")" allow
# 1.7.0: rozhodnutí majitele zapisuje orchestrátor do .run-args.json podpříkazem skriptu (citace s uvozovkami a středníkem)
run bash-args-bloku-rozhodnuti guard-run.sh "$(pre $SID '' Bash command "python3 -I $hooks/../scripts/args-bloku.py rozhodnuti $proj --text 've vizi jsme žádné čekání neměli; spouštěj „ručně“ podle P2'")" allow
run bash-zbytek-rezu guard-run.sh "$(pre $SID '' Bash command "bash $hooks/../scripts/zbytek-rezu.sh $proj 12")" allow
# záložní cesta args stavby: plný výsledek bloku PRD ze souboru .output runtime (useknutá notifikace) mimo projekt
run bash-args-bloku-output guard-run.sh "$(pre $SID '' Bash command "python3 -I $hooks/../scripts/args-bloku.py stavba $proj 05 --prd-vysledek /private/tmp/claude-501/-Users-x-proj/sess/tasks/wf1wa23ij.output --doplnit '{\"prd_stale\":[]}'")" allow
run read-vysledek-stavby guard-run.sh "$(pre $SID '' Read file_path "$proj/docs/.vysledek-stavba-05.json")" allow
rm -f "$proj/docs/.kontext.jsonl" "$proj/docs/.prd-05.json" "$proj/docs/.prd-vysledek-05.json" "$proj/docs/.kolecko.json"
# --- scripts/args-bloku.py (1.6.0): args bloků do souboru, výsledek bloku PRD ze souboru běhu Workflow
ab() { DEV_PIPELINE_TRANSCRIPTS="$tmp/abproj" python3 -I "$hooks/../scripts/args-bloku.py" "$@" 2>&1; }
wfd="$tmp/abproj/-p/$SID/workflows"; mkdir -p "$wfd"
jq -n '{status:"completed", workflowName:"blok-prd", result:{ok:true, rez:"05", souhrn:"x", stavba:{rez:"05", prd_path:"/p/docs/prd/rez-05.md", casti:[{id:"K1"}], hypotezy:{blokujici:["N1"], ids:["N2"]}, mapa_kostry:"1-2 ## Cíl", ne_cile:"x", vize:"/jina.md"}}}' > "$wfd/wf_aaa-111.json"
jq -n '{status:"completed", workflowName:"blok-prd", result:{ok:true, rez:"05", prd_path:"/p/docs/prd/rez-05.md", casti:[], hypotezy_pro_stavbu:{ids:["N3"]}, kriteria:7}}' > "$wfd/wf_bbb-222.json"
jq -n '{status:"running", workflowName:"blok-prd", result:null}' > "$wfd/wf_ccc-333.json"
jq -n '{status:"completed", workflowName:"blok-stavby", result:{rez:"05"}}' > "$wfd/wf_ddd-444.json"
jq -n '{vize:"/p/docs/vize/v.md", produkt:"/p/docs/produkt.md", ne_cile:"y"}' > "$proj/docs/.run-args.json"
o=$(ab stavba "$proj" 5 --prd-run wf_aaa-111 --doplnit '{"prd_stale":[{"rez":"04"}],"hypotezy":{"text":["věta"]}}'); rc=$?
# stálá pole z výsledku PRD (ne_cile, vize) se zahodí a soubor je nese z .run-args.json (spec H1)
k=$(jq -c '[.rez, .cwd == $p, .casti[0].id, .hypotezy.blokujici, .hypotezy.text, .prd_stale[0].rez, has("mapa_kostry"), .ne_cile, .vize]' --arg p "$proj" "$proj/docs/.stavba-05.json" 2>/dev/null)
[ $rc -eq 0 ] && [ "$k" = '["05",true,"K1",["N1"],["věta"],"04",false,"y","/p/docs/vize/v.md"]' ] && printf '%s' "$o" | grep -q '^docs/.stavba-05.json: ' && ok || ko "ab-stavba: rc=$rc $o $k"
o=$(ab stavba "$proj" 5 --prd-run bbb-222); rc=$?
k=$(jq -c '[.hypotezy.ids, .kriteria]' "$proj/docs/.stavba-05.json" 2>/dev/null)
[ $rc -eq 0 ] && [ "$k" = '[["N3"],7]' ] && printf '%s' "$o" | grep -q 'starší tvar' && ok || ko "ab-stavba-stary-blok: rc=$rc $o $k"
o=$(ab stavba "$proj" 6 --prd-run wf_aaa-111); [ $? -eq 4 ] && printf '%s' "$o" | grep -q 'patří řezu 05' && ok || ko "ab-jiny-rez: $o"
o=$(ab stavba "$proj" 5 --prd-run wf_ccc-333); [ $? -eq 3 ] && printf '%s' "$o" | grep -q 'záložní cesta' && ok || ko "ab-nedokonceny: $o"
o=$(ab stavba "$proj" 5 --prd-run wf_nic-000); [ $? -eq 3 ] && ok || ko "ab-nenalezen: $o"
jq -n '{rez:"05", prd_path:"/p/x.md", hypotezy:{ids:["N9"]}}' > "$tmp/stavba.json"
o=$(ab stavba "$proj" 5 --prd-vysledek "$tmp/stavba.json"); rc=$?
[ $rc -eq 0 ] && [ "$(jq -c '.hypotezy.ids' "$proj/docs/.stavba-05.json")" = '["N9"]' ] && ok || ko "ab-zalozni: rc=$rc $o"
o=$(ab prd "$proj" 5 --puvodni-run wf_bbb-222 --doplnit '{"rezim":"zapracovani","od_faze":"autori"}'); rc=$?
[ $rc -eq 0 ] && [ "$(jq -c '[.rez, .puvodni.kriteria, .od_faze, .vize]' "$proj/docs/.prd-05.json")" = '["05",7,"autori","/p/docs/vize/v.md"]' ] && ok || ko "ab-prd-puvodni: rc=$rc $o"
o=$(ab prd "$proj" 5 --puvodni-run wf_ddd-444); [ $? -eq 3 ] && printf '%s' "$o" | grep -q 'ne blok-prd' && ok || ko "ab-puvodni-stavba: $o"
o=$(ab prd "$proj" 5 --doplnit '{"rez":"06"}'); [ $? -eq 4 ] && ok || ko "ab-doplnit-rez: $o"
o=$(ab prd "$proj" 5 --doplnit '{neni'); [ $? -eq 2 ] && ok || ko "ab-nevalidni: $o"
rm "$proj/docs/.run-args.json"
o=$(ab kolecko "$proj" --doplnit '{"base":"main"}'); rc=$?
[ $rc -eq 0 ] && [ "$(jq -c '[.rez, .base, .vize]' "$proj/docs/.kolecko.json")" = "[\"kolecko\",\"main\",\"$proj/docs/vize/test.md\"]" ] && ok || ko "ab-kolecko-vize-z-markeru: rc=$rc $o $(cat "$proj/docs/.kolecko.json")"
rm -f "$proj"/docs/.stavba-05.json "$proj"/docs/.prd-05.json "$proj"/docs/.kolecko.json
# --- scripts/zbytek-rezu.sh (1.6.0): zbytky neúspěšného řezu do patche, docs/ zůstává, strom zpět na HEAD
zr="$tmp/zr"; mkdir -p "$zr/docs" "$zr/apps"; (cd "$zr" && git init -q && git config user.email t@t && git config user.name t \
  && echo 'export default [];' > eslint.config.js && echo a > apps/a.ts && echo '# h' > docs/handoff.md && git add -A && git commit -qm init)
(cd "$zr" && echo zmena > eslint.config.js && rm apps/a.ts && echo novy > apps/b.mjs && echo '# h2' > docs/handoff.md)
o=$(bash "$hooks/../scripts/zbytek-rezu.sh" "$zr" 12 2>&1); rc=$?
st=$(git -C "$zr" status --porcelain | tr '\n' '|')
[ $rc -eq 0 ] && [ "$st" = ' M docs/handoff.md|?? docs/e2e/|' ] && printf '%s' "$o" | grep -q 'rez-12-zbytek.patch, uložené soubory (3)' && ok || ko "zr-uloz: rc=$rc st=$st $o"
(cd "$zr" && git apply docs/e2e/rez-12-zbytek.patch) && [ "$(cat "$zr/eslint.config.js")" = zmena ] && [ -f "$zr/apps/b.mjs" ] && [ ! -e "$zr/apps/a.ts" ] && ok || ko "zr-obnova"
o=$(bash "$hooks/../scripts/zbytek-rezu.sh" "$zr" 12 -- eslint.config.js 2>&1); rc=$?
[ $rc -eq 0 ] && [ -f "$zr/docs/e2e/rez-12-zbytek-2.patch" ] && [ -f "$zr/apps/b.mjs" ] && ok || ko "zr-cesty-druhy-patch: rc=$rc $o"
o=$(bash "$hooks/../scripts/zbytek-rezu.sh" "$zr" 3 -- eslint.config.js 2>&1); [ $? -eq 0 ] && printf '%s' "$o" | grep -q 'nic neuloženo' && ok || ko "zr-nic: $o"
bash "$hooks/../scripts/zbytek-rezu.sh" "$tmp/neni-repo" 3 >/dev/null 2>&1; [ $? -eq 2 ] && ok || ko "zr-neni-repo"
# --- subagenti
run sub-ask guard-run.sh "$(pre $SID ag1 AskUserQuestion questions "")" allow
run sub-read-big-deny guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/big.ts")" deny "find_symbol"
run sub-read-big-offset guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/big.ts" offset "100" limit "50")" allow
run sub-read-small guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/small.ts")" allow
# 1.9.0: práh platí pro každý textový soubor pod projektem, ne jen zdrojové přípony (agenti četli PRD .md celé, 58 kB na agenta)
run sub-read-big-md-deny guard-run.sh "$(pre $SID ag1 Read file_path "$proj/docs/big.md")" deny "rg -n (nadpis"
run sub-read-prd guard-run.sh "$(pre $SID ag1 Read file_path "$proj/docs/prd/rez-01.md")" allow
# 1.9.0: Read s offset nebo limit prošel vždy; teď projde jen úsek pod 300 řádků
run sub-read-limit-2000-deny guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/big.ts" limit "2000")" deny "find_symbol"
run sub-read-limit-300-deny guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/big.ts" limit "300")" deny
run sub-read-limit-250 guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/big.ts" limit "250")" allow
run sub-read-offset-bez-limitu-deny guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/big.ts" offset "1")" deny
run sub-read-offset-konec guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/big.ts" offset "300")" allow
run sub-read-maly-bez-limitu guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/small.ts")" allow
# výjimky: předávka, tečkové stavové soubory docs/, cesta mimo projekt, binární soubor
mkdir -p "$proj/docs/reviews"; seq 1 500 > "$proj/docs/reviews/predavka-ag1.md"; seq 1 500 > "$proj/docs/.kontext.jsonl"; seq 1 500 > "$tmp/mimo.ts"
{ printf '\0\0\0'; seq 1 500; } > "$proj/src/bin.dat"
run sub-read-predavka guard-run.sh "$(pre $SID ag1 Read file_path "$proj/docs/reviews/predavka-ag1.md")" allow
run sub-cat-kontext-jsonl guard-run.sh "$(pre $SID ag1 Bash command "cat docs/.kontext.jsonl")" allow
run sub-cat-mimo-projekt guard-run.sh "$(pre $SID ag1 Bash command "cat $tmp/mimo.ts")" allow
run sub-cat-binarni guard-run.sh "$(pre $SID ag1 Bash command "cat src/bin.dat")" allow
rm -f "$proj/docs/reviews/predavka-ag1.md" "$proj/docs/.kontext.jsonl" "$proj/src/bin.dat"
run sub-cat-big-deny guard-run.sh "$(pre $SID ag1 Bash command "cat src/big.ts")" deny
run sub-cat-n-big-deny guard-run.sh "$(pre $SID ag1 Bash command "cat -n src/big.ts")" deny
run sub-cat-small guard-run.sh "$(pre $SID ag1 Bash command "cat src/small.ts")" allow
run sub-cat-pipe guard-run.sh "$(pre $SID ag1 Bash command "cat src/big.ts | grep foo")" allow
run sub-cat-heredoc guard-run.sh "$(pre $SID ag1 Bash command "cat > src/big.ts <<'EOF'\\nx\\nEOF")" allow
run sub-sed-narrow guard-run.sh "$(pre $SID ag1 Bash command "sed -n '10,60p' src/big.ts")" allow
run sub-sed-200 guard-run.sh "$(pre $SID ag1 Bash command "sed -n '1,200p' src/big.ts")" allow
run sub-sed-300-deny guard-run.sh "$(pre $SID ag1 Bash command "sed -n '1,300p' src/big.ts")" deny
run sub-sed-p-deny guard-run.sh "$(pre $SID ag1 Bash command "sed -n p src/big.ts")" deny
run sub-sed-p-quoted-deny guard-run.sh "$(pre $SID ag1 Bash command "sed -n 'p' src/big.ts")" deny
run sub-sed-i-ok guard-run.sh "$(pre $SID ag1 Bash command "sed -i '' 's/a/b/' src/big.ts")" allow
run sub-head-300-deny guard-run.sh "$(pre $SID ag1 Bash command "head -300 src/big.ts")" deny
run sub-tail-300-deny guard-run.sh "$(pre $SID ag1 Bash command "tail -n 300 src/big.ts")" deny
run sub-awk-print-deny guard-run.sh "$(pre $SID ag1 Bash command "awk '{print}' src/big.ts")" deny
run sub-awk-1-deny guard-run.sh "$(pre $SID ag1 Bash command "awk 1 src/big.ts")" deny
run sub-awk-program guard-run.sh "$(pre $SID ag1 Bash command "awk '/foo/ {print \$2}' src/big.ts")" allow
run sub-less-deny guard-run.sh "$(pre $SID ag1 Bash command "less src/big.ts")" deny
run sub-roura-jinde-deny guard-run.sh "$(pre $SID ag1 Bash command "cat src/big.ts; rg x src | head")" deny
run sub-roura-segment guard-run.sh "$(pre $SID ag1 Bash command "rg x src | head; cat src/big.ts | wc -l")" allow
# review C: cesty s mezerou, cd v příkazu, podshell a blok, sed -n -e, awk s mezerami, || není roura, docs/./ není výjimka
mkdir -p "$proj/src/sub dir"; seq 1 500 > "$proj/src/sub dir/big sp.ts"
run sub-read-mezera-deny guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/sub dir/big sp.ts")" deny
run sub-cat-mezera-uvozovky-deny guard-run.sh "$(pre $SID ag1 Bash command "cat \"src/sub dir/big sp.ts\"")" deny
run sub-cat-mezera-lomitko-deny guard-run.sh "$(pre $SID ag1 Bash command "cat src/sub\\ dir/big\\ sp.ts")" deny
run sub-cd-relativni-deny guard-run.sh "$(pre $SID ag1 Bash command "cd src && cat big.ts")" deny
run sub-cd-zpet-ok guard-run.sh "$(pre $SID ag1 Bash command "cd src && cat small.ts")" allow
run sub-podshell-deny guard-run.sh "$(pre $SID ag1 Bash command "(cat src/big.ts)")" deny
run sub-blok-deny guard-run.sh "$(pre $SID ag1 Bash command "{ cat src/big.ts; }")" deny
run sub-sed-n-e-deny guard-run.sh "$(pre $SID ag1 Bash command "sed -n -e '1,400p' src/big.ts")" deny
run sub-sed-ne-deny guard-run.sh "$(pre $SID ag1 Bash command "sed -ne '1,400p' src/big.ts")" deny
run sub-awk-mezery-deny guard-run.sh "$(pre $SID ag1 Bash command "awk '{ print }' src/big.ts")" deny
run sub-cat-or-true-deny guard-run.sh "$(pre $SID ag1 Bash command "cat src/big.ts || true")" deny
run sub-read-docs-tecka-lomitko-deny guard-run.sh "$(pre $SID ag1 Read file_path "$proj/docs/./big.md")" deny
run sub-cat-docs-tecka-lomitko-deny guard-run.sh "$(pre $SID ag1 Bash command "cat docs/./big.md")" deny
# zamítnutí guard-run se připíše do stavu hlídače kontextu (zam), ať metrika zamitnuto nese i celé soubory
rm -f "$tmp/tmpdir/dev-pipeline-kontext/ag1"
run sub-zam-1 guard-run.sh "$(pre $SID ag1 Bash command "cat src/big.ts")" deny
run sub-zam-2 guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/big.ts")" deny
[ "$(sed -n 's/^zam=//p' "$tmp/tmpdir/dev-pipeline-kontext/ag1" 2>/dev/null)" = 2 ] && ok || ko "sub-zam-stav: $(cat "$tmp/tmpdir/dev-pipeline-kontext/ag1" 2>/dev/null)"
rm -f "$tmp/tmpdir/dev-pipeline-kontext/ag1"
run sub-sed-wide-deny guard-run.sh "$(pre $SID ag1 Bash command "sed -n '1,400p' src/big.ts")" deny
run sub-sed-dollar-deny guard-run.sh "$(pre $SID ag1 Bash command "sed -n '1,\$p' src/big.ts")" deny
run sub-sed-noquote-deny guard-run.sh "$(pre $SID ag1 Bash command "sed -n 1,500p src/big.ts")" deny
run sub-sed-regex guard-run.sh "$(pre $SID ag1 Bash command "sed -n '/foo/,/bar/p' src/big.ts")" allow
run sub-head-big-deny guard-run.sh "$(pre $SID ag1 Bash command "head -n 400 src/big.ts")" deny
run sub-head-small guard-run.sh "$(pre $SID ag1 Bash command "head -n 50 src/big.ts")" allow
run sub-head-c guard-run.sh "$(pre $SID ag1 Bash command "head -c 2000 src/big.ts")" allow
run sub-tail-plus-deny guard-run.sh "$(pre $SID ag1 Bash command "tail -n +1 src/big.ts")" deny
run sub-tail-plus-ok guard-run.sh "$(pre $SID ag1 Bash command "tail -n +300 src/big.ts")" allow
run sub-cd-cat-deny guard-run.sh "$(pre $SID ag1 Bash command "cd $proj && cat src/big.ts")" deny
run sub-pnpm guard-run.sh "$(pre $SID ag1 Bash command "pnpm test")" allow
# 1.6.0: výstup přesměrovaný do souboru není čtení do kontextu (falešný zásah prd-část řezu 10 v běhu web-rijen)
run sub-sed-do-souboru guard-run.sh "$(pre $SID ag1 Bash command "sed -n 1,500p src/big.ts > \$TMPDIR/cat.ts")" allow
run sub-cat-do-souboru guard-run.sh "$(pre $SID ag1 Bash command "cat src/big.ts >> /tmp/dp-x.ts")" allow
run sub-cat-stderr-deny guard-run.sh "$(pre $SID ag1 Bash command "cat src/big.ts 2>/dev/null")" deny
run sub-sed-na-stderr-deny guard-run.sh "$(pre $SID ag1 Bash command "sed -n 1,500p src/big.ts >&2")" deny
# 1.6.0: rada Sereny jen pro jazyky z .serena/project.yml (28 marných volání Sereny nad .py v běhu web-rijen)
run sub-read-big-py-bez-sereny guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/big.py")" deny "Serena tenhle jazyk v projektu nemá"
printf 'language_servers:\n  - typescript\n  - python\n' > "$proj/.serena/project.yml"
run sub-read-big-py-se-serenou guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/big.py")" deny "find_symbol"
printf 'languages: [typescript, "python"]\n' > "$proj/.serena/project.yml"
run sub-read-big-py-languages guard-run.sh "$(pre $SID ag1 Bash command "cat src/big.py")" deny "find_symbol"
mv "$proj/.serena/project.yml" "$tmp/serena.yml"
run sub-read-big-ts-bez-projektu guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/big.ts")" deny "rg -n"
mv "$tmp/serena.yml" "$proj/.serena/project.yml"; printf 'language_servers:\n- typescript\n' > "$proj/.serena/project.yml"
# 1.6.0: do docs/reviews/ žádné skripty (rez-11-pismo-pokus.mjs shodil mini-řez 12 v běhu web-rijen)
run rv-write-mjs-deny guard-run.sh "$(pre $SID ag1 Write file_path "$proj/docs/reviews/rez-11-pismo-pokus.mjs" content "x")" deny "scratchpadu"
run rv-write-rel-py-deny guard-run.sh "$(pre $SID ag1 Write file_path "docs/reviews/a.py" content "x")" deny
run rv-write-md-ok guard-run.sh "$(pre $SID ag1 Write file_path "$proj/docs/reviews/rez-11-e2e-kolo-1.md" content "x")" allow
run rv-write-json-ok guard-run.sh "$(pre $SID ag1 Write file_path "$proj/docs/reviews/rez-11-doklad.json" content "{}")" allow
run rv-orch-write-mjs-deny guard-run.sh "$(pre $SID '' Write file_path "$proj/docs/reviews/x.mjs" content "x")" deny "scratchpadu"
run rv-cp-do-adresare-deny guard-run.sh "$(pre $SID ag1 Bash command "cp \$TMPDIR/pokus.mjs docs/reviews/")" deny "scratchpadu"
run rv-cp-cil-deny guard-run.sh "$(pre $SID ag1 Bash command "cp /tmp/p.mjs $proj/docs/reviews/rez-11-pismo-pokus.mjs")" deny
run rv-redirect-deny guard-run.sh "$(pre $SID ag1 Bash command "echo 'print(1)' > docs/reviews/a.py")" deny
run rv-tee-deny guard-run.sh "$(pre $SID ag1 Bash command "printf x | tee -a docs/reviews/a.sh")" deny
run rv-heredoc-skript-deny guard-run.sh "$(pre $SID ag1 Bash command $'cat > docs/reviews/m.mjs <<\'EOF\'\nconsole.log(1)\nEOF')" deny
run rv-heredoc-md-telo-ok guard-run.sh "$(pre $SID ag1 Bash command $'cat > docs/reviews/r.md <<\'EOF\'\nskript: echo x > docs/reviews/a.py\nEOF')" allow
run rv-mv-na-txt-ok guard-run.sh "$(pre $SID '' Bash command "mv docs/reviews/rez-11-pismo-pokus.mjs docs/reviews/rez-11-pismo-pokus.mjs.txt")" allow
run rv-log-ok guard-run.sh "$(pre $SID ag1 Bash command "pnpm vitest run > docs/reviews/rez-09-vitest.log 2>&1; echo EXIT=\$?")" allow
run rv-cp-md-do-adresare-ok guard-run.sh "$(pre $SID ag1 Bash command "cp /tmp/r.md docs/reviews/")" allow
run rv-jina-session-ok guard-run.sh "$(pre $OTHER ag1 Write file_path "$proj/docs/reviews/x.mjs" content "x")" allow
run sub-write-src guard-run.sh "$(pre $SID ag1 Write file_path "$proj/src/a.ts" content "x")" allow
# --- auto-paměť Claude Code se v běhu nepíše (orchestrátor i subagenti; Write, Edit i zápis z Bash); čtení projde
MEM="$HOME/.claude/projects/-Users-x-proj/memory"
run mem-orch-write-deny guard-run.sh "$(pre $SID '' Write file_path "$MEM/a.md" content "x")" deny "Auto-paměť"
run mem-sub-write-deny guard-run.sh "$(pre $SID ag1 Write file_path "$MEM/a.md" content "x")" deny "vize-spory"
run mem-sub-edit-deny guard-run.sh "$(pre $SID ag1 Edit file_path "$MEM/MEMORY.md" old_string "a" new_string "b")" deny
run mem-bash-heredoc-deny guard-run.sh "$(pre $SID '' Bash command $'cat > '"$MEM"$'/b.md <<\'EOF\'\n# x\nEOF')" deny "Auto-paměť"
run mem-bash-append-tilde-deny guard-run.sh "$(pre $SID ag1 Bash command "echo '- x' >> ~/.claude/projects/-Users-x-proj/memory/MEMORY.md")" deny
run mem-bash-tee-deny guard-run.sh "$(pre $SID ag1 Bash command "printf x | tee -a $MEM/a.md")" deny
run mem-bash-cp-deny guard-run.sh "$(pre $SID ag1 Bash command "cp /tmp/a.md $MEM/")" deny
run mem-bash-sed-i-deny guard-run.sh "$(pre $SID ag1 Bash command "sed -i '' 's/a/b/' $MEM/a.md")" deny
run mem-bash-python-deny guard-run.sh "$(pre $SID ag1 Bash command $'python3 - <<\'EOF\'\nopen(\'/Users/x/.claude/projects/p/memory/a.md\',\'w\').write(\'x\')\nEOF')" deny
run mem-bash-cat-ok guard-run.sh "$(pre $SID ag1 Bash command "cat $MEM/MEMORY.md")" allow
run mem-bash-ls-ok guard-run.sh "$(pre $SID '' Bash command "ls $MEM/")" allow
run mem-bash-grep-ok guard-run.sh "$(pre $SID ag1 Bash command "grep -n x $MEM/MEMORY.md")" allow
run mem-orch-read-ok guard-run.sh "$(pre $SID '' Read file_path "$MEM/MEMORY.md")" allow
run mem-other-session-ok guard-run.sh "$(pre $OTHER '' Write file_path "$MEM/a.md" content "x")" allow
CLAUDE_CONFIG_DIR="$tmp/cfg" run mem-config-dir-deny guard-run.sh "$(pre $SID ag1 Write file_path "$tmp/cfg/projects/p/memory/a.md" content "x")" deny "Auto-paměť"
run mem-jina-cesta-memory-ok guard-run.sh "$(pre $SID ag1 Write file_path "$proj/src/memory/a.ts" content "x")" allow
# literály $HOME, ${CLAUDE_CONFIG_DIR}, ~ a relativní zápis po cd do paměti; projektový src/memory/ projde (i v heredocu)
run mem-home-literal-deny guard-run.sh "$(pre $SID ag1 Bash command 'echo x >> "$HOME/.claude/projects/-a/memory/MEMORY.md"')" deny "Auto-paměť"
run mem-config-literal-deny guard-run.sh "$(pre $SID ag1 Bash command 'printf x | tee -a ${CLAUDE_CONFIG_DIR}/projects/-a/memory/a.md')" deny
run mem-cd-relativni-deny guard-run.sh "$(pre $SID ag1 Bash command 'cd ~/.claude/projects/-a/memory && echo x > m.md')" deny "Auto-paměť"
run mem-cd-home-tee-deny guard-run.sh "$(pre $SID '' Bash command 'cd "$HOME/.claude/projects/-a/memory"; printf x | tee MEMORY.md')" deny
run mem-cd-pamet-cteni-ok guard-run.sh "$(pre $SID ag1 Bash command 'cd ~/.claude/projects/-a/memory && cat MEMORY.md')" allow
run mem-cd-jinam-zapis-ok guard-run.sh "$(pre $SID ag1 Bash command 'cd /tmp && echo x > m.md')" allow
run mem-cd-pamet-pak-jinam-ok guard-run.sh "$(pre $SID ag1 Bash command 'cd ~/.claude/projects/-a/memory; cd /tmp; echo x > m.md')" allow
run mem-redirect-projekt-ok guard-run.sh "$(pre $SID ag1 Bash command "echo x > src/memory/a.ts")" allow
run mem-heredoc-projekt-ok guard-run.sh "$(pre $SID ag1 Bash command $'python3 - <<\'PY\'\nfrom pathlib import Path\nPath(\'apps/api/src/memory/store.ts\').write_text(\'x\')\nPY')" allow
run mem-heredoc-home-literal-deny guard-run.sh "$(pre $SID ag1 Bash command $'node - <<\'JS\'\nrequire(\'fs\').writeFileSync(process.env.HOME + \'/x\', \'\'); const p = \'$HOME/.claude/projects/-a/memory/MEMORY.md\'; require(\'fs\').appendFileSync(p, \'y\')\nJS')" deny
# --- obrázky: subagent nečte celý obrázek nad 400 kB (snímky srovnává skriptem, čte náhled do 1 000 px); malý projde
head -c 500000 /dev/zero > "$proj/src/big.png"; head -c 10000 /dev/zero > "$proj/src/small.png"; cp "$proj/src/big.png" "$proj/src/foto.JPG"
run img-sub-big-deny guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/big.png")" deny "1 000 px"
run img-sub-big-offset-deny guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/big.png" offset "1" limit "10")" deny
run img-sub-upper-deny guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/foto.JPG")" deny
run img-sub-small-ok guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/small.png")" allow
DEV_PIPELINE_IMAGE_MAX_BYTES=600000 run img-sub-prah-ok guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/big.png")" allow
run img-other-session-ok guard-run.sh "$(pre $OTHER ag1 Read file_path "$proj/src/big.png")" allow
# --- orchestrátor čte pojmy, rozhodnutí a závěrečnou zprávu (kostru skládá scripts/zprava.py), zprávu píše
for f in pojmy.md rozhodnuti.md zaverecna-zprava.md; do echo "# $f" > "$proj/docs/$f"; done
run read-pojmy guard-run.sh "$(pre $SID '' Read file_path "$proj/docs/pojmy.md")" allow
run bash-cat-rozhodnuti guard-run.sh "$(pre $SID '' Bash command "cat docs/rozhodnuti.md")" allow
run read-zprava guard-run.sh "$(pre $SID '' Read file_path "$proj/docs/zaverecna-zprava.md")" allow
run write-zprava guard-run.sh "$(pre $SID '' Write file_path "$proj/docs/zaverecna-zprava.md" content "x")" allow
run bash-zprava-py guard-run.sh "$(pre $SID '' Bash command "python3 -I $hooks/../scripts/zprava.py $proj --plugin-root $hooks/..")" allow
run bash-follow-ups-py guard-run.sh "$(pre $SID '' Bash command "python3 -I $hooks/../scripts/follow-ups.py $proj --osud rozhodnutí")" allow
# --- docs/.verify-passed: jen verify-marker.sh
run vm-sub-write-deny guard-run.sh "$(pre $SID ag1 Write file_path "$proj/docs/.verify-passed" content "{}")" deny "verify-marker"
run vm-sub-edit-deny guard-run.sh "$(pre $SID ag1 Edit file_path "$proj/docs/.verify-passed" old_string "a" new_string "b")" deny
run vm-orch-write-deny guard-run.sh "$(pre $SID '' Write file_path "$proj/docs/.verify-passed" content "{}")" deny "verify-marker"
run vm-bash-redirect-deny guard-run.sh "$(pre $SID ag1 Bash command "echo '{\"tree\":\"abc\"}' > $proj/docs/.verify-passed")" deny
run vm-bash-tee-deny guard-run.sh "$(pre $SID ag1 Bash command "printf x | tee docs/.verify-passed")" deny
run vm-bash-touch-deny guard-run.sh "$(pre $SID ag1 Bash command "touch docs/.verify-passed")" deny
run vm-bash-script-ok guard-run.sh "$(pre $SID ag1 Bash command "bash $hooks/../scripts/verify-marker.sh $proj $proj/docs/reviews/rez-01-verify-kolo-1.md")" allow
run vm-bash-read-ok guard-run.sh "$(pre $SID ag1 Bash command "cat docs/.verify-passed")" allow
run vm-bash-rm-ok guard-run.sh "$(pre $SID ag1 Bash command "rm -f docs/.verify-passed")" allow
run vm-other-session-ok guard-run.sh "$(pre $OTHER ag1 Write file_path "$proj/docs/.verify-passed" content "{}")" allow
# čtení markeru s 2>/dev/null není zápis (1.5.0; verify řezů 04 a 09 v běhu web-podzim)
run vm-bash-read-stderr-ok guard-run.sh "$(pre $SID ag1 Bash command "cd $proj; cat docs/.verify-passed 2>/dev/null")" allow
c_vm09=$(cat <<'EOF'
cd /sucho/CK-Go2; grep -n "lint-staged" -A12 package.json | head -30; ls .lintstagedrc* 2>/dev/null; grep -n "Základ řezu" docs/prd/rez-09-admin-rychlost-ulozeni-hledani.md | head; grep -n "\[měřidlo\]" docs/prd/rez-09-cast-K2.md docs/prd/rez-09-cast-K4.md | cut -c1-80; sed -n 28,45p package.json | cut -c1-150; git log --oneline -3; cat docs/.verify-passed 2>/dev/null
EOF
)
run vm-bash-read-v-dlouhem-ok guard-run.sh "$(pre $SID ag1 Bash command "$c_vm09")" allow
run vm-bash-redirect-uvozovky-deny guard-run.sh "$(pre $SID ag1 Bash command "printf x > \"$proj/docs/.verify-passed\"")" deny "verify-marker"
run vm-bash-append-deny guard-run.sh "$(pre $SID ag1 Bash command "ls 2>/dev/null; echo x >> docs/.verify-passed")" deny
run vm-bash-cp-cil-deny guard-run.sh "$(pre $SID ag1 Bash command "cp /tmp/m docs/.verify-passed")" deny
run vm-bash-cp-zdroj-ok guard-run.sh "$(pre $SID ag1 Bash command "cp docs/.verify-passed /tmp/m")" allow
run vm-bash-sed-i-deny guard-run.sh "$(pre $SID ag1 Bash command "sed -i '' 's/a/b/' docs/.verify-passed")" deny
run vm-bash-python-zapis-deny guard-run.sh "$(pre $SID ag1 Bash command "python3 -c \"open('docs/.verify-passed','w').write('x')\"")" deny
run vm-bash-python-heredoc-zapis-deny guard-run.sh "$(pre $SID ag1 Bash command $'python3 - <<\'EOF\'\nfrom pathlib import Path\nPath(\'docs/.verify-passed\').write_text(\'{}\')\nEOF')" deny
run vm-bash-python-cteni-ok guard-run.sh "$(pre $SID ag1 Bash command "python3 -c \"print(open('docs/.verify-passed').read())\"")" allow
# --- blast-radius během běhu: stash, clean, checkout/restore nad tečkou a docs/
br() { jq -n --arg s "$1" --arg c "$proj" --arg cmd "$2" '{session_id:$s, cwd:$c, hook_event_name:"PreToolUse", tool_name:"Bash", tool_input:{command:$cmd}}'; }
run br-stash-deny guard-blast-radius.sh "$(br $SID 'git stash')" deny
run br-stash-push-deny guard-blast-radius.sh "$(br $SID 'git stash push -m x')" deny
run br-stash-list-ok guard-blast-radius.sh "$(br $SID 'git stash list')" allow
run br-clean-deny guard-blast-radius.sh "$(br $SID 'git clean -fd')" deny
run br-checkout-docs-deny guard-blast-radius.sh "$(br $SID 'git checkout -- docs/vize-spory.md')" deny
run br-checkout-dot-deny guard-blast-radius.sh "$(br $SID 'git checkout .')" deny
run br-checkout-dashdot-deny guard-blast-radius.sh "$(br $SID 'git checkout -- .')" deny
run br-restore-dot-deny guard-blast-radius.sh "$(br $SID 'git restore .')" deny
run br-restore-docs-deny guard-blast-radius.sh "$(br $SID "cd $proj && git restore docs/handoff.md")" deny
run br-checkout-own-ok guard-blast-radius.sh "$(br $SID 'git checkout -- src/a.ts')" allow
run br-checkout-branch-ok guard-blast-radius.sh "$(br $SID 'git checkout main')" allow
run br-checkout-newbranch-ok guard-blast-radius.sh "$(br $SID 'git checkout -b vize/x')" allow
run br-restore-staged-ok guard-blast-radius.sh "$(br $SID 'git restore --staged src/a.ts')" allow
run br-heredoc-stash-ok guard-blast-radius.sh "$(br $SID $'cat >> docs/journal.md <<\'EOF\'\ngit stash\nEOF')" allow
# 1.6.0: checkout a restore v klonu mimo projekt (2 falešné zásahy v běhu web-rijen), stash radí zbytek-rezu.sh
run br-cd-promenna-mimo-ok guard-blast-radius.sh "$(br $SID 'S=/private/tmp/claude-501/x/scratchpad/sim; cd $S && git checkout -q -- docs scripts && node ../fix.mjs')" allow
run br-cd-absolutni-mimo-ok guard-blast-radius.sh "$(br $SID "cd $proj; ls; cd /private/tmp/claude-501/x/scratchpad/klon; git status --porcelain; git checkout -q docs/vize/a.md")" allow
run br-git-C-mimo-ok guard-blast-radius.sh "$(br $SID 'git -C /tmp/dp-klon checkout -- .')" allow
run br-cd-zpet-do-projektu-deny guard-blast-radius.sh "$(br $SID "cd /tmp/dp-klon && cd $proj && git checkout -- docs/handoff.md")" deny
run br-cd-neznama-deny guard-blast-radius.sh "$(br $SID 'cd $NEZNAMA && git checkout .')" deny
run br-cd-relativni-deny guard-blast-radius.sh "$(br $SID 'cd apps/web && git restore .')" deny
run br-git-C-projekt-deny guard-blast-radius.sh "$(br $SID "git -C $proj checkout -- docs/x.md")" deny
run br-cd-mimo-stash-ok guard-blast-radius.sh "$(br $SID 'cd /tmp/dp-klon && git stash')" allow
# review 1.6.0, N1: stav „mimo projekt“ nepřežije konec subshellu ani návrat do projektu; čemu guard nerozumí, blokuje
run br-subshell-cd-stash-deny guard-blast-radius.sh "$(br $SID '(cd /tmp && ls); git stash')" deny
run br-cd-minus-checkout-deny guard-blast-radius.sh "$(br $SID 'cd /tmp; cd -; git checkout -- docs/')" deny
run br-cd-oldpwd-deny guard-blast-radius.sh "$(br $SID 'cd /tmp && cd "$OLDPWD" && git checkout -- docs/x.md')" deny
run br-cd-projectdir-deny guard-blast-radius.sh "$(br $SID 'cd /tmp && cd "$CLAUDE_PROJECT_DIR" && git stash')" deny
run br-cd-relativne-zpet-deny guard-blast-radius.sh "$(br $SID "cd $proj/src && cd .. && git checkout -- docs/a.md")" deny
run br-cd-tecky-do-projektu-deny guard-blast-radius.sh "$(br $SID "cd /tmp && cd $proj/../$(basename "$proj") && git stash")" deny
run br-cd-substituce-deny guard-blast-radius.sh "$(br $SID 'cd "$(mktemp -d)" && git stash')" deny
run br-pushd-deny guard-blast-radius.sh "$(br $SID 'pushd /tmp && popd && git stash')" deny
run br-subshell-mimo-ok guard-blast-radius.sh "$(br $SID '(cd /tmp/klon && git stash)')" allow
run br-subshell-mimo-pak-projekt-deny guard-blast-radius.sh "$(br $SID '(cd /tmp/klon && git stash); git stash')" deny
run br-mimo-substituce-ok guard-blast-radius.sh "$(br $SID 'cd /tmp/klon && x=$(git rev-parse HEAD) && git checkout -- .')" allow
run br-mimo-relativni-ok guard-blast-radius.sh "$(br $SID 'cd /tmp/klon && cd sub && git checkout -- .')" allow
# review 1.6.0, N6: samoodkazující přiřazení dřív rozvoj zacyklilo; hook visel do timeoutu 30 s a příkaz pak prošel bez kontroly
z=$(date +%s)
run br-promenna-sama-na-sebe-deny guard-blast-radius.sh "$(br $SID 'S=$S/x; cd $S; git stash')" deny
run br-promenna-zdvojena-deny guard-blast-radius.sh "$(br $SID 'S=/a; S=$S$S; S=$S$S; S=$S$S; S=$S$S; S=$S$S; S=$S$S; S=$S$S; S=$S$S; S=$S$S; S=$S$S; S=$S$S; S=$S$S; S=$S$S; cd $S; cd "$CLAUDE_PROJECT_DIR"; git stash')" deny
run br-promenna-rozvinuta-ok guard-blast-radius.sh "$(br $SID 'S=/tmp/a; S=$S/b; cd $S && git stash')" allow
run br-args-bloku-output guard-blast-radius.sh "$(br $SID "python3 -I $hooks/../scripts/args-bloku.py stavba $proj 05 --prd-vysledek /private/tmp/claude-501/-Users-x-proj/sess/tasks/wf1wa23ij.output")" allow
[ $(( $(date +%s) - z )) -le 3 ] && ok || ko "br-promenna-rychle: tři rozvoje proměnných trvaly přes 3 s"
out=$(br $SID 'git stash push -m x -- eslint.config.js' | CLAUDE_PROJECT_DIR="$proj" bash "$hooks/guard-blast-radius.sh" 2>&1 >/dev/null); rc=$?
[ $rc -eq 2 ] && printf '%s' "$out" | grep -q 'scripts/zbytek-rezu.sh <cwd> <NN>' && ok || ko "br-stash-zbytek-hlaska: rc=$rc $out"
# --- guard nasazení čte spouštěný příkaz, ne text (třída F); docs/.deploy-unlocked chybí
run br-deploy-commitmsg-ok guard-blast-radius.sh "$(br $SID 'git commit -m "rez 07: nasazeno přes railway up"')" allow
run br-deploy-grep-ok guard-blast-radius.sh "$(br $SID 'grep "railway up" docs/dev-runbook.md')" allow
run br-deploy-list-ok guard-blast-radius.sh "$(br $SID 'npx wrangler pages deployment list --project-name web')" allow
run br-railway-up-deny guard-blast-radius.sh "$(br $SID "cd $proj/apps/api && railway up --service API")" deny
run br-wrangler-deploy-deny guard-blast-radius.sh "$(br $SID 'npx wrangler pages deploy dist')" deny
run br-env-deploy-deny guard-blast-radius.sh "$(br $SID 'CLOUDFLARE_ACCOUNT_ID=x pnpm --filter web exec wrangler deploy')" deny
run br-bash-c-deploy-deny guard-blast-radius.sh "$(br $SID "bash -c 'railway up'")" deny
# --dry-run nic nenasazuje (1.5.0; code-review řezu 02 v běhu web-podzim kvůli blokaci vynechal kontrolu bundlu)
run br-wrangler-dry-run-ok guard-blast-radius.sh "$(br $SID "cd $proj/apps/api && npx wrangler deploy --dry-run --outdir \$TMPDIR/api-dist --env=production > \$TMPDIR/wb.log 2>&1; echo rc=\$?; tail -6 \$TMPDIR/wb.log")" allow
run br-dry-run-pak-deploy-deny guard-blast-radius.sh "$(br $SID 'npx wrangler deploy --dry-run --outdir /tmp/d && npx wrangler deploy --env=production')" deny
run br-bash-c-dry-run-ok guard-blast-radius.sh "$(br $SID "bash -c 'wrangler deploy --dry-run'")" allow
run br-bash-c-deploy-po-dry-run-deny guard-blast-radius.sh "$(br $SID "bash -c 'wrangler deploy --dry-run; wrangler deploy'")" deny
# --- rm s nechráněnou proměnnou před lomítkem (pravidlo 6): 2 blokace, 6 průchodů
run br-rm-glob-deny guard-blast-radius.sh "$(br $SID 'rm $S/*.orig.ts')" deny
run br-rm-var-deny guard-blast-radius.sh "$(br $SID 'for f in a b; do rm -f $S/$f.bak.ts; done')" deny
run br-rm-chraneny-ok guard-blast-radius.sh "$(br $SID 'rm -f "${S:?}"/a.bak.ts "${S:?}"/b.bak.ts')" allow
run br-rm-literal-ok guard-blast-radius.sh "$(br $SID 'rm -f /tmp/dp-test/a.log')" allow
run br-rm-node-modules-ok guard-blast-radius.sh "$(br $SID 'rm -rf node_modules')" allow
run br-rm-bez-lomitka-ok guard-blast-radius.sh "$(br $SID 'rm $f')" allow
run br-rm-soubor-ok guard-blast-radius.sh "$(br $SID 'rm -f $S/done.flag')" allow
run br-rm-podadresar-ok guard-blast-radius.sh "$(br $SID 'rm -rf "$TMPDIR/dp-test"')" allow
out=$(br $SID 'rm -rf "$D"/' | CLAUDE_PROJECT_DIR="$proj" bash "$hooks/guard-blast-radius.sh" 2>&1 >/dev/null); rc=$?
[ $rc -eq 2 ] && printf '%s' "$out" | grep -qF 'přepiš na rm -f "${S:?}"/soubor nebo literální cestu; scratchpad uklízet nemusíš' && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL br-rm-hlaska: rc=$rc $out"; }
rm "$proj/docs/.orchestrator-run"; run br-nomarker-rm-deny guard-blast-radius.sh "$(br $SID 'rm $S/*.ts')" deny; cp "$tmp/marker" "$proj/docs/.orchestrator-run"
rm "$proj/docs/.orchestrator-run"; run br-nomarker-stash-ok guard-blast-radius.sh "$(br $SID 'git stash')" allow; cp "$tmp/marker" "$proj/docs/.orchestrator-run"
# --- bez markeru / starý marker: vše projde
rm "$proj/docs/.orchestrator-run"; run nomarker guard-run.sh "$(pre $SID '' AskUserQuestion questions "")" allow
cp "$tmp/oldmarker" "$proj/docs/.orchestrator-run"; run oldmarker guard-run.sh "$(pre $SID '' AskUserQuestion questions "")" allow
cp "$tmp/marker" "$proj/docs/.orchestrator-run"
# --- Stop
stop() { jq -n --arg s "$1" --arg c "$proj" --argjson a "$2" '{session_id:$s, cwd:$c, hook_event_name:"Stop", stop_hook_active:$a}'; }
run stop-running on-stop.sh "$(stop $SID false)" allow
printf '**Stav běhu:** řez 01 uzavřen, výsledek přečten\n' > "$proj/docs/handoff.md"; run stop-idle-block on-stop.sh "$(stop $SID false)" block "nic neběží"
run stop-active-allow on-stop.sh "$(stop $SID true)" allow
run stop-other on-stop.sh "$(stop $OTHER false)" allow
printf 'stav běhu: zastaveno: změna cíle\n' > "$proj/docs/handoff.md"; run stop-stopped on-stop.sh "$(stop $SID false)" allow
printf '| a |\n' > "$proj/docs/handoff.md"; run stop-nostate-block on-stop.sh "$(stop $SID false)" block "chybí"
printf 'Stav běhu: Hotovo\n' > "$proj/docs/handoff.md"; run stop-done on-stop.sh "$(stop $SID false)" allow
rm "$proj/docs/handoff.md"; run stop-nohandoff-block on-stop.sh "$(stop $SID false)" block
# --- SessionStart
ss() { jq -n --arg s "$1" --arg c "$proj" --arg src "$2" '{session_id:$s, cwd:$c, hook_event_name:"SessionStart", source:$src}'; }
printf 'stav běhu: běží workflow\n| řez | stav |\n' > "$proj/docs/handoff.md"
run ss-orch-compact session-start-handoff.sh "$(ss $SID compact)" ctx "stav běhu"
run ss-orch-resume session-start-handoff.sh "$(ss $SID resume)" ctx "obnovené"
run ss-orch-startup session-start-handoff.sh "$(ss $SID startup)" allow
run ss-other-compact session-start-handoff.sh "$(ss $OTHER compact)" ctx "jiné session"
run ss-other-startup session-start-handoff.sh "$(ss $OTHER startup)" ctx "jiné session"
head -c 6000 /dev/zero | tr '\0' 'a' > "$proj/docs/handoff.md"; run ss-cut session-start-handoff.sh "$(ss $SID compact)" ctx "4 096"
out=$(ss $SID compact | CLAUDE_PROJECT_DIR="$proj" bash "$hooks/session-start-handoff.sh" | jq -r '.hookSpecificOutput.additionalContext' | wc -c | tr -d ' ')
pocl=$(wc -c < "$hooks/../skills/orchestrate/PO-COMPACTU.md" 2>/dev/null | tr -d ' '); [ -n "$pocl" ] || pocl=0
[ "$out" -lt $((4700 + pocl)) ] && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL ss-cut-size: $out B (strop $((4700 + pocl)))"; }
cp "$tmp/oldmarker" "$proj/docs/.orchestrator-run"; run ss-oldmarker session-start-handoff.sh "$(ss $SID compact)" ctx "bez session_id"; cp "$tmp/marker" "$proj/docs/.orchestrator-run"
rm "$proj/docs/.orchestrator-run"; run ss-nomarker session-start-handoff.sh "$(ss $SID compact)" allow; cp "$tmp/marker" "$proj/docs/.orchestrator-run"
# --- UserPromptSubmit
ps() { jq -n --arg s "$1" --arg c "$proj" --arg p "$2" '{session_id:$s, cwd:$c, hook_event_name:"UserPromptSubmit", prompt:$p}'; }
run ps-orch prompt-submit.sh "$(ps $SID '/orchestrate docs/vize/test.md')" ctx "session_id"
[ "$(jq -r .session_id "$proj/docs/.orchestrator-session")" = "$SID" ] && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL ps-file"; }
run ps-plugin-prefix prompt-submit.sh "$(ps $OTHER '/dev-pipeline:orchestrate')" ctx "$OTHER"
run ps-other prompt-submit.sh "$(ps $SID 'ahoj, jak to jde')" allow
run ps-similar prompt-submit.sh "$(ps $SID '/orchestrateX')" allow
# claude_args: příkazová řádka procesu claude (rodič hooku přes exec -a jako claude --autocompact 400k), setup z ní čte autocompact
printf '%s\n' 'printf "%s" "$1" | CLAUDE_PROJECT_DIR="$2" bash "$3" > /dev/null' > "$tmp/ps-rodic.sh"
bash -c 'exec -a "claude --dangerously-skip-permissions --autocompact 400k" bash "$0" "$@"' "$tmp/ps-rodic.sh" "$(ps $SID '/orchestrate docs/vize/test.md')" "$proj" "$hooks/prompt-submit.sh"
ca=$(jq -r '.claude_args' "$proj/docs/.orchestrator-session" 2>/dev/null)
case "$ca" in "claude --dangerously-skip-permissions --autocompact 400k"*) ok ;; *) ko "ps-claude-args: '$ca'" ;; esac
[ "$(jq -r .session_id "$proj/docs/.orchestrator-session")" = "$SID" ] && ok || ko "ps-claude-args-session"
# hook nesmí selhat ani bez zjistitelného rodiče (PPID 1 po odpojení): soubor vznikne s prázdným claude_args
printf '%s\n' '( printf "%s" "$1" | CLAUDE_PROJECT_DIR="$2" bash "$3" > /dev/null & ) ; sleep 1' > "$tmp/ps-sirotek.sh"
bash "$tmp/ps-sirotek.sh" "$(ps $OTHER '/orchestrate')" "$proj" "$hooks/prompt-submit.sh"
[ "$(jq -r '.session_id + "|" + (.claude_args | type)' "$proj/docs/.orchestrator-session" 2>/dev/null)" = "$OTHER|string" ] && ok || ko "ps-sirotek: $(cat "$proj/docs/.orchestrator-session")"
# --- PreCompact
pc() { jq -n --arg s "$1" --arg c "$proj" '{session_id:$s, cwd:$c, hook_event_name:"PreCompact", trigger:"manual"}'; }
rm -f "$proj/docs/.kontext.jsonl"   # compacty ze SessionStart výše (zkouška injekce) se nepočítají
mkdir -p "$tmp/tmpdir"
head -c 6000 /dev/zero | tr '\0' 'a' > "$proj/docs/handoff.md"
out=$(pc $SID | CLAUDE_PROJECT_DIR="$proj" bash "$hooks/pre-compact.sh"); printf '%s' "$out" | grep -q systemMessage && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL pc-warn: $out"; }
printf 'x\n' > "$proj/docs/handoff.md"; out=$(pc $SID | CLAUDE_PROJECT_DIR="$proj" bash "$hooks/pre-compact.sh"); [ -z "$out" ] && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL pc-quiet: $out"; }
out=$(pc $OTHER | CLAUDE_PROJECT_DIR="$proj" bash "$hooks/pre-compact.sh"); [ -z "$out" ] && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL pc-other: $out"; }
# 1.7.0: PreCompact compact nezapisuje (proběhne i bez compactu: falešný záznam ve 20:14:52 v běhu sonnet-5-5); záznam
# píše SessionStart při source=compact v orchestrátorské session s triggerem, který mu PreCompact nechal (TMPDIR)
[ ! -e "$proj/docs/.kontext.jsonl" ] && ok || ko "pc-bez-zaznamu: $(cat "$proj/docs/.kontext.jsonl")"
printf 'x\n' > "$proj/docs/handoff.md"
pcs() { printf '%s' "$2" | TMPDIR="$tmp/tmpdir" CLAUDE_PROJECT_DIR="$proj" bash "$hooks/$1" > /dev/null 2>&1; }
pcs pre-compact.sh "$(pc $SID)"; pcs session-start-handoff.sh "$(ss $SID compact)"   # compact s triggerem manual
pcs session-start-handoff.sh "$(ss $SID resume)"                                    # resume není compact
pcs pre-compact.sh "$(pc $OTHER)"; pcs session-start-handoff.sh "$(ss $OTHER compact)" # cizí session nic
pcs pre-compact.sh "$(pc $SID)"                                                     # PreCompact bez compactu: nic
pcs session-start-handoff.sh "$(ss $SID compact)"   # compact po falešném PreCompact: trigger z něj, soubor se smaže
pcs session-start-handoff.sh "$(ss $SID compact)"   # compact bez PreCompact: prázdný trigger
k=$(jq -sc '[.[] | select(.aid == "orchestrator") | [.udalost, .typ, .trigger, .rez]]' "$proj/docs/.kontext.jsonl" 2>/dev/null)
[ "$k" = '[["compact","orchestrator","manual","-"],["compact","orchestrator","manual","-"],["compact","orchestrator","","-"]]' ] && ok || ko "ss-compact-zaznam: $k"
[ "$(jq -sc '[.[] | select(.aid != "orchestrator")] | length' "$proj/docs/.kontext.jsonl" 2>/dev/null)" = 0 ] && ok || ko "ss-compact-cizi"
[ ! -e "$tmp/tmpdir/dev-pipeline-kontext/compact-trigger-$SID" ] && ok || ko "ss-compact-trigger-smazan"
rm -f "$proj/docs/.kontext.jsonl"
ok() { pass=$((pass+1)); }; ko() { fail=$((fail+1)); echo "FAIL $*"; }
# compact s triggerem auto se počítá, cizí session v projektu záznam nezapíše (orchestrátor je jen session z markeru)
pca() { jq -n --arg s "$1" --arg c "$proj" '{session_id:$s, cwd:$c, hook_event_name:"PreCompact", trigger:"auto"}'; }
pcs pre-compact.sh "$(pca $SID)"; pcs session-start-handoff.sh "$(ss $SID compact)"
pcs pre-compact.sh "$(pca $OTHER)"; pcs session-start-handoff.sh "$(ss $OTHER compact)"
k=$(jq -sc '[.[] | [.aid, .udalost, .trigger]]' "$proj/docs/.kontext.jsonl" 2>/dev/null)
[ "$k" = '[["orchestrator","compact","auto"]]' ] && ok || ko "ss-compact-auto-jen-orchestrator: $k"
rm -f "$proj/docs/.kontext.jsonl"
# --- hlídač kontextu: syntetický transkript subagenta pod DEV_PIPELINE_TRANSCRIPTS, stav hooku v dočasném TMPDIR
AID=agtest1; tdir="$tmp/transcripts/-proj/$SID/subagents/workflows/wf_1"; mkdir -p "$tdir" "$tmp/tmpdir"; T="$tdir/agent-$AID.jsonl"
PRED="$proj/docs/reviews/predavka-$AID.md"
jq -cn '{type:"user", message:{role:"user", content:"Řez 5: PRD docs/prd/rez-05-x.md, scénáře docs/e2e/rez-05.md. Úkol: implementuj řez 05"}}' > "$T"
kx() { jq -cn --argjson k "$1" '{type:"assistant", message:{usage:{input_tokens:10, cache_read_input_tokens:($k - 1110), cache_creation_input_tokens:1000, output_tokens:100}}}' >> "$T"; }
hk() { # sid agent_id událost nástroj [klíč hodnota]... → vstup hlídače
  local s=$1 a=$2 e=$3 t=$4 obj='{}'; shift 4
  while [ $# -ge 2 ]; do obj=$(jq -cn --argjson o "$obj" --arg k "$1" --arg v "$2" '$o + {($k):$v}'); shift 2; done
  jq -n --arg s "$s" --arg a "$a" --arg e "$e" --arg t "$t" --argjson i "$obj" --arg c "$proj" \
    '{session_id:$s, cwd:$c, hook_event_name:$e, tool_name:$t, tool_input:$i} + (if $a=="" then {} else {agent_id:$a, agent_type:"dev-pipeline:implement"} end)'
}
hl() { DEV_PIPELINE_TRANSCRIPTS="$tmp/transcripts" TMPDIR="$tmp/tmpdir" run "$@"; }
kx 50000;  hl hl-pod-prahem-post hlidac-kontextu.sh "$(hk $SID $AID PostToolUse Bash command "pnpm test")" allow
           hl hl-pod-prahem-pre hlidac-kontextu.sh "$(hk $SID $AID PreToolUse Bash command "pnpm test")" allow
[ ! -e "$proj/docs/.kontext.jsonl" ] && ok || ko "hl-pod-100k-bez-zaznamu"
kx 120000; hl hl-100k hlidac-kontextu.sh "$(hk $SID $AID PostToolUse Read file_path "$proj/src/a.ts")" allow
kx 150000; hl hl-narust hlidac-kontextu.sh "$(hk $SID $AID PostToolUse Read file_path "$proj/src/a.ts")" allow
kx 160000; hl hl-narust-malo hlidac-kontextu.sh "$(hk $SID $AID PostToolUse Read file_path "$proj/src/a.ts")" allow
kx 260000; hl hl-mekky-ctx hlidac-kontextu.sh "$(hk $SID $AID PostToolUse Bash command "pnpm test")" ctx "tuhle práci dokončí nástupce"
           hl hl-mekky-hotovy hlidac-kontextu.sh "$(hk $SID $AID PostToolUse Bash command "pnpm test")" ctx "PŘEDÁVKA: Když je celé zadání už hotové a zbývá jen návrat, vrať normální návrat bez předávky"
           hl hl-mekky-cesta hlidac-kontextu.sh "$(hk $SID $AID PostToolUse Edit file_path "$proj/src/a.ts")" ctx "do $PRED: 1. zadání"
# 1.9.0: implementační agent dostane navíc řádek „zbývající soubory“ do předávky a pole zbyvajici_soubory do návratu (Kontrakt na stropu předávek)
           hl hl-mekky-zbyvajici hlidac-kontextu.sh "$(hk $SID $AID PostToolUse Bash command "pnpm test")" ctx "řádek „zbývající soubory: …“ (soubory ze zadání, které ještě nejsou hotové"
           hl hl-mekky-zbyvajici-navrat hlidac-kontextu.sh "$(hk $SID $AID PostToolUse Bash command "pnpm test")" ctx "zbyvajici_soubory = tytéž soubory jako v předávce"
           hl hl-mekky-pre hlidac-kontextu.sh "$(hk $SID $AID PreToolUse Bash command "pnpm test")" allow
kx 300000; hl hl-tvrdy-bash-deny hlidac-kontextu.sh "$(hk $SID $AID PreToolUse Bash command "pnpm test")" deny "PŘEDÁVKA je povinná"
# 1.9.0: i tvrdá výzva žádá u implementace zbyvajici_soubory v návratu a řádek „zbývající soubory“ v předávce (plan-check N5)
           hl hl-tvrdy-zbyvajici-navrat hlidac-kontextu.sh "$(hk $SID $AID PreToolUse Bash command "pnpm test")" deny "predavka = $PRED, zbyvajici_soubory = tytéž soubory jako v předávce"
           hl hl-tvrdy-zbyvajici-predavka hlidac-kontextu.sh "$(hk $SID $AID PreToolUse Bash command "pnpm test")" deny "řádek „zbývající soubory: …“ (soubory ze zadání, které ještě nejsou hotové"
           hl hl-tvrdy-prd-bez-zbyvajici hlidac-kontextu.sh "$(hk $SID $AID PreToolUse Bash command "pnpm test" | jq -c '.agent_type = "dev-pipeline:prd"')" deny "predavka = $PRED (když je zadání"
           hl hl-tvrdy-structured hlidac-kontextu.sh "$(hk $SID $AID PreToolUse StructuredOutput stav castecne)" allow
           hl hl-tvrdy-write-predavka hlidac-kontextu.sh "$(hk $SID $AID PreToolUse Write file_path "$PRED" content "x")" allow
           hl hl-tvrdy-write-jinam-deny hlidac-kontextu.sh "$(hk $SID $AID PreToolUse Write file_path "$proj/src/a.ts" content "x")" deny
           hl hl-tvrdy-bash-predavka hlidac-kontextu.sh "$(hk $SID $AID PreToolUse Bash command "mkdir -p docs/reviews && cat > docs/reviews/predavka-$AID.md <<'EOF'")" allow
           hl hl-jina-session hlidac-kontextu.sh "$(hk $OTHER $AID PreToolUse Bash command "pnpm test")" allow
           hl hl-orchestrator hlidac-kontextu.sh "$(hk $SID '' PreToolUse Bash command "pnpm test")" allow
# přímý subagent orchestrátora (transkript mimo subagents/workflows/): měří se, předávku nedostane
AID2=agprimy; T2="$tmp/transcripts/-proj/$SID/subagents/agent-$AID2.jsonl"; cp "$T" "$T2"
           hl hl-primy-subagent-post hlidac-kontextu.sh "$(hk $SID $AID2 PostToolUse Bash command "rg x")" allow
           hl hl-primy-subagent-pre hlidac-kontextu.sh "$(hk $SID $AID2 PreToolUse Bash command "rg x")" allow
grep -q "\"aid\":\"$AID2\"" "$proj/docs/.kontext.jsonl" && ok || ko "hl-primy-subagent-zaznam"
printf '{"type":"assistant","message":{"usage":{"input_tok' >> "$T"   # rozepsaný poslední řádek
           hl hl-rozepsany-radek hlidac-kontextu.sh "$(hk $SID $AID PreToolUse Bash command "pnpm test")" deny
echo >> "$T"
kx 100000; hl hl-compact hlidac-kontextu.sh "$(hk $SID $AID PostToolUse Bash command "pnpm test")" allow
k=$(jq -sc 'map(select(.aid == "agtest1")) | [map(.udalost), (last | .compactu, .max), (first | .rez, .typ, .aid)]' "$proj/docs/.kontext.jsonl" 2>/dev/null)
# 1.9.0: PreToolUse StructuredOutput bez jiné události zapíše „navrat“, aby poslední záznam agenta nesl konečné čtení
[ "$k" = '[["mereni","mereni","mekky","tvrdy","navrat","compact"],1,100000,"05","implement","agtest1"]' ] && ok || ko "hl-kontext-jsonl: $k"
# strukturovaný návrat nad prahem: žádná výzva ani událost prahu, jen měření (1.5.0; 5 falešných „mekky“ v běhu web-podzim)
AID3=agnavrat; T3="$tdir/agent-$AID3.jsonl"; head -1 "$T" > "$T3"
jq -cn '{type:"assistant", message:{usage:{input_tokens:10, cache_read_input_tokens:258890, cache_creation_input_tokens:1000, output_tokens:100}}}' >> "$T3"
           hl hl-structured-post-bez-vyzvy hlidac-kontextu.sh "$(hk $SID $AID3 PostToolUse StructuredOutput stav hotovo)" allow
           hl hl-structured-pre hlidac-kontextu.sh "$(hk $SID $AID3 PreToolUse StructuredOutput stav hotovo)" allow
k3=$(jq -sc --arg a "$AID3" '[.[] | select(.aid == $a) | .udalost]' "$proj/docs/.kontext.jsonl" 2>/dev/null)
[ "$k3" = '["mereni","navrat"]' ] && ok || ko "hl-structured-jen-mereni: $k3"
# týž agent po návratu dál pracuje (nástroj jiný než StructuredOutput): výzva přijde, práh platí
           hl hl-po-navratu-vyzva hlidac-kontextu.sh "$(hk $SID $AID3 PostToolUse Bash command "pnpm test")" ctx "tuhle práci dokončí nástupce"
# 1.6.0: zapsaná předávka jde do logu jako udalost "predavka", jednou za agenta
mkdir -p "$proj/docs/reviews"; echo "# předávka" > "$PRED"
           hl hl-predavka-zapis hlidac-kontextu.sh "$(hk $SID $AID PostToolUse Write file_path "$PRED" content "x")" allow
           hl hl-predavka-znovu hlidac-kontextu.sh "$(hk $SID $AID PostToolUse Bash command "git status")" allow
           hl hl-predavka-pre hlidac-kontextu.sh "$(hk $SID $AID PreToolUse StructuredOutput stav castecne)" allow
kp=$(jq -sc --arg a "$AID" '[.[] | select(.aid == $a and .udalost == "predavka") | [.rez, .typ, .soubor]]' "$proj/docs/.kontext.jsonl" 2>/dev/null)
[ "$kp" = "[[\"05\",\"implement\",\"docs/reviews/predavka-$AID.md\"]]" ] && ok || ko "hl-predavka-log: $kp"
# 1.6.0: kolečko se pozná i ve velkém transkriptu (head | grep -q pod pipefail vracel 141 a 65 záznamů kolečka mělo rez "-")
AID4=agkolecko; T4="$tdir/agent-$AID4.jsonl"
jq -cn '{type:"user", message:{role:"user", content:"Závěrečné review kolečko vize: thermo nad diffem main...HEAD"}}' > "$T4"
for i in $(seq 1 400); do jq -cn --arg x "$(head -c 600 /dev/zero | tr '\0' 'x')" '{type:"user", message:{role:"user", content:$x}}' >> "$T4"; done
jq -cn '{type:"assistant", message:{usage:{input_tokens:10, cache_read_input_tokens:118890, cache_creation_input_tokens:1000, output_tokens:100}}}' >> "$T4"
           hl hl-kolecko hlidac-kontextu.sh "$(hk $SID $AID4 PostToolUse Bash command "git status")" allow
k4=$(jq -sc --arg a "$AID4" '[.[] | select(.aid == $a) | .rez] | unique' "$proj/docs/.kontext.jsonl" 2>/dev/null)
[ "$k4" = '["kolecko"]' ] && ok || ko "hl-kolecko-rez: $k4"
# 1.7.0: PRD agent dostane jednou při ~170 k výzvu zapsat kostru (4 z 5 architektů v běhu sonnet-5-5 předávali před zápisem)
hkp() { hk "$@" | jq -c '.agent_type = "dev-pipeline:prd"'; }
ka() { jq -cn --argjson k "$2" '{type:"assistant", message:{usage:{input_tokens:10, cache_read_input_tokens:($k - 1110), cache_creation_input_tokens:1000, output_tokens:100}}}' >> "$1"; }
AID5=agarch; T5="$tdir/agent-$AID5.jsonl"; head -1 "$T" > "$T5"
ka "$T5" 160000; hl hl-arch-pod-prahem hlidac-kontextu.sh "$(hkp $SID $AID5 PostToolUse Bash command "rg x")" allow
ka "$T5" 175000; hl hl-arch-vyzva hlidac-kontextu.sh "$(hkp $SID $AID5 PostToolUse Bash command "rg x")" ctx "zapiš ji teď (tabulka Části, Kontrakt, kritéria), i neúplnou"
                 hl hl-arch-pre-bez hlidac-kontextu.sh "$(hkp $SID $AID5 PreToolUse Bash command "rg x")" allow
ka "$T5" 185000; hl hl-arch-jednou hlidac-kontextu.sh "$(hkp $SID $AID5 PostToolUse Bash command "rg x")" allow
# 1.9.0: stráž opakovaného čtení a měření čtení (41 kB přesných opakování na implement agenta v běhu zaklad-dat)
AID6=agcteni; T6="$tdir/agent-$AID6.jsonl"; head -1 "$T" > "$T6"; ka "$T6" 50000
hkr() { # jako hk, PostToolUse s tool_response (délka obsahu = bajty čtení)
  local n=$1; shift; hk "$@" | jq -c --arg s "$(head -c "$n" /dev/zero | tr '\0' 'x')" '.tool_response = (if .tool_name == "Read" then {type:"text", file:{content:$s}} else {stdout:$s, stderr:""} end)'
}
touch -t 202601010000 "$proj/src/big.ts" "$proj/src/small.ts" "$proj/docs/big.md"
           hl hl-cteni-prvni hlidac-kontextu.sh "$(hk $SID $AID6 PreToolUse Read file_path "$proj/src/big.ts" offset "1" limit "100")" allow
           hl hl-cteni-post hlidac-kontextu.sh "$(hkr 1234 $SID $AID6 PostToolUse Read file_path "$proj/src/big.ts" offset "1" limit "100")" allow
           hl hl-cteni-opakovani-deny hlidac-kontextu.sh "$(hk $SID $AID6 PreToolUse Read file_path "$proj/src/big.ts" offset "1" limit "100")" deny "už máš v kontextu (tvoje čtení č. 1)"
           hl hl-cteni-jiny-usek hlidac-kontextu.sh "$(hk $SID $AID6 PreToolUse Read file_path "$proj/src/big.ts" offset "101" limit "100")" allow
touch -t 202601010001 "$proj/src/big.ts"
           hl hl-cteni-po-zmene hlidac-kontextu.sh "$(hk $SID $AID6 PreToolUse Read file_path "$proj/src/big.ts" offset "1" limit "100")" allow
           hl hl-cteni-sed-post hlidac-kontextu.sh "$(hkr 2000 $SID $AID6 PostToolUse Bash command "sed -n '10,60p' src/big.ts")" allow
           hl hl-cteni-sed-opakovani-deny hlidac-kontextu.sh "$(hk $SID $AID6 PreToolUse Bash command "sed -n '10,60p' src/big.ts")" deny "řádky 10-60"
           hl hl-cteni-sed-roura hlidac-kontextu.sh "$(hk $SID $AID6 PreToolUse Bash command "sed -n '10,60p' src/big.ts | head -3")" allow
           hl hl-cteni-sed-jinam hlidac-kontextu.sh "$(hk $SID $AID6 PreToolUse Bash command "sed -n '10,60p' src/big.ts > \$TMPDIR/x")" allow
           hl hl-cteni-cat-maly-post hlidac-kontextu.sh "$(hkr 300 $SID $AID6 PostToolUse Bash command "cd $proj && cat src/small.ts")" allow
           hl hl-cteni-cat-maly-opakovani-deny hlidac-kontextu.sh "$(hk $SID $AID6 PreToolUse Bash command "cat src/small.ts")" deny "small.ts"
           hl hl-cteni-head-post hlidac-kontextu.sh "$(hkr 100 $SID $AID6 PostToolUse Bash command "head -n 20 src/big.ts")" allow
           hl hl-cteni-head-opakovani-deny hlidac-kontextu.sh "$(hk $SID $AID6 PreToolUse Bash command "head -20 src/big.ts")" deny "řádky 1-20"
           hl hl-cteni-tail-jiny hlidac-kontextu.sh "$(hk $SID $AID6 PreToolUse Bash command "tail -n 20 src/big.ts")" allow
seq 1 500 > "$proj/docs/.kontext.jsonl.test"; mkdir -p "$proj/docs/reviews"; seq 1 50 > "$proj/docs/reviews/predavka-$AID6.md"
           hl hl-cteni-vyjimka-docs-tecka-post hlidac-kontextu.sh "$(hkr 100 $SID $AID6 PostToolUse Bash command "cat docs/.kontext.jsonl.test")" allow
           hl hl-cteni-vyjimka-docs-tecka hlidac-kontextu.sh "$(hk $SID $AID6 PreToolUse Bash command "cat docs/.kontext.jsonl.test")" allow
           hl hl-cteni-vyjimka-predavka-post hlidac-kontextu.sh "$(hkr 100 $SID $AID6 PostToolUse Read file_path "$proj/docs/reviews/predavka-$AID6.md")" allow
           hl hl-cteni-vyjimka-predavka hlidac-kontextu.sh "$(hk $SID $AID6 PreToolUse Read file_path "$proj/docs/reviews/predavka-$AID6.md")" allow
           hl hl-cteni-mimo-cwd hlidac-kontextu.sh "$(hk $SID $AID6 PreToolUse Read file_path "$tmp/mimo.ts")" allow
           hl hl-cteni-jina-session hlidac-kontextu.sh "$(hk $OTHER $AID6 PreToolUse Read file_path "$proj/src/big.ts" offset "101" limit "100")" allow
rm -f "$proj/docs/.kontext.jsonl.test" "$proj/docs/reviews/predavka-$AID6.md"
# měření: poslední záznam agenta (navrat při StructuredOutput) nese součet bajtů proběhlých čtení a počet zamítnutí
           hl hl-cteni-navrat hlidac-kontextu.sh "$(hk $SID $AID6 PreToolUse StructuredOutput stav hotovo)" allow
k6=$(jq -sc --arg a "$AID6" '[.[] | select(.aid == $a)] | last | [.udalost, .cteni_bajtu, .zamitnuto]' "$proj/docs/.kontext.jsonl" 2>/dev/null)
[ "$k6" = '["navrat",3634,4]' ] && ok || ko "hl-cteni-mereni: $k6 (čekáno navrat, 1234+2000+300+100 bajtů, 4 zamítnutí; výjimky se nepočítají)"
# review C: navrat jen jednou; zamítnutí guard-run (celý soubor) se počítá do téhož zamitnuto
           hl hl-cteni-navrat-znovu hlidac-kontextu.sh "$(hk $SID $AID6 PreToolUse StructuredOutput stav hotovo)" allow
[ "$(jq -sc --arg a "$AID6" '[.[] | select(.aid == $a and .udalost == "navrat")] | length' "$proj/docs/.kontext.jsonl")" = 1 ] && ok || ko "hl-navrat-jednou"
           hl hl-guard-zam guard-run.sh "$(hk $SID $AID6 PreToolUse Bash command "cat src/big.ts")" deny
           hl hl-cteni-po-guard hlidac-kontextu.sh "$(hkr 10 $SID $AID6 PostToolUse Bash command "head -n 3 src/big.ts")" allow
[ "$(sed -n 's/^zam=//p' "$tmp/tmpdir/dev-pipeline-kontext/$AID6")" = 5 ] && ok || ko "hl-zam-z-guard: $(cat "$tmp/tmpdir/dev-pipeline-kontext/$AID6")"
# review C V1: opakování se zamítá jen u volání složeného výhradně z čtecích kusů; zápis, formátovač, git, cd ho vypnou
AID7=agzmena; T7="$tdir/agent-$AID7.jsonl"; head -1 "$T" > "$T7"; ka "$T7" 50000
seq 1 40 > "$proj/src/a7.ts"; seq 1 40 > "$proj/src/b7.ts"; touch -t 202601010000 "$proj/src/a7.ts" "$proj/src/b7.ts"
           hl hl-v1-post hlidac-kontextu.sh "$(hkr 80 $SID $AID7 PostToolUse Bash command "cat src/a7.ts")" allow
           hl hl-v1-sed-i-cat hlidac-kontextu.sh "$(hk $SID $AID7 PreToolUse Bash command "sed -i '' 's/1/one/' src/a7.ts && cat src/a7.ts")" allow
           hl hl-v1-prettier-cat hlidac-kontextu.sh "$(hk $SID $AID7 PreToolUse Bash command "pnpm prettier --write src/a7.ts && cat src/a7.ts")" allow
           hl hl-v1-git-cat hlidac-kontextu.sh "$(hk $SID $AID7 PreToolUse Bash command "git checkout src/a7.ts; cat src/a7.ts")" allow
           hl hl-v1-cd-cat hlidac-kontextu.sh "$(hk $SID $AID7 PreToolUse Bash command "cd src && cat a7.ts")" allow
           hl hl-v1-cp-cat hlidac-kontextu.sh "$(hk $SID $AID7 PreToolUse Bash command "cp src/b7.ts src/a7.ts && cat src/a7.ts")" allow
           hl hl-v1-jen-cteni-deny hlidac-kontextu.sh "$(hk $SID $AID7 PreToolUse Bash command "cat src/a7.ts; cat src/b7.ts")" deny "a7.ts"
           hl hl-v1-podshell-deny hlidac-kontextu.sh "$(hk $SID $AID7 PreToolUse Bash command "(cat src/a7.ts)")" deny
           hl hl-v1-sed-ne-post hlidac-kontextu.sh "$(hkr 20 $SID $AID7 PostToolUse Bash command "sed -ne '1,5p' src/a7.ts")" allow
           hl hl-v1-sed-n-e-deny hlidac-kontextu.sh "$(hk $SID $AID7 PreToolUse Bash command "sed -n -e '1,5p' src/a7.ts")" deny "řádky 1-5"
           hl hl-v1-awk-mezery-deny hlidac-kontextu.sh "$(hk $SID $AID7 PreToolUse Bash command "awk '{ print }' src/a7.ts")" deny
# N1: táž sekunda, jiná velikost = změna (klíč nese mtime i velikost); N5: 2>/dev/null je čtení; N6: tail -f není čtení
{ printf 'xx'; cat "$proj/src/a7.ts"; } > "$tmp/a7"; mv "$tmp/a7" "$proj/src/a7.ts"; touch -t 202601010000 "$proj/src/a7.ts"   # 40 řádků, +2 B
           hl hl-n1-velikost hlidac-kontextu.sh "$(hk $SID $AID7 PreToolUse Bash command "cat src/a7.ts")" allow
           hl hl-n5-stderr-post hlidac-kontextu.sh "$(hkr 90 $SID $AID7 PostToolUse Bash command "cat src/b7.ts 2>/dev/null")" allow
           hl hl-n5-stderr-deny hlidac-kontextu.sh "$(hk $SID $AID7 PreToolUse Bash command "cat src/b7.ts 2>&1")" deny
           hl hl-n6-tail-f-post hlidac-kontextu.sh "$(hkr 50 $SID $AID7 PostToolUse Bash command "tail -f src/b7.ts")" allow
           hl hl-n6-tail-f-znovu hlidac-kontextu.sh "$(hk $SID $AID7 PreToolUse Bash command "tail -f src/b7.ts")" allow
# P3: odpověď bez obsahu (obrázek, chyba) se neměří
           hl hl-p3-obrazek hlidac-kontextu.sh "$(hk $SID $AID7 PostToolUse Read file_path "$proj/src/a7.ts" | jq -c '.tool_response = {type:"image", source:"x"}')" allow
[ "$(sed -n 's/^cb=//p' "$tmp/tmpdir/dev-pipeline-kontext/$AID7")" = 190 ] && ok || ko "hl-cb-po-review: $(sed -n 's/^cb=//p' "$tmp/tmpdir/dev-pipeline-kontext/$AID7") (čekáno 80+20+90)"
# review C V2: deset souběžných PostToolUse téhož agenta (Claude Code pouští nástroje jednoho tahu najednou) pod zámkem
AID8=agsoubeh; T8="$tdir/agent-$AID8.jsonl"; head -1 "$T" > "$T8"; ka "$T8" 50000
for i in $(seq 1 10); do
  printf '%s' "$(hkr 50 $SID $AID8 PostToolUse Read file_path "$proj/src/big.ts" offset "$((i * 10))" limit "5")" | DEV_PIPELINE_TRANSCRIPTS="$tmp/transcripts" TMPDIR="$tmp/tmpdir" CLAUDE_PROJECT_DIR="$proj" bash "$hooks/hlidac-kontextu.sh" > /dev/null 2>&1 &
done; wait
k8="$(sed -n 's/^cn=//p' "$tmp/tmpdir/dev-pipeline-kontext/$AID8") $(sed -n 's/^cb=//p' "$tmp/tmpdir/dev-pipeline-kontext/$AID8") $(grep -c '^cteni=' "$tmp/tmpdir/dev-pipeline-kontext/$AID8")"
[ "$k8" = "10 500 10" ] && ok || ko "hl-soubeh: cn cb cteni = $k8 (čekáno 10 500 10)"
[ ! -d "$tmp/tmpdir/dev-pipeline-kontext/$AID8.lock" ] && ok || ko "hl-soubeh-zamek-uklizen"
# čas: 20 volání nad souborem 5 000 řádků pod 1 500 ms (samostatně 39–45 ms na volání u guard-run, ~35 ms u hlídače;
# limit s rezervou na souběžnou zátěž stroje)
seq 1 5000 | sed 's/^/const y/' > "$proj/src/big5000.ts"
ms() { perl -MTime::HiRes=time -e 'printf "%.0f\n", time * 1000'; }
for h in guard-run.sh hlidac-kontextu.sh; do
  t0=$(ms); for i in $(seq 1 20); do printf '%s' "$(hk $SID $AID6 PreToolUse Bash command "cat src/big5000.ts")" | DEV_PIPELINE_TRANSCRIPTS="$tmp/transcripts" TMPDIR="$tmp/tmpdir" CLAUDE_PROJECT_DIR="$proj" bash "$hooks/$h" > /dev/null 2>&1; done; t1=$(ms)
  [ $((t1 - t0)) -lt 1500 ] && ok || ko "cas-$h: 20 volání $((t1 - t0)) ms (limit 1 500)"
done
rm -f "$proj/src/big5000.ts"
AID6=agarchskok; T6="$tdir/agent-$AID6.jsonl"; head -1 "$T" > "$T6"
ka "$T6" 260000; hl hl-arch-s-predavkou hlidac-kontextu.sh "$(hkp $SID $AID6 PostToolUse Bash command "rg x")" ctx "i neúplnou; E2E scénáře nech nástupci. PŘEDÁVKA:"
AID7=agarchnavrat; T7="$tdir/agent-$AID7.jsonl"; head -1 "$T" > "$T7"
ka "$T7" 175000; hl hl-arch-navrat hlidac-kontextu.sh "$(hkp $SID $AID7 PostToolUse StructuredOutput stav hotovo)" allow
AID8=agimpl170; T8="$tdir/agent-$AID8.jsonl"; head -1 "$T" > "$T8"
ka "$T8" 175000; hl hl-arch-jen-prd hlidac-kontextu.sh "$(hk $SID $AID8 PostToolUse Bash command "rg x")" allow
AID9=agarchprimy; T9="$tmp/transcripts/-proj/$SID/subagents/agent-$AID9.jsonl"; head -1 "$T" > "$T9"
ka "$T9" 175000; hl hl-arch-mimo-workflow hlidac-kontextu.sh "$(hkp $SID $AID9 PostToolUse Bash command "rg x")" allow
# --- fronta těžkých příkazů: váhy, obal přes updatedInput, E2E verifikátor
fr() { # sid agent_id agent_type příkaz → vstup PreToolUse Bash
  jq -n --arg s "$1" --arg a "$2" --arg ty "$3" --arg c "$4" --arg p "$proj" \
    '{session_id:$s, cwd:$p, hook_event_name:"PreToolUse", tool_name:"Bash", tool_input:{command:$c, description:"test", timeout:120000}} + (if $a=="" then {} else {agent_id:$a, agent_type:$ty} end)'
}
frun() { printf '%s' "$1" | CLAUDE_PROJECT_DIR="$proj" bash "$hooks/fronta-tezkych.sh" 2>/dev/null; }
vaha() { # příkaz očekávaná_váha (0 = projde beze změny)
  local got; got=$(frun "$(fr $SID ag1 dev-pipeline:implement "$1")" | jq -r '.hookSpecificOutput.updatedInput.command // ""' 2>/dev/null | sed -nE '1s/.* vezmi --vaha ([0-9]+) .*/\1/p')
  [ "${got:-0}" = "$2" ] && ok || ko "vaha '$1': čekáno $2, dostal ${got:-0}"
}
vaha 'pnpm test' 4
vaha 'cd apps/api && pnpm --filter @x/api test > /tmp/log 2>&1; echo EXIT=$?' 4
vaha 'pnpm -r test' 4
vaha 'pnpm turbo test' 4
vaha 'npx vitest run' 4
vaha 'git commit -m "rez 05: x"' 4
vaha 'pnpm turbo typecheck' 3
vaha 'pnpm verify:arch' 3
vaha 'turbo run lint' 3
vaha 'pnpm install --frozen-lockfile' 2
vaha '(cd apps/web && npx vite build)' 2
vaha 'VITEST_MAX_THREADS=2 pnpm vitest run apps/api/src/routes' 2
vaha 'pnpm --filter @x/api typecheck' 1
vaha 'npx tsc --noEmit -p apps/api' 1
vaha 'pnpm vitest run apps/api/src/a.test.ts' 1
vaha 'git status --short && git diff --stat' 0
vaha 'rg -n "pnpm test" docs/prd/rez-05.md' 0
vaha $'cat > docs/reviews/rez-05-x.md <<\'EOF\'\npnpm test\nEOF' 0
vaha 'pnpm typecheck && pnpm test' 4
vaha 'pnpm turbo dev' 0
vaha 'npx vitest --watch' 0
vaha 'pnpm test -- --watch' 0
vaha 'npx tsc -w -p apps/api' 0
out=$(frun "$(fr $SID ag1 dev-pipeline:implement 'pnpm test')")
printf '%s' "$out" | jq -e --arg q "'" '.hookSpecificOutput | .permissionDecision == "allow" and .updatedInput.timeout == 600000 and .updatedInput.description == "test"
  and (.updatedInput.command | startswith("python3 " + $q) and contains("/scripts/tezky.py" + $q + " vezmi --vaha 4 --pid $$ --popis " + $q + "pnpm test" + $q + " --max-cekani 180 && {\npnpm test\n}; __dp_rc=$?; python3 ") and endswith(" vrat --pid $$; (exit $__dp_rc)"))' >/dev/null && ok || ko "fr-obal: $out"
out=$(frun "$(fr $SID ag1 dev-pipeline:implement 'true || pnpm test; echo BEZI; (exit 3)')"); obal=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.updatedInput.command')
for sh in bash zsh; do
  command -v $sh >/dev/null 2>&1 || continue
  o=$(TMPDIR="$tmp/tk" $sh -c "$obal" 2>&1); rc=$?
  [ $rc -eq 3 ] && [ "$o" = BEZI ] && [ "$(TMPDIR="$tmp/tk" python3 "$hooks/../scripts/tezky.py" stav)" = '{"drzi": [], "fronta": []}' ] && ok || ko "fr-obal-bezi-$sh: rc=$rc $o"
done
[ -z "$(frun "$(fr $SID ag1 dev-pipeline:implement "$obal")")" ] && ok || ko "fr-obaleny-znovu"
[ -z "$(frun "$(fr $SID ag1 dev-pipeline:implement 'git log --oneline -n 5')")" ] && ok || ko "fr-lehky-beze-zmeny"
[ -z "$(frun "$(fr $SID '' '' 'pnpm test')")" ] && ok || ko "fr-orchestrator"
[ -z "$(frun "$(fr $OTHER ag1 dev-pipeline:implement 'pnpm test')")" ] && ok || ko "fr-jina-session"
run fr-e2e-test-deny fronta-tezkych.sh "$(fr $SID ag2 dev-pipeline:e2e-verifier 'pnpm test')" deny "E2E ověřuje běžící aplikaci"
run fr-e2e-worktree-deny fronta-tezkych.sh "$(fr $SID ag2 dev-pipeline:e2e-verifier 'git worktree add ../wt HEAD')" deny
run fr-e2e-typecheck-deny fronta-tezkych.sh "$(fr $SID ag2 dev-pipeline:e2e-verifier 'pnpm --filter @x/api typecheck')" deny
run fr-e2e-show-ok fronta-tezkych.sh "$(fr $SID ag2 dev-pipeline:e2e-verifier 'git show HEAD~3:apps/api/src/a.ts | grep -n budget')" allow
# --- tezky.py: rozpočet, přísné FIFO, mrtvý PID, vypršení (stav v dočasném TMPDIR, krok 0,2 s)
ROZ=6; MAXC=300
tk() { TMPDIR="$tmp/tk" DEV_PIPELINE_TEZKY_KROK=0.2 DEV_PIPELINE_TEZKY_ROZPOCET=$ROZ DEV_PIPELINE_TEZKY_MAX_CEKANI=$MAXC python3 "$hooks/../scripts/tezky.py" "$@"; }
sleep 60 & p1=$!; sleep 60 & p2=$!; sleep 0 & pd=$!; wait $pd
ROZ=4; tk vezmi --vaha 3 --pid $p1 --popis prvni
( tk vezmi --vaha 3 --pid $p2 --popis druhy; echo "rc=$?" > "$tmp/tk2" ) & bg=$!
sleep 1
[ ! -s "$tmp/tk2" ] && [ "$(tk stav | jq -c '[.drzi[].pid, .fronta[].pid]')" = "[$p1,$p2]" ] && ok || ko "tk-druhe-ceka: $(cat "$tmp/tk2" 2>/dev/null) $(tk stav)"
tk vrat --pid $p1; wait $bg
[ "$(cat "$tmp/tk2")" = "rc=0" ] && [ "$(tk stav | jq -c '[.drzi[].pid, (.fronta | length)]')" = "[$p2,0]" ] && ok || ko "tk-druhe-po-vrat: $(cat "$tmp/tk2") $(tk stav)"
tk vrat --pid $p2
ROZ=6; tk vezmi --vaha 6 --pid $pd --popis mrtvy
MAXC=2; tk vezmi --vaha 6 --pid $p1 --popis zivy; rc=$?
[ $rc -eq 0 ] && [ "$(tk stav | jq -c '[.drzi[].pid]')" = "[$p1]" ] && ok || ko "tk-mrtvy-pid: rc=$rc $(tk stav)"
MAXC=0.5; o=$(tk vezmi --vaha 3 --pid $p2 --popis treti 2>&1); rc=$?
[ $rc -eq 75 ] && printf '%s' "$o" | grep -qF 'pořád běží zivy (váha 6); příkaz se nespustil, zopakuj ho' && [ "$(tk stav | jq '.fronta | length')" = 0 ] && ok || ko "tk-vyprseni: rc=$rc $o"
tk vrat --pid $p1
ROZ=4; MAXC=2; tk vezmi --vaha 9 --pid $p1 --popis velky; rc=$?
[ $rc -eq 0 ] && [ "$(tk stav | jq -c '[.drzi[].vaha]')" = "[4]" ] && ok || ko "tk-nad-rozpoctem: rc=$rc $(tk stav)"
tk vrat --pid $p1
{ kill $p1 $p2; wait $p1 $p2; } 2>/dev/null
# --- dialog-v-behu.sh (PermissionRequest): v běhu každý dialog zamítne a zapíše do docs/.kontext.jsonl, jinde mlčí
pr() { # sid agent_id agent_type nástroj příkaz → vstup PermissionRequest
  jq -n --arg s "$1" --arg a "$2" --arg ty "$3" --arg t "$4" --arg c "$5" --arg p "$proj" \
    '{session_id:$s, cwd:$p, hook_event_name:"PermissionRequest", permission_mode:"bypassPermissions", tool_name:$t,
      tool_input:(if $t == "Bash" then {command:$c} else {file_path:$c} end), permission_suggestions:[]}
     + (if $a == "" then {} else {agent_id:$a, agent_type:$ty} end)'
}
drun() { printf '%s' "$1" | TMPDIR="$tmp/tmpdir" CLAUDE_PROJECT_DIR="${2:-$proj}" bash "$hooks/dialog-v-behu.sh" 2>/dev/null; }
dialogy() { jq -c 'select(.udalost == "dialog")' "$proj/docs/.kontext.jsonl" 2>/dev/null; }
mkdir -p "$tmp/tmpdir/dev-pipeline-kontext"; printf 'rez=13\nmax=0\n' > "$tmp/tmpdir/dev-pipeline-kontext/ag-dlg"
zsh_cmd='X=(${(f)"$(printf "a\nb")"}); echo ${#X}'
o=$(drun "$(pr $SID ag-dlg dev-pipeline:implement Bash "$zsh_cmd")"); z=$(dialogy | tail -1)
printf '%s' "$o" | jq -e '.hookSpecificOutput | .hookEventName == "PermissionRequest" and .decision.behavior == "deny" and (.decision.message | contains("while IFS= read -r") and contains("NEPROVEDLA"))' >/dev/null \
  && printf '%s' "$z" | jq -e --arg c "$zsh_cmd" '.rez == "13" and .aid == "ag-dlg" and .typ == "dev-pipeline:implement" and .nastroj == "Bash" and .prikaz == $c' >/dev/null && ok || ko "dlg-agent-bash: $o | $z"
o=$(drun "$(pr $SID '' '' Bash 'rm -rf "$d"')"); z=$(dialogy | tail -1)
printf '%s' "$o" | jq -e '.hookSpecificOutput.decision.behavior == "deny"' >/dev/null \
  && printf '%s' "$z" | jq -e '.typ == "orchestrator" and .aid == "" and .rez == "-"' >/dev/null && ok || ko "dlg-orchestrator: $o | $z"
o=$(drun "$(pr $SID ag-dlg2 dev-pipeline:fix Write "$proj/.claude/settings.json")"); z=$(dialogy | tail -1)
printf '%s' "$o" | jq -e '.hookSpecificOutput.decision | .behavior == "deny" and (.message | contains("otázku pro orchestrátora") and (contains("IFS") | not))' >/dev/null \
  && printf '%s' "$z" | jq -e '.nastroj == "Write" and .rez == "-" and (.prikaz | endswith(".claude/settings.json"))' >/dev/null && ok || ko "dlg-write: $o | $z"
o=$(drun "$(pr $SID '' '' Write "$proj/docs/x.md")")
printf '%s' "$o" | jq -e '.hookSpecificOutput.decision.message | contains("vize-spory")' >/dev/null && ok || ko "dlg-orchestrator-write: $o"
pred=$(dialogy | wc -l)
[ -z "$(drun "$(pr $OTHER ag-dlg dev-pipeline:implement Bash "$zsh_cmd")")" ] && [ "$(dialogy | wc -l)" -eq "$pred" ] && ok || ko "dlg-jina-session"
mkdir -p "$tmp/bezbehu/docs"
[ -z "$(drun "$(pr $SID ag-dlg dev-pipeline:implement Bash "$zsh_cmd")" "$tmp/bezbehu")" ] && [ ! -e "$tmp/bezbehu/docs/.kontext.jsonl" ] && ok || ko "dlg-mimo-beh"
[ -z "$(drun 'nejde o json')" ] && [ "$(dialogy | wc -l)" -eq "$pred" ] && ok || ko "dlg-necitelny-vstup"
drun "$(pr $SID ag-dlg dev-pipeline:implement Bash "$(printf 'x%.0s' $(seq 1 300))")" >/dev/null
[ "$(dialogy | tail -1 | jq -r '.prikaz | length')" = 200 ] && ok || ko "dlg-prikaz-200"
# Claude Code volá hook pro jeden dialog dvakrát: druhé volání do 10 s zamítne taky, ale záznam nepřidá
while [ $(( $(date +%s) % 10 )) -ge 8 ]; do sleep 0.5; done   # obě volání v témž desetisekundovém okně hooku
pred=$(dialogy | wc -l); o1=$(drun "$(pr $SID ag-dlg3 dev-pipeline:implement Bash 'echo ${(P)k}')"); o2=$(drun "$(pr $SID ag-dlg3 dev-pipeline:implement Bash 'echo ${(P)k}')")
printf '%s%s' "$o1" "$o2" | grep -c '"behavior": "deny"' | grep -qx 2 && [ "$(dialogy | wc -l)" -eq $((pred + 1)) ] && ok || ko "dlg-dvojite-volani: $(dialogy | wc -l) / $pred"
echo "pass=$pass fail=$fail"; [ $fail -eq 0 ]
