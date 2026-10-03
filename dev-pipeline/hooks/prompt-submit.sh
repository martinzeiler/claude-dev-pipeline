#!/usr/bin/env bash
# dev-pipeline UserPromptSubmit hook. Když uživatel napíše /orchestrate (nebo /dev-pipeline:orchestrate),
# uloží session_id (a claude_args, příkazovou řádku procesu claude) do docs/.orchestrator-session, aby setup orchestrace mohl zapsat marker
# docs/.orchestrator-run s identitou orchestrátorské session. Model své session_id jinak nezná
# (CLAUDE_SESSION_ID v Bash nástroji není), hook ho dostane ve vstupu.
set -uo pipefail

input=$(cat)
j() { printf '%s' "$input" | jq -r "$1 // empty" 2>/dev/null; }
prompt=$(j '.prompt' | sed 's/^[[:space:]]*//'); sid=$(j '.session_id'); cwd=$(j '.cwd')
case "$prompt" in
  /orchestrate|"/orchestrate "*|/dev-pipeline:orchestrate|"/dev-pipeline:orchestrate "*) ;;
  *) exit 0 ;;
esac
proj="${CLAUDE_PROJECT_DIR:-$cwd}"
{ [ -n "$sid" ] && [ -d "$proj" ]; } || exit 0
mkdir -p "$proj/docs"
# Příkazová řádka procesu claude (claude_args): setup z ní čte --autocompact. Sám ji zjistit neumí: Bash nástroj běží
# v sandboxu a `ps` tam argumenty procesu nevrátí (běh web-podzim: „autocompact nezjištěn“ při --autocompact 400k).
# Hook sandbox nemá. Rodič hooku je claude, nebo shell, který hook spustil; jdeme nahoru nejvýš 4 úrovně k prvnímu
# předkovi, který není shell. Prázdný řetězec, když se nic nezjistí; hook kvůli tomu nikdy neselže.
claude_args=""
pid=$PPID
for _ in 1 2 3 4; do
  case "$pid" in ''|*[!0-9]*|0|1) break ;; esac
  a=$(ps -o args= -p "$pid" 2>/dev/null | head -1)
  [ -n "$a" ] || break
  w=${a%% *}; w=${w##*/}; w=${w#-}
  case "$w" in
    sh|bash|zsh|dash|ksh|env) pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ') ;;
    *) claude_args=$a; break ;;
  esac
done
jq -n --arg s "$sid" --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg c "$claude_args" '{session_id:$s, at:$t, claude_args:$c}' > "$proj/docs/.orchestrator-session"
jq -n --arg s "$sid" '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:("dev-pipeline: session_id této session je " + $s + ", uloženo do docs/.orchestrator-session pro setup orchestrace.")}}'
exit 0
