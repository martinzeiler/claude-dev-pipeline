#!/usr/bin/env bash
# Zapíše docs/.verify-passed: doklad, že nad TÍMTO pracovním stromem proběhla zelená plná brána
# (typecheck + celá suita). Volá ho jen verify agent po zelené. Pre-commit hook projektu může
# při shodě hashe plnou suitu přeskočit (typecheck a rychlé kontroly pouští dál).
# Použití: verify-marker.sh <cwd projektu> [cesta k logu brány]
set -euo pipefail
cwd=${1:?použití: verify-marker.sh <cwd> [log]}
log=${2:-}
cd "$cwd"
tree=$(bash "$(cd "$(dirname "$0")" && pwd)/tree-hash.sh" "$cwd")
mkdir -p docs
printf '{"tree":"%s","at":"%s","log":"%s"}\n' "$tree" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$log" > docs/.verify-passed
echo "$tree"
