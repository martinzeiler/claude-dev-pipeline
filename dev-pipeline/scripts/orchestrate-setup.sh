#!/usr/bin/env bash
# dev-pipeline: setup autonomního běhu vize. Spouští orchestrátor na začátku /dev-pipeline:orchestrate.
#   orchestrate-setup.sh <cesta k vizi>
# Co udělá (deterministicky, bez otázek):
#   1. ověří identitu orchestrátorské session (docs/.orchestrator-session od UserPromptSubmit hooku),
#   2. vyžaduje čistý pracovní strom (kromě vize samé, .gitignore a markerů běhu),
#   3. stav předchozí vize (handoff, journal, vize-spory, prd/, e2e/, zpráva, marker) přesune do docs/archive/<slug>/,
#      reporty z docs/reviews/ do docs/reviews/_archiv/<slug>/, z follow-ups odloží přeškrtnuté položky;
#      stejná vize = navázání, nic se nearchivuje,
#   4. doplní .gitignore (a .prettierignore, když projekt prettier používá), vytvoří větev vize/<slug>, stavové soubory
#      a založí docs/follow-ups.md, docs/pojmy.md a docs/rozhodnuti.md, když chybí,
#   5. zapíše marker docs/.orchestrator-run (JSON se session_id) a docs/handoff.md s tabulkou plánu z vize,
#   6. všechno (gitignore, vize, archiv, stavové soubory) commitne JEDNÍM commitem: projekty s pomalou
#      pre-commit bránou platí bránu jednou, ne čtyřikrát,
#   7. vypíše mapu sekcí vize (řádky) pro orchestrátora, stav nastavení Claude Code, na kterém běh závisí
#      (autoContinueAtUsageLimit, zápis do ~/dev-pipeline-feedback.md ze sandboxu; autocompact jen jako informace,
#      varuje nad 400k; do ~/.claude nezapisuje, jen hlásí), a varování o velikosti souborů.
# Návratové kódy: 0 ok · 2 chybí předpoklad (zpráva na stderr) · 3 vize nemá sekci Plán řezů.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)

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
# příkazová řádka procesu claude (zapisuje hook prompt-submit.sh; hook běží mimo sandbox, setup v Bash sandboxu ps nevidí)
claude_args=$(jq -r '.claude_args // empty' "$sess_file" 2>/dev/null)

# 2. čistý strom (vize, .gitignore, markery a stavové soubory běhu smí být rozpracované), pak gitignore a vize do indexu
dirty=$(git status --porcelain --untracked-files=all | grep -v -E ' docs/(\.orchestrator-session|\.orchestrator-run|\.vize-done|\.review-passed|\.deploy-unlocked|\.verify-passed|\.kontext\.jsonl|\.run-args\.json|\.stavba-[^/]*\.json|\.prd-[^/]*\.json|\.kolecko\.json|\.vysledek-stavba-[^/]*\.json|\.vysledek-kolecko\.json|reviews/)' \
  | grep -v -E '^.. \.gitignore$' | grep -v -F -- " $vize_rel" | grep -v -F -- " docs/vize/$slug/" || true)
[ -z "$dirty" ] || die "pracovní strom není čistý, běh startuje z čistého stavu:
$dirty"
obsah=""
gi_changed=0
# docs/.kontext.jsonl píše hlídač kontextu (a session-start-handoff compacty orchestrátora), docs/.run-args.json a args bloků
# (docs/.stavba-*.json, docs/.prd-*.json, docs/.kolecko.json) orchestrátor přes scripts/args-bloku.py; bloky je čtou
# načítacím agentem a po compactu z nich orchestrátor navazuje. docs/.vysledek-stavba-*.json píše uzavření řezu (i seznamy
# zastaveného bloku, -zastaveno.json), docs/.vysledek-kolecko.json závěr kolečka.
# docs/e2e/*-vykon/ jsou surové výstupy měřidel (JSON, HAR, snímky); do commitu jde jen doklad se souhrnem.
for e in docs/.orchestrator-run docs/.orchestrator-session docs/.deploy-unlocked docs/.vize-done docs/.review-passed docs/.verify-passed docs/reviews/ docs/.kontext.jsonl docs/.run-args.json "docs/.stavba-*.json" "docs/.prd-*.json" docs/.kolecko.json "docs/.vysledek-stavba-*.json" docs/.vysledek-kolecko.json "docs/e2e/*-vykon/" "CLAUDE-SECURITY-*/"; do
  grep -qxF -- "$e" .gitignore 2>/dev/null || { echo "$e" >> .gitignore; gi_changed=1; }
done
if [ "$gi_changed" = 1 ] || [ -n "$(git status --porcelain -- .gitignore)" ]; then git add .gitignore; obsah="$obsah gitignore"; fi
# .prettierignore: stavové soubory běhu a výstupy agentů, když projekt prettier používá. Píší je agenti za běhu;
# formátovací pre-check deploye by je přeformátoval a necommitnutou práci orchestrátora zničil.
if ls .prettierrc* >/dev/null 2>&1 || grep -q '"prettier"' package.json 2>/dev/null; then
  pi_changed=0
  for e in docs/handoff.md docs/journal.md docs/vize-spory.md docs/follow-ups.md docs/zaverecna-zprava.md docs/prd/ docs/e2e/ docs/reviews/ docs/archive/; do
    if ! grep -qxF -- "$e" .prettierignore 2>/dev/null; then
      [ "$pi_changed" = 0 ] && printf '\n# dev-pipeline: stavové soubory běhu a výstupy agentů (píší je agenti za běhu; přeformátování by zničilo necommitnutou práci)\n' >> .prettierignore
      echo "$e" >> .prettierignore; pi_changed=1
    fi
  done
  if [ "$pi_changed" = 1 ]; then git add .prettierignore; obsah="$obsah prettierignore"; echo "prettierignore: doplněny stavové soubory běhu"; fi
fi
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
    # Odkazy z kódu a z follow-ups na docs/prd a docs/e2e minulých vizí přepíše na archiv vize, ve které vznikly, dřív než
    # se dokumenty přesunou: jinak pre-commit brána odmítne commit setupu kvůli odkazům na přesunuté soubory, nebo odkaz
    # tiše ukazuje na stejnojmenný dokument pozdější vize. Změny skript dá do indexu.
    python3 -I "$here/odkazy-archivu.py" "$proj" "$old_slug" "$vize_rel" || echo "odkazy na archiv: kontrola selhala, odkazy zůstaly beze změny"
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
    # reporty předchozí vize (gitignorované) stranou, ať se jména řezů dvou vizí v docs/reviews nemíchají
    if ls docs/reviews/*.md >/dev/null 2>&1; then
      mkdir -p "docs/reviews/_archiv/$old_slug"
      mv docs/reviews/*.md "docs/reviews/_archiv/$old_slug/" 2>/dev/null || true
      echo "reporty: docs/reviews/*.md → docs/reviews/_archiv/$old_slug/"
    fi
    # měření kontextu a args bloků předchozí vize (gitignorované) tamtéž: souhrn kontextu v co-dela i args po compactu
    # patří jen k běžící vizi
    for f in docs/.kontext.jsonl docs/.run-args.json docs/.stavba-*.json docs/.prd-*.json docs/.kolecko.json docs/.vysledek-stavba-*.json docs/.vysledek-kolecko.json; do
      [ -f "$f" ] || continue
      mkdir -p "docs/reviews/_archiv/$old_slug"; mv "$f" "docs/reviews/_archiv/$old_slug/${f#docs/.}"
    done
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
[ -f docs/follow-ups.md ] || printf '# Follow-ups\n\nKontinuální backlog napříč vizemi. Jedna odrážka = jedna položka: `[řez NN · <oblast>] [<osud>] text` (osud: rozhodnutí, oprava, nápad, obsah); vyřešené se přeškrtávají s `VYŘEŠENO <datum>: <čím>`. Přehled dává `scripts/follow-ups.py <cwd>` z pluginu, celý soubor nikdo nečte.\n' > docs/follow-ups.md
# Slovník a rozhodnutí projektu (TVAR-DOKUMENTU, sekce Pojmy a rozhodnutí): píše je vize session (pojmy i sklizeň běhu),
# během běhu jsou jen ke čtení; paměť Claude Code tím přestává být úložištěm rozhodnutí.
[ -f docs/pojmy.md ] || printf '# Pojmy projektu\n\nTermíny projektu, u každého 1–2 věty bez cest k souborům. Píše vize session a sklizeň běhu (nové termíny z kostry PRD); během běhu jen ke čtení.\n' > docs/pojmy.md
[ -f docs/rozhodnuti.md ] || printf '# Rozhodnutí projektu\n\nDatovaná rozhodnutí s „proč“ a „místo čeho“ (R1, R2, …). Nové rozhodnutí staré označí „překonáno <datum> kým“, nikdy ho nepřepíše. Píše jen vize session; během běhu jen ke čtení.\n' > docs/rozhodnuti.md
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
  # Sekce „Plán řezů“ končí až na nadpisu stejné nebo vyšší úrovně (podnadpisy uvnitř ji nekončí, jinak by parser
  # skončil na prvním podnadpisu a hlásil PLÁN NENALEZEN). Plán je tabulka se sloupcem „#“; sekce může mít i jiné tabulky.
  sekce=$(awk 'BEGIN{p=0;lvl=0} /^#{1,4} /{ if (p) { match($0,/^#+/); if (RLENGTH<=lvl) exit } else if (tolower($0) ~ /pl[aá]n [rř]ez/) { match($0,/^#+/); lvl=RLENGTH; p=1; next } } p{print}' "$vize_abs")
  plan=$(printf '%s\n' "$sekce" | awk '
    function konec() { if (inb) { if (chosen == "" && first ~ /^\|[[:space:]]*#[[:space:]]*\|/) chosen = blk; else if (fallback == "" && n >= 3) fallback = blk } inb = 0; blk = ""; n = 0 }
    /^\|/ { if (!inb) { inb = 1; first = $0 } blk = blk $0 "\n"; n++; next }
    { konec() }
    END { konec(); printf "%s", (chosen != "" ? chosen : fallback) }')
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
git add docs/handoff.md docs/journal.md docs/vize-spory.md docs/follow-ups.md docs/pojmy.md docs/rozhodnuti.md 2>/dev/null
if ! git diff --cached --quiet; then
  [ -n "$obsah" ] && zprava="$zprava (${obsah# })"
  git commit -q -m "$zprava" || die "commit selhal (pre-commit brána?). Archiv, stavové soubory a přepsané odkazy zůstaly v indexu a docs/.orchestrator-run existuje, takže pouhé nové spuštění setupu neprojde na čistém stromu. Oprav příčinu podle výstupu brány (kód opravuje uživatel nebo jiná session, orchestrátor ne), commitni index zprávou „$zprava“ a napiš znovu /dev-pipeline:orchestrate $vize_rel: setup vizi naváže."
  echo "commit: $zprava"
fi

# 7. mapa sekcí vize: orchestrátor čte sekce po řádcích (sed -n), Funkční požadavky a Tvar UI jsou pro PRD agenty
echo "sekce vize (řádky od-do; orchestrátor čte všechny kromě označených, ty jsou pro PRD agenty):"
awk '/^## /{ if (h != "") vypis(st, NR - 1, h); st = NR; h = $0 } END { if (h != "") vypis(st, NR, h) }
  function vypis(a, b, t,   l) { l = tolower(t); printf "  %d-%d  %s%s\n", a, b, t, (l ~ /funk|tvar ui|ui plochy/ ? "   (PRD agentům, orchestrátor nečte)" : "") }' "$vize_abs"

# nastavení Claude Code, na kterém běh závisí: jen kontrola a výpis, skript do ~/.claude nezapisuje
cfgdir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"; sfile="$cfgdir/settings.json"; chybi=""
if [ "$(jq -r '.autoContinueAtUsageLimit // empty' "$sfile" 2>/dev/null)" = "true" ]; then echo "nastavení: autoContinueAtUsageLimit: true"
else echo "nastavení: autoContinueAtUsageLimit CHYBÍ (Workflow po usage limitu nepokračuje): do $sfile přidej \"autoContinueAtUsageLimit\": true"; chybi="$chybi;autoContinueAtUsageLimit"; fi
# Zápis do feedback souboru: sandbox může zapínat i projekt (.claude/settings.local.json) a user settings pak allowWrite
# nemají; setup běží v témže sandboxu jako orchestrátor, takže zkušební zápis měří přesně to, co orchestrátor potká.
fb="$HOME/dev-pipeline-feedback.md"
if [ -e "$fb" ]; then { : >> "$fb"; } 2>/dev/null; fbrc=$?
else { : >> "$fb"; } 2>/dev/null; fbrc=$?; [ "$fbrc" = 0 ] && rm -f "$fb"; fi
if [ "$fbrc" = 0 ]; then echo "nastavení: zápis do ~/dev-pipeline-feedback.md funguje"
else echo "nastavení: zápis do ~/dev-pipeline-feedback.md SELHAL (sandbox bez allowWrite): přidej \"~/dev-pipeline-feedback.md\" do sandbox.filesystem.allowWrite v nastavení, které sandbox zapíná"; chybi="$chybi;zápis do ~/dev-pipeline-feedback.md (sandbox bez allowWrite)"; fi
# Autocompact orchestrátora: bez stropu roste kontext k 1 M a compact na plném okně ztrácí víc; stav je na disku, compact
# kolem 370 k proběhl za běh dvakrát bez ztráty. Práh se hledá v příkazové řádce procesu claude z docs/.orchestrator-session
# (hook), v přepínači procesu podle CLAUDE_PID (bez sandboxu), v env, v settings nahoře i per model (modelSettings.<model>,
# kam ho ukládá /autocompact; model ze settings.model bez přípony [1m], jinak první model s prahem). Bez nalezeného prahu
# je to chybějící nastavení s příkazem: /autocompact v session by zůstal trvale a stropoval i ruční sessions.
ac=""; acz=""
ac_z() { printf '%s' "$1" | sed -nE 's/.*--autocompact[= ]+([0-9]+[kK]?).*/\1/p'; }
if [ -n "$claude_args" ]; then ac=$(ac_z "$claude_args"); [ -n "$ac" ] && acz="claude --autocompact"; fi
if [ -z "$ac" ] && [ -n "${CLAUDE_PID:-}" ]; then
  ac=$(ac_z "$(ps -o args= -p "$CLAUDE_PID" 2>/dev/null)")
  [ -n "$ac" ] && acz="claude --autocompact"
fi
if [ -z "$ac" ] && [ -n "${CLAUDE_CODE_AUTO_COMPACT_WINDOW:-}" ]; then ac=$CLAUDE_CODE_AUTO_COMPACT_WINDOW; acz="env CLAUDE_CODE_AUTO_COMPACT_WINDOW"; fi
if [ -z "$ac" ]; then ac=$(jq -r '.autoCompactWindow // empty' "$sfile" 2>/dev/null); [ -n "$ac" ] && acz="settings autoCompactWindow"; fi
if [ -z "$ac" ]; then
  acm=$(jq -r '(.model // "" | sub("\\[.*$"; "")) as $m | (.modelSettings // {}) | to_entries | map(select(.value.autoCompactWindow? != null)) | (map(select(.key == $m)) + .) | first // empty | "\(.key) \(.value.autoCompactWindow)"' "$sfile" 2>/dev/null)
  if [ -n "$acm" ]; then ac=${acm#* }; acz="settings modelSettings.${acm%% *}.autoCompactWindow, stropuje i ruční sessions na tom modelu"; fi
fi
acn=${ac%[kK]}; case "$acn" in ''|*[!0-9]*) acn="" ;; esac
[ -n "$acn" ] && [ "$acn" != "$ac" ] && acn=$((acn * 1000))
if [ -z "$acn" ]; then
  echo "nastavení: autocompact CHYBÍ (orchestrátor bez stropu compactu): ukonči session a spusť claude --autocompact 400k (přepínač platí jen pro tu session; /autocompact v session by zůstal trvale a stropoval i ruční sessions)"
  chybi="$chybi;autocompact (spusť claude --autocompact 400k)"
elif [ "$acn" -gt 400000 ]; then echo "nastavení: autocompact $ac ($acz) je nad 400k: orchestrátor spouštěj s claude --autocompact 400k"
else echo "nastavení: autocompact $ac ($acz)"; fi
[ -n "$chybi" ] && echo "nastaveni_chybi: $(printf '%s' "${chybi#;}" | sed 's/;/; /g')"

# varování
vsize=$(wc -c < "$vize_abs" | tr -d ' ')
[ "$vsize" -gt 87040 ] && echo "varování: vize má $vsize B; doporučení je tělo kolem 85 kB a podklady v přílohách docs/vize/$slug/ (rozhodnutí se neškrtají, vize se kvůli délce nedělí)"
if [ -f CLAUDE.md ]; then
  cl=$(wc -l < CLAUDE.md | tr -d ' '); cb=$(wc -c < CLAUDE.md | tr -d ' ')
  { [ "$cl" -gt 400 ] || [ "$cb" -gt 20480 ]; } && echo "varování: CLAUDE.md projektu má $cl řádků a $cb B (doporučený strop 400 řádků a ~20 kB), každý agent ho nese v preambuli; historie a stavy patří do docs/"
fi
hs=$(wc -c < docs/handoff.md | tr -d ' '); [ "$hs" -gt 4096 ] && echo "varování: handoff má $hs B, po compactu se injektují jen první 4 096 B"
echo "marker: docs/.orchestrator-run (session $sid, start $now)"
echo "hotovo: rc=$rc"
exit $rc
