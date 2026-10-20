#!/usr/bin/env bash
# dev-pipeline: zbytky řezu, který neprošel (mini-řez finální fáze s vysledek: selhalo), do patche a strom zpět na HEAD.
#
# Použití: zbytek-rezu.sh <cwd> <NN> [-- <cesta>...]
#   Bez cest: necommitnuté změny sledovaných souborů MIMO docs/ a netrackované negitignorované soubory mimo docs/.
#   Dokumenty běhu v docs/ (handoff, journal, follow-ups, vize-spory, PRD a scénáře) zůstávají: commitují se se závěrečnou
#   zprávou. S cestami za -- jen ty (smí i do docs/).
# Výsledek: docs/e2e/rez-NN-zbytek.patch (existující se nepřepisuje: -2, -3 …; sledované soubory a malé textové netrackované
#   jako nové soubory), pak strom vrácen: změněné a smazané soubory z HEAD, přidané do indexu odebrané, netrackované
#   z patche smazané. Obnova: git apply <patch>.
#   Netrackovaný soubor nad 1 MB nebo binární do patche nejde (patch se commitne se zprávou do historie vize větve; typicky
#   velký datový soubor měřidla): zůstane ve stromu nesmazaný a souhrn ho vypíše jako
#   „ponecháno, rozhodne majitel“.
# Na stdout souhrn (patch, soubory). Návratové kódy: 0 hotovo nebo nic k uložení; 2 špatné argumenty nebo není git repo;
#   3 patch se nepodařilo ověřit (strom beze změny); 4 vrácení stromu selhalo nebo ho git status nepotvrdil (patch je
#   uložený, souhrn vypíše, co zůstalo).
# Proč: po selhaném mini-řezu zůstávají ve stromu změněné konfigurační a datové soubory; guard zakazuje stash
# a majitel to dřív řešil ručně před mergem. Spouští ho orchestrátor, když žádný blok neběží (skill orchestrate).
# Seznamy souborů jdou přes -z a core.quotePath=false a operace nad nimi přes --literal-pathspecs: bez toho git cesty
# s diakritikou uzavře do uvozovek s oktalovými escapy, git restore pak selže na celé dávce a rm nic nesmaže (review 1.6.0 N7).
set -uo pipefail

[ $# -ge 2 ] || { echo "zbytek-rezu: použití: zbytek-rezu.sh <cwd> <NN> [-- <cesta>...]" >&2; exit 2; }
cwd=$1; nn=$2; shift 2
case "$nn" in ''|*[!0-9]*) echo "zbytek-rezu: číslo řezu '$nn' není číslo" >&2; exit 2 ;; esac
nn=$(printf '%02d' "$((10#$nn))")
cd "$cwd" 2>/dev/null && git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "zbytek-rezu: $cwd není git repo" >&2; exit 2; }
root=$(git rev-parse --show-toplevel); cd "$root" || exit 2

MAX_NETRACK=1048576   # 1 MB
g() { git -c core.quotePath=false "$@"; }              # výpisy se surovými cestami
gl() { git --literal-pathspecs -c core.quotePath=false "$@"; }   # operace nad výčtem konkrétních souborů

cesty=()
if [ $# -gt 0 ]; then
  [ "$1" = "--" ] && shift
  cesty=("$@")
fi
if [ ${#cesty[@]} -gt 0 ]; then rozsah=(-- "${cesty[@]}"); else rozsah=(-- . ':(exclude)docs'); fi

# Sledované změny proti HEAD (staged i unstaged). Přidané do indexu (A) se vrací odebráním z indexu a smazáním, ostatní
# (M, D, T, …) obnovou z HEAD. Přejmenování se bez --no-renames rozpadne na D + A, nebo D + netrackovaný (mv bez git mv).
sledovane=(); pridane=(); ostatni=()
while IFS= read -r -d '' st && IFS= read -r -d '' f; do
  [ -n "$f" ] || continue
  sledovane+=("$f")
  case "$st" in A*) pridane+=("$f") ;; *) ostatni+=("$f") ;; esac
done < <(g diff --name-status -z --no-renames HEAD "${rozsah[@]}")

# Netrackované negitignorované: malé textové do patche, ostatní ponechat (vnořené repo, binární, nad 1 MB).
netrack=(); ponechane=()
while IFS= read -r -d '' f; do
  [ -n "$f" ] || continue
  case "$f" in */) ponechane+=("$f (adresář nebo vnořené repo)"); continue ;; esac
  if [ ! -L "$f" ] && [ -f "$f" ]; then
    vel=$(wc -c < "$f" 2>/dev/null | tr -d ' '); vel=${vel:-0}
    if [ "$vel" -gt "$MAX_NETRACK" ]; then ponechane+=("$f ($vel B, nad 1 MB)"); continue; fi
    # Binární podle gitu: numstat dává „-<tab>-“.
    case "$(g diff --no-index --numstat -- /dev/null "$f" 2>/dev/null)" in -$'\t'-*) ponechane+=("$f (binární)"); continue ;; esac
  fi
  netrack+=("$f")
done < <(g ls-files -z --others --exclude-standard "${rozsah[@]}")

vypis_ponechane() {
  [ ${#ponechane[@]} -gt 0 ] || return 0
  echo "zbytek-rezu: ponecháno ve stromu, rozhodne majitel (není v patchi):"
  for p in "${ponechane[@]}"; do echo "  $p"; done
}

if [ ${#sledovane[@]} -eq 0 ] && [ ${#netrack[@]} -eq 0 ]; then
  echo "zbytek-rezu: řez $nn nemá necommitnuté zbytky k uložení v rozsahu ($([ ${#cesty[@]} -gt 0 ] && echo "${cesty[*]}" || echo 'mimo docs/')); nic neuloženo"
  vypis_ponechane
  exit 0
fi

mkdir -p docs/e2e
patch="docs/e2e/rez-$nn-zbytek.patch"; i=2
while [ -e "$patch" ]; do patch="docs/e2e/rez-$nn-zbytek-$i.patch"; i=$((i + 1)); done   # starší patch se nepřepisuje
tmp="$patch.$$"
{
  echo "# Zbytky řezu $nn, který neprošel ($(date -u +%Y-%m-%dT%H:%M:%SZ), HEAD $(git rev-parse --short HEAD))."
  echo "# Strom byl po uložení vrácen na HEAD. Obnova: git apply $patch"
  for f in ${sledovane[@]+"${sledovane[@]}"}; do echo "# změněný: $f"; done
  for f in ${netrack[@]+"${netrack[@]}"}; do echo "# netrackovaný: $f"; done
  for f in ${ponechane[@]+"${ponechane[@]}"}; do echo "# ponechaný ve stromu (není v patchi): $f"; done
  [ ${#sledovane[@]} -gt 0 ] && gl diff --binary --no-renames HEAD -- "${sledovane[@]}"
  for f in ${netrack[@]+"${netrack[@]}"}; do g diff --no-index --binary -- /dev/null "$f"; done
  true
} > "$tmp" 2>/dev/null
# Patch musí přesně popsat dnešní stav: obráceně jde aplikovat na strom (sledované i nové soubory).
if ! git apply --check -R "$tmp" 2>/dev/null; then
  rm -f "$tmp"
  echo "zbytek-rezu: patch zbytků řezu $nn se nepodařilo ověřit (git apply --check -R); strom nechávám beze změny" >&2
  exit 3
fi
mv -f "$tmp" "$patch"

# Vrácení po souborech: selhání jednoho nezastaví ostatní (dřív jeden neznámý pathspec shodil celou dávku git restore).
# Přidaný soubor, který je dál upravený, git rm --cached bez -f odmítne; git reset ho z indexu odebere vždy.
for f in ${pridane[@]+"${pridane[@]}"}; do gl reset -q -- "$f" >/dev/null 2>&1; rm -f -- "$f"; done
for f in ${ostatni[@]+"${ostatni[@]}"}; do gl restore --source=HEAD --staged --worktree -- "$f" >/dev/null 2>&1; done
for f in ${netrack[@]+"${netrack[@]}"}; do rm -f -- "$f"; done

# „Vráceno na HEAD“ jen s dokladem: git status nad dotčenými cestami musí být prázdný.
zbyle=()
dotcene=(${sledovane[@]+"${sledovane[@]}"} ${netrack[@]+"${netrack[@]}"})
while IFS= read -r -d '' z; do [ -n "$z" ] && zbyle+=("$z"); done < <(gl status --porcelain -z --untracked-files=all -- "${dotcene[@]}")

n=${#dotcene[@]}
if [ ${#zbyle[@]} -gt 0 ]; then
  echo "zbytek-rezu: patch $patch uložen (uložené soubory: $n), ale strom se nepodařilo vrátit na HEAD; zůstalo (git status --porcelain):" >&2
  for z in "${zbyle[@]}"; do echo "  $z" >&2; done
  vypis_ponechane >&2
  exit 4
fi
echo "zbytek-rezu: $patch, uložené soubory ($n): $(printf '%s, ' "${dotcene[@]}" | sed 's/, $//'); strom vrácen na HEAD (ověřeno git status)"
vypis_ponechane
exit 0
