#!/usr/bin/env bash
# dev-pipeline PermissionRequest hook: v běhu orchestrace zamítne každý dialog ke schválení hned.
#
# Aktivní JEN když v projektu leží docs/.orchestrator-run se session_id shodným s touto session (orchestrátor i agenti
# Workflow nesou session_id hlavní session). Dialog v běhu nikdo neschválí: agentovi Workflow vyprší po 120 s a příkaz se
# zamítne, takže hook jen ušetří čekání a agentovi řekne, jak příkaz přepsat. Typický spouštěč je pojistka Claude Code
# (circuitBreaker dangerousRemoval): příkaz, který parser nepřečte (zsh příznaky expanze), nebo rm, které nevyloučí; ta
# platí i pod --dangerously-skip-permissions a hook ji smí jen odmítnout, ne schválit. Zamítá i ve stavu zastaveno: běh bez
# člověka trvá, dokud leží marker.
# Každé zamítnutí jde řádkem udalost "dialog" do docs/.kontext.jsonl (čte co-dela.sh a zprava.py).
# Fail-open: bez markeru, v cizí session nebo s nečitelným vstupem hook mlčí a dialog se ukáže.
set -uo pipefail

input=$(cat)
proj="${CLAUDE_PROJECT_DIR:-}"
[ -n "$proj" ] || proj=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
marker="$proj/docs/.orchestrator-run"
[ -n "$proj" ] && [ -f "$marker" ] || exit 0

IFS=$'\037' read -r sid aid typ tool prikaz <<EOF
$(printf '%s' "$input" | jq -r '[.session_id, .agent_id, .agent_type, .tool_name, ((.tool_input.command? // .tool_input.file_path? // (.tool_input | tostring)) | tostring | gsub("[\n\u001e\u001f]"; " ") | .[0:200])] | map(. // "" | tostring) | join("\u001f")' 2>/dev/null)
EOF
[ -n "${tool:-}" ] && [ -n "${sid:-}" ] || exit 0
msid=$(sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$marker" 2>/dev/null | head -1)
[ -n "$msid" ] && [ "$msid" = "$sid" ] || exit 0

# Řez agenta zná stav hlídače kontextu (týž adresář jako hlidac-kontextu.sh); orchestrátor a neznámý agent mají „-“.
rez="-"
if [ -n "${aid:-}" ]; then
  st="${TMPDIR:-/tmp}"; st="${st%/}/dev-pipeline-kontext/$aid"
  r=$(sed -n 's/^rez=//p' "$st" 2>/dev/null | head -1); [ -n "$r" ] && rez=$r
  [ -n "${typ:-}" ] || typ="-"
else
  typ="orchestrator"
fi
# Claude Code volá hook pro jeden dialog dvakrát a souběžně (dvě vyhodnocení téhož příkazu, ověřeno pokusem): týž příkaz
# téhož agenta v jednom desetisekundovém okně zapíše jen volání, kterému projde atomické mkdir; zamítne se pokaždé.
ddir="${TMPDIR:-/tmp}"; ddir="${ddir%/}/dev-pipeline-dialog"; mkdir -p "$ddir" 2>/dev/null
find "$ddir" -mindepth 1 -maxdepth 1 -mmin +5 -exec rm -rf {} + 2>/dev/null
klic="$(printf '%s' "$sid|${aid:-}|$tool|${prikaz:-}" | cksum | tr -d ' ')-$(( $(date +%s) / 10 ))"
if mkdir "$ddir/$klic" 2>/dev/null; then
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg rez "$rez" --arg aid "${aid:-}" --arg typ "$typ" --arg n "$tool" --arg p "${prikaz:-}" \
    '{ts:$ts, rez:$rez, aid:$aid, typ:$typ, udalost:"dialog", nastroj:$n, prikaz:$p}' >> "$proj/docs/.kontext.jsonl" 2>/dev/null
fi

zaklad="dev-pipeline: běh orchestrace je bez člověka, dialog ke schválení by nikdo nepotvrdil, proto ho hook zamítl. Akce se NEPROVEDLA."
if [ "$tool" = Bash ]; then
  zprava="$zaklad Claude Code tenhle příkaz posílá člověku, když ho jeho parser nepřečte (typicky zsh příznaky expanze \${(f)…}, \${(P)x}, \${(u)x}, \${x:l}, \${=x}) nebo když nevyloučí nebezpečné rm (rm s proměnnou, maskou nebo bez doslovné cesty). Přepiš ho a spusť znovu: seznam řádků do pole přes while IFS= read -r, nepřímou proměnnou přes asociativní pole nebo přímé jméno, rm jen s doslovnou cestou (dočasné soubory ve scratchpadu mazat nemusíš), složitější postup zapiš jako skript do scratchpadu a spusť ho interpretem, pro který je napsaný (zsh <soubor> nebo bash <soubor>)."
elif [ -n "${aid:-}" ]; then
  zprava="$zaklad Udělej to jinou cestou, kterou pravidla běhu povolují, nebo to vrať v návratu jako otázku pro orchestrátora."
else
  zprava="$zaklad Udělej to jinou cestou, nebo potřebu zapiš do vize-spory jako otázku pro majitele a pokračuj."
fi
jq -n --arg m "$zprava" '{hookSpecificOutput:{hookEventName:"PermissionRequest", decision:{behavior:"deny", message:$m}}}'
exit 0
