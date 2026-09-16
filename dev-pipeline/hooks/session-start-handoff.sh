#!/usr/bin/env bash
# dev-pipeline SessionStart hook (matcher: startup, compact, resume).
#
# Marker docs/.orchestrator-run (JSON: session_id, started, vize, slug) říká, KTERÁ session
# je orchestrátor. Jen ta dostane po compactu nebo resume prvních 4 kB docs/handoff.md
# (tabulka plánu) a PO-COMPACTU.md ze skillu orchestrate. Každá jiná session v témže
# projektu dostane jednu větu, že orchestrace běží jinde a ona jí není. Bez markeru hook
# mlčí. Důvod: v minulém běhu hook injektoval 246 kB handoffu po každém compactu a ruční
# sessions dostávaly orchestrátorský blok kvůli zapomenutému markeru.
set -uo pipefail

input=$(cat)
j() { printf '%s' "$input" | jq -r "$1 // empty" 2>/dev/null; }
src=$(j '.source'); sid=$(j '.session_id'); cwd=$(j '.cwd')
proj="${CLAUDE_PROJECT_DIR:-$cwd}"
marker="$proj/docs/.orchestrator-run"
[ -f "$marker" ] || exit 0

emit() {
  jq -n --arg c "$1" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
  exit 0
}

msid=$(jq -r '.session_id // empty' "$marker" 2>/dev/null)
mstart=$(jq -r '.started // empty' "$marker" 2>/dev/null)
mvize=$(jq -r '.vize // empty' "$marker" 2>/dev/null)

if [ -z "$msid" ]; then
  emit "dev-pipeline: v projektu leží docs/.orchestrator-run bez session_id (pozůstatek starší verze pluginu nebo spadlého běhu). Tahle session není orchestrátor. Pokud žádná orchestrace neběží, marker smaž."
fi
if [ "$msid" != "$sid" ]; then
  emit "dev-pipeline: v projektu běží orchestrace vize (${mvize:-?}) v jiné session ($msid, od ${mstart:-?}). Tahle session není orchestrátor: chovej se jako běžná ruční session, nesahej na docs/handoff.md ani na běh."
fi

# Orchestrátorská session. Při startup se skill invokuje znovu a text dostane čerstvý;
# injektuje se jen po compactu a resume, kdy skill soubory nikdo znovu nenačte.
case "$src" in
  compact) uvod="Právě proběhl compact." ;;
  resume)  uvod="Pokračuješ v obnovené session." ;;
  *) exit 0 ;;
esac

handoff="$proj/docs/handoff.md"
plugin_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
po_compactu="$plugin_root/skills/orchestrate/PO-COMPACTU.md"

LIMIT=4096
tabulka=""
if [ -f "$handoff" ]; then
  size=$(wc -c < "$handoff" | tr -d ' ')
  tabulka=$(head -c "$LIMIT" "$handoff" | iconv -c -f UTF-8 -t UTF-8 2>/dev/null)
  if [ "$size" -gt "$LIMIT" ]; then
    tabulka="$tabulka

[dev-pipeline: docs/handoff.md má $size B, injektováno jen prvních 4 096 B. Handoff je tabulka plánu do 4 kB; zkrať ho.]"
  fi
else
  tabulka="[docs/handoff.md neexistuje]"
fi

extra=""
[ -f "$po_compactu" ] && extra=$(cat "$po_compactu")

jq -n --arg uvod "$uvod" --arg tabulka "$tabulka" --arg extra "$extra" --arg vize "$mvize" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: (
      $uvod + " Jsi orchestrátor běhu vize (" + $vize + "). Tabulka plánu z docs/handoff.md:\n\n"
      + $tabulka
      + (if $extra == "" then "" else "\n\n---\n\n" + $extra end)
    )
  }
}'
exit 0
