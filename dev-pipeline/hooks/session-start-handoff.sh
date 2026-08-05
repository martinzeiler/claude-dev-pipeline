#!/usr/bin/env bash
# dev-pipeline SessionStart hook (matcher: compact).
#
# Po každém compactu re-injektuje aktuální docs/handoff.md, aby autonomní běh
# neztratil nit — handoff je záchranná kotva stavu (viz PIPELINE.md).
#
# Vedle handoffu injektuje i skills/slice-run/PO-COMPACTU.md, ale JEN když běží
# autonomní běh (marker docs/.orchestrator-run). Důvod: `orchestrate/SKILL.md` se
# čte jen jednou při invokaci a compact ho nezachová, takže se z běhu tiše
# vytrácejí kroky, které v něm jsou (souběh fází, stropy subagentů, disciplína
# kontextu). Měřeno na ostrém běhu: za tři řezy a dva compacty orchestrátor znovu
# nepřečetl ani PIPELINE.md, přestože mu to SKILL.md nařizuje — souběžné psaní PRD
# proběhlo jen u prvního řezu, do prvního compactu. Připomínat to musí kód, ne
# disciplína.
set -uo pipefail

input=$(cat)
src=$(printf '%s' "$input" | jq -r '.source // .session_type // empty' 2>/dev/null)
[ "$src" = "compact" ] || exit 0

cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
proj="${CLAUDE_PROJECT_DIR:-$cwd}"
f="$proj/docs/handoff.md"
[ -f "$f" ] || exit 0

# Kořen pluginu odvozený od umístění tohohle skriptu (hooks/ je sourozenec skills/),
# aby to fungovalo i bez CLAUDE_PLUGIN_ROOT v prostředí hooku.
plugin_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
pipeline_md="$plugin_root/skills/slice-run/PIPELINE.md"
po_compactu="$plugin_root/skills/slice-run/PO-COMPACTU.md"

# Kanonické kroky jen během autonomního běhu — v běžné session by to byl šum.
extra=""
if [ -f "$proj/docs/.orchestrator-run" ] && [ -f "$po_compactu" ]; then
  extra=$(cat "$po_compactu")
  extra="$extra

**Absolutní cesta ke kanonickému PIPELINE.md:** \`$pipeline_md\`"
fi

jq -n --rawfile handoff "$f" --arg extra "$extra" '{
  additionalContext: (
    "Právě proběhl compact. Aktuální stav práce podle docs/handoff.md:\n\n"
    + $handoff
    + "\n\nDeník: docs/journal.md · PRD řezy: docs/prd/ · kanonický proces: PIPELINE.md ve skillu dev-pipeline:slice-run. Pokračuj tam, kde handoff říká."
    + (if $extra == "" then "" else "\n\n---\n\n" + $extra end)
  )
}'
exit 0
