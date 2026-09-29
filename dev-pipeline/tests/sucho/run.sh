#!/usr/bin/env bash
# Suchý běh bloků dev-pipeline: všechny scénáře tests/sucho/scenare/*.mjs nad stubnutými agenty (bez tokenů) a na konci
# syntaktická kontrola bloků wf-check.mjs. Exit 0 jen když prošlo obojí.
# Použití: dev-pipeline/tests/sucho/run.sh [--vypis] [filtr …]   (SUCHO_BLOKY=<adresář> přehraje bloky odjinud)
set -u
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
plugin=$(cd "$here/../.." && pwd)
bloky=${SUCHO_BLOKY:-$plugin/workflows}

node "$here/harness.mjs" "$@"
rc_scenare=$?

echo
echo "wf-check:"
node "$plugin/scripts/wf-check.mjs" "$bloky"/*.js
rc_wf=$?

if [ "$rc_scenare" -eq 0 ] && [ "$rc_wf" -eq 0 ]; then
  echo "suchý běh: vše prošlo"
  exit 0
fi
echo "suchý běh: SELHÁNÍ (scénáře rc=$rc_scenare, wf-check rc=$rc_wf)"
exit 1
