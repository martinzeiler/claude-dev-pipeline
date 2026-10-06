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

# Testy skriptů orchestrátora (args-bloku.py, zbytek-rezu.sh) v dočasných adresářích; bez filtru scénářů.
rc_skripty=0
if [ "$#" -eq 0 ]; then
  for t in "$plugin"/tests/skripty/*.sh; do
    echo
    echo "skripty: $(basename "$t")"
    bash "$t" || rc_skripty=1
  done
fi

if [ "$rc_scenare" -eq 0 ] && [ "$rc_wf" -eq 0 ] && [ "$rc_skripty" -eq 0 ]; then
  echo "suchý běh: vše prošlo"
  exit 0
fi
echo "suchý běh: SELHÁNÍ (scénáře rc=$rc_scenare, wf-check rc=$rc_wf, skripty rc=$rc_skripty)"
exit 1
