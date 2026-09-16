#!/usr/bin/env bash
# dev-pipeline PreCompact hook: jen varování uživateli, nikdy neblokuje.
# Když je docs/handoff.md nad 4 kB, SessionStart hook po compactu injektuje jen prvních 4 096 B.
set -uo pipefail

input=$(cat)
j() { printf '%s' "$input" | jq -r "$1 // empty" 2>/dev/null; }
sid=$(j '.session_id'); cwd=$(j '.cwd'); trigger=$(j '.trigger')
proj="${CLAUDE_PROJECT_DIR:-$cwd}"
marker="$proj/docs/.orchestrator-run"
[ -f "$marker" ] || exit 0
msid=$(jq -r '.session_id // empty' "$marker" 2>/dev/null)
[ -n "$msid" ] && [ "$msid" = "$sid" ] || exit 0
handoff="$proj/docs/handoff.md"
[ -f "$handoff" ] || exit 0
size=$(wc -c < "$handoff" | tr -d ' ')
if [ "$size" -gt 4096 ]; then
  jq -n --arg m "dev-pipeline: docs/handoff.md má $size B, po compactu ($trigger) se injektují jen první 4 096 B. Handoff je tabulka plánu do 4 kB." '{systemMessage:$m}'
fi
exit 0
