#!/usr/bin/env bash
# Zapíše docs/.verify-passed: doklad, že nad TÍMTO pracovním stromem proběhla zelená plná brána
# (typecheck + celá suita). Volá ho jen verify agent po zelené. Pre-commit hook projektu může
# při shodě hashe plnou suitu přeskočit (typecheck a rychlé kontroly pouští dál).
# Použití: verify-marker.sh <cwd projektu> [cesta k logu brány]
#
# Přenos markeru při zvednutí verze buildu po bráně (volá deploy):
#   verify-marker.sh --zvedni <cwd> <soubor> <stary> <novy>
# Nahradí v souboru literál stary za novy. Omezení na token drží záruku, že se změní jen verze, ne chování, takže doklad
# brány platí dál. Když marker seděl se stromem před náhradou, zapíše nový {tree, at, log, zvednuti: {z, soubor}} a vypíše
# „marker přenesen“. Když marker chybí nebo neseděl, nechá ho a vypíše „marker nesedí“; pre-commit pak pustí suitu. Oba
# případy kód 0. Kód 3 (důvod na stderr, nic se nezmění): soubor pod docs/, pod .git/, mimo repo nebo neexistuje, stary
# není v souboru přesně jednou, stary nebo novy nesplní ^[A-Za-z0-9._:-]+$ nebo nenese číslici (false → true není verze).
set -euo pipefail
if [ "${1:-}" = --zvedni ]; then
  shift
  exec python3 -I - "$(cd "$(dirname "$0")" && pwd)/tree-hash.sh" "$@" <<'PY'
import json, os, re, subprocess, sys, time

def odmitni(duvod):
    print(f"verify-marker --zvedni: {duvod}; nic se nezměnilo", file=sys.stderr)
    sys.exit(3)

def nesedi(duvod=None):
    if duvod:
        print(f"verify-marker --zvedni: {duvod}", file=sys.stderr)
    print("marker nesedí")
    sys.exit(0)

def prikaz(*argv):
    return subprocess.run(argv, capture_output=True, text=True, check=True).stdout

tree_hash, argv = sys.argv[1], sys.argv[2:]
if len(argv) != 4:
    odmitni("použití: verify-marker.sh --zvedni <cwd> <soubor> <stary> <novy>")
cwd, soubor, stary, novy = argv
for jmeno, token in (("stary", stary), ("novy", novy)):
    if not re.fullmatch(r"[A-Za-z0-9._:-]+", token):
        odmitni(f"{jmeno} {token!r} nesplňuje ^[A-Za-z0-9._:-]+$")
    if not re.search(r"[0-9]", token):
        odmitni(f"{jmeno} {token!r} nenese číslici, to není verze")
try:
    os.chdir(cwd)
    root = os.path.realpath(prikaz("git", "rev-parse", "--show-toplevel").strip())
except (OSError, subprocess.CalledProcessError):
    odmitni(f"{cwd} není adresář v git repu")

# realpath po chdir: relativní cesta platí od cwd, „..“ i symlink mimo repo nebo do docs/ se rozřeší dřív, než se posuzují
cil = os.path.realpath(soubor)
if not cil.startswith(root + os.sep):
    odmitni(f"{soubor} je mimo repo")
if not os.path.isfile(cil):
    odmitni(f"{soubor} neexistuje")
# samefile: na macOS je Docs/ totéž co docs/. Docs v kořeni repa tree-hash.sh nepočítá, docs v cwd nese sám marker.
zakazane = [os.path.join(d, n) for d, n in ((root, "docs"), (os.getcwd(), "docs"), (root, ".git")) if os.path.exists(os.path.join(d, n))]
p = cil
while p != root:
    p = os.path.dirname(p)
    if any(os.path.samefile(p, z) for z in zakazane):
        odmitni(f"{soubor} je pod {os.path.basename(p)}/")

with open(cil, "rb") as f:
    data = f.read()
hledany, vyskytu = stary.encode(), 0
# i překrývající se výskyty: 1.1 je v 1.1.1 dvakrát, str.count by našel jeden a vybral za volajícího
i = data.find(hledany)
while i >= 0:
    vyskytu += 1
    i = data.find(hledany, i + 1)
if vyskytu != 1:
    odmitni(f"{stary} je v {soubor} {vyskytu}×, musí být přesně jednou")

try:
    pred = prikaz("bash", tree_hash, os.getcwd()).strip()
except (OSError, subprocess.CalledProcessError):
    odmitni("strom před náhradou se nespočítal")
marker = os.path.join("docs", ".verify-passed")
try:
    with open(marker, encoding="utf-8") as f:
        stary_marker = json.load(f)
except (OSError, ValueError):
    stary_marker = None

with open(cil, "wb") as f:
    f.write(data.replace(hledany, novy.encode()))

if not (isinstance(stary_marker, dict) and stary_marker.get("tree") == pred):
    nesedi()
rel = os.path.relpath(cil, root)
try:
    po = prikaz("bash", tree_hash, os.getcwd()).strip()
    zmeny = prikaz("git", "diff-tree", "-r", "-z", "--name-only", "--no-renames", pred, po).split("\0")
except (OSError, subprocess.CalledProcessError):
    nesedi("strom po náhradě se nespočítal, marker zůstává")
# Strom mezi oběma výpočty smí změnit jen tahle náhrada: cizí změna by dostala doklad brány, která ji neměřila.
if set(zmeny) - {"", rel}:
    nesedi(f"strom se změnil i mimo {rel}, marker zůstává")
with open(marker, "w", encoding="utf-8") as f:
    json.dump({"tree": po, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "log": stary_marker.get("log", ""),
               "zvednuti": {"z": pred, "soubor": rel}}, f, ensure_ascii=False, separators=(",", ":"))
    f.write("\n")
print("marker přenesen")
PY
fi
cwd=${1:?použití: verify-marker.sh <cwd> [log]}
log=${2:-}
cd "$cwd"
tree=$(bash "$(cd "$(dirname "$0")" && pwd)/tree-hash.sh" "$cwd")
mkdir -p docs
printf '{"tree":"%s","at":"%s","log":"%s"}\n' "$tree" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$log" > docs/.verify-passed
echo "$tree"
