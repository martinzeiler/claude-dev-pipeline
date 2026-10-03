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
echo "# vize" > "$proj/docs/vize/test.md"; echo "# prd" > "$proj/docs/prd/rez-01.md"
printf 'stav běhu: běží workflow blok-stavby řez 01\n| řez | stav |\n' > "$proj/docs/handoff.md"
pass=0; fail=0
ok() { pass=$((pass+1)); }; ko() { fail=$((fail+1)); echo "FAIL $*"; }
run() { # name script json expect(allow|deny|block|ctx) [grep]
  local name=$1 script=$2 json=$3 expect=$4 grepfor=${5:-} out rc got=allow
  out=$(printf '%s' "$json" | CLAUDE_PROJECT_DIR="$proj" bash "$hooks/$script" 2>/dev/null); rc=$?
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
run write-memory guard-run.sh "$(pre $SID '' Write file_path "$HOME/.claude/projects/x/memory/a.md" content "x")" allow
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
# --- subagenti
run sub-ask guard-run.sh "$(pre $SID ag1 AskUserQuestion questions "")" allow
run sub-read-big-deny guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/big.ts")" deny "find_symbol"
run sub-read-big-offset guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/big.ts" offset "100" limit "50")" allow
run sub-read-small guard-run.sh "$(pre $SID ag1 Read file_path "$proj/src/small.ts")" allow
run sub-read-big-md guard-run.sh "$(pre $SID ag1 Read file_path "$proj/docs/big.md")" allow
run sub-read-prd guard-run.sh "$(pre $SID ag1 Read file_path "$proj/docs/prd/rez-01.md")" allow
run sub-cat-big-deny guard-run.sh "$(pre $SID ag1 Bash command "cat src/big.ts")" deny
run sub-cat-n-big-deny guard-run.sh "$(pre $SID ag1 Bash command "cat -n src/big.ts")" deny
run sub-cat-small guard-run.sh "$(pre $SID ag1 Bash command "cat src/small.ts")" allow
run sub-cat-pipe guard-run.sh "$(pre $SID ag1 Bash command "cat src/big.ts | grep foo")" allow
run sub-cat-heredoc guard-run.sh "$(pre $SID ag1 Bash command "cat > src/big.ts <<'EOF'\\nx\\nEOF")" allow
run sub-sed-narrow guard-run.sh "$(pre $SID ag1 Bash command "sed -n '10,60p' src/big.ts")" allow
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
run sub-write-src guard-run.sh "$(pre $SID ag1 Write file_path "$proj/src/a.ts" content "x")" allow
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
head -c 6000 /dev/zero | tr '\0' 'a' > "$proj/docs/handoff.md"
out=$(pc $SID | CLAUDE_PROJECT_DIR="$proj" bash "$hooks/pre-compact.sh"); printf '%s' "$out" | grep -q systemMessage && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL pc-warn: $out"; }
printf 'x\n' > "$proj/docs/handoff.md"; out=$(pc $SID | CLAUDE_PROJECT_DIR="$proj" bash "$hooks/pre-compact.sh"); [ -z "$out" ] && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL pc-quiet: $out"; }
out=$(pc $OTHER | CLAUDE_PROJECT_DIR="$proj" bash "$hooks/pre-compact.sh"); [ -z "$out" ] && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL pc-other: $out"; }
ok() { pass=$((pass+1)); }; ko() { fail=$((fail+1)); echo "FAIL $*"; }
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
           hl hl-mekky-pre hlidac-kontextu.sh "$(hk $SID $AID PreToolUse Bash command "pnpm test")" allow
kx 300000; hl hl-tvrdy-bash-deny hlidac-kontextu.sh "$(hk $SID $AID PreToolUse Bash command "pnpm test")" deny "PŘEDÁVKA je povinná"
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
[ "$k" = '[["mereni","mereni","mekky","tvrdy","compact"],1,100000,"05","implement","agtest1"]' ] && ok || ko "hl-kontext-jsonl: $k"
# strukturovaný návrat nad prahem: žádná výzva ani událost prahu, jen měření (1.5.0; 5 falešných „mekky“ v běhu web-podzim)
AID3=agnavrat; T3="$tdir/agent-$AID3.jsonl"; head -1 "$T" > "$T3"
jq -cn '{type:"assistant", message:{usage:{input_tokens:10, cache_read_input_tokens:258890, cache_creation_input_tokens:1000, output_tokens:100}}}' >> "$T3"
           hl hl-structured-post-bez-vyzvy hlidac-kontextu.sh "$(hk $SID $AID3 PostToolUse StructuredOutput stav hotovo)" allow
           hl hl-structured-pre hlidac-kontextu.sh "$(hk $SID $AID3 PreToolUse StructuredOutput stav hotovo)" allow
k3=$(jq -sc --arg a "$AID3" '[.[] | select(.aid == $a) | .udalost]' "$proj/docs/.kontext.jsonl" 2>/dev/null)
[ "$k3" = '["mereni"]' ] && ok || ko "hl-structured-jen-mereni: $k3"
# týž agent po návratu dál pracuje (nástroj jiný než StructuredOutput): výzva přijde, práh platí
           hl hl-po-navratu-vyzva hlidac-kontextu.sh "$(hk $SID $AID3 PostToolUse Bash command "pnpm test")" ctx "tuhle práci dokončí nástupce"
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
echo "pass=$pass fail=$fail"; [ $fail -eq 0 ]
