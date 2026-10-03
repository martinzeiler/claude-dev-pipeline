#!/usr/bin/env bash
# dev-pipeline PreToolUse guard (matcher: Bash).
# Deterministická blokace úzké množiny katastrof s externím blast radiusem.
# Běží nezávisle na permission módu (i pod --dangerously-skip-permissions).
# Exit 2 + stderr = blokace (důvod vidí model), exit 0 = povoleno.
set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0
[ -z "$cmd" ] && exit 0
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
proj="${CLAUDE_PROJECT_DIR:-$cwd}"

block() {
  echo "dev-pipeline guard: $1" >&2
  exit 2
}

# Tělo heredocu, který teče do SOUBORU, není příkaz — je to text.
# Bez tohohle guard blokoval `cat >> docs/journal.md <<'EOF' … railway up … EOF`,
# tedy poctivý zápis do deníku o tom, co se v řezu nasadilo (v ostrém běhu 2×).
# Heredoc do INTERPRETU (`bash <<EOF`, `ssh host <<EOF`) se nechává, protože tam
# tělo příkaz opravdu je — jinak by šlo guard obejít jedním přesměrováním.
strip_data_heredocs() {
  local line delim="" out="" probe trimmed d
  while IFS= read -r line || [ -n "$line" ]; do
    if [ -n "$delim" ]; then
      trimmed=$(printf '%s' "$line" | sed 's/^[[:space:]]*//')
      [ "$trimmed" = "$delim" ] && delim=""
      continue
    fi
    probe=$(printf '%s' "$line" | sed 's/<<</@@HS@@/g')   # herestring není heredoc
    case "$probe" in
      *"<<"*)
        # jen datový heredoc: cat/tee nebo přesměrování do souboru na témže řádku
        if printf '%s' "$probe" | grep -Eq '(^|[|;&[:space:]])(cat|tee)([[:space:]]|$)|>>?[[:space:]]*[^[:space:]|&]'; then
          d=$(printf '%s' "$probe" | sed -n "s/.*<<-\{0,1\}[[:space:]]*[\"']\{0,1\}\([A-Za-z_][A-Za-z0-9_]*\)[\"']\{0,1\}.*/\1/p")
          [ -n "$d" ] && delim="$d"
        fi
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

# 1) Force-push je zakázán vždy (včetně --force-with-lease). Chce-li ho uživatel, udělá ho ručně.
# Kontrola per segment složeného příkazu — force flag musí být ve STEJNÉM segmentu jako git push
# (jinak false positive: `git add -f x && git push` není force-push).
while IFS= read -r seg; do
  if printf '%s' "$seg" | grep -Eq 'git.*push' \
     && printf '%s' "$seg" | grep -Eq '(--force|(^|[[:space:]])-f([[:space:]]|$))'; then
    block "force-push je blokován. Pokud je opravdu potřeba, musí ho spustit uživatel ručně."
  fi
done < <(printf '%s\n' "$cmd" | tr '|;&' '\n')

# 2) Destruktivní git na main/master větvi.
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

# 3) rm -rf na kořenové/domácí cesty.
if printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)[[:space:]]+("?/"?|~/?|"?\$HOME)([[:space:]]|$|")'; then
  block "rm -rf na kořenový nebo domovský adresář je blokován."
fi

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
# `--dry-run` nic nenasazuje (wrangler deploy --dry-run jen sestaví bundle): do 1.5.0 ho gate blokoval a code-review
# řezu 02 v běhu web-podzim kontrolu bundlu vynechal.
SUCHY='(^|[[:space:]])--dry-run([[:space:]=]|$)'
je_deploy() {
  if printf '%s' "$1" | grep -Eq '(^|[;&|({[:space:]])((ba|z)?sh[[:space:]]+-[A-Za-z]*c|eval)[[:space:]]'; then
    printf '%s' "$1" | grep -Eo "(railway[[:space:]]+up|wrangler[[:space:]]+(pages[[:space:]]+)?deploy)([[:space:]\"']|$)[^;&|\"']*" \
      | grep -Evq -- "$SUCHY" && return 0
  fi
  spoustene "$1" | grep -E "$DEPLOY_RE" | grep -Evq -- "$SUCHY"
}
if [ -n "$proj" ] && [ -f "$proj/docs/.orchestrator-run" ]; then
  if je_deploy "$cmd"; then
    if [ ! -f "$proj/docs/.deploy-unlocked" ]; then
      block "deploy během autonomního běhu vyžaduje marker docs/.deploy-unlocked (vytváří ho deploy agent v bloku stavby samostatným příkazem po zelené bráně; viz KONTRAKT.md ve skillu orchestrate). Pokud žádný autonomní běh neběží, je docs/.orchestrator-run pozůstatek spadlé session — smaž ho a zkus to znovu."
    fi
  fi
fi

# 5) Během autonomního běhu nikdo nevrací cizí ani necommitnutou práci: git stash (kromě list/show), git clean,
# a git checkout -- / git restore nad tečkou nebo nad docs/ jsou blokované. Důvod: deploy agent řezu 5 (vize doplneni-webu)
# po `pnpm format:check` udělal `git checkout -- docs/vize-spory.md` a smazal 22 řádků necommitnutého uzavření.
# Vrácení vlastního souboru mimo docs/ (`git checkout -- src/a.ts`) zůstává povolené.
if [ -n "$proj" ] && [ -f "$proj/docs/.orchestrator-run" ]; then
  while IFS= read -r seg; do
    if printf '%s' "$seg" | grep -Eq '(^|[[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+stash([[:space:]]|$)' \
       && ! printf '%s' "$seg" | grep -Eq 'stash[[:space:]]+(list|show)'; then
      block "git stash je během autonomního běhu blokován: odložil by necommitnutou práci jiných agentů (PRD dalšího řezu, journal, vize-spory). Co nechceš commitnout, nech ve stromě; co je tvoje, commitni."
    fi
    if printf '%s' "$seg" | grep -Eq '(^|[[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+clean([[:space:]]|$)'; then
      block "git clean je během autonomního běhu blokován: smazal by netrackované soubory jiných agentů (rozpracované PRD, reporty, doklady)."
    fi
    if printf '%s' "$seg" | grep -Eq '(^|[[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+(checkout|restore)([[:space:]]|$)'; then
      cile=$(printf '%s' "$seg" | sed -E 's/.*git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+(checkout|restore)[[:space:]]*//')
      if printf ' %s ' "$cile" | grep -Eq '[[:space:]](\.|\./|docs|docs/[^[:space:]]*|:/|\*)[[:space:]]|(^|[[:space:]])--[[:space:]]*$'; then
        block "git checkout/restore nad tečkou, docs/ nebo celým stromem je během autonomního běhu blokován: vrátil by necommitnutou práci jiných agentů (v běhu doplneni-webu tak zmizelo uzavření řezu 5). Vracej jen konkrétní soubor, který jsi sám změnil, mimo docs/."
      fi
    fi
  done < <(printf '%s\n' "$cmd" | tr '|;&' '\n')
fi

# 6) rm s nechráněnou proměnnou, za jejímž lomítkem hned stojí glob, další proměnná nebo nic (`rm $S/*.ts`, `rm $S/$f.x`,
# `rm "$D"/`): s prázdnou proměnnou maže od kořene disku. Na takový příkaz se Claude Code ptá uživatele i v bypassPermissions
# a žádný mód, pravidlo ani hook dotaz nepřebije. V běhu bez-dluhu na něm stál celý běh 40 minut (2.1.280 čekal
# bez limitu; od 2.1.281 dotaz po 2 min sám zamítne). Guard příkaz zastaví dřív, než dotaz vznikne, a řekne přepis.
# Platí vždy, nejen během běhu: chráněný tvar "${S:?}" nebo literální cesta projde bez dotazu kdekoli.
NECHRANENA='\$(\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)"?/"?([*?[]|\$|[[:space:]]|$)'
if printf '%s' "$cmd" | grep -Eq "$NECHRANENA"; then   # běžný příkaz skončí u jednoho grepu
  while IFS= read -r seg; do
    printf '%s' "$seg" | grep -Eq '(^|[[:space:](])rm[[:space:]]' || continue
    if printf '%s' "$seg" | grep -Eq "$NECHRANENA"; then
      block "rm s nechráněnou proměnnou před lomítkem by s prázdnou proměnnou mazal od kořene disku a Claude Code by se na něj ptal uživatele (běh by stál): přepiš na rm -f \"\${S:?}\"/soubor nebo literální cestu; scratchpad uklízet nemusíš."
    fi
  done < <(printf '%s\n' "$cmd" | tr '|;&' '\n')
fi

exit 0
