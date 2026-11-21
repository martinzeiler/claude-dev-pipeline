#!/usr/bin/env bash
# dev-pipeline limit-watcher — hlídá interaktivní orchestrátor session v tmuxu
# a po obnovení usage limitu ji nakopne zprávou "pokračuj".
#
# Pozadí: Claude Code nemá auto-resume po usage limitu (ověřeno 2026-07). Když
# limit utne HLAVNÍ orchestrátor session, zobrazí se dialog (Enter = počkat) a
# session stojí, dokud jí někdo nenapíše. Tento watcher to dělá za tebe.
#
# Použití:
#   1. Orchestrátor spusť v tmuxu:  tmux new -s pipeline
#      (v něm `claude` a `/dev-pipeline:orchestrate ...`)
#   2. V druhém terminálu:          limit-watcher.sh [session] [interval-s]
#      (default: session=pipeline, interval=300)
#   Zkouška vzoru: limit-watcher.sh --je-limit < text  → kód 0, když text nese hlášku vyčerpaného limitu, jinak 1
#      (tutéž funkci volá smyčka nad obsahem pane).
#
# Chování: každý interval přečte viditelný obsah pane. Když vidí limit hlášku
# a session zrovna nepracuje, pošle Enter (potvrdí volbu "počkat") a po chvíli
# "pokračuj" + Enter. Před resetem je pokus neškodný (session odpoví zase limit
# hláškou), po resetu session naváže — stav běhu žije v souborech (handoff/journal).
# Skončí sám, když session zmizí nebo vznikne docs/.vize-done v cwd.
set -uo pipefail

# Hlášky vyčerpaného limitu: „You've hit your weekly limit · resets …“, „You've hit your limit · resets …“,
# „5-hour limit reached ∙ resets …“, starší „Claude usage limit reached. Your limit will reset at …“.
# Varování před limitem („Approaching weekly limit · resets …“) hlášku vyčerpání nenese.
LIMIT_PATTERN='limit reached|limit will reset|limit resets|hit your (.* )?limit'
BUSY_PATTERN='esc to interrupt'
je_limit() { grep -Eqi "$LIMIT_PATTERN"; }   # text na stdin

if [ "${1:-}" = "--je-limit" ]; then je_limit; exit $?; fi

SESSION="${1:-pipeline}"
INTERVAL="${2:-300}"

log() { echo "[$(date '+%H:%M:%S')] $1"; }

log "Hlídám tmux session '$SESSION' (interval ${INTERVAL}s). Konec: Ctrl+C, zánik session, nebo docs/.vize-done."

while true; do
  if [ -f docs/.vize-done ] && [ ! -f docs/.orchestrator-run ]; then
    log "Běh je dokončený (.vize-done bez .orchestrator-run) — končím."
    exit 0
  fi
  pane=$(tmux capture-pane -p -t "$SESSION" 2>/dev/null) || {
    log "tmux session '$SESSION' neexistuje — končím."
    exit 0
  }
  if je_limit <<< "$pane"; then
    if grep -Eqi "$BUSY_PATTERN" <<< "$pane"; then
      log "Limit hláška viditelná, ale session pracuje — nechávám být."
    else
      log "Limit hláška + idle session — posílám Enter a 'pokračuj'."
      tmux send-keys -t "$SESSION" Enter
      sleep 5
      tmux send-keys -t "$SESSION" "pokračuj" Enter
    fi
  fi
  sleep "$INTERVAL"
done
