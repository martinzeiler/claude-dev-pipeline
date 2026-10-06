#!/usr/bin/env bash
# dev-pipeline PreCompact hook: nikdy neblokuje.
# V orchestrátorské session zapíše compact do docs/.kontext.jsonl (aid orchestrator, udalost compact): co-dela.sh a závěrečná
# zpráva počítají compacty orchestrátora odtud, ne z paměti (v běhu web-rijen zpráva psala 1, byly 2; 1.6.0).
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
jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg tr "${trigger:-}" \
  '{ts:$ts, rez:"-", aid:"orchestrator", typ:"orchestrator", udalost:"compact", trigger:$tr}' \
  >> "$proj/docs/.kontext.jsonl" 2>/dev/null
handoff="$proj/docs/handoff.md"
[ -f "$handoff" ] || exit 0
size=$(wc -c < "$handoff" | tr -d ' ')
if [ "$size" -gt 4096 ]; then
  jq -n --arg m "dev-pipeline: docs/handoff.md má $size B, po compactu ($trigger) se injektují jen první 4 096 B. Handoff je tabulka plánu do 4 kB." '{systemMessage:$m}'
fi
exit 0
