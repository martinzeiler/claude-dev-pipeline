#!/usr/bin/env bash
# Testy scripts/xprotectd.py: prahy rady na restart, čtení sloupce mem z top, sledování session podle poměru,
# a že co-dela.sh řádek ukáže i za zkrácením dlouhého výpisu. Spusť: dev-pipeline/tests/skripty/xprotectd.sh
set -uo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); plugin=$(cd "$here/../.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/xprotectd-test.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
ok() { pass=$((pass+1)); }; ko() { fail=$((fail+1)); echo "FAIL $*"; }
je() { # název, mem, poměr, čekaný řádek
  local o; o=$(python3 "$plugin/scripts/xprotectd.py" --hodnoty "$2" "$3" 2>&1)
  [ "$o" = "$4" ] && ok || ko "$1: čekáno [$4], je [$o]"
}

je mb-nesledovana 56M 1.1 "xprotectd 56 MB · session nesledovaná"
je priznak-top 117M+ 1 "xprotectd 117 MB · session nesledovaná"
je kilobajty 2048K 1 "xprotectd 2 MB · session nesledovaná"
je gb-carka 2.4G 1 "xprotectd 2,4 GB · session nesledovaná"
# práh pauzy 8 GB včetně
je pod-pauzou 7.9G 1 "xprotectd 7,9 GB · session nesledovaná"
je prah-pauzy 8G 1 "⚠ xprotectd 8,0 GB · session nesledovaná · restartuj počítač při nejbližší pauze mezi bloky"
# práh „co nejdřív“ 16 GB včetně
je pod-hned 15.9G 1 "⚠ xprotectd 15,9 GB · session nesledovaná · restartuj počítač při nejbližší pauze mezi bloky"
je prah-hned 16G 1 "⚠ xprotectd 16,0 GB · session nesledovaná · restartuj počítač co nejdřív"
je terabajt 1T 1 "⚠ xprotectd 1024,0 GB · session nesledovaná · restartuj počítač co nejdřív"
# sledování od poměru 3 včetně, rada na restart na něm nezávisí
je pod-sledovanim 56M 2.9 "xprotectd 56 MB · session nesledovaná"
je prah-sledovani 56M 3 "xprotectd 56 MB · session sledovaná (dlouhé příkazy 3× pomalejší; pomůže ji ukončit a obnovit v nové záložce)"
je sledovana-velka 17G 8.4 "⚠ xprotectd 17,0 GB · session sledovaná (dlouhé příkazy 8× pomalejší; pomůže ji ukončit a obnovit v nové záložce) · restartuj počítač co nejdřív"
# neměřený poměr: řádek bez části o session; nečitelná velikost: žádný řádek
je bez-pomeru 56M - "xprotectd 56 MB"
je necitelne MEM 1 ""

# skutečné měření: návratový kód 0 a na macOS s běžícím xprotectd řádek v očekávaném tvaru
o=$(python3 "$plugin/scripts/xprotectd.py" 2>&1); rc=$?
[ $rc -eq 0 ] && ok || ko "mereni-rc: rc=$rc $o"
if [ "$(uname -s)" = Darwin ] && pgrep -x xprotectd >/dev/null; then
  printf '%s' "$o" | grep -Eq '^(⚠ )?xprotectd [0-9,]+ (MB|GB) · session (ne)?sledovaná' && ok || ko "mereni-tvar: $o"
else
  [ -z "$o" ] && ok || ko "mimo-macos-nic: $o"
fi

# co-dela.sh: řádek je poslední a přežije zkrácení --kratce; bez výstupu skriptu výpis nic nepřidá
kopie="$tmp/skripty"; mkdir -p "$kopie"; cp "$plugin/scripts/co-dela.sh" "$kopie/"
printf 'print("⚠ xprotectd TEST")\n' > "$kopie/xprotectd.py"
s="$tmp/sess"; mkdir -p "$s/subagents"
for i in 01 02 03 04 05 06 07 08 09 10 11 12 13 14; do
  jq -cn '{type:"assistant", message:{content:[{type:"tool_use", name:"Bash", input:{command:"true"}}]}}' > "$s/subagents/agent-a$i.jsonl"
done
o=$(cd "$tmp" && bash "$kopie/co-dela.sh" --session "$s" --kratce 2>&1)
printf '%s' "$o" | grep -q 'dalších řádků' && ok || ko "zkraceni-nastalo: $o"
[ "$(printf '%s\n' "$o" | tail -1)" = "⚠ xprotectd TEST" ] && ok || ko "radek-po-zkraceni: $o"
o=$(cd "$tmp" && bash "$kopie/co-dela.sh" --session "$s" 2>&1)
[ "$(printf '%s\n' "$o" | tail -1)" = "⚠ xprotectd TEST" ] && ok || ko "radek-plny-vypis: $o"
: > "$kopie/xprotectd.py"
o=$(cd "$tmp" && bash "$kopie/co-dela.sh" --session "$s" --kratce 2>&1)
printf '%s' "$o" | grep -q 'xprotectd' && ko "bez-vystupu: $o" || ok
# status line nesmí měřit: obnovuje se každých 30 s
printf 'import pathlib; pathlib.Path("%s/zmereno").touch()\n' "$tmp" > "$kopie/xprotectd.py"
jq -cn --arg t "$s.jsonl" '{transcript_path:$t}' | (cd "$tmp" && bash "$kopie/co-dela.sh" --status >/dev/null 2>&1)
[ ! -e "$tmp/zmereno" ] && ok || ko "status-bez-mereni"

echo "xprotectd: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
