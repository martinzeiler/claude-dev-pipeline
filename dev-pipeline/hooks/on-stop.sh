#!/usr/bin/env bash
# dev-pipeline Stop hook. Aktivní jen pro orchestrátorskou session (marker docs/.orchestrator-run
# se shodným session_id). Rozhoduje podle řádku „stav běhu:“ v docs/handoff.md:
#   běží …      → workflow nebo agent pracuje na pozadí, zastavení tahu je v pořádku, pokud žije cron kontroly stavu:
#                 razítko docs/.cron-od (epocha v sekundách, orchestrátor ho píše po CronCreate) chybí, nenese čas, nebo je
#                 starší než 6 dní → blokace s postupem obnovy cronu. Claude Code opakovaný cron po 7 dnech sám ruší
#                 a restart session ho ruší taky (razítko tehdy maže session-start-handoff.sh a setup); bez tiků stál běh
#                 hodiny bez dohledu a po každé mezeře nad hodinu padala cache orchestrátora.
#   zastaveno … → důvod ze zavřeného seznamu, čeká se na uživatele
#   hotovo      → finální fáze skončila
#   cokoli jiného nebo chybí → blokace s důvodem: běh nesmí stát bez rozjeté práce
# Při stop_hook_active (už jednou blokováno v témže tahu) pouští vždy, aby nevznikla smyčka.
# Během setupu běhu (scripts/orchestrate-setup.sh na pozadí) pouští vždy, bez ohledu na stav a razítko cronu: setup zapíše
# marker a handoff dřív, než commit s bránou doběhne, a orchestrátor na jeho výsledek čeká. Signál je příznak
# <adresář gitu>/dev-pipeline-setup-bezi, který setup drží po dobu běhu; příznak starší 30 minut (setup někdo zabil) neplatí.
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

gd=$(git -C "$proj" rev-parse --absolute-git-dir 2>/dev/null) || gd=""
if [ -n "$gd" ] && [ -f "$gd/dev-pipeline-setup-bezi" ] && [ -n "$(find "$gd/dev-pipeline-setup-bezi" -mmin -30 2>/dev/null)" ]; then
  exit 0
fi

block() { jq -n --arg r "dev-pipeline: $1" '{decision:"block",reason:$r}'; exit 0; }

handoff="$proj/docs/handoff.md"
state=""
if [ -f "$handoff" ]; then
  state=$(grep -m1 -iE '^[*_[:space:]]*stav běhu[*_[:space:]]*:' "$handoff" \
    | sed -E 's/^[^:]*:[[:space:]]*//; s/[*_]+//g; s/[[:space:]]+$//')
fi
low=$(printf '%s' "$state" | tr '[:upper:]' '[:lower:]')

# Stáří razítka cronu v sekundách; prázdné, když razítko chybí nebo nenese čas (jen číslice, nejvýš 12, ne z budoucnosti).
CRON_MAX=518400   # 6 dní: den rezervy před sedmidenním vypršením cronu
stari_cronu() {
  local od=""
  [ -f "$proj/docs/.cron-od" ] || return 0
  IFS= read -r od < "$proj/docs/.cron-od" || true
  od=$(printf '%s' "$od" | tr -d '[:space:]')
  case "$od" in ''|*[!0-9]*|?????????????*) return 0 ;; esac
  od=$(( $(date +%s) - 10#$od ))
  [ "$od" -ge 0 ] && printf '%s' "$od"
  return 0
}
cron_zije() {
  local s; s=$(stari_cronu)
  [ -n "$s" ] && [ "$s" -le "$CRON_MAX" ]
}
CRON_BLOK="Cron kontroly stavu chybí nebo do dne vyprší (razítko docs/.cron-od chybí, nenese čas, nebo je starší než 6 dní). Claude Code opakovaný cron po 7 dnech sám ruší a restart session ho ruší taky; bez tiků běh stojí bez dohledu a po mezeře nad hodinu padá cache. Udělej teď: CronList; starý cron kontroly stavu zruš (CronDelete); založ nový CronCreate se stejným promptem (každých 30 minut, prompt ze sekce Setup skillu orchestrate); pak zapiš razítko příkazem date +%s > docs/.cron-od"

case "$low" in
  "") block "Běh vize je aktivní, ale v docs/handoff.md chybí řádek „stav běhu:“. Doplň ho jednou z hodnot „běží workflow <název>“, „zastaveno: <důvod ze seznamu>“, „hotovo“, nebo popisem dalšího kroku, a ten krok hned udělej." ;;
  běží*|bezi*) cron_zije || block "$CRON_BLOK"; exit 0 ;;
  zastaveno*|hotovo*) exit 0 ;;
  *) block "Běh vize je aktivní (stav běhu: „${state}“) a nic neběží. Nezastavuj se: udělej další krok smyčky (spusť blok PRD nebo blok stavby, vyhodnoť došlý výsledek, nebo zapiš do handoffu „zastaveno: <důvod ze zavřeného seznamu>“ a napiš uživateli zprávu)." ;;
esac
