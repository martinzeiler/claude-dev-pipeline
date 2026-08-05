#!/usr/bin/env bash
# dev-pipeline SessionStart hook (matcher: compact, resume).
#
# Po compactu i po obnovení session re-injektuje aktuální docs/handoff.md, aby
# autonomní běh neztratil nit — handoff je záchranná kotva stavu (viz PIPELINE.md).
#
# Vedle handoffu injektuje i skills/slice-run/PO-COMPACTU.md, ale JEN když běží
# autonomní běh (marker docs/.orchestrator-run). Důvod: `orchestrate/SKILL.md` se
# čte jen jednou při invokaci a compact ani resume ho nezachovají, takže se z běhu tiše
# vytrácejí kroky, které v něm jsou (souběh fází, stropy subagentů, disciplína
# kontextu). Měřeno na ostrém běhu: za tři řezy a dva compacty orchestrátor znovu
# nepřečetl ani PIPELINE.md, přestože mu to SKILL.md nařizuje — souběžné psaní PRD
# proběhlo jen u prvního řezu, do prvního compactu. Připomínat to musí kód, ne
# disciplína.
set -uo pipefail

input=$(cat)
src=$(printf '%s' "$input" | jq -r '.source // .session_type // empty' 2>/dev/null)

# `compact` i `resume`: obojí pokračuje ve staré historii, takže si orchestrátor
# nese to, co mu z procesu zbylo, a skill soubory se znovu nenačítají. Při
# `startup` se naopak skill invokuje znovu a čerstvý text dostane přímo — tam
# by injekce jen duplikovala.
case "$src" in
  compact) uvod="Právě proběhl compact." ;;
  resume)  uvod="Pokračuješ v obnovené session." ;;
  *) exit 0 ;;
esac

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

jq -n --rawfile handoff "$f" --arg extra "$extra" --arg uvod "$uvod" '{
  additionalContext: (
    $uvod + " Aktuální stav práce podle docs/handoff.md:\n\n"
    + $handoff
    + "\n\nDeník: docs/journal.md · PRD řezy: docs/prd/ · kanonický proces: PIPELINE.md ve skillu dev-pipeline:slice-run. Pokračuj tam, kde handoff říká."
    + (if $extra == "" then "" else "\n\n---\n\n" + $extra end)
  )
}'
exit 0
