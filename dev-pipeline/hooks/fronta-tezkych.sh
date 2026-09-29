#!/usr/bin/env bash
# dev-pipeline fronta těžkých příkazů (PreToolUse, matcher Bash).
#
# Aktivní JEN pro subagenta (vstup s agent_id) session, jejíž session_id nese docs/.orchestrator-run; jinak exit 0 bez výstupu.
# Těžký příkaz (suita testů, typecheck celého repa, instalace, build, git commit s pre-commit branou) přepíše přes updatedInput
# na obal, který nejdřív čeká na místo v rozpočtu stroje (scripts/tezky.py, váha podle tabulky v TRIDENI); lehký projde beze
# změny. Proč: souběžné části řezu si dělí 8 jader a 16 GB, myšlení agentů běží na serverech a stroj zatěžují jen místní
# příkazy (analýza 5.14: Mac se v běhu bez-dluhu přehříval). Přepis přes updatedInput ověřen 29. 9. na Claude Code 2.1.284
# u subagenta i agenta Workflow. Obal běží ve stejném shellu jako původní příkaz, $$ je PID toho shellu; když ho zabije
# timeout, místo uvolní tezky.py sám podle mrtvého PID.
# E2E verifikátor těžké příkazy nesmí vůbec: ověřuje běžící aplikaci, kritéria nad kódem změřila brána.
# Fail-open: cokoli nejednoznačného projde beze změny.
set -uo pipefail

input=$(cat)
proj="${CLAUDE_PROJECT_DIR:-}"
[ -n "$proj" ] || proj=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
marker="$proj/docs/.orchestrator-run"
[ -n "$proj" ] && [ -f "$marker" ] || exit 0
IFS=$'\037' read -r sid msid aid typ <<EOF
$(printf '%s' "$input" | jq -r --slurpfile m "$marker" '[.session_id, ($m[0].session_id? // ""), .agent_id, .agent_type] | map(. // "" | tostring) | join("\u001f")' 2>/dev/null)
EOF
[ -n "${aid:-}" ] && [ -n "${sid:-}" ] && [ "$sid" = "${msid:-}" ] || exit 0
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -n "$cmd" ] || exit 0
# Už obalený příkaz (agent zopakoval obal z výstupu, nebo hook běží dvakrát) se znovu neobaluje.
case "$cmd" in *tezky.py*) exit 0 ;; esac

# Třídění po segmentech (&&, ||, ;, |, řádky) bez těl heredoců a bez přesměrování. Výstup „váha zákaz“: váha je nejvyšší
# váha segmentu, zákaz = 1, když by příkaz E2E verifikátor nesměl (cokoli těžkého kromě git commit, nebo git worktree add).
#   4  suita testů: pnpm test, pnpm -r test, pnpm --filter X test, turbo test, npm test, yarn test, vitest bez cesty; git commit
#   3  typecheck nebo lint celého repa: pnpm typecheck, pnpm -r typecheck, turbo (mimo test a build), pnpm verify:arch
#   2  instalace (pnpm install|i|add, npm ci|install), build (pnpm build, turbo build, vite|next|astro build, tsc -b),
#      vitest nad adresářem (argument je cesta bez .test./.spec.)
#   1  typecheck jednoho balíčku (tsc -p|--noEmit, pnpm --filter X typecheck, pnpm -C dir typecheck), cílené testy (*.test.*)
read -r -d '' TRIDENI <<'AWK'
function zapis(v, commit) { if (v > vaha) vaha = v; if (v > 0 && !commit) zakaz = 1 }
function testy(i,   j, t, soubor, adr) {
  soubor = 0; adr = 0
  for (j = i; j <= n; j++) { t = tok[j]; if (t ~ /^-/) continue
    if (t ~ /\.(test|spec)\./) soubor = 1; else if (t ~ /\//) adr = 1 }
  return adr ? 2 : (soubor ? 1 : 4)
}
function nastroj(w, i,   j) {
  if (w == "vitest" || w == "jest") { if (tok[i] == "run") i++; return testy(i) }
  if (w == "turbo") {
    # Dlouho běžící úlohy (dev server, watch) by držely místo ve frontě, dokud žije jejich shell: frontou nejdou.
    for (j = i; j <= n; j++) if (tok[j] ~ /^(dev|start|serve|preview|watch)(:|$)/) return 0
    for (j = i; j <= n; j++) if (tok[j] == "test" || tok[j] ~ /^test:/) return 4
    for (j = i; j <= n; j++) if (tok[j] == "build" || tok[j] ~ /^build:/) return 2
    return 3
  }
  if (w == "tsc") { for (j = i; j <= n; j++) if (tok[j] == "-w") return 0; for (j = i; j <= n; j++) if (tok[j] == "-b" || tok[j] == "--build") return 2; return 1 }
  if ((w == "vite" || w == "next" || w == "astro") && tok[i] == "build") return 2
  return 0
}
function skript(s, i, filtr) {
  if (s == "test" || s == "t" || s ~ /^test:/) return testy(i)
  if (s == "typecheck" || s ~ /^typecheck:/ || s == "lint" || s ~ /^lint:/) return filtr ? 1 : 3
  if (s == "verify:arch") return 3
  if (s == "build" || s ~ /^build:/) return 2
  return nastroj(s, i)
}
function jmeno(w) { sub(/.*\//, "", w); sub(/@.*/, "", w); return w }
function segment(seg,   raw, m, k, t, i, j, w, filtr) {
  m = split(seg, raw, " "); n = 0; split("", tok)
  for (k = 1; k <= m; k++) {
    t = raw[k]
    if (t ~ /^[0-9]*(<|>|&>)/) { if (t ~ /^[0-9]*(<|>>?|&>>?)$/) k++; continue }
    gsub(/^[({!]+|[)};]+$/, "", t)
    if (t != "" && t != "&") tok[++n] = t
  }
  # Režim --watch běží, dokud ho někdo nezabije: místo ve frontě by držel trvale (suita brány by ho pak nikdy nedostala).
  for (j = 1; j <= n; j++) if (tok[j] ~ /^--watch(=|$)/) return
  i = 1
  while (i <= n && (tok[i] ~ /^(sudo|env|time|nice|nohup|command|exec|do|then|else|if|while|until)$/ || tok[i] ~ /^[A-Za-z_][A-Za-z0-9_]*=/)) i++
  if (i > n) return
  w = jmeno(tok[i])
  if (w == "git") {
    j = i + 1
    while (j <= n && tok[j] ~ /^-/) j += (tok[j] == "-C" || tok[j] == "-c") ? 2 : 1
    if (tok[j] == "commit") zapis(4, 1)
    else if (tok[j] == "worktree" && tok[j + 1] == "add") zakaz = 1
    return
  }
  if (w == "npx" || w == "bunx") {
    j = i + 1; while (j <= n && tok[j] ~ /^-/) j++
    if (j <= n) zapis(nastroj(jmeno(tok[j]), j + 1), 0)
    return
  }
  if (w == "pnpm" || w == "npm" || w == "yarn" || w == "bun") {
    filtr = 0; j = i + 1
    while (j <= n) {
      t = tok[j]
      if (t == "--filter" || t == "-F" || t == "-C" || t == "--dir" || t == "--prefix" || t == "--workspace") { filtr = 1; j += 2; continue }
      if (t ~ /^--(filter|dir|prefix|workspace)=/) { filtr = 1; j++; continue }
      if (t ~ /^-/ || t == "run" || t == "run-script") { j++; continue }
      break
    }
    if (j > n) { if (w == "yarn") zapis(2, 0); return }
    t = tok[j]
    if (t == "exec" || t == "dlx" || t == "x") {
      j++; while (j <= n && tok[j] ~ /^-/) j++
      if (j <= n) zapis(nastroj(jmeno(tok[j]), j + 1), 0)
      return
    }
    if (t == "install" || t == "i" || t == "add" || t == "ci") { zapis(2, 0); return }
    zapis(skript(t, j + 1, filtr), 0)
    return
  }
  zapis(nastroj(w, i + 1), 0)
}
BEGIN { vaha = 0; zakaz = 0; konec = "" }
{
  if (konec != "") { r = $0; gsub(/^[ \t]+|[ \t]+$/, "", r); if (r == konec) konec = ""; next }
  h = $0; gsub(/<<</, "", h)
  if (match(h, /<<-?[ \t]*['"]?[A-Za-z_][A-Za-z0-9_]*/)) { konec = substr(h, RSTART, RLENGTH); sub(/^<<-?[ \t]*['"]?/, "", konec) }
  radek = $0; gsub(/&&|\|\||[;|]/, "\n", radek)
  pocet = split(radek, segs, "\n")
  for (s = 1; s <= pocet; s++) segment(segs[s])
}
END { print vaha, zakaz }
AWK
read -r vaha zakaz <<EOF
$(printf '%s\n' "$cmd" | awk "$TRIDENI" 2>/dev/null)
EOF

case "${typ:-}" in
  dev-pipeline:e2e-verifier|e2e-verifier)
    if [ "${zakaz:-0}" = 1 ]; then
      jq -cn --arg r "E2E ověřuje běžící aplikaci, ne kód: worktree, instalace, testy ani typecheck nespouštíš. Kritéria nad kódem (značka [měřidlo]) změřila brána nad odevzdávaným stromem, výsledek je v reportu brány ze zadání; měřidlo nad starší revizí jen přes git objekty (git show <rev>:<soubor>, git grep <vzor> <rev>)." \
        '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
      exit 0
    fi ;;
esac
case "${vaha:-0}" in ''|*[!0-9]*|0) exit 0 ;; esac
command -v python3 >/dev/null 2>&1 || exit 0

# Obal: vezmi čeká na místo (kód 75 po vypršení, pak se příkaz nespustí), vrat uvolní místo i po chybě příkazu;
# návratový kód je kód původního příkazu. Popis pro co-dela: prvních 80 znaků příkazu, jednoduché uvozovky nahrazené.
tezky="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/tezky.py"
read -r -d '' OBAL <<'JQ'
.tool_input as $ti
| ($ti.command | split("\n") | join(" ") | split("'") | join("\"") | .[0:80]) as $popis
| ([($ti.timeout // 120000), 600000] | max) as $to
# Čekání ve frontě se počítá do timeoutu příkazu: v popředí zbude na samotný běh aspoň 420 s (suita, commit s branou).
| (if $ti.run_in_background == true then "" else " --max-cekani \([(($to / 1000) - 420), 60] | max | floor)" end) as $mc
| "python3 '\($py)' vezmi --vaha \($v) --pid $$ --popis '\($popis)'\($mc) && {\n\($ti.command)\n}; __dp_rc=$?; python3 '\($py)' vrat --pid $$; (exit $__dp_rc)" as $obal
| {hookSpecificOutput:{hookEventName:"PreToolUse", permissionDecision:"allow",
   updatedInput:($ti + {command:$obal, timeout:$to})}}
JQ
printf '%s' "$input" | jq -c --arg py "$tezky" --argjson v "$vaha" "$OBAL" 2>/dev/null
exit 0
