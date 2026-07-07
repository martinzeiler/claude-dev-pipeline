#!/usr/bin/env bash
# dev-pipeline SessionStart hook (matcher: compact).
# Po každém compactu re-injektuje aktuální docs/handoff.md, aby autonomní běh
# neztratil nit — handoff je záchranná kotva stavu (viz PIPELINE.md).
set -uo pipefail

input=$(cat)
src=$(printf '%s' "$input" | jq -r '.source // .session_type // empty' 2>/dev/null)
[ "$src" = "compact" ] || exit 0

cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
proj="${CLAUDE_PROJECT_DIR:-$cwd}"
f="$proj/docs/handoff.md"
[ -f "$f" ] || exit 0

jq -n --rawfile handoff "$f" '{
  additionalContext: ("Právě proběhl compact. Aktuální stav práce podle docs/handoff.md:\n\n" + $handoff + "\n\nDeník: docs/journal.md · PRD řezy: docs/prd/ · kanonický proces: PIPELINE.md ve skillu dev-pipeline:slice-run. Pokračuj tam, kde handoff říká.")
}'
exit 0
