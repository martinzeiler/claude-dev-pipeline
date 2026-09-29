#!/usr/bin/env bash
# dev-pipeline hlídač kontextu subagentů běhu (PreToolUse i PostToolUse, matcher *).
#
# Aktivní JEN pro subagenta (vstup s agent_id) session, jejíž session_id nese docs/.orchestrator-run; jinak exit 0 bez výstupu.
# Kontext agenta měří z jeho transkriptu (usage poslední odpovědi) a vývoj zapisuje do docs/.kontext.jsonl (čte co-dela.sh).
# Nad měkkým prahem vrací po každém nástroji výzvu PŘEDÁVKA, nad tvrdým zamítne vše kromě zápisu předávky a strukturovaného
# návratu; blok pak pustí nástupce se stejným zadáním (runSePredavkou). Proč: v běhu bez-dluhu mělo 117 compactů subagentů
# (implementace protočila v mediánu ~970 k) a nad ~300 k agenti pracují hůř (analýza 6.7). Agenti o prahu nevědí:
# pokyn přijde až touto zprávou, aby nad ním nepřemýšleli a nekončili předčasně.
# Stav agenta (transkript, řez, maximum, příznaky) drží ${TMPDIR:-/tmp}/dev-pipeline-kontext/<agent_id>; find nad
# transkripty běží jen poprvé, pak tail + jq (~20 ms nad 15MB transkriptem). Fail-open: cokoli nejednoznačného projde.
set -uo pipefail

input=$(cat)
# Rychlá cesta: hook běží u každého volání nástroje v každé session, bez markeru běhu končí dřív než jq.
proj="${CLAUDE_PROJECT_DIR:-}"
[ -n "$proj" ] || proj=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
marker="$proj/docs/.orchestrator-run"
[ -n "$proj" ] && [ -f "$marker" ] || exit 0

# Jedno volání jq: pole vstupu, session z markeru a jestli Bash sahá na soubor předávky.
IFS=$'\037' read -r ev sid msid aid typ tool fp bash_predavka <<EOF
$(printf '%s' "$input" | jq -r --slurpfile m "$marker" '. as $i | [$i.hook_event_name, $i.session_id, ($m[0].session_id? // ""), $i.agent_id, $i.agent_type, $i.tool_name, ($i.tool_input.file_path? // ""), (($i.tool_input.command? // "") | tostring | contains("predavka-" + ($i.agent_id // "") + ".md"))] | map(. // "" | tostring) | join("\u001f")' 2>/dev/null)
EOF
[ -n "${aid:-}" ] && [ -n "${sid:-}" ] && [ "$sid" = "${msid:-}" ] || exit 0

MEKKY="${DEV_PIPELINE_KONTEXT_MEKKY:-250000}"
TVRDY="${DEV_PIPELINE_KONTEXT_TVRDY:-290000}"
stdir="${TMPDIR:-/tmp}"; stdir="${stdir%/}/dev-pipeline-kontext"; st="$stdir/$aid"

t=""; rez=""; max=0; zap=0; f100=0; fm=0; ft=0; comp=0; zmena=0
if [ -f "$st" ]; then
  while IFS='=' read -r k v; do
    case "$k" in t) t=$v ;; rez) rez=$v ;; max) max=$v ;; zap) zap=$v ;; f100) f100=$v ;; fm) fm=$v ;; ft) ft=$v ;; comp) comp=$v ;; esac
  done < "$st"
fi
uloz() {
  [ "$zmena" = 1 ] || return 0
  [ -d "$stdir" ] || mkdir -p "$stdir" 2>/dev/null
  printf 't=%s\nrez=%s\nmax=%s\nzap=%s\nf100=%s\nfm=%s\nft=%s\ncomp=%s\n' "$t" "$rez" "$max" "$zap" "$f100" "$fm" "$ft" "$comp" > "$st.$$" 2>/dev/null \
    && mv -f "$st.$$" "$st" 2>/dev/null
}

if [ -z "$t" ] || [ ! -f "$t" ]; then
  # Transkript subagenta i agenta Workflow leží pod <projekty>/*/<session>/subagents/ (workflow v podadresáři); pole
  # s jeho cestou hook nedostává (ověřeno pokusem na Claude Code 2.1.284). DEV_PIPELINE_TRANSCRIPTS slouží testům.
  t=$(find "${DEV_PIPELINE_TRANSCRIPTS:-${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects}"/*/"$sid"/subagents -name "agent-$aid.jsonl" 2>/dev/null | head -1)
  [ -n "$t" ] || exit 0
  # Řez jednou ze zadání na začátku transkriptu: rámec bloku PRD i stavby začíná „Řez NN:“; kolečko číslo řezu nemá.
  rez=$(head -c 200000 "$t" | grep -m1 -o -E 'Řez [0-9]+')
  rez=${rez%%$'\n'*}; rez=${rez##* }
  if [ -n "$rez" ]; then rez=$(printf '%02d' "$((10#$rez))")
  elif head -c 200000 "$t" | grep -q '[Kk]olečk'; then rez=kolecko
  else rez=-; fi
  zmena=1
fi

# Kontext = usage poslední odpovědi asistenta; fromjson? přeskočí rozepsaný poslední řádek.
ctx=$(tail -n 400 "$t" | jq -R -s '[split("\n")[] | fromjson? | select(.type=="assistant") | .message.usage | select(.) | ((.input_tokens//0)+(.cache_read_input_tokens//0)+(.cache_creation_input_tokens//0)+(.output_tokens//0))] | last // empty' 2>/dev/null)
case "$ctx" in ''|*[!0-9]*) uloz; exit 0 ;; esac

# Compact: kontext spadl pod polovinu maxima nad 150 k. Maximum se resetuje, příznaky prahů platí zase od začátku.
udalost=""
if [ "$max" -gt 150000 ] && [ $((ctx * 2)) -lt "$max" ]; then
  comp=$((comp + 1)); max=$ctx; f100=0; fm=0; ft=0; udalost=compact; zmena=1
elif [ "$ctx" -gt "$max" ]; then
  max=$ctx; zmena=1
fi
if [ -z "$udalost" ]; then
  if [ "$ctx" -ge "$TVRDY" ] && [ "$ft" != 1 ]; then udalost=tvrdy
  elif [ "$ctx" -ge "$MEKKY" ] && [ "$fm" != 1 ]; then udalost=mekky
  elif [ "$ctx" -gt 100000 ] && [ "$f100" != 1 ]; then udalost=mereni
  elif [ "$f100" = 1 ] && [ $((max - zap)) -ge 25000 ]; then udalost=mereni
  fi
fi
case "$udalost" in tvrdy) ft=1; fm=1; f100=1 ;; mekky) fm=1; f100=1 ;; mereni) f100=1 ;; esac
if [ -n "$udalost" ]; then
  zap=$max; zmena=1
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg rez "$rez" --arg aid "$aid" --arg typ "${typ#dev-pipeline:}" \
    --argjson k "$ctx" --argjson m "$max" --argjson c "$comp" --arg u "$udalost" \
    '{ts:$ts, rez:$rez, aid:$aid, typ:(if $typ == "" then "-" else $typ end), kontext:$k, max:$m, compactu:$c, udalost:$u}' \
    >> "$proj/docs/.kontext.jsonl" 2>/dev/null
fi
uloz

# Výzvu k předávce dostávají jen agenti Workflow bloků (transkript pod subagents/workflows/): jen blok umí pustit nástupce
# s předávkou. Přímí subagenti orchestrátora (pruzkum, preflight) se jen měří.
case "$t" in */subagents/workflows/*) ;; *) exit 0 ;; esac

P="$proj/docs/reviews/predavka-$aid.md"
BODY="1. zadání jednou větou; 2. co je hotové a čím je to ověřené (příkaz, test); 3. co zbývá, v pořadí, jak bys pokračoval; 4. zjištění, která nástupce potřebuje (soubory, symboly, pasti, užitečné příkazy); 5. rozdělané soubory a stav testů a typechecku; 6. všechno, co patří do tvého strukturovaného návratu (follow-upy, odchylky, nálezy, počty), aby ho nástupce mohl vrátit za celé zadání."
if [ "$ev" = "PostToolUse" ] && [ "$ctx" -ge "$MEKKY" ]; then
  jq -cn --arg z "PŘEDÁVKA: tuhle práci dokončí nástupce se stejným zadáním. Dokonči jen rozdělaný krok (dopiš rozepsanou změnu a nech projít její test; strom nenechávej rozbitý), nic nového nezačínej. Pak zapiš předávku do $P: $BODY Pak ukonči práci strukturovaným návratem: pole predavka = $P, ostatní povinná pole vyplň podle skutečného stavu (stav: castecne, když ho schéma má)." \
    '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$z}}'
elif [ "$ev" = "PreToolUse" ] && [ "$ctx" -ge "$TVRDY" ]; then
  # Projde jen strukturovaný návrat a práce se souborem předávky (cesta i relativně: agent ji mohl zkrátit).
  case "$tool" in
    StructuredOutput) exit 0 ;;
    Write|Edit|MultiEdit|Read) case "$fp" in "$P"|*/docs/reviews/"predavka-$aid.md"|docs/reviews/"predavka-$aid.md") exit 0 ;; esac ;;
    Bash) [ "$bash_predavka" = true ] && exit 0 ;;
  esac
  jq -cn --arg r "PŘEDÁVKA je povinná: jediné povolené kroky jsou zápis předávky do $P a strukturovaný návrat s polem predavka = $P. Předávka: $BODY" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
fi
exit 0
