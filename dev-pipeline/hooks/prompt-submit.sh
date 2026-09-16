#!/usr/bin/env bash
# dev-pipeline UserPromptSubmit hook. Když uživatel napíše /orchestrate (nebo /dev-pipeline:orchestrate),
# uloží session_id do docs/.orchestrator-session, aby setup orchestrace mohl zapsat marker
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
jq -n --arg s "$sid" --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{session_id:$s, at:$t}' > "$proj/docs/.orchestrator-session"
jq -n --arg s "$sid" '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:("dev-pipeline: session_id této session je " + $s + ", uloženo do docs/.orchestrator-session pro setup orchestrace.")}}'
exit 0
