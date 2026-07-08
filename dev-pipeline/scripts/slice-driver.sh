#!/usr/bin/env bash
# dev-pipeline slice-driver — fallback Ralph loop přes řezy vize.
# Každý řez = nová Claude Code session s čerstvým kontextem; stav žije v souborech
# (docs/prd/, docs/journal.md, docs/handoff.md — viz PIPELINE.md ve skillu slice-run).
#
# Použití:
#   slice-driver.sh [--watch] [--max N] [adresář-projektu]
#
#   --watch   interaktivní režim: sleduješ průběh, další řez odstartuješ ukončením
#             session (dvojité Ctrl+C). Bez --watch běží headless (claude -p) a
#             session se po řezu ukončí sama — režim „spusť a odejdi".
#   --max N   strop iterací (default 20) — pojistka proti nekonečné smyčce.
#
# Primární executor je /dev-pipeline:orchestrate (orchestrátor session); tento
# driver je záložní/cron varianta se stejným souborovým kontraktem.
set -uo pipefail

MODE="auto"
MAX=20
DIR="$(pwd)"

while [ $# -gt 0 ]; do
  case "$1" in
    --watch) MODE="watch"; shift ;;
    --max)
      if [ $# -lt 2 ] || ! printf '%s' "$2" | grep -Eq '^[0-9]+$'; then
        echo "--max vyžaduje číselnou hodnotu (např. --max 10)"; exit 1
      fi
      MAX="$2"; shift 2 ;;
    *) DIR="$1"; shift ;;
  esac
done

cd "$DIR" || { echo "Adresář $DIR neexistuje"; exit 1; }
mkdir -p docs

notify() {
  osascript -e "display notification \"$1\" with title \"dev-pipeline\"" 2>/dev/null || true
}

# Usage limit v headless režimu: claude -p skončí exit 1 s hláškou "usage limit reached ...
# resets at <čas>". Čas resetu nejde spolehlivě strojově parsovat (plain text) → čekej
# v půlhodinových krocích a zkoušej znovu; limit-retry NEspotřebovává iterace (stav řezů
# žije v souborech, opakované spuštění slice-run je bezpečné — naváže na in_progress PRD).
LIMIT_PATTERN='usage limit reached|limit will reset'

i=0
while [ "$i" -lt "$MAX" ]; do
  if [ -f docs/.vize-done ]; then
    echo "── docs/.vize-done nalezen — všechny řezy hotové."
    break
  fi
  i=$((i + 1))
  echo "── Iterace $i/$MAX ($(date '+%H:%M')) ─────────────────────────"
  if [ "$MODE" = "watch" ]; then
    claude "/dev-pipeline:slice-run"
  else
    out=$(claude -p "/dev-pipeline:slice-run" --dangerously-skip-permissions --verbose 2>&1)
    printf '%s\n' "$out" | tee -a docs/driver.log
    if printf '%s' "$out" | grep -Eqi "$LIMIT_PATTERN"; then
      i=$((i - 1))
      notify "Usage limit — driver čeká 30 min a zkusí to znovu."
      echo "── Usage limit ($(date '+%H:%M')) — čekám 30 min, iterace se nepočítá."
      sleep 1800
    fi
  fi
done

if [ -f docs/.vize-done ]; then
  notify "Všechny řezy hotové — spusť finální fázi."
  echo ""
  echo "Řezy dokončeny. Finální fáze (plné review kolečko + validátor vize):"
  echo "  claude \"/dev-pipeline:orchestrate final\""
else
  notify "Driver skončil na stropu $MAX iterací bez .vize-done."
  echo "Dosažen strop $MAX iterací bez docs/.vize-done — zkontroluj docs/journal.md."
fi
