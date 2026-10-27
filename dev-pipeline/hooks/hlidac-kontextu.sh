#!/usr/bin/env bash
# dev-pipeline hlídač kontextu subagentů běhu (PreToolUse i PostToolUse, matcher *).
#
# Aktivní JEN pro subagenta (vstup s agent_id) session, jejíž session_id nese docs/.orchestrator-run; jinak exit 0 bez výstupu.
# Kontext agenta měří z jeho transkriptu (usage poslední odpovědi) a vývoj zapisuje do docs/.kontext.jsonl (čte co-dela.sh).
# Nad měkkým prahem vrací po každém nástroji výzvu PŘEDÁVKA, nad tvrdým zamítne vše kromě zápisu předávky a strukturovaného
# návratu; blok pak pustí nástupce se stejným zadáním (runSePredavkou). Proč: nad ~300 k agenti pracují hůř a compact
# subagenta ztrácí rozdělanou práci. Agenti o prahu nevědí: pokyn přijde až touto zprávou, aby nad ním nepřemýšleli
# a nekončili předčasně.
# PRD agent (dev-pipeline:prd) dostane navíc jednou při ~170 k výzvu zapsat kostru PRD hned, i neúplnou: architekt,
# který předá bez kostry na disku, nechá nástupce psát ji znovu (věta v zadání nestačí).
# Stráž opakovaného čtení (1.9.0): zamítne přesné opakování téhož úseku (Read offset/limit, sed -n A,Bp, cat, head, tail,
# awk '{print}') nezměněného souboru (mtime a velikost) týmž agentem. V Bash jen tehdy, když celé volání sestává z čtecích
# kusů nad soubory: kus, který něco dělá (zápis, formátovač, git, test, cd, roura, přesměrování), stráž opakování pro to
# volání vypne (soubor se tím příkazem teprve mění). Jen soubory pod cwd projektu; výjimky: soubor předávky, tečkové
# stavové soubory docs/, heredoc, sed -i; python3, node a awk s programem stráž neřeší. Celý velký soubor zamítá
# guard-run.sh (práh 350 řádků, úsek od 300) a své zamítnutí připisuje do stavu agenta tady (zam). Důvod: implement
# agenti četli 200 kB na agenta, z toho 41 kB přesná opakování; věta o Sereně v zadání na to nestačila.
# Měření: PostToolUse sčítá bajty čtení (délka obsahu odpovědi Read a stdout čtecích Bash příkazů) a počet zamítnutí;
# záznamy v .kontext.jsonl nesou cteni_bajtu a zamitnuto, poslední záznam agenta vzniká při strukturovaném návratu
# (udalost navrat, jednou).
# Stav agenta (transkript, řez, maximum, příznaky, čtení) drží ${TMPDIR:-/tmp}/dev-pipeline-kontext/<agent_id> pod zámkem
# mkdir <stav>.lock (Claude Code pouští nástroje jednoho tahu souběžně, bez zámku by se zápisy stavu přepisovaly); find nad
# transkripty běží jen poprvé, pak tail + jq (~20 ms nad 15MB transkriptem). Fail-open: cokoli nejednoznačného projde.
set -uo pipefail

input=$(cat)
# Rychlá cesta: hook běží u každého volání nástroje v každé session, bez markeru běhu končí dřív než jq.
proj="${CLAUDE_PROJECT_DIR:-}"
[ -n "$proj" ] || proj=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
marker="$proj/docs/.orchestrator-run"
[ -n "$proj" ] && [ -f "$marker" ] || exit 0

# Jedno volání jq: pole vstupu, session z markeru, jestli Bash sahá na soubor předávky, příkaz (nové řádky jako \x1e),
# offset a limit Read a délka obsahu odpovědi nástroje (PostToolUse; obrázek a chybová odpověď bez obsahu = 0).
IFS=$'\037' read -r ev sid msid aid typ tool fp bash_predavka cmd off lim resp_len <<EOF
$(printf '%s' "$input" | jq -r --slurpfile m "$marker" '. as $i | [$i.hook_event_name, $i.session_id, ($m[0].session_id? // ""), $i.agent_id, $i.agent_type, $i.tool_name, ($i.tool_input.file_path? // ""), (($i.tool_input.command? // "") | tostring | contains("predavka-" + ($i.agent_id // "") + ".md")), (($i.tool_input.command? // "") | tostring | gsub("\n"; "\u001e")), ($i.tool_input.offset? // ""), ($i.tool_input.limit? // ""), (($i.tool_response? // "") | if type == "object" then ((.file.content? // .stdout? // "") | tostring) else "" end | length)] | map(. // "" | tostring) | join("\u001f")' 2>/dev/null)
EOF
[ -n "${aid:-}" ] && [ -n "${sid:-}" ] && [ "$sid" = "${msid:-}" ] || exit 0

MEKKY="${DEV_PIPELINE_KONTEXT_MEKKY:-250000}"
TVRDY="${DEV_PIPELINE_KONTEXT_TVRDY:-290000}"
ARCHITEKT="${DEV_PIPELINE_KONTEXT_ARCHITEKT:-170000}"
stdir="${TMPDIR:-/tmp}"; stdir="${stdir%/}/dev-pipeline-kontext"; st="$stdir/$aid"

# Zámek stavu: krátké čekání (do ~2 s), pak se opuštěný zámek převezme; bez zámku se jde dál (fail-open).
[ -d "$stdir" ] || mkdir -p "$stdir" 2>/dev/null
lock="$st.lock"; cekani=0
until mkdir "$lock" 2>/dev/null; do
  cekani=$((cekani + 1))
  if [ "$cekani" -gt 100 ]; then rmdir "$lock" 2>/dev/null; mkdir "$lock" 2>/dev/null; break; fi
  sleep 0.02
done
trap 'rmdir "$lock" 2>/dev/null' EXIT

cislo() { case "$1" in ''|*[!0-9]*) printf 0 ;; *) printf '%s' "$1" ;; esac; }
t=""; rez=""; max=0; zap=0; f100=0; fm=0; ft=0; fa=0; comp=0; pz=0; fn=0; cb=0; zam=0; cn=0; CTENI=""; zmena=0
if [ -f "$st" ]; then
  while IFS='=' read -r k v; do
    case "$k" in t) t=$v ;; rez) rez=$v ;; max) max=$(cislo "$v") ;; zap) zap=$(cislo "$v") ;; f100) f100=$(cislo "$v") ;; fm) fm=$(cislo "$v") ;;
      ft) ft=$(cislo "$v") ;; fa) fa=$(cislo "$v") ;; comp) comp=$(cislo "$v") ;; pz) pz=$(cislo "$v") ;; fn) fn=$(cislo "$v") ;;
      cb) cb=$(cislo "$v") ;; zam) zam=$(cislo "$v") ;; cn) cn=$(cislo "$v") ;; cteni) CTENI="${CTENI}cteni=$v"$'\n' ;; esac
  done < "$st"
fi
uloz() {
  [ "$zmena" = 1 ] || return 0
  { printf 't=%s\nrez=%s\nmax=%s\nzap=%s\nf100=%s\nfm=%s\nft=%s\nfa=%s\ncomp=%s\npz=%s\nfn=%s\ncb=%s\nzam=%s\ncn=%s\n' "$t" "$rez" "$max" "$zap" "$f100" "$fm" "$ft" "$fa" "$comp" "$pz" "$fn" "$cb" "$zam" "$cn"
    printf '%s' "$CTENI"; } > "$st.$$" 2>/dev/null && mv -f "$st.$$" "$st" 2>/dev/null
}

# ---------- stráž opakovaného čtení a měření ----------
# Výstup: s_deny (důvod zamítnutí, PreToolUse), s_cteni (řádky „cesta|úsek|mtime velikost|číslo“ proběhlých čtení,
# PostToolUse), s_je_cteni; base = adresář, ke kterému se vztahují relativní cesty (cd v příkazu ho posouvá).
s_deny=""; s_cteni=""; s_je_cteni=0; base="$proj"
otisk() { stat -f '%m %z' "$1" 2>/dev/null || stat -c '%Y %s' "$1" 2>/dev/null; }
# cesta → absolutní pod projektem, nebo prázdno (mimo cwd, výjimka, neexistuje)
cesta_v_cwd() {
  local f=$1
  case "$f" in /*) ;; *) f="$base/$f" ;; esac
  case "$f" in "$proj"/*) ;; *) return 1 ;; esac
  case "$f" in */docs/reviews/predavka-*.md|*/docs/.[!/]*) return 1 ;; esac
  [ -f "$f" ] || return 1
  printf '%s' "$f"
}
# posud <cesta> <od> <do|konec>: opakování téhož úseku nezměněného souboru → s_deny; jinak zapíše čtení
posud() {
  local f=$1 od=$2 do=$3 radku m drive
  radku=$(wc -l < "$f" 2>/dev/null | tr -d ' '); case "$radku" in ''|*[!0-9]*) return 0 ;; esac
  case "$od" in ''|*[!0-9]*) od=1 ;; esac
  if [ "$do" = konec ] || [ "$do" -gt "$radku" ]; then do=$radku; fi
  s_je_cteni=1
  m=$(otisk "$f")
  if [ -z "$s_deny" ] && [ -n "$m" ]; then
    drive=$(printf '%s' "$CTENI" | grep -F "cteni=$f|$od-$do|$m|" | head -1)
    [ -n "$drive" ] && s_deny="Tenhle úsek ${f#"$proj"/} (řádky $od-$do) už máš v kontextu (tvoje čtení č. ${drive##*|}) a soubor se od té doby nezměnil; čti jiný úsek, nebo pokračuj."
  fi
  s_cteni="${s_cteni}cteni=$f|$od-$do|${m:-0}|$((cn + 1))"$'\n'
}
# číslo z přepínače -n/-N/-n+N (head, tail): tiskne „N“ nebo „+N“; prázdno = výchozí 10
n_prepinac() {
  local a=$1 b=${2:-}
  case "$a" in
    -n) printf '%s' "$b" ;;
    -n+*|-n[0-9]*) printf '%s' "${a#-n}" ;;
    -[0-9]*) printf '%s' "${a#-}" ;;
  esac
}
straz_bash() {
  local kusy kus tok f od do vyraz i n jen_cteni=1
  case "$cmd" in *'<<'*) return 0 ;; esac   # heredoc: zápis
  kusy=${cmd//$'\x1e'/$'\n'}; kusy=${kusy//&&/$'\n'}; kusy=${kusy//||/$'\n'}; kusy=${kusy//;/$'\n'}
  while IFS= read -r kus; do
    kus="${kus#"${kus%%[![:space:]]*}"}"
    [ -n "$kus" ] || continue
    # roura a přesměrování výstupu do souboru: výstup nejde celý do kontextu, nebo je to zápis (2> a >&2 se nepočítají)
    case "$kus" in *'|'*) jen_cteni=0; continue ;; esac
    if printf '%s' "$kus" | grep -Eq '(^|[^0-9&>])>>?[[:space:]]*[^&[:space:]]'; then jen_cteni=0; continue; fi
    read -ra tok <<< "$kus"
    tok[0]="${tok[0]#\(}"; [ "${tok[0]}" = '{' ] && tok=("${tok[@]:1}")
    case "${tok[0]:-}" in
      cd) jen_cteni=0; f="${tok[1]:-}"; f="${f//\'/}"; f="${f//\"/}"; f="${f%\)}"
          case "$f" in /*) base="$f" ;; '') base="$proj" ;; *) base="$base/$f" ;; esac ;;
      cat|less|more)
        for f in "${tok[@]:1}"; do case "$f" in -*) continue ;; esac; f="${f%\)}"; f=$(cesta_v_cwd "$f") || continue; posud "$f" 1 konec; done ;;
      sed)
        i=1; vyraz=""
        case "${tok[1]:-}" in -n) i=2; [ "${tok[2]:-}" = -e ] && i=3 ;; -ne) i=2 ;; *) jen_cteni=0; continue ;; esac
        vyraz="${tok[$i]:-}"; vyraz="${vyraz//\'/}"; vyraz="${vyraz//\"/}"
        case "$vyraz" in
          p) od=1; do=konec ;;
          [0-9]*,\$p) od="${vyraz%%,*}"; do=konec ;;
          [0-9]*,[0-9]*p) od="${vyraz%%,*}"; do="${vyraz#*,}"; do="${do%p}" ;;
          [0-9]*p) od="${vyraz%p}"; do="$od" ;;
          *) continue ;;
        esac
        case "$od" in ''|*[!0-9]*) continue ;; esac
        case "$do" in konec) ;; ''|*[!0-9]*) continue ;; esac
        for f in "${tok[@]:$((i + 1))}"; do f="${f%\)}"; f=$(cesta_v_cwd "$f") || continue; posud "$f" "$od" "$do"; done ;;
      head|tail)
        n=""; i=1
        while [ "$i" -lt "${#tok[@]}" ]; do
          case "${tok[$i]}" in
            -c|-c*) n=preskoc; break ;;
            -n) n=$(n_prepinac -n "${tok[$((i+1))]:-}"); i=$((i+2)); continue ;;
            -[0-9]*|-n*) n=$(n_prepinac "${tok[$i]}"); i=$((i+1)); continue ;;
            -*) n=preskoc; break ;;
          esac
          break
        done
        if [ "$n" = preskoc ]; then jen_cteni=0; continue; fi
        [ -z "$n" ] && n=10
        case "$n" in +[0-9]*) ;; *[!0-9]*) continue ;; esac
        for f in "${tok[@]:$i}"; do
          case "$f" in -*) continue ;; esac
          f="${f%\)}"; f=$(cesta_v_cwd "$f") || continue
          if [ "${tok[0]}" = head ]; then posud "$f" 1 "$n"
          elif [ "${n#+}" != "$n" ]; then posud "$f" "${n#+}" konec
          else od=$(( $(wc -l < "$f" | tr -d ' ') - n + 1 )); [ "$od" -lt 1 ] && od=1; posud "$f" "$od" konec; fi
        done ;;
      awk)
        # jen holý průchod celým souborem: program mezi apostrofy (i s mezerami), soubory za ním
        case "$kus" in
          *"'"*"'"*) vyraz="${kus#*\'}"; vyraz="${vyraz%%\'*}"; f="${kus#*\'}"; f="${f#*\'}" ;;
          *) vyraz="${tok[1]:-}"; f="${kus#*awk}"; f="${f#*${tok[1]:-}}" ;;
        esac
        vyraz="${vyraz// /}"
        case "$vyraz" in '{print}'|'{print$0}'|1) ;; *) jen_cteni=0; continue ;; esac
        read -ra tok <<< "$f"
        for f in "${tok[@]:0}"; do f="${f%\)}"; f=$(cesta_v_cwd "$f") || continue; posud "$f" 1 konec; done ;;
      *) jen_cteni=0 ;;
    esac
  done <<< "$kusy"
  # volání, které něco dělá, může soubor teprve změnit: mtime před spuštěním nic neříká
  [ "$jen_cteni" = 1 ] || s_deny=""
}
if [ "$tool" = Read ] && [ -n "$fp" ]; then
  if f=$(cesta_v_cwd "$fp"); then
    case "$off" in ''|*[!0-9]*) off=1 ;; esac
    # Read bez limit vrací nejvýš 2 000 řádků
    case "$lim" in ''|*[!0-9]*) posud "$f" "$off" $((off + 1999)) ;; *) posud "$f" "$off" $((off + lim - 1)) ;; esac
  fi
elif [ "$tool" = Bash ] && [ -n "$cmd" ]; then
  straz_bash
fi
if [ "$ev" = PostToolUse ] && [ "$s_je_cteni" = 1 ]; then
  cn=$((cn + 1)); cb=$((cb + $(cislo "${resp_len:-0}"))); CTENI="${CTENI}${s_cteni}"; zmena=1
fi
# Zamítnutí stráže vydá až konec skriptu (tvrdý práh kontextu má přednost) a teprve tam se počítá.
straz_deny() {
  [ "$ev" = PreToolUse ] && [ -n "$s_deny" ] || return 0
  zam=$((zam + 1)); zmena=1; uloz
  jq -cn --arg r "$s_deny" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
}

if [ -z "$t" ] || [ ! -f "$t" ]; then
  # Transkript subagenta i agenta Workflow leží pod <projekty>/*/<session>/subagents/ (workflow v podadresáři); pole
  # s jeho cestou hook nedostává (ověřeno pokusem na Claude Code 2.1.284). DEV_PIPELINE_TRANSCRIPTS slouží testům.
  t=$(find "${DEV_PIPELINE_TRANSCRIPTS:-${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects}"/*/"$sid"/subagents -name "agent-$aid.jsonl" 2>/dev/null | head -1)
  [ -n "$t" ] || { uloz; straz_deny; exit 0; }
  # Řez jednou ze zadání na začátku transkriptu: rámec bloku PRD i stavby začíná „Řez NN:“; kolečko číslo řezu nemá.
  # Bez roury: grep -q/-m1 skončí po první shodě, head dostane SIGPIPE a pod pipefail vrátí roura 141, takže podmínka
  # by padla i při shodě.
  rez=$(grep -m1 -o -E 'Řez [0-9]+' < <(head -c 200000 "$t"))
  rez=${rez%%$'\n'*}; rez=${rez##* }
  if [ -n "$rez" ]; then rez=$(printf '%02d' "$((10#$rez))")
  elif grep -q '[Kk]olečk' < <(head -c 200000 "$t"); then rez=kolecko
  else rez=-; fi
  zmena=1
fi

# Kontext = usage poslední odpovědi asistenta; fromjson? přeskočí rozepsaný poslední řádek.
ctx=$(tail -n 400 "$t" | jq -R -s '[split("\n")[] | fromjson? | select(.type=="assistant") | .message.usage | select(.) | ((.input_tokens//0)+(.cache_read_input_tokens//0)+(.cache_creation_input_tokens//0)+(.output_tokens//0))] | last // empty' 2>/dev/null)
case "$ctx" in ''|*[!0-9]*) uloz; straz_deny; exit 0 ;; esac

# Compact: kontext spadl pod polovinu maxima nad 150 k. Maximum se resetuje, příznaky prahů platí zase od začátku.
udalost=""
if [ "$max" -gt 150000 ] && [ $((ctx * 2)) -lt "$max" ]; then
  comp=$((comp + 1)); max=$ctx; f100=0; fm=0; ft=0; fa=0; udalost=compact; zmena=1
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
# Strukturovaný návrat je poslední krok agenta: práh překročený až jím není důvod k předávce ani událost prahu, jen měření
# (hotový agent by dostal falešnou výzvu k předávce). Před návratem (PreToolUse) vznikne jednou záznam, aby poslední záznam
# agenta nesl konečné čtení (udalost navrat, když žádná jiná).
if [ "$tool" = StructuredOutput ]; then
  case "$udalost" in tvrdy|mekky)
    if [ "$f100" != 1 ] || [ $((max - zap)) -ge 25000 ]; then udalost=mereni; else udalost=""; fi ;;
  esac
  if [ -z "$udalost" ] && [ "$ev" = PreToolUse ] && [ "$fn" != 1 ]; then udalost=navrat; fi
fi
case "$udalost" in tvrdy) ft=1; fm=1; f100=1 ;; mekky) fm=1; f100=1 ;; mereni) f100=1 ;; navrat) fn=1 ;; esac
if [ -n "$udalost" ]; then
  [ "$udalost" != navrat ] && zap=$max
  zmena=1
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg rez "$rez" --arg aid "$aid" --arg typ "${typ#dev-pipeline:}" \
    --argjson k "$ctx" --argjson m "$max" --argjson c "$comp" --arg u "$udalost" --argjson cb "$cb" --argjson z "$zam" \
    '{ts:$ts, rez:$rez, aid:$aid, typ:(if $typ == "" then "-" else $typ end), kontext:$k, max:$m, compactu:$c, udalost:$u, cteni_bajtu:$cb, zamitnuto:$z}' \
    >> "$proj/docs/.kontext.jsonl" 2>/dev/null
fi
# Předávka do logu: první volání po tom, co agent zapsal svou předávku (Write, Edit i Bash heredoc), zapíše záznam
# udalost "predavka". Uzavření počítá předávky řezu z logu; do 1.6.0 v něm nebyly a journal psal rozporné věty.
if [ "$pz" != 1 ] && [ "$ev" = PostToolUse ] && [ -f "$proj/docs/reviews/predavka-$aid.md" ]; then
  pz=1; zmena=1
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg rez "$rez" --arg aid "$aid" --arg typ "${typ#dev-pipeline:}" \
    --argjson k "$ctx" --argjson m "$max" --argjson c "$comp" --arg s "docs/reviews/predavka-$aid.md" --argjson cb "$cb" --argjson z "$zam" \
    '{ts:$ts, rez:$rez, aid:$aid, typ:(if $typ == "" then "-" else $typ end), kontext:$k, max:$m, compactu:$c, udalost:"predavka", soubor:$s, cteni_bajtu:$cb, zamitnuto:$z}' \
    >> "$proj/docs/.kontext.jsonl" 2>/dev/null
fi
# Výzva PRD agentovi zapsat kostru (jednou, jako ostatní prahy; compact ji obnoví). Jen po nástroji a ne po návratu.
arch=""
if [ "$typ" = dev-pipeline:prd ] && [ "$fa" != 1 ] && [ "$ev" = PostToolUse ] && [ "$tool" != StructuredOutput ] \
  && [ "$ctx" -ge "$ARCHITEKT" ]; then
  case "$t" in */subagents/workflows/*)
    fa=1; zmena=1
    arch="Jestli jsi architekt a ještě jsi nezapsal kostru PRD, zapiš ji teď (tabulka Části, Kontrakt, kritéria), i neúplnou; E2E scénáře nech nástupci." ;;
  esac
fi
uloz

# Výzvu k předávce dostávají jen agenti Workflow bloků (transkript pod subagents/workflows/): jen blok umí pustit nástupce
# s předávkou. Přímí subagenti orchestrátora (pruzkum, preflight) se jen měří; stráž čtení platí pro oba.
case "$t" in */subagents/workflows/*) ;; *) straz_deny; exit 0 ;; esac

P="$proj/docs/reviews/predavka-$aid.md"
# Implementační agent navíc vypíše zbývající soubory (řádek předávky i pole návratu): blok z nich u Kontraktu na stropu
# předávek skládá dva agenty po polovinách.
ZBYVA=""; ZBYVA_NAVRAT=""
if [ "$typ" = dev-pipeline:implement ]; then
  ZBYVA=" a řádek „zbývající soubory: …“ (soubory ze zadání, které ještě nejsou hotové, cesty relativně ke kořeni projektu)"
  ZBYVA_NAVRAT=", zbyvajici_soubory = tytéž soubory jako v předávce"
fi
BODY="1. zadání jednou větou; 2. co je hotové a čím je to ověřené (příkaz, test); 3. co zbývá, v pořadí, jak bys pokračoval$ZBYVA; 4. zjištění, která nástupce potřebuje (soubory, symboly, pasti, užitečné příkazy); 5. rozdělané soubory a stav testů a typechecku; 6. všechno, co patří do tvého strukturovaného návratu (follow-upy, odchylky, nálezy, počty), aby ho nástupce mohl vrátit za celé zadání."
if [ "$ev" = "PostToolUse" ] && [ "$ctx" -ge "$MEKKY" ] && [ "$tool" != StructuredOutput ]; then
  # Hotový agent nepředává: předávka „nic nezbývá“ by jen pustila nástupce, který vrátí návrat.
  # Výzva architektovi (když přišla ve stejném kroku) jde před ni: kostra má být na disku dřív, než agent předá.
  jq -cn --arg z "${arch:+$arch }PŘEDÁVKA: Když je celé zadání už hotové a zbývá jen návrat, vrať normální návrat bez předávky (pole predavka nevyplňuj). Jinak tuhle práci dokončí nástupce se stejným zadáním. Dokonči jen rozdělaný krok (dopiš rozepsanou změnu a nech projít její test; strom nenechávej rozbitý), nic nového nezačínej. Pak zapiš předávku do $P: $BODY Pak ukonči práci strukturovaným návratem: pole predavka = $P$ZBYVA_NAVRAT, ostatní povinná pole vyplň podle skutečného stavu (stav: castecne, když ho schéma má)." \
    '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$z}}'
elif [ -n "$arch" ]; then
  jq -cn --arg z "$arch" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$z}}'
elif [ "$ev" = "PreToolUse" ] && [ "$ctx" -ge "$TVRDY" ]; then
  # Projde jen strukturovaný návrat a práce se souborem předávky (cesta i relativně: agent ji mohl zkrátit).
  case "$tool" in
    StructuredOutput) exit 0 ;;
    Write|Edit|MultiEdit|Read) case "$fp" in "$P"|*/docs/reviews/"predavka-$aid.md"|docs/reviews/"predavka-$aid.md") exit 0 ;; esac ;;
    Bash) [ "$bash_predavka" = true ] && exit 0 ;;
  esac
  jq -cn --arg r "PŘEDÁVKA je povinná: jediné povolené kroky jsou zápis předávky do $P a strukturovaný návrat s polem predavka = $P$ZBYVA_NAVRAT (když je zadání už hotové, stačí strukturovaný návrat bez předávky). Předávka: $BODY" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
else
  straz_deny
fi
exit 0
