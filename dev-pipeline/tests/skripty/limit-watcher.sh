#!/usr/bin/env bash
# Testy scripts/limit-watcher.sh bez skutečného tmuxu. Vzor hlášky přes režim --je-limit (text na stdin, kód 0 = limit):
# týdenní limit hlásí „You've hit your weekly limit · resets …“, obecný „You've hit your limit · resets …“, pětihodinový
# „5-hour limit reached ∙ resets …“; starší vzor první tvar bez slova mezi „your“ a „limit“ a tvary s oddělovačem nenašel
# a hlídač by session po resetu nenakopl. Varování před limitem a český stav běhu hlídač spustit nesmí.
# Smyčka hlídače se stubem tmux v PATH: při limitu a nečinné session pošle Enter a „pokračuj“, během práce nic.
# Spusť: bash dev-pipeline/tests/skripty/limit-watcher.sh
set -uo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); plugin=$(cd "$here/../.." && pwd)
skript="$plugin/scripts/limit-watcher.sh"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/limit-watcher-test.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
ok() { pass=$((pass+1)); }; ko() { fail=$((fail+1)); echo "FAIL $*"; }

najde() { printf '%s' "$1" | bash "$skript" --je-limit; }

# hlášky vyčerpaného limitu: dnešní tvary (týdenní, obecný, pětihodinový, limit modelu, s oddělovačem) i starší
while IFS= read -r h; do
  [ -n "$h" ] || continue
  najde "$h" && ok || ko "limit nenalezen: $h"
done <<'EOF'
You've hit your weekly limit · resets Nov 18 at 12pm (Europe/Prague)
You've hit your limit · resets 3pm (Europe/Prague)
You've hit your session limit · resets 3pm
 ⎿  You've hit your 5-hour limit · resets 9:30pm (Europe/Prague)
You've hit your Opus limit · resets Mon 9am
5-hour limit reached ∙ resets 10pm
Weekly limit reached ∙ resets Nov 18, 12pm
Claude usage limit reached. Your limit will reset at 5pm (Europe/Prague).
EOF

# co limit není: běžící práce, český stav běhu, varování před limitem, výpis co-dela
while IFS= read -r h; do
  [ -n "$h" ] || continue
  najde "$h" && ko "falešný limit: $h" || ok
done <<'EOF'
✻ Spouštím blok stavby řezu 05… (esc to interrupt)
stav běhu: zastaveno: limit účtu do 18. 11. 12:00
▶ stavba řez 05 · běží 1 h 12 min · fáze 3/9 Review
Approaching weekly limit · resets Nov 18 at 12pm
strop forků z fronty těžkých příkazů se k vitestu nedostane
EOF

# hláška uprostřed obsahu pane (víc řádků), jak ji čte hlídač
pane=$(printf '%s\n' '⏺ Blok stavby řezu 14b běží.' "  ⎿  You've hit your weekly limit · resets Nov 18 at 12pm (Europe/Prague)" '' '> ')
najde "$pane" && ok || ko "limit v obsahu pane nenalezen"

# smyčka hlídače: stub tmux vypíše obsah pane jednou, podruhé hlásí zaniklou session (hlídač skončí); send-keys loguje
mkdir -p "$tmp/bin"
cat > "$tmp/bin/tmux" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  capture-pane) [ -e "$STUB_DIR/precteno" ] && exit 1; : > "$STUB_DIR/precteno"; cat "$STUB_DIR/pane" ;;
  send-keys) shift; printf '%s\n' "$*" >> "$STUB_DIR/klavesy" ;;
esac
STUB
chmod +x "$tmp/bin/tmux"
hlidac() { # obsah pane → $klavesy (odeslané klávesy, každé volání send-keys jeden řádek)
  local d="$tmp/beh-$1"; mkdir -p "$d"; printf '%s\n' "$2" > "$d/pane"
  (cd "$d" && STUB_DIR="$d" PATH="$tmp/bin:$PATH" gtimeout 30 bash "$skript" pipeline 0 >/dev/null 2>&1); rc=$?
  klavesy=$(cat "$d/klavesy" 2>/dev/null)
}
hlidac necinna "$pane"
[ $rc -eq 0 ] && [ "$klavesy" = "$(printf '%s\n' '-t pipeline Enter' '-t pipeline pokračuj Enter')" ] && ok || ko "smycka-necinna: rc=$rc klávesy: $klavesy"
hlidac pracuje "$(printf '%s\n' "You've hit your limit · resets 3pm" '✻ Přemýšlím… (esc to interrupt)')"
[ $rc -eq 0 ] && [ -z "$klavesy" ] && ok || ko "smycka-pracuje: rc=$rc klávesy: $klavesy"
hlidac bez-limitu "$(printf '%s\n' '⏺ Blok stavby řezu 14b běží.' '> ')"
[ $rc -eq 0 ] && [ -z "$klavesy" ] && ok || ko "smycka-bez-limitu: rc=$rc klávesy: $klavesy"

echo "limit-watcher: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
