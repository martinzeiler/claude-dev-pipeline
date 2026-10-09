#!/usr/bin/env bash
# dev-pipeline PreCompact hook: nikdy neblokuje.
# Compact orchestrátora do docs/.kontext.jsonl nezapisuje: PreCompact proběhne i bez compactu (v běhu sonnet-5-5 záznam
# ve 20:14:52 bez compactu, zpráva psala 2 compacty, byl 1; 1.7.0). Záznam píše až session-start-handoff.sh při
# source=compact; trigger (manual/auto), který SessionStart nedostává, mu tento hook nechá v dočasném souboru session.
# Když je docs/handoff.md nad 4 kB, varuje uživatele: SessionStart hook po compactu injektuje jen prvních 4 096 B.
set -uo pipefail

input=$(cat)
j() { printf '%s' "$input" | jq -r "$1 // empty" 2>/dev/null; }
sid=$(j '.session_id'); cwd=$(j '.cwd'); trigger=$(j '.trigger')
proj="${CLAUDE_PROJECT_DIR:-$cwd}"
marker="$proj/docs/.orchestrator-run"
[ -f "$marker" ] || exit 0
msid=$(jq -r '.session_id // empty' "$marker" 2>/dev/null)
[ -n "$msid" ] && [ "$msid" = "$sid" ] || exit 0
stdir="${TMPDIR:-/tmp}"; stdir="${stdir%/}/dev-pipeline-kontext"
mkdir -p "$stdir" 2>/dev/null && printf '%s\n' "${trigger:-}" > "$stdir/compact-trigger-$sid" 2>/dev/null
handoff="$proj/docs/handoff.md"
[ -f "$handoff" ] || exit 0
size=$(wc -c < "$handoff" | tr -d ' ')
if [ "$size" -gt 4096 ]; then
  jq -n --arg m "dev-pipeline: docs/handoff.md má $size B, po compactu ($trigger) se injektují jen první 4 096 B. Handoff je tabulka plánu do 4 kB." '{systemMessage:$m}'
fi
exit 0
