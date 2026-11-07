#!/usr/bin/env bash
# Hlídá v scripts/*.sh a hooks/*.sh výskyt $jméno bezprostředně před ne-ASCII znakem: zsh i bash 3.2 v některých locale berou
# ne-ASCII bajt do jména proměnné (pod set -u pak „zprava\xe2: unbound variable“). Správný tvar je ${jméno}.
# Spusť: bash dev-pipeline/tests/skripty/promenne-pred-ne-ascii.sh
set -uo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); plugin=$(cd "$here/../.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/ne-ascii-test.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
ok() { pass=$((pass+1)); }; ko() { fail=$((fail+1)); echo "FAIL $*"; }
nalezy() {
  python3 -I - "$@" <<'PY'
import re, sys
vzor = re.compile(rb"\$[A-Za-z_][A-Za-z0-9_]*[\x80-\xff]")
for cesta in sys.argv[1:]:
    with open(cesta, "rb") as f:
        for n, radek in enumerate(f, 1):
            if vzor.search(radek):
                print(f"{cesta}:{n}: {radek.decode('utf-8', 'replace').strip()[:120]}")
PY
}
# detektor sám: past najde, ${jméno}, pozici $1 a mezeru před ne-ASCII nechá
cat > "$tmp/past.sh" <<'POD'
die "zprávou „$zprava“ a dál"
echo "$cesta→$cil"
POD
cat > "$tmp/cisty.sh" <<'POD'
die "zprávou „${zprava}“ a dál"
echo "$cesta →"
echo "$1→"
POD
[ "$(nalezy "$tmp/past.sh" | wc -l | tr -d ' ')" = 2 ] && ok || ko "detektor-past: $(nalezy "$tmp/past.sh")"
[ -z "$(nalezy "$tmp/cisty.sh")" ] && ok || ko "detektor-cisty: $(nalezy "$tmp/cisty.sh")"
# repo
o=$(nalezy "$plugin"/scripts/*.sh "$plugin"/hooks/*.sh); rc=$?
[ $rc -eq 0 ] && [ -z "$o" ] && ok || ko "repo: rc=$rc
$o"
echo "promenne-pred-ne-ascii: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
