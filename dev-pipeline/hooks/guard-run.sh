#!/usr/bin/env bash
# dev-pipeline PreToolUse guard běhu (matcher: AskUserQuestion|Read|Grep|Glob|Bash|Write|Edit|MultiEdit|NotebookEdit).
#
# Aktivní JEN když v projektu leží docs/.orchestrator-run se session_id shodným s touto session.
# Hlavní session (hook input bez agent_id) je orchestrátor: neptá se uživatele, nečte projekt
# (jen vizi, produkt.md, handoff, vize-spory, follow-ups, args bloků v docs/.run-args.json a docs/.stavba-*.json,
# deník vad ~/dev-pipeline-feedback.md a soubory pluginu), nespouští projekt, needituje kód.
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

# Deník vad pipeline (KONTRAKT): zapisuje ho orchestrátor při uzavření řezu. Leží mimo ~/.claude, protože tu cestu
# sandbox Claude Code chrání. Do 1.4.0 ho guard orchestrátorovi blokoval (vada E z běhu bez-dluhu).
FEEDBACK="$HOME/dev-pipeline-feedback.md"
# Cesty, které orchestrátor smí číst.
orch_read_ok() {
  local p; p=$(abspath "$1")
  case "$p" in
    "$plugin_root"/*|"$HOME"/.claude/*|"$FEEDBACK"|/private/tmp/*|/tmp/*|/var/folders/*) return 0 ;;
    "$proj"/docs/handoff.md|"$proj"/docs/vize*|"$proj"/docs/follow-ups.md|"$proj"/docs/produkt.md|"$proj"/docs/.orchestrator-run|"$proj"/docs/.orchestrator-session) return 0 ;;
    # args bloků na disku: po compactu je orchestrátor čte odtud (PO-COMPACTU), jinak by je znovu zjišťoval
    "$proj"/docs/.run-args.json|"$proj"/docs/.stavba-*.json) return 0 ;;
  esac
  return 1
}
# Cesty, do kterých orchestrátor smí psát.
orch_write_ok() {
  local p; p=$(abspath "$1")
  case "$p" in
    "$proj"/docs/*|"$HOME"/.claude/*|"$FEEDBACK"|/private/tmp/*|/tmp/*|/var/folders/*) return 0 ;;
  esac
  return 1
}

ORCH_READ="Orchestrátor nečte projekt. Sám čteš jen vizi, produkt.md, handoff, vize-spory, follow-ups, docs/.run-args.json, docs/.stavba-*.json, ~/dev-pipeline-feedback.md a soubory pluginu; na cokoli z kódu, PRD, reportů, diffů nebo logů pošli agenta dev-pipeline:pruzkum s přesnou otázkou, formátem důkazů a stropem délky návratu."
ORCH_RUN="Orchestrátor nespouští projekt (balíčkovač, testy, typecheck, curl, deploy). Tu práci dělají fázoví agenti v bloku stavby; stav si nech ověřit agentem a převzít jen výsledek."
ORCH_EDIT="Orchestrátor needituje kód ani konfiguraci projektu; píše jen do docs/ (handoff, vize-spory, follow-ups). Opravy dělá fix agent v bloku stavby."

first_word() {
  printf '%s' "$1" | sed -E 's/^[[:space:]]*//; s/^(sudo|env|time|nice|nohup)[[:space:]]+//' | awk '{print $1}'
}
# Argumenty od 2. slova, které nejsou flagy, bez uvozovek.
file_args() {
  printf '%s' "$1" | awk '{for (i = 2; i <= NF; i++) if ($i !~ /^-/) print $i}' | tr -d "'\""
}

# Segmenty složeného příkazu, jeden na řádek: dělí na | ; & a konci řádku jen MIMO uvozovky (konec řádku v uvozovkách
# je mezera, zpětné lomítko escapuje). Text v uvozovkách zůstává v segmentu (cesty čtení se kontrolují i v uvozovkách).
# Proč: do 1.5.0 dělil guard i uvnitř uvozovek a `grep -E 'agent-browser|curl|wrangler'` orchestrátora skončil jako
# příkaz curl (běh web-podzim, 1. 10. 11:43).
segmenty() {
  printf '%s' "$1" | awk 'BEGIN { RS = "\001"; sq = "\047" } {
    s = $0; q = ""; out = ""; n = length(s)
    for (i = 1; i <= n; i++) {
      c = substr(s, i, 1)
      if (q == sq) { if (c == sq) q = ""; out = out (c == "\n" ? " " : c); continue }
      if (c == "\\" && i < n) { d = substr(s, i + 1, 1); out = out c (d == "\n" ? " " : d); i++; continue }
      if (q == "\"") { if (c == "\"") q = ""; out = out (c == "\n" ? " " : c); continue }
      if (c == sq || c == "\"") { q = c; out = out c; continue }
      if (c == "|" || c == ";" || c == "&" || c == "\n") { print out; out = ""; continue }
      out = out c
    }
    print out
  }'
}

# ---------- orchestrátor ----------
# Tělo datového heredocu (cat/tee nebo přesměrování do souboru) není příkaz, je to text; stejná funkce jako v guard-blast-radius.
# Bez ní orchestrátor neprošel se zápisem do ~/dev-pipeline-feedback.md, jehož záhlaví nebo řádek začínal wrangler, pnpm nebo curl.
# Orchestrátorovi se navíc vynechává tělo heredocu do interpretu jiného než shell (python3 - <<'EOF'): je to kód skriptu,
# ne příkazy shellu; do 1.5.0 skončil text „…; vitest projekt admin; …“ v pythonu, který upravoval handoff, jako příkaz
# vitest (běh web-podzim, 1. 10. 21:45). Heredoc do shellu (bash <<EOF, ssh host <<EOF) se dál kontroluje.
INTERPRET_HEREDOC='(^|[|;&[:space:](])(python[0-9.]*|node|ruby|perl|php|deno)([[:space:]]|$)'
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
        # datový heredoc (cat/tee nebo přesměrování do souboru na témže řádku) nebo heredoc do interpretu jiného než shell
        if printf '%s' "$probe" | grep -Eq '(^|[|;&[:space:]])(cat|tee)([[:space:]]|$)|>>?[[:space:]]*[^[:space:]|&]' \
           || printf '%s' "$probe" | grep -Eq "$INTERPRET_HEREDOC"; then
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
# Segmenty pro kontrolu orchestrátora: segmenty mimo uvozovky; řetězec pro shell (bash -c, sh -c, eval) je příkaz,
# proto se jeho segment rozdělí ještě naivně i uvnitř uvozovek (jako do 1.5.0), aby `bash -c "cd x; pnpm test"` neprošel.
orch_segmenty() {
  local seg
  while IFS= read -r seg; do
    printf '%s\n' "$seg"
    if printf '%s' "$seg" | grep -Eq '(^|[[:space:](])((ba|z)?sh[[:space:]]+-[A-Za-z]*c|eval)[[:space:]]'; then
      printf '%s\n' "$seg" | sed -E "s/.*((ba|z)?sh[[:space:]]+-[A-Za-z]*c|eval)[[:space:]]+//" | tr '|;&' '\n' | sed -E "s/^[[:space:]]*[\"']+//; s/[\"']+[[:space:]]*$//"
    fi
  done < <(segmenty "$1")
}
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
  done < <(orch_segmenty "$cmd")
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
# Zápis = cílem je sám marker: přesměrování do něj, tee/touch/install/truncate s ním, cp/mv/ln s ním jako cílem, dd of=,
# sed/perl -i nad ním, nebo skript (python, node…), který ho zmiňuje a zapisuje. Čtení markeru s `2>/dev/null` jinde
# v příkazu zápis není: do 1.5.0 to guard bral jako zápis a verify agenti řezů 04 a 09 marker přečíst nesměli.
bash_writes_verify_marker() {
  case "$1" in *".verify-passed"*) ;; *) return 1 ;; esac
  if printf '%s' "$1" | grep -Eq "$INTERPRET_HEREDOC" \
     && printf '%s' "$1" | grep -Eq "write|['\"][wa]b?\+?['\"]|['\"]>>?['\"]"; then
    return 0
  fi
  local seg w posl
  while IFS= read -r seg; do
    case "$seg" in *".verify-passed"*) ;; *) continue ;; esac
    case "$seg" in *verify-marker.sh*) continue ;; esac
    printf '%s' "$seg" | grep -Eq ">[>|]?[[:space:]]*[\"']?[^[:space:]\"'|;&<>]*\\.verify-passed" && return 0
    w=$(first_word "$seg")
    case "$w" in
      tee|touch|install|truncate) return 0 ;;
      cp|mv|ln|rsync)
        posl=$(printf '%s' "$seg" | awk '{print $NF}' | tr -d "'\"")
        case "$posl" in *.verify-passed) return 0 ;; esac ;;
      dd) printf '%s' "$seg" | grep -Eq 'of=[^[:space:]]*\.verify-passed' && return 0 ;;
      sed|perl) printf '%s' "$seg" | grep -Eq '(^|[[:space:]])-[A-Za-z]*i' && return 0 ;;
    esac
  done < <(segmenty "$1")
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
      cmd=$(j '.tool_input.command'); [ -n "$cmd" ] && orch_bash "$(strip_data_heredocs "$cmd")" ;;
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
