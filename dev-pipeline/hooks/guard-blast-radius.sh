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
# ZNÁMÉ OMEZENÍ: gate zná jen railway + wrangler pages. Projekt s jinou deploy platformou
# (fly, vercel, kubectl, ...) gate NEchrání — přidej její příkaz do regexu níže.
# POZOR na UX past: marker musí vzniknout SAMOSTATNÝM příkazem před deployem — hook čte
# marker před spuštěním, takže `touch .deploy-unlocked && railway up` v jednom příkazu neprojde.
if [ -n "$proj" ] && [ -f "$proj/docs/.orchestrator-run" ]; then
  if printf '%s' "$cmd" | grep -Eq '(railway[[:space:]]+up|wrangler[[:space:]]+pages[[:space:]]+deploy)'; then
    if [ ! -f "$proj/docs/.deploy-unlocked" ]; then
      block "deploy během autonomního běhu vyžaduje marker docs/.deploy-unlocked (vytváří ho pipeline fáze 5 až po zeleném review a testech — viz PIPELINE.md). Pokud žádný autonomní běh neběží, je docs/.orchestrator-run stale pozůstatek spadlé session — smaž ho a zkus to znovu."
    fi
  fi
fi

exit 0
