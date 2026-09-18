#!/usr/bin/env bash
# Status line Claude Code (settings.json → statusLine.command: bash ~/.claude/statusline.sh, refreshInterval 30 s).
# Řádek 1: původní příkaz beze změny (model, bar kontextu, procenta, tokeny, větev, projekt).
# Za ním segment živých agentů z dev-pipeline: scripts/co-dela.sh --status (jen když skript existuje a něco běží).
# Zdroj: setup/statusline.sh v repu claude-dev-pipeline. Cestu k repu lze přebít proměnnou DEV_PIPELINE_REPO.

input=$(cat); model=$(echo "$input" | jq -r '.model.display_name'); cwd=$(echo "$input" | jq -r '.workspace.current_dir'); project_dir=$(echo "$input" | jq -r '.workspace.project_dir'); usage=$(echo "$input" | jq '.context_window.current_usage'); size=$(echo "$input" | jq -r '.context_window.context_window_size'); if [ "$project_dir" != "null" ] && [ -n "$project_dir" ]; then project=$(basename "$project_dir"); else project=$(basename "$cwd"); fi; git_branch=""; if git -C "$cwd" rev-parse --git-dir > /dev/null 2>&1; then branch=$(git -C "$cwd" --no-optional-locks branch --show-current 2>/dev/null); if [ -n "$branch" ]; then git_branch="$branch"; fi; fi; output="\033[36m${model}\033[0m"; if [ "$usage" != "null" ]; then current=$(echo "$usage" | jq '.input_tokens + .cache_creation_input_tokens + .cache_read_input_tokens'); if [ "$current" != "null" ] && [ "$size" != "null" ] && [ "$size" -gt 0 ]; then pct=$((current * 100 / size)); filled=$((pct / 5)); empty=$((20 - filled)); bar=""; for ((i=0; i<filled; i++)); do bar="${bar}█"; done; for ((i=0; i<empty; i++)); do bar="${bar}░"; done; output="${output} [${bar}]"; output="${output} \033[33m${pct}%\033[0m"; if [ "$current" -ge 1000 ]; then current_k=$((current / 1000)); tokens_current="${current_k}k"; else tokens_current="$current"; fi; if [ "$size" -ge 1000 ]; then size_k=$((size / 1000)); tokens_size="${size_k}k"; else tokens_size="$size"; fi; output="${output} \033[2m${tokens_current}/${tokens_size}\033[0m"; fi; fi; if [ -n "$git_branch" ]; then output="${output} \033[32m${git_branch}\033[0m"; fi; if [ -n "$project" ]; then output="${output} \033[34m${project}\033[0m"; fi; printf "%b" "$output"


# --- dev-pipeline: živí agenti (Workflow bloky a samostatní agenti této session) ---
co_dela="${DEV_PIPELINE_REPO:-$HOME/claude-dev-pipeline}/dev-pipeline/scripts/co-dela.sh"
if [ -f "$co_dela" ]; then
  seg=$(printf '%s' "$input" | bash "$co_dela" --status 2>/dev/null)
  [ -n "$seg" ] && printf ' %b' "$seg"
fi
exit 0
