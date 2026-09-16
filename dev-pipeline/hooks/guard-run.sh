#!/usr/bin/env bash
# dev-pipeline PreToolUse guard běhu (matcher: AskUserQuestion|Read|Grep|Glob|Bash|Write|Edit|MultiEdit|NotebookEdit).
#
# Aktivní JEN když v projektu leží docs/.orchestrator-run se session_id shodným s touto session.
# Hlavní session (hook input bez agent_id) je orchestrátor: neptá se uživatele, nečte projekt
# (jen vizi, handoff, vize-spory, follow-ups a soubory pluginu), nespouští projekt, needituje kód.
# Subagenti (s agent_id): nečtou celé velké zdrojové soubory, ani přes Read bez offset/limit,
# ani přes cat, sed -n, head, tail v Bash. Práh DEV_PIPELINE_READ_MAX_LINES, výchozí 350.
# Fail-open: cokoli nejednoznačného projde. Deny = JSON permissionDecision, exit 0.
set -uo pipefail

input=$(cat)
j() { printf '%s' "$input" | jq -r "$1 // empty" 2>/dev/null; }
tool=$(j '.tool_name'); sid=$(j '.session_id'); agent_id=$(j '.agent_id'); cwd=$(j '.cwd')
proj="${CLAUDE_PROJECT_DIR:-$cwd}"
marker="$proj/docs/.orchestrator-run"
[ -n "$tool" ] && [ -f "$marker" ] || exit 0
msid=$(jq -r '.session_id // empty' "$marker" 2>/dev/null)
[ -n "$msid" ] && [ "$msid" = "$sid" ] || exit 0

plugin_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
MAX="${DEV_PIPELINE_READ_MAX_LINES:-350}"
LINES=0

deny() {
  jq -n --arg r "dev-pipeline guard běhu: $1" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

abspath() {
  case "$1" in
    /*) printf '%s' "$1" ;;
    "~"*) printf '%s%s' "$HOME" "${1#\~}" ;;
    *) printf '%s/%s' "$cwd" "$1" ;;
  esac
}

# Cesty, které orchestrátor smí číst.
orch_read_ok() {
  local p; p=$(abspath "$1")
  case "$p" in
    "$plugin_root"/*|"$HOME"/.claude/*|/private/tmp/*|/tmp/*|/var/folders/*) return 0 ;;
    "$proj"/docs/handoff.md|"$proj"/docs/vize*|"$proj"/docs/follow-ups.md|"$proj"/docs/.orchestrator-run|"$proj"/docs/.orchestrator-session) return 0 ;;
  esac
  return 1
}
# Cesty, do kterých orchestrátor smí psát.
orch_write_ok() {
  local p; p=$(abspath "$1")
  case "$p" in
    "$proj"/docs/*|"$HOME"/.claude/*|/private/tmp/*|/tmp/*|/var/folders/*) return 0 ;;
  esac
  return 1
}

ORCH_READ="Orchestrátor nečte projekt. Sám čteš jen vizi, handoff, vize-spory, follow-ups a soubory pluginu; na cokoli z kódu, PRD, reportů, diffů nebo logů pošli agenta (Explore, model sonnet) s přesnou otázkou, formátem důkazů a stropem délky návratu."
ORCH_RUN="Orchestrátor nespouští projekt (balíčkovač, testy, typecheck, curl, deploy). Tu práci dělají fázoví agenti v bloku stavby; stav si nech ověřit agentem a převzít jen výsledek."
ORCH_EDIT="Orchestrátor needituje kód ani konfiguraci projektu; píše jen do docs/ (handoff, vize-spory, follow-ups). Opravy dělá fix agent v bloku stavby."

first_word() {
  printf '%s' "$1" | sed -E 's/^[[:space:]]*//; s/^(sudo|env|time|nice|nohup)[[:space:]]+//' | awk '{print $1}'
}
# Argumenty od 2. slova, které nejsou flagy, bez uvozovek.
file_args() {
  printf '%s' "$1" | awk '{for (i = 2; i <= NF; i++) if ($i !~ /^-/) print $i}' | tr -d "'\""
}

# ---------- orchestrátor ----------
orch_bash() {
  local cmd="$1" seg w a p
  while IFS= read -r seg; do
    [ -z "${seg// /}" ] && continue
    w=$(first_word "$seg")
    case "$w" in
      pnpm|npm|npx|yarn|bun|pytest|vitest|jest|tsc|turbo|curl|wget|railway|wrangler|docker|make|cargo)
        deny "$ORCH_RUN" ;;
      cat|head|tail|sed|awk|grep|rg|find|less|more|bat|wc|diff)
        for a in $(file_args "$seg"); do
          p=$(abspath "$a"); { [ -f "$p" ] || [ -d "$p" ]; } || continue
          orch_read_ok "$a" || deny "$ORCH_READ (cesta: $a)"
        done ;;
      git)
        if printf '%s' "$seg" | grep -Eq '(^|[[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+(diff|show|log[[:space:]]+.*-p)' \
           && ! printf '%s' "$seg" | grep -Eq -- '--(stat|shortstat|name-only|name-status|oneline)'; then
          deny "Orchestrátor nečte diffy ani obsah commitů; použij --stat nebo --name-only, obsah ti shrne agent."
        fi ;;
    esac
  done < <(printf '%s\n' "$cmd" | tr '|;&' '\n')
}

# ---------- subagenti ----------
src_ext_ok() {
  case "${1##*.}" in
    ts|tsx|js|jsx|mjs|cjs|mts|cts|py|go|rs|java|kt|kts|cs|php|rb|swift|c|cc|cpp|h|hpp|scala|dart) return 0 ;;
  esac
  return 1
}
big_source() {
  local p; p=$(abspath "$1")
  [ -f "$p" ] || return 1
  src_ext_ok "$p" || return 1
  LINES=$(wc -l < "$p" | tr -d ' ')
  [ "$LINES" -gt "$MAX" ]
}
read_reason() {
  printf 'Soubor %s má %s řádků. Celé velké zdrojové soubory se nečtou: použij mcp__serena__get_symbols_overview a mcp__serena__find_symbol (include_body=true) na to, co potřebuješ, nebo čti po částech do %s řádků (Read s offset/limit, sed -n s užším rozsahem).' "$1" "$2" "$MAX"
}
check_files() { local a; for a in $(file_args "$1"); do big_source "$a" && deny "$(read_reason "$a" "$LINES")"; done; }

sub_read() {
  local fp off lim
  fp=$(j '.tool_input.file_path'); off=$(j '.tool_input.offset'); lim=$(j '.tool_input.limit')
  [ -n "$fp" ] || return 0
  { [ -n "$off" ] || [ -n "$lim" ]; } && return 0
  big_source "$fp" && deny "$(read_reason "$fp" "$LINES")"
  return 0
}
sub_bash() {
  local cmd="$1" seg w rng x y n k a
  case "$cmd" in *"|"*|*"<<"*) return 0 ;; esac
  while IFS= read -r seg; do
    w=$(first_word "$seg")
    case "$w" in
      cat) check_files "$seg" ;;
      sed)
        rng=$(printf '%s' "$seg" | sed -nE "s/.*-n[[:space:]]*['\"]?([0-9]+),(\\$|[0-9]+)p['\"]?.*/\1 \2/p")
        [ -n "$rng" ] || continue
        x=${rng% *}; y=${rng#* }
        if [ "$y" = '$' ] || [ $((y - x + 1)) -gt "$MAX" ]; then check_files "$seg"; fi ;;
      head)
        n=$(printf '%s' "$seg" | sed -nE 's/.*head[[:space:]]+(-n[[:space:]]*|-)([0-9]+).*/\2/p')
        [ -n "$n" ] && [ "$n" -gt "$MAX" ] && check_files "$seg" ;;
      tail)
        k=$(printf '%s' "$seg" | sed -nE 's/.*tail[[:space:]]+-n[[:space:]]*\+([0-9]+).*/\1/p')
        if [ -n "$k" ]; then
          for a in $(file_args "$seg"); do
            big_source "$a" && [ $((LINES - k + 1)) -gt "$MAX" ] && deny "$(read_reason "$a" "$LINES")"
          done
        else
          n=$(printf '%s' "$seg" | sed -nE 's/.*tail[[:space:]]+(-n[[:space:]]*|-)([0-9]+).*/\2/p')
          [ -n "$n" ] && [ "$n" -gt "$MAX" ] && check_files "$seg"
        fi ;;
    esac
  done < <(printf '%s\n' "$cmd" | tr ';&' '\n')
}

# docs/.verify-passed píše jen scripts/verify-marker.sh (verify agent po zelené plné bráně).
VERIFY_MARK="docs/.verify-passed zapisuje jen scripts/verify-marker.sh po zelené plné bráně (verify agent v bloku stavby). Ručně zapsaný marker by pre-commit hooku podvrhl doklad, že suita proběhla; to není oprava, to je obcházení brány. Když je brána červená, oprav příčinu a nech verify proběhnout znovu."
is_verify_marker_path() { case "$(abspath "$1")" in */docs/.verify-passed) return 0 ;; esac; return 1; }
bash_writes_verify_marker() {
  case "$1" in *verify-marker.sh*) return 1 ;; esac
  case "$1" in *".verify-passed"*) ;; *) return 1 ;; esac
  case "$1" in *">"*|*"tee "*|*"touch "*|*"cp "*|*"mv "*|*"sed -i"*|*"install "*|*"dd "*|*"python"*|*"node "*|*"perl "*) return 0 ;; esac
  return 1
}
case "$tool" in
  Write|Edit|MultiEdit|NotebookEdit)
    fp=$(j '.tool_input.file_path // .tool_input.notebook_path'); [ -n "$fp" ] && is_verify_marker_path "$fp" && deny "$VERIFY_MARK" ;;
  Bash)
    cmd=$(j '.tool_input.command'); [ -n "$cmd" ] && bash_writes_verify_marker "$cmd" && deny "$VERIFY_MARK" ;;
esac

if [ -z "$agent_id" ]; then
  case "$tool" in
    AskUserQuestion)
      deny "Běh vize je autonomní, uživatele se během něj neptáš. Rozhodni podle vize a plánu. Změna cesty k cíli: zapiš důvod do tabulky plánu a pokračuj. Předpoklad: zapiš do docs/vize-spory.md a pokračuj. Důvod ze zavřeného seznamu zastavení: zapiš do handoffu „stav běhu: zastaveno: <důvod>“ a napiš uživateli zprávu." ;;
    Read)
      fp=$(j '.tool_input.file_path'); [ -n "$fp" ] && ! orch_read_ok "$fp" && deny "$ORCH_READ (soubor: $fp)" ;;
    Grep|Glob)
      p=$(j '.tool_input.path'); [ -z "$p" ] && p="$cwd"
      orch_read_ok "$p" || deny "$ORCH_READ (hledání v: $p)" ;;
    Bash)
      cmd=$(j '.tool_input.command'); [ -n "$cmd" ] && orch_bash "$cmd" ;;
    Write|Edit|MultiEdit|NotebookEdit)
      fp=$(j '.tool_input.file_path // .tool_input.notebook_path'); [ -n "$fp" ] && ! orch_write_ok "$fp" && deny "$ORCH_EDIT (soubor: $fp)" ;;
  esac
else
  case "$tool" in
    Read) sub_read ;;
    Bash) cmd=$(j '.tool_input.command'); [ -n "$cmd" ] && sub_bash "$cmd" ;;
  esac
fi
exit 0
