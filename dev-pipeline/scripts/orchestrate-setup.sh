#!/usr/bin/env bash
# dev-pipeline: setup autonomního běhu vize. Spouští orchestrátor na začátku /dev-pipeline:orchestrate.
#   orchestrate-setup.sh <cesta k vizi>
# Co udělá (deterministicky, bez otázek):
#   1. ověří identitu orchestrátorské session (docs/.orchestrator-session od UserPromptSubmit hooku),
#   2. vyžaduje čistý pracovní strom (kromě vize samé, .gitignore a markerů běhu),
#   3. stav předchozí vize (handoff, journal, vize-spory, prd/, e2e/, zpráva, marker) přesune do docs/archive/<slug>/,
#      z follow-ups odloží přeškrtnuté položky; stejná vize = navázání, nic se nearchivuje,
#   4. doplní .gitignore, vytvoří větev vize/<slug> a stavové soubory,
#   5. zapíše marker docs/.orchestrator-run (JSON se session_id) a docs/handoff.md s tabulkou plánu z vize,
#   6. všechno (gitignore, vize, archiv, stavové soubory) commitne JEDNÍM commitem: projekty s pomalou
#      pre-commit bránou platí bránu jednou, ne čtyřikrát.
# Návratové kódy: 0 ok · 2 chybí předpoklad (zpráva na stderr) · 3 vize nemá sekci Plán řezů.
set -uo pipefail

die() { echo "orchestrate-setup: $*" >&2; exit 2; }
proj=$(git rev-parse --show-toplevel 2>/dev/null) || die "nejsi v git repozitáři"
cd "$proj" || die "nelze vstoupit do $proj"
[ $# -ge 1 ] || die "použití: orchestrate-setup.sh <cesta k vizi>"
vize_in=$1
case "$vize_in" in /*) vize_abs=$vize_in ;; *) vize_abs="$proj/$vize_in" ;; esac
[ -f "$vize_abs" ] || die "vize $vize_in neexistuje"
vize_rel=${vize_abs#"$proj"/}
slug=$(basename "$vize_abs" .md)
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
today=$(date +%Y-%m-%d)

# 1. identita session
sess_file="docs/.orchestrator-session"
[ -f "$sess_file" ] || die "chybí $sess_file: /dev-pipeline:orchestrate musí uživatel napsat jako prompt (hook si z něj uloží session_id); spuštěno jinak se běh nemá čeho chytit"
sid=$(jq -r '.session_id // empty' "$sess_file" 2>/dev/null)
[ -n "$sid" ] || die "$sess_file neobsahuje session_id"

# 2. čistý strom (vize, .gitignore a markery běhu smí být rozpracované), pak gitignore a vize do indexu
dirty=$(git status --porcelain --untracked-files=all | grep -v -E ' docs/(\.orchestrator-session|\.orchestrator-run|\.vize-done|\.review-passed|\.deploy-unlocked|\.verify-passed|reviews/)' \
  | grep -v -E '^.. \.gitignore$' | grep -v -F -- " $vize_rel" | grep -v -F -- " docs/vize/$slug/" || true)
[ -z "$dirty" ] || die "pracovní strom není čistý, běh startuje z čistého stavu:
$dirty"
obsah=""
gi_changed=0
for e in docs/.orchestrator-run docs/.orchestrator-session docs/.deploy-unlocked docs/.vize-done docs/.review-passed docs/.verify-passed docs/reviews/ "CLAUDE-SECURITY-*/"; do
  grep -qxF -- "$e" .gitignore 2>/dev/null || { echo "$e" >> .gitignore; gi_changed=1; }
done
if [ "$gi_changed" = 1 ] || [ -n "$(git status --porcelain -- .gitignore)" ]; then git add .gitignore; obsah="$obsah gitignore"; fi
if [ -n "$(git status --porcelain -- "$vize_rel" "docs/vize/$slug" 2>/dev/null)" ]; then
  git add -- "$vize_rel"; [ -d "docs/vize/$slug" ] && git add -- "docs/vize/$slug"
  obsah="$obsah vize"
fi

# 3. předchozí běh
old_slug=""
resume=0
if [ -f docs/.orchestrator-run ]; then
  old_slug=$(jq -r '.slug // empty' docs/.orchestrator-run 2>/dev/null || true)
fi
if [ -z "$old_slug" ]; then
  first_prd=$(ls docs/prd/*.md 2>/dev/null | head -1 || true)
  if [ -n "$first_prd" ]; then
    old_slug=$(sed -n 's/^vize:[[:space:]]*//p' "$first_prd" | head -1 | xargs -n1 basename 2>/dev/null | sed 's/\.md$//')
  fi
fi
if [ -z "$old_slug" ] && [ -f docs/handoff.md ]; then
  old_slug=$(sed -n 's/^# Běh vize[[:space:]]*//p' docs/handoff.md | head -1)
fi
stare=""
for f in docs/handoff.md docs/journal.md docs/vize-spory.md docs/zaverecna-zprava.md docs/.orchestrator-run; do [ -e "$f" ] && stare="$stare $f"; done
ls docs/prd/*.md >/dev/null 2>&1 && stare="$stare docs/prd"
ls docs/e2e/*.md >/dev/null 2>&1 && stare="$stare docs/e2e"

if [ -n "$stare" ]; then
  if [ "$old_slug" = "$slug" ]; then
    resume=1
    echo "navázání: v projektu je stav téže vize ($slug), nic se nearchivuje"
  else
    [ -n "$old_slug" ] || old_slug="predchozi-$today"
    arch="docs/archive/$old_slug"
    mkdir -p "$arch"
    for f in $stare; do
      base=$(basename "$f")
      if [ -d "$f" ]; then
        mkdir -p "$arch/$base"
        for g in "$f"/*.md; do
          if git ls-files --error-unmatch "$g" >/dev/null 2>&1; then git mv -k "$g" "$arch/$base/"; else mv "$g" "$arch/$base/"; fi
        done
      else
        if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then git mv -k "$f" "$arch/$base"; else mv "$f" "$arch/$base"; fi
      fi
    done
    if [ -f docs/follow-ups.md ] && grep -q '~~' docs/follow-ups.md; then
      grep '~~' docs/follow-ups.md >> "$arch/follow-ups-uzavrene.md"
      grep -v '~~' docs/follow-ups.md > docs/follow-ups.tmp && mv docs/follow-ups.tmp docs/follow-ups.md
    fi
    rm -f docs/.vize-done docs/.review-passed docs/.deploy-unlocked
    git add -A docs/archive docs/follow-ups.md 2>/dev/null
    git add -A docs/prd docs/e2e docs/handoff.md docs/journal.md docs/vize-spory.md docs/zaverecna-zprava.md 2>/dev/null
    obsah="$obsah archiv:$old_slug"
    echo "archiv: $old_slug → $arch"
  fi
fi

# 4. větev, stavové soubory
branch="vize/$slug"
if git show-ref --verify --quiet "refs/heads/$branch"; then
  git checkout -q "$branch" || die "přepnutí na $branch selhalo (rozpracované změny vize/gitignore se s větví bijí); commitni je ručně a spusť setup znovu"
else
  git checkout -q -b "$branch" || die "vytvoření větve $branch selhalo"
fi
echo "větev: $branch"

mkdir -p docs/prd docs/e2e docs/reviews
[ -f docs/follow-ups.md ] || printf '# Follow-ups\n\nKontinuální backlog napříč vizemi. Jedna odrážka = jedna položka s kontextem; vyřešené se přeškrtávají s `VYŘEŠENO <datum>: <čím>`.\n' > docs/follow-ups.md
[ -f docs/journal.md ] || printf '# Deník běhu vize %s\n\nZačátek %s.\n' "$slug" "$today" > docs/journal.md
[ -f docs/vize-spory.md ] || printf '# Spory a předpoklady k vizi %s\n\nZapisuje kdokoli v běhu. Formát: datum | řez | agent · Rozpor · Jak jsem se zachoval · Co by to rozhodlo.\n' "$slug" > docs/vize-spory.md

# 5. marker a handoff
jq -n --arg s "$sid" --arg t "$now" --arg v "$vize_rel" --arg g "$slug" --arg b "$branch" \
  '{session_id:$s, started:$t, vize:$v, slug:$g, branch:$b}' > docs/.orchestrator-run
rm -f "$sess_file"

rc=0
if [ "$resume" = 1 ] && [ -f docs/handoff.md ]; then
  sed -i '' -E "s/^(session:).*/\1 $sid/" docs/handoff.md 2>/dev/null || true
  echo "handoff: ponechán (navázání), $(wc -c < docs/handoff.md | tr -d ' ') B"
  git add docs/handoff.md 2>/dev/null
  zprava="běh: navázání vize $slug"
else
  plan=$(awk 'BEGIN{p=0} /^#{1,4} /{ if (p) exit; if (tolower($0) ~ /pl[aá]n [rř]ez/) {p=1; next} } p{print}' "$vize_abs")
  radku=$(printf '%s\n' "$plan" | grep -c '^|' || true)
  if [ -z "$plan" ] || [ "$radku" -lt 3 ]; then
    plan="PLÁN NENALEZEN: vize nemá sekci „Plán řezů“ s tabulkou. Bez plánu běh nestartuje; doplň ho ve /vize session."
    rc=3
  fi
  {
    printf '# Běh vize %s\n' "$slug"
    printf 'stav běhu: čeká: výběr prvního řezu\n'
    printf 'branch: %s · vize: %s · start: %s\nsession: %s\n\n' "$branch" "$vize_rel" "$today" "$sid"
    printf '## Plán (živá kopie; výchozí z vize, sloupec stav a pozn. vede orchestrátor)\n\n%s\n\n' "$plan"
    printf '## Změny plánu\n\n(zatím žádné)\n\n## Poznámky pro navázání\n\n(prázdné)\n'
  } > docs/handoff.md
  echo "handoff: nový, $(wc -c < docs/handoff.md | tr -d ' ') B, řádků plánu: $((radku > 2 ? radku - 2 : 0))"
  zprava="běh: start vize $slug"
fi
# 6. jediný commit: gitignore + vize + archiv + stavové soubory
git add docs/handoff.md docs/journal.md docs/vize-spory.md docs/follow-ups.md 2>/dev/null
if ! git diff --cached --quiet; then
  [ -n "$obsah" ] && zprava="$zprava (${obsah# })"
  git commit -q -m "$zprava" || die "commit selhal (pre-commit brána?); oprav a spusť setup znovu"
  echo "commit: $zprava"
fi

# varování
vsize=$(wc -c < "$vize_abs" | tr -d ' ')
[ "$vsize" -gt 122880 ] && echo "varování: vize má $vsize B, strop těla je ~120 kB (40k tokenů)"
if [ -f CLAUDE.md ]; then cl=$(wc -l < CLAUDE.md | tr -d ' '); [ "$cl" -gt 400 ] && echo "varování: CLAUDE.md projektu má $cl řádků (doporučený strop 400), každý agent ho nese v preambuli"; fi
hs=$(wc -c < docs/handoff.md | tr -d ' '); [ "$hs" -gt 4096 ] && echo "varování: handoff má $hs B, po compactu se injektují jen první 4 096 B"
echo "marker: docs/.orchestrator-run (session $sid, start $now)"
echo "hotovo: rc=$rc"
exit $rc
