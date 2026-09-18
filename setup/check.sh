#!/usr/bin/env bash
# dev-pipeline: kontrola instalace na tomto stroji. Nic nemění, jen hlásí. Spusť: bash setup/check.sh
# Návratový kód 0 = vše nutné je na místě; 1 = něco nutného chybí (řádky FAIL).
set -uo pipefail
ok=0; warn=0; fail=0
OK()   { printf 'OK    %s\n' "$1"; ok=$((ok+1)); }
WARN() { printf 'WARN  %s\n' "$1"; warn=$((warn+1)); }
FAIL() { printf 'FAIL  %s\n' "$1"; fail=$((fail+1)); }
have() { command -v "$1" >/dev/null 2>&1; }
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
settings="$HOME/.claude/settings.json"
claude_json="$HOME/.claude.json"

echo "== nástroje"
for t in claude git node jq python3 uv; do
  if have "$t"; then OK "$t: $($t --version 2>&1 | head -1)"; else FAIL "$t chybí"; fi
done
have rg && OK "rg: $(rg --version 2>&1 | head -1)" || WARN "rg není systémová binárka; agentům v Bash nástroji Claude Code podstrkuje vlastní ripgrep funkcí rg, takže běh to nepotřebuje (brew install ripgrep jen pro tvůj terminál)"
have gh && OK "gh: $(gh --version | head -1)" || WARN "gh chybí (jen pro práci s GitHubem, pipeline ho nepotřebuje)"
have tmux && OK "tmux" || WARN "tmux chybí (jen pro scripts/limit-watcher.sh na běh mimo dohled)"
if have claude; then
  v=$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  [ -n "$v" ] && [ "$(printf '%s\n2.1.271\n' "$v" | sort -V | head -1)" = "2.1.271" ] && OK "Claude Code $v ≥ 2.1.271 (autoContinueAtUsageLimit, statusLine.refreshInterval)" || WARN "Claude Code $v: ověřeno s 2.1.271+"
  claude --help 2>/dev/null | grep -q -- '--autocompact' && OK "claude --autocompact k dispozici" || WARN "claude --autocompact není v --help; použij /autocompact 400k v session"
fi

echo "== Serena"
if have serena; then OK "serena: $(serena --version 2>&1 | head -1)"; else FAIL "serena chybí (uv tool install serena-agent)"; fi
have serena-hooks && OK "serena-hooks" || FAIL "serena-hooks chybí (je součást balíku serena-agent; zkontroluj PATH na ~/.local/bin)"
if [ -f "$claude_json" ] && jq -e '.mcpServers.serena' "$claude_json" >/dev/null 2>&1; then
  args=$(jq -r '.mcpServers.serena.args | join(" ")' "$claude_json")
  case "$args" in *"--project-from-cwd"*) OK "MCP server serena (user scope): $args" ;; *) WARN "MCP server serena je registrovaný, ale bez --project-from-cwd: $args" ;; esac
else FAIL "MCP server serena není v ~/.claude.json (claude mcp add --scope user serena -- \$HOME/.local/bin/serena start-mcp-server --context claude-code --project-from-cwd)"; fi
if [ -f "$settings" ]; then
  for h in "activate" "remind" "auto-approve" "cleanup"; do
    jq -r '.hooks // {} | .. | .command? // empty' "$settings" | grep -q "serena-hooks $h" && OK "hook serena-hooks $h" || WARN "hook serena-hooks $h chybí v settings.json (setup/settings.snippet.json)"
  done
fi
[ -f "$HOME/.claude/CLAUDE.md" ] && grep -q 'mcp__serena__' "$HOME/.claude/CLAUDE.md" && OK "~/.claude/CLAUDE.md má sekci o Sereně" || WARN "~/.claude/CLAUDE.md nemá sekci o Sereně (setup/CLAUDE.global.md)"
[ -n "${MCP_TIMEOUT:-}" ] && OK "MCP_TIMEOUT=$MCP_TIMEOUT" || WARN "MCP_TIMEOUT není nastaven (export MCP_TIMEOUT=60000 v profilu shellu; start language serveru u velkého repa trvá)"

echo "== Claude Code nastavení"
if [ -f "$settings" ]; then
  jq -e '.extraKnownMarketplaces["claude-dev-pipeline"]' "$settings" >/dev/null 2>&1 && OK "marketplace claude-dev-pipeline: $(jq -r '.extraKnownMarketplaces["claude-dev-pipeline"].source.path' "$settings")" || FAIL "marketplace claude-dev-pipeline chybí v settings.json"
  [ "$(jq -r '.enabledPlugins["dev-pipeline@claude-dev-pipeline"]' "$settings")" = "true" ] && OK "plugin dev-pipeline zapnutý" || FAIL "plugin dev-pipeline není zapnutý (claude plugin install dev-pipeline@claude-dev-pipeline)"
  [ "$(jq -r '.autoContinueAtUsageLimit' "$settings")" = "true" ] && OK "autoContinueAtUsageLimit: true" || FAIL "autoContinueAtUsageLimit není true (Workflow po usage limitu nepokračuje)"
  [ "$(jq -r '.enabledPlugins["context7@claude-plugins-official"]' "$settings")" = "true" ] && OK "plugin context7 zapnutý" || WARN "plugin context7 není zapnutý (implement agent bez aktuální dokumentace knihoven)"
  [ "$(jq -r '.enabledPlugins["claude-security@claude-plugins-official"]' "$settings")" = "true" ] && OK "plugin claude-security zapnutý (sken jen na vyžádání)" || WARN "plugin claude-security není zapnutý (volitelný)"
  if jq -e '.statusLine' "$settings" >/dev/null 2>&1; then
    ri=$(jq -r '.statusLine.refreshInterval // empty' "$settings")
    [ -n "$ri" ] && OK "statusLine s refreshInterval $ri s" || WARN "statusLine bez refreshInterval: segment agentů se v tiché session nepřekreslí"
  else WARN "statusLine není nastavená (volitelné: setup/statusline.sh)"; fi
  [ -f "$HOME/.claude/statusline.sh" ] && grep -q 'co-dela.sh' "$HOME/.claude/statusline.sh" && OK "~/.claude/statusline.sh volá co-dela.sh --status" || WARN "~/.claude/statusline.sh nevolá co-dela.sh (volitelné)"
else FAIL "$settings neexistuje"; fi
[ "${ANTHROPIC_SMALL_FAST_MODEL:-}" = "claude-sonnet-5" ] && OK "ANTHROPIC_SMALL_FAST_MODEL=claude-sonnet-5" || WARN "ANTHROPIC_SMALL_FAST_MODEL není claude-sonnet-5 (pomocné úlohy pojedou na výchozím malém modelu)"

echo "== plugin"
inst=$(ls -d "$HOME/.claude/plugins/cache/claude-dev-pipeline/dev-pipeline/"*/ 2>/dev/null | sort -V | tail -1)
src=$(jq -r '.version' "$repo/dev-pipeline/.claude-plugin/plugin.json")
if [ -n "$inst" ]; then
  iv=$(jq -r '.version' "$inst/.claude-plugin/plugin.json" 2>/dev/null)
  [ "$iv" = "$src" ] && OK "nainstalovaná verze $iv = zdroj $src" || WARN "nainstalovaná verze $iv, zdroj má $src (claude plugin update dev-pipeline@claude-dev-pipeline)"
else FAIL "plugin není v cache (claude plugin install dev-pipeline@claude-dev-pipeline)"; fi
nx=0; for f in "$repo"/dev-pipeline/hooks/*.sh "$repo"/dev-pipeline/scripts/*.sh; do [ -x "$f" ] || { nx=$((nx+1)); }; done
[ "$nx" = 0 ] && OK "hooky a skripty pluginu jsou spustitelné" || FAIL "$nx skriptů pluginu není spustitelných (chmod +x dev-pipeline/hooks/*.sh dev-pipeline/scripts/*.sh)"

echo "== E2E"
if have agent-browser; then
  OK "agent-browser $(agent-browser --version 2>&1 | head -1)"
  agent-browser doctor >/dev/null 2>&1 && OK "agent-browser doctor: bez nálezu" || WARN "agent-browser doctor hlásí problém (agent-browser install; agent-browser doctor --fix)"
else WARN "agent-browser chybí (npm i -g agent-browser && agent-browser install); bez něj běží E2E jen jako doložení kritérií bez prohlížeče"; fi

echo
printf 'OK %d · WARN %d · FAIL %d\n' "$ok" "$warn" "$fail"
[ "$fail" = 0 ]
