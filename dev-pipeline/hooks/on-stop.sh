#!/usr/bin/env bash
# dev-pipeline Stop hook. Aktivní jen pro orchestrátorskou session (marker docs/.orchestrator-run
# se shodným session_id). Rozhoduje podle řádku „stav běhu:“ v docs/handoff.md:
#   běží …      → workflow nebo agent pracuje na pozadí, zastavení tahu je v pořádku
#   zastaveno … → důvod ze zavřeného seznamu, čeká se na uživatele
#   hotovo      → finální fáze skončila
#   cokoli jiného nebo chybí → blokace s důvodem: běh nesmí stát bez rozjeté práce
# Při stop_hook_active (už jednou blokováno v témže tahu) pouští vždy, aby nevznikla smyčka.
set -uo pipefail

input=$(cat)
j() { printf '%s' "$input" | jq -r "$1 // empty" 2>/dev/null; }
sid=$(j '.session_id'); cwd=$(j '.cwd'); active=$(j '.stop_hook_active'); agent_id=$(j '.agent_id')
[ -n "$agent_id" ] && exit 0
proj="${CLAUDE_PROJECT_DIR:-$cwd}"
marker="$proj/docs/.orchestrator-run"
[ -f "$marker" ] || exit 0
msid=$(jq -r '.session_id // empty' "$marker" 2>/dev/null)
[ -n "$msid" ] && [ "$msid" = "$sid" ] || exit 0
[ "$active" = "true" ] && exit 0

block() { jq -n --arg r "dev-pipeline: $1" '{decision:"block",reason:$r}'; exit 0; }

handoff="$proj/docs/handoff.md"
state=""
if [ -f "$handoff" ]; then
  state=$(grep -m1 -iE '^[*_[:space:]]*stav běhu[*_[:space:]]*:' "$handoff" \
    | sed -E 's/^[^:]*:[[:space:]]*//; s/[*_]+//g; s/[[:space:]]+$//')
fi
low=$(printf '%s' "$state" | tr '[:upper:]' '[:lower:]')
case "$low" in
  "") block "Běh vize je aktivní, ale v docs/handoff.md chybí řádek „stav běhu:“. Doplň ho jednou z hodnot „běží workflow <název>“, „zastaveno: <důvod ze seznamu>“, „hotovo“, nebo popisem dalšího kroku, a ten krok hned udělej." ;;
  běží*|bezi*|zastaveno*|hotovo*) exit 0 ;;
  *) block "Běh vize je aktivní (stav běhu: „${state}“) a nic neběží. Nezastavuj se: udělej další krok smyčky (spusť blok PRD nebo blok stavby, vyhodnoť došlý výsledek, nebo zapiš do handoffu „zastaveno: <důvod ze zavřeného seznamu>“ a napiš uživateli zprávu)." ;;
esac
