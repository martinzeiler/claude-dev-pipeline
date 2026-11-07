#!/usr/bin/env bash
# dev-pipeline PreToolUse guard (matcher: Bash).
# Deterministická blokace úzké množiny katastrof s externím blast radiusem.
# Běží nezávisle na permission módu (i pod --dangerously-skip-permissions).
# Exit 2 + stderr = blokace (důvod vidí model), exit 0 = povoleno.
# Hook běží před každým Bash příkazem všech agentů: kontroly po řádcích a segmentech jsou bez nových procesů (vestavěné
# [[ =~ ]] a rozvoje proměnných, kompatibilní s bash 3.2), grep a sed zůstávají jen za rychlým předvýběrem přes case.
# Pozor na ${x//vzor/…} nad dlouhým textem: v bash 3.2 je kvadratické a nad příkazem s dlouhým heredocem visí do timeoutu hooku,
# po kterém příkaz projde bez kontroly. Proto segmenty dělá jedno tr a počty závorek smyčka přes ${x#*znak}. LC_ALL=C: bajtové
# porovnávání bez převodu na široké znaky při každém srovnání vzoru.
set -uo pipefail
export LC_ALL=C

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0
[ -z "$cmd" ] && exit 0
proj="${CLAUDE_PROJECT_DIR:-}"
[ -n "$proj" ] || proj=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)

block() {
  echo "dev-pipeline guard: $1" >&2
  exit 2
}

# Tělo heredocu, který teče do SOUBORU, není příkaz — je to text.
# Bez tohohle guard blokoval `cat >> docs/journal.md <<'EOF' … railway up … EOF`,
# tedy poctivý zápis do deníku o tom, co se v řezu nasadilo (v ostrém běhu 2×).
# Heredoc do INTERPRETU (`bash <<EOF`, `ssh host <<EOF`) se nechává, protože tam
# tělo příkaz opravdu je — jinak by šlo guard obejít jedním přesměrováním.
RE_DATOVY='(^|[|;&[:space:]])(cat|tee)([[:space:]]|$)|>>?[[:space:]]*[^[:space:]|&]'
RE_ZNACKA=".*<<-?[[:space:]]*[\"']?([A-Za-z_][A-Za-z0-9_]*)[\"']?"
strip_data_heredocs() {
  local line delim="" out="" probe trimmed
  while IFS= read -r line || [ -n "$line" ]; do
    if [ -n "$delim" ]; then
      trimmed=${line#"${line%%[![:space:]]*}"}
      [ "$trimmed" = "$delim" ] && delim=""
      continue
    fi
    case "$line" in
      *"<<"*)
        probe=${line//<<</@@HS@@}   # herestring není heredoc
        case "$probe" in
          *"<<"*)
            # jen datový heredoc: cat/tee nebo přesměrování do souboru na témže řádku
            if [[ "$probe" =~ $RE_DATOVY ]] && [[ "$probe" =~ $RE_ZNACKA ]]; then
              delim=${BASH_REMATCH[1]}
            fi
            ;;
        esac
        ;;
    esac
    out="$out$line
"
  done <<HEREDOC_STRIPPER_EOF
$1
HEREDOC_STRIPPER_EOF
  printf '%s' "$out"
}

cmd=$(strip_data_heredocs "$cmd")
[ -z "$cmd" ] && exit 0
# Segmenty složeného příkazu, jeden na řádek.
segmenty=$(printf '%s\n' "$cmd" | tr '|;&' '\n')

# 1) Force-push je zakázán vždy (včetně --force-with-lease). Chce-li ho uživatel, udělá ho ručně.
# Kontrola per segment složeného příkazu — force flag musí být ve STEJNÉM segmentu jako git push
# (jinak false positive: `git add -f x && git push` není force-push).
RE_PUSH='git.*push'
RE_FORCE='(--force|(^|[[:space:]])-f([[:space:]]|$))'
case "$cmd" in
  *git*push*)
    while IFS= read -r seg; do
      if [[ "$seg" =~ $RE_PUSH ]] && [[ "$seg" =~ $RE_FORCE ]]; then
        block "force-push je blokován. Pokud je opravdu potřeba, musí ho spustit uživatel ručně."
      fi
    done <<<"$segmenty"
    ;;
esac

# 2) Destruktivní git na main/master větvi.
case "$cmd" in
  *git*reset*|*git*clean*)
    if printf '%s' "$cmd" | grep -Eq 'git([^|;&]*)(reset[[:space:]]+--hard|clean[[:space:]]+-[a-zA-Z]*f)'; then
      if [ -n "$proj" ]; then
        branch=$(git -C "$proj" branch --show-current 2>/dev/null || echo "")
        case "$branch" in
          main|master)
            block "git reset --hard / git clean -f na větvi '$branch' je blokován. Přepni na pracovní (vize) branch."
            ;;
        esac
      fi
    fi
    ;;
esac

# 3) rm -rf na kořenové/domácí cesty.
case "$cmd" in
  *rm*)
    if printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)[[:space:]]+("?/"?|~/?|"?\$HOME)([[:space:]]|$|")'; then
      block "rm -rf na kořenový nebo domovský adresář je blokován."
    fi
    ;;
esac

# 4) Deploy gate během autonomního běhu: deploy jen po zeleném review+testech (marker .deploy-unlocked).
# ZNÁMÉ OMEZENÍ: gate zná jen railway up a wrangler (pages) deploy. Projekt s jinou deploy platformou
# (fly, vercel, kubectl, ...) gate NEchrání — přidej její příkaz do DEPLOY_RE níže.
# POZOR na UX past: marker musí vzniknout SAMOSTATNÝM příkazem před deployem — hook čte
# marker před spuštěním, takže `touch .deploy-unlocked && railway up` v jednom příkazu neprojde.
# Gate hledá SPOUŠTĚNÝ příkaz (první slovo segmentu za cd …&&, přiřazeními proměnných, npx, pnpm exec, bunx), ne text:
# do 1.4.0 blokoval commit message o nasazení, grep runbooku i `wrangler pages deployment list`, který deploy.md předepisuje
# k ověření (třída F, 3 záznamy ve feedbacku). Text v uvozovkách se vyřazuje; řetězec pro interpret (bash -c, eval) ne,
# protože tam text příkaz opravdu je (jako u heredocu do shellu výše).
DEPLOY_RE='^([^[:space:]]*/)?(railway(@[^[:space:]]*)?[[:space:]]+up|wrangler(@[^[:space:]]*)?[[:space:]]+(pages[[:space:]]+)?deploy)([[:space:]]|$)'
# Spouštěné příkazy, jeden segment na řádek: bez textu v uvozovkách (i přes konce řádků), závorek, prefixů
# (sudo, env, time, do, then…), přiřazení proměnných (FOO=1 příkaz) a spouštěčů balíčků (npx, bunx, pnpm --filter x exec…).
spoustene() {
  printf '%s' "$1" | tr '\n' '\001' | sed -E "s/\"[^\"]*\"|'[^']*'/''/g" | tr '\001|;&' '\n\n\n\n' | sed -E \
    -e 's/^[[:space:](){!]+//' \
    -e 's/^((sudo|env|time|nice|nohup|command|exec|do|then|else|if|while|until)[[:space:]]+|[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)+//' \
    -e 's/^(npx|bunx|pnpm|npm|yarn)([[:space:]]+(-C|--dir|--filter|-F|--prefix)[[:space:]]+[^[:space:]]+|[[:space:]]+-[^[:space:]]*)*([[:space:]]+(exec|dlx|x))?([[:space:]]+--)?[[:space:]]+//'
}
# `--dry-run` nic nenasazuje (wrangler deploy --dry-run jen sestaví bundle): gate ho pouští, jinak review kontrolu bundlu vynechá.
SUCHY='(^|[[:space:]])--dry-run([[:space:]=]|$)'
je_deploy() {
  if printf '%s' "$1" | grep -Eq '(^|[;&|({[:space:]])((ba|z)?sh[[:space:]]+-[A-Za-z]*c|eval)[[:space:]]'; then
    printf '%s' "$1" | grep -Eo "(railway[[:space:]]+up|wrangler[[:space:]]+(pages[[:space:]]+)?deploy)([[:space:]\"']|$)[^;&|\"']*" \
      | grep -Evq -- "$SUCHY" && return 0
  fi
  spoustene "$1" | grep -E "$DEPLOY_RE" | grep -Evq -- "$SUCHY"
}
if [ -n "$proj" ] && [ -f "$proj/docs/.orchestrator-run" ]; then
  case "$cmd" in
    *railway*|*wrangler*)
      if je_deploy "$cmd"; then
        if [ ! -f "$proj/docs/.deploy-unlocked" ]; then
          block "deploy během autonomního běhu vyžaduje marker docs/.deploy-unlocked (vytváří ho deploy agent v bloku stavby samostatným příkazem po zelené bráně; viz KONTRAKT.md ve skillu orchestrate). Pokud žádný autonomní běh neběží, je docs/.orchestrator-run pozůstatek spadlé session — smaž ho a zkus to znovu."
        fi
      fi
      ;;
  esac
fi

# 5) Během autonomního běhu nikdo nevrací cizí ani necommitnutou práci: git stash (kromě list/show), git clean,
# a git checkout -- / git restore nad tečkou nebo nad docs/ jsou blokované. Důvod: deploy agent řezu 5 (vize doplneni-webu)
# po `pnpm format:check` udělal `git checkout -- docs/vize-spory.md` a smazal 22 řádků necommitnutého uzavření.
# Vrácení vlastního souboru mimo docs/ (`git checkout -- src/a.ts`) zůstává povolené.
# Mimo projekt (po `cd` do klonu ve scratchpadu, `git -C <cesta mimo projekt>`) pravidlo neplatí: checkout v klonu ve
# scratchpadu je legitimní a guard by ho bez sledování `cd` zastavil. Guard proto sleduje adresář
# segment po segmentu: absolutní i relativní `cd`, `cd -`, $OLDPWD, $PWD, $CLAUDE_PROJECT_DIR, přiřazení v témže příkazu
# (S=/cesta; cd $S), HOME a TMPDIR; konec subshellu `( … )` vrací adresář před ním. Cokoli, čemu nerozumí (neznámá
# proměnná, `cd $(…)`, pushd, `)` bez známého `(`), znamená neznámý adresář a s ním blokaci: výjimka platí jen tam, kde je
# s jistotou známo, že git běží mimo projekt. Do opravy v 1.6.0 přežil stav „mimo“ konec subshellu i `cd -` zpět
# a `(cd /tmp && ls); git stash` prošel (review 1.6.0, N1).
normcesta() { # absolutní cesta → bez ., .. a zdvojených lomítek
  local IFS=/ kus
  local -a kusy out
  set -f; kusy=($1); set +f
  out=()
  for kus in ${kusy[@]+"${kusy[@]}"}; do
    case "$kus" in
      ''|.) ;;
      ..) [ ${#out[@]} -gt 0 ] && unset "out[$((${#out[@]} - 1))]" ;;
      *) out[${#out[@]}]=$kus ;;
    esac
  done
  if [ ${#out[@]} -eq 0 ]; then printf '/'; else printf '/%s' "${out[@]}"; fi
}
case "$proj" in /*) projn=$(normcesta "$proj") ;; *) projn=$proj ;; esac
mimo_projekt() { # cesta → 0, když je absolutní a leží mimo projekt
  case "$1" in /*) ;; *) return 1 ;; esac
  case "$1" in "$projn"|"$projn"/*|"$proj"|"$proj"/*) return 1 ;; esac
  return 0
}
# Adresář, ve kterém poběží další segment: absolutní cesta, nebo prázdno = neznámý (bere se jako projekt).
cur=$projn; prev=""
# Přiřazení z příkazu jako řádky „JMÉNO=hodnota“ (bash 3.2 na macOS nemá asociativní pole). Hodnota se rozvine už při
# přiřazení, jako to dělá shell, takže uložená hodnota nikdy nenese `$`: `S=$S/x; cd $S` dřív rozvoj zacyklil a hook
# visel do timeoutu 30 s, po kterém příkaz prošel bez kontroly (review 1.6.0, N6).
prirazeni=""
hodnota() {
  local radek v=""
  while IFS= read -r radek; do
    case "$radek" in "$1="*) v=${radek#"$1="} ;; esac
  done <<<"$prirazeni"
  printf '%s' "$v"
}
rozvin() { # text cesty → cesta s rozvinutými proměnnými, nebo prázdno, když nějakou neznáme
  local t="$1" n v i=0 re='\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?'
  t=${t//\'/}; t=${t//\"/}
  case "$t" in "~"|"~/"*) t="$HOME${t#\~}" ;; esac
  while [[ "$t" =~ $re ]]; do
    i=$((i + 1)); [ "$i" -le 16 ] || return 0
    n=${BASH_REMATCH[1]}
    case "$n" in
      HOME) v=$HOME ;; TMPDIR) v=${TMPDIR:-} ;; PWD) v=$cur ;; OLDPWD) v=$prev ;; CLAUDE_PROJECT_DIR) v=$proj ;;
      *) v=$(hodnota "$n") ;;
    esac
    [ -n "$v" ] || return 0
    case "$v" in *'$'*) return 0 ;; esac
    t=${t/"${BASH_REMATCH[0]}"/$v}
    [ ${#t} -le 4096 ] || return 0
  done
  printf '%s' "$t"
}
pocet_znaku() { # text znak → POCET
  local x=$1
  POCET=0
  while :; do
    case "$x" in
      *"$2"*) x=${x#*"$2"}; POCET=$((POCET + 1)) ;;
      *) return ;;
    esac
  done
}
RE_PRIRAZENI='^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=([^[:space:]]*)[[:space:]]*$'
RE_CD='^[[:space:]({]*cd([[:space:]]+([^[:space:]]+))?[[:space:]]*$'
RE_CD_JINY='^[[:space:]({]*(cd|pushd|popd)([[:space:]]|$)'
RE_GIT_C='git[[:space:]]+-C[[:space:]]+([^[:space:]]+)'
RE_GIT_PODPRIKAZ='(^|[[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+'
RE_STASH="${RE_GIT_PODPRIKAZ}stash([[:space:]]|\$)"
RE_STASH_CTENI='stash[[:space:]]+(list|show)'
RE_CLEAN="${RE_GIT_PODPRIKAZ}clean([[:space:]]|\$)"
RE_VRACENI="${RE_GIT_PODPRIKAZ}(checkout|restore)([[:space:]]|\$)"
if [ -n "$proj" ] && [ -f "$proj/docs/.orchestrator-run" ]; then
  zasobnik=""
  while IFS= read -r seg; do
    # `(` na začátku segmentu otevírá subshell: jeho `cd` po `)` neplatí
    lead=${seg%%[!\ \(\{]*}
    pocet_znaku "$lead" '('; otevrene=$POCET
    i=0; while [ "$i" -lt "$otevrene" ]; do zasobnik="$cur|$prev
$zasobnik"; i=$((i + 1)); done
    if [[ "$seg" =~ $RE_PRIRAZENI ]]; then
      # přiřazení bez příkazu (S=/cesta, export S=/cesta) platí pro další segmenty
      jm=${BASH_REMATCH[2]}; hod=$(rozvin "${BASH_REMATCH[3]}")
      prirazeni="$prirazeni
$jm=$hod"
    elif [[ "$seg" =~ $RE_CD ]]; then
      arg=${BASH_REMATCH[2]:-}; arg=${arg%%)*}; novy=""
      case "$arg" in
        "") novy=$HOME ;;
        -) novy=$prev ;;
        *) t=$(rozvin "$arg")
           case "$t" in
             /*) novy=$(normcesta "$t") ;;
             "") ;;
             *) [ -n "$cur" ] && novy=$(normcesta "$cur/$t") ;;
           esac ;;
      esac
      prev=$cur; cur=$novy
    elif [[ "$seg" =~ $RE_CD_JINY ]]; then
      prev=$cur; cur=""   # cd, kterému guard nerozumí (víc slov, $(…)), pushd, popd: adresář neznámý
    elif [ -z "$cur" ] || ! mimo_projekt "$cur"; then
      jde_mimo=0
      if [[ "$seg" =~ $RE_GIT_C ]]; then
        t=$(rozvin "${BASH_REMATCH[1]}")
        case "$t" in /*) t=$(normcesta "$t") ;; "") ;; *) if [ -n "$cur" ]; then t=$(normcesta "$cur/$t"); else t=""; fi ;; esac
        [ -n "$t" ] && mimo_projekt "$t" && jde_mimo=1
      fi
      if [ "$jde_mimo" = 0 ] && [[ "$seg" == *git* ]]; then
        if [[ "$seg" =~ $RE_STASH ]] && ! [[ "$seg" =~ $RE_STASH_CTENI ]]; then
          plugin_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)
          block "git stash je během autonomního běhu blokován: odložil by necommitnutou práci jiných agentů (PRD dalšího řezu, journal, vize-spory). Zbytky řezu, který neprošel, ulož příkazem bash ${plugin_root:-<plugin>}/scripts/zbytek-rezu.sh <cwd> <NN> (změny mimo docs/ dá do patche docs/e2e/rez-NN-zbytek.patch a strom vrátí; jen když žádný blok neběží). Jinak co nechceš commitnout, nech ve stromě; co je tvoje, commitni."
        fi
        if [[ "$seg" =~ $RE_CLEAN ]]; then
          block "git clean je během autonomního běhu blokován: smazal by netrackované soubory jiných agentů (rozpracované PRD, reporty, doklady)."
        fi
        if [[ "$seg" =~ $RE_VRACENI ]]; then
          cile=$(printf '%s' "$seg" | sed -E 's/.*git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+(checkout|restore)[[:space:]]*//')
          if printf ' %s ' "$cile" | grep -Eq '[[:space:]](\.|\./|docs|docs/[^[:space:]]*|:/|\*)[[:space:]]|(^|[[:space:]])--[[:space:]]*$'; then
            block "git checkout/restore nad tečkou, docs/ nebo celým stromem je během autonomního běhu blokován: vrátil by necommitnutou práci jiných agentů. Vracej jen konkrétní soubor, který jsi sám změnil, mimo docs/."
          fi
        fi
      fi
    fi
    # `)` bez `(` v témže segmentu zavírá subshell; bez známého `(` (konec `$(…)` rozděleného na | ; &) je adresář neznámý
    pocet_znaku "$seg" ')'; zavrene=$POCET
    pocet_znaku "$seg" '('; zavrene=$((zavrene - (POCET - otevrene)))
    while [ "$zavrene" -gt 0 ]; do
      if [ -n "$zasobnik" ]; then
        radek=${zasobnik%%$'\n'*}; zasobnik=${zasobnik#*$'\n'}
        cur=${radek%%|*}; prev=${radek#*|}
      else
        cur=""; prev=""
      fi
      zavrene=$((zavrene - 1))
    done
  done <<<"$segmenty"
fi

# 6) rm s nechráněnou proměnnou, za jejímž lomítkem hned stojí glob, další proměnná nebo nic (`rm $S/*.ts`, `rm $S/$f.x`,
# `rm "$D"/`): s prázdnou proměnnou maže od kořene disku. Na takový příkaz se Claude Code ptá uživatele i v bypassPermissions
# a žádný mód, pravidlo ani hook dotaz nepřebije; autonomní běh na něm stojí. Guard příkaz zastaví dřív, než dotaz
# vznikne, a řekne přepis.
# Platí vždy, nejen během běhu: chráněný tvar "${S:?}" nebo literální cesta projde bez dotazu kdekoli.
NECHRANENA='\$(\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)"?/"?([*?[]|\$|[[:space:]]|$)'
RE_RM='(^|[[:space:](])rm[[:space:]]'
case "$cmd" in
  *rm*)
    while IFS= read -r seg; do
      [[ "$seg" =~ $RE_RM ]] || continue
      if [[ "$seg" =~ $NECHRANENA ]]; then
        block "rm s nechráněnou proměnnou před lomítkem by s prázdnou proměnnou mazal od kořene disku a Claude Code by se na něj ptal uživatele (běh by stál): přepiš na rm -f \"\${S:?}\"/soubor nebo literální cestu; scratchpad uklízet nemusíš."
      fi
    done <<<"$segmenty"
    ;;
esac

exit 0
