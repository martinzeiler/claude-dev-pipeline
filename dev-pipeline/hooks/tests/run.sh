#!/usr/bin/env bash
# Testy hooků dev-pipeline nad syntetickými vstupy. Spusť: dev-pipeline/hooks/tests/run.sh
set -uo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); hooks="$here/.."
mkdir -p "$HOME/.cache/dev-pipeline-tests"; tmp=$(mktemp -d "$HOME/.cache/dev-pipeline-tests/run.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
proj="$tmp/proj"; mkdir -p "$proj/docs/vize" "$proj/docs/prd" "$proj/src"
SID="sess-orch"; OTHER="sess-other"
jq -n --arg s "$SID" '{session_id:$s, started:"2026-09-16T12:00:00Z", vize:"docs/vize/test.md", slug:"test"}' > "$proj/docs/.orchestrator-run"
cp "$proj/docs/.orchestrator-run" "$tmp/marker"; : > "$tmp/oldmarker"
seq 1 500 | sed 's/^/const x/' > "$proj/src/big.ts"; seq 1 100 > "$proj/src/small.ts"; seq 1 500 > "$proj/docs/big.md"
echo "# vize" > "$proj/docs/vize/test.md"; echo "# prd" > "$proj/docs/prd/rez-01.md"
printf 'stav běhu: běží workflow blok-stavby řez 01\n| řez | stav |\n' > "$proj/docs/handoff.md"
pass=0; fail=0
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
# --- PreCompact
pc() { jq -n --arg s "$1" --arg c "$proj" '{session_id:$s, cwd:$c, hook_event_name:"PreCompact", trigger:"manual"}'; }
head -c 6000 /dev/zero | tr '\0' 'a' > "$proj/docs/handoff.md"
out=$(pc $SID | CLAUDE_PROJECT_DIR="$proj" bash "$hooks/pre-compact.sh"); printf '%s' "$out" | grep -q systemMessage && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL pc-warn: $out"; }
printf 'x\n' > "$proj/docs/handoff.md"; out=$(pc $SID | CLAUDE_PROJECT_DIR="$proj" bash "$hooks/pre-compact.sh"); [ -z "$out" ] && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL pc-quiet: $out"; }
out=$(pc $OTHER | CLAUDE_PROJECT_DIR="$proj" bash "$hooks/pre-compact.sh"); [ -z "$out" ] && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL pc-other: $out"; }
echo "pass=$pass fail=$fail"; [ $fail -eq 0 ]
