#!/usr/bin/env bash
# Testy commitu v scripts/orchestrate-setup.sh nad dočasným repem s pre-commit hookem: jedno opakování, když výstup hooku nese
# jako selhání jen Test timed out, jinak hned chyba s hotovou zprávou commitu (pod set -u, past $zprava před ne-ASCII).
# Dál poslední řádek stdout „hotovo: rc=<kód>“, stav po selhaném commitu (soubor identity, handoff „zastaveno: setup“)
# a navázání po ručním commitu, razítko cronu docs/.cron-od, trvalé soubory projektu při archivaci a příznak běžícího
# setupu v adresáři gitu (Stop hook podle něj pouští konec tahu): během commitu existuje, po konci nezůstane.
# Spusť: bash dev-pipeline/tests/skripty/orchestrate-setup.sh
set -uo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); plugin=$(cd "$here/../.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/orchestrate-setup-test.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/home" "$tmp/cfg"
pass=0; fail=0
ok() { pass=$((pass+1)); }; ko() { fail=$((fail+1)); echo "FAIL $*"; }

novy_repo() { # jméno; hook N-tého běhu vypíše $h/vystup-N a skončí 1, bez souboru projde
  r="$tmp/$1"; h="$tmp/$1-hook"; mkdir -p "$r/docs/vize" "$h"
  git -C "$r" init -q; git -C "$r" config user.name t; git -C "$r" config user.email t@t
  echo x > "$r/README.md"; git -C "$r" add -A; git -C "$r" commit -q -m start
  printf '# Vize\n\n## Plán řezů\n\n| # | název | stav |\n|---|---|---|\n| 01 | první | |\n' > "$r/docs/vize/v.md"
  jq -n '{session_id:"sess-setup"}' > "$r/docs/.orchestrator-session"
  cat > "$r/.git/hooks/pre-commit" <<HOOK
#!/bin/sh
n=\$((\$(cat "$h/n" 2>/dev/null || echo 0) + 1)); echo \$n > "$h/n"
[ -f "$r/.git/dev-pipeline-setup-bezi" ] && echo \$n >> "$h/priznak"
[ -f "$h/vystup-\$n" ] || exit 0
cat "$h/vystup-\$n"; exit 1
HOOK
  chmod +x "$r/.git/hooks/pre-commit"
}
setup() { o=$(cd "$r" && HOME="$tmp/home" CLAUDE_CONFIG_DIR="$tmp/cfg" bash "$plugin/scripts/orchestrate-setup.sh" "${1:-docs/vize/v.md}" 2>&1); rc=$?; }
# jen stdout: poslední řádek nese kód i bez stderr (hlášku chyby nese stderr)
setup_stdout() { o=$(cd "$r" && HOME="$tmp/home" CLAUDE_CONFIG_DIR="$tmp/cfg" bash "$plugin/scripts/orchestrate-setup.sh" "${1:-docs/vize/v.md}" 2>/dev/null); rc=$?; }
posledni() { printf '%s\n' "$o" | tail -1; }
stav() { grep -m1 '^stav běhu:' "$r/docs/handoff.md"; }
behu() { cat "$h/n" 2>/dev/null; }
zprava() { git -C "$r" log -1 --format=%s; }
TIMEOUT=' FAIL  src/a.test.ts > stráž > drží hranici
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
   × stráž > drží hranici 5003ms
     → Test timed out in 5000ms.
 Test Files  1 failed | 105 passed (106)
      Tests  1 failed | 900 passed (901)
ELIFECYCLE  Test failed.
ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @x/api@1.0.0 test: `vitest run`
husky - pre-commit script failed (code 1)'

# jen timeout, napodruhé zelená: jeden commit, hláška bez „zátěže stroje“
novy_repo jednou; printf '%s\n' "$TIMEOUT" > "$h/vystup-1"; setup
[ $rc -eq 0 ] && [ "$(behu)" = 2 ] && [ "$(zprava)" = 'běh: start vize v (gitignore vize)' ] && ok || ko "jednou: rc=$rc behu=$(behu) $(zprava) $o"
printf '%s' "$o" | grep -qF 'timeout v plné suitě, přeměř' && ok || ko "jednou-hlaska: $o"
printf '%s' "$o" | grep -q 'zátěž' && ko "jednou-zatez: $o" || ok
printf '%s' "$o" | grep -qF 'Test timed out in 5000ms' && ok || ko "jednou-vystup-hooku: $o"

# jen timeout dvakrát: dvakrát a dost, chyba nese hlášku a celou zprávu commitu (set -u, ${zprava})
novy_repo dvakrat; printf '%s\n' "$TIMEOUT" > "$h/vystup-1"; printf '%s\n' "$TIMEOUT" > "$h/vystup-2"; printf '%s\n' "$TIMEOUT" > "$h/vystup-3"; setup
[ $rc -eq 2 ] && [ "$(behu)" = 2 ] && [ "$(zprava)" = start ] && ok || ko "dvakrat: rc=$rc behu=$(behu) $(zprava) $o"
printf '%s' "$o" | grep -qF 'orchestrate-setup: timeout v plné suitě, přeměř; opakovaný commit spadl taky. commit selhal' && ok || ko "dvakrat-hlaska: $o"
printf '%s' "$o" | grep -qF 'přidej opravené soubory do indexu (git add <soubory>) a commitni na pozadí zprávou „běh: start vize v (gitignore vize)“' && ok || ko "dvakrat-zprava: $o"
printf '%s' "$o" | grep -q 'unbound variable' && ko "dvakrat-unbound: $o" || ok

# asertace vedle timeoutu: bez opakování, bez hlášky o timeoutu
novy_repo asertace; printf '%s\n FAIL  src/b.test.ts > počty\nAssertionError: expected 1 to be 2 // Object.is equality\n' "$TIMEOUT" > "$h/vystup-1"; setup
[ $rc -eq 2 ] && [ "$(behu)" = 1 ] && ok || ko "asertace: rc=$rc behu=$(behu) $o"
printf '%s' "$o" | grep -q 'přeměř' && ko "asertace-hlaska: $o" || ok
# jiná chyba vedle timeoutu
novy_repo jina; printf '%s\n FAIL  src/b.test.ts [ src/b.test.ts ]\nError: Cannot find module x\n' "$TIMEOUT" > "$h/vystup-1"; setup
[ $rc -eq 2 ] && [ "$(behu)" = 1 ] && ok || ko "jina-chyba: rc=$rc behu=$(behu) $o"
# FAIL bez důvodu navíc (runner tiskne jen jméno testu): víc FAIL než timeoutů se neopakuje
novy_repo fail-navic; printf ' FAIL a\n FAIL b\nError: Test timed out in 5000ms.\n' > "$h/vystup-1"; setup
[ $rc -eq 2 ] && [ "$(behu)" = 1 ] && ok || ko "fail-navic: rc=$rc behu=$(behu) $o"
# chyba typecheck vedle timeoutu
novy_repo tsc; printf 'src/a.ts(1,2): error TS2345: x\nError: Test timed out in 5000ms.\n' > "$h/vystup-1"; setup
[ $rc -eq 2 ] && [ "$(behu)" = 1 ] && ok || ko "tsc: rc=$rc behu=$(behu) $o"
# bez timeoutu: bez opakování, chyba s celou zprávou
novy_repo bez; printf 'husky - pre-commit script failed (code 1)\n' > "$h/vystup-1"; setup
[ $rc -eq 2 ] && [ "$(behu)" = 1 ] && printf '%s' "$o" | grep -qF 'orchestrate-setup: commit selhal' && printf '%s' "$o" | grep -qF 'zprávou „běh: start vize v' && ok || ko "bez-timeoutu: rc=$rc behu=$(behu) $o"
# napodruhé jiné selhání: žádné třetí, chyba bez hlášky o timeoutu
novy_repo druhy-jiny; printf '%s\n' "$TIMEOUT" > "$h/vystup-1"; printf 'AssertionError: x\n' > "$h/vystup-2"; setup
[ $rc -eq 2 ] && [ "$(behu)" = 2 ] && printf '%s' "$o" | grep -qF 'orchestrate-setup: commit selhal' && ok || ko "druhy-jiny: rc=$rc behu=$(behu) $o"
# zelený hook: běží jednou, žádná hláška
novy_repo zeleny; setup
[ $rc -eq 0 ] && [ "$(behu)" = 1 ] && printf '%s' "$o" | grep -qF 'commit: běh: start vize v' && ok || ko "zeleny: rc=$rc behu=$(behu) $o"
printf '%s' "$o" | grep -q 'přeměř' && ko "zeleny-hlaska: $o" || ok

# poslední řádek stdout je vždy „hotovo: rc=<kód>“: úspěch, die před commitem i po něm, vize bez plánu (kód 3)
[ "$(posledni)" = 'hotovo: rc=0' ] && [ "$(printf '%s\n' "$o" | grep -c '^hotovo: rc=')" = 1 ] && ok || ko "hotovo-rc0: $(posledni)"
[ "$(cat "$h/priznak" 2>/dev/null)" = 1 ] && [ ! -e "$r/.git/dev-pipeline-setup-bezi" ] && ok || ko "priznak-po-uspechu: při commitu $(cat "$h/priznak" 2>/dev/null), po konci $(ls "$r/.git" | grep setup)"
[ ! -e "$r/docs/.orchestrator-session" ] && ok || ko "identita-po-uspechu: soubor identity zůstal"
novy_repo bez-identity; rm "$r/docs/.orchestrator-session"; setup_stdout
[ $rc -eq 2 ] && [ "$o" = 'hotovo: rc=2' ] && [ ! -e "$r/.git/dev-pipeline-setup-bezi" ] && ok || ko "hotovo-rc2-die: rc=$rc $o"
novy_repo bez-planu; printf '# Vize\n\n## Cíle\n\ntext\n' > "$r/docs/vize/v.md"; setup_stdout
[ $rc -eq 3 ] && [ "$(posledni)" = 'hotovo: rc=3' ] && ok || ko "hotovo-rc3: rc=$rc $(posledni)"
novy_repo spatna-vize; setup_stdout docs/vize/neni.md
[ $rc -eq 2 ] && [ "$o" = 'hotovo: rc=2' ] && ok || ko "hotovo-rc2-vize: rc=$rc $o"

# selhaný commit: kód 2 na posledním řádku, soubor identity zůstává, handoff nese zastaveno (Stop hook konec tahu pustí),
# index čeká na ruční commit; po něm setup naváže bez zásahu do stavových souborů a stav vrátí
novy_repo selhany; printf 'AssertionError: expected false to be true\n' > "$h/vystup-1"; setup
[ $rc -eq 2 ] && [ "$(posledni)" = 'hotovo: rc=2' ] && ok || ko "selhany-rc: rc=$rc $(posledni)"
[ "$(cat "$h/priznak" 2>/dev/null)" = 1 ] && [ ! -e "$r/.git/dev-pipeline-setup-bezi" ] && ok || ko "priznak-po-selhani: při commitu $(cat "$h/priznak" 2>/dev/null), po konci $(ls "$r/.git" | grep setup)"
[ "$(jq -r .session_id "$r/docs/.orchestrator-session" 2>/dev/null)" = sess-setup ] && ok || ko "selhany-identita: soubor identity po selhaném commitu chybí"
[ "$(stav)" = 'stav běhu: zastaveno: setup, commit archivace selhal v pre-commit bráně' ] && ok || ko "selhany-handoff: $(stav)"
printf '%s' "$o" | grep -qF 'dej ho opravit agentovi dev-pipeline:fix s výstupem brány; jinou příčinu řekni uživateli a skonči. Po opravě přidej opravené soubory do indexu (git add <soubory>) a commitni na pozadí zprávou „běh: start vize v (gitignore vize)“, pak spusť setup znovu: vizi naváže a stav vrátí.' && ok || ko "selhany-hlaska: $o"
[ "$(git -C "$r" show :docs/handoff.md | grep -m1 '^stav běhu:')" = 'stav běhu: čeká: výběr prvního řezu' ] && ok || ko "selhany-index: zastaveno nemá jít do indexu"
printf 'x\n' > "$h/vystup-3"   # kdyby navázání commitovalo, hook by ho shodil: po ručním commitu není co commitovat
git -C "$r" commit -q -m 'běh: start vize v (gitignore vize)' && setup
[ $rc -eq 0 ] && [ "$(posledni)" = 'hotovo: rc=0' ] && printf '%s' "$o" | grep -qF 'navázání: v projektu je stav téže vize (v)' && ok || ko "selhany-navazani: rc=$rc $o"
[ "$(stav)" = 'stav běhu: čeká: výběr prvního řezu' ] && printf '%s' "$o" | grep -qF 'handoff: stav běhu vrácen po selhaném commitu setupu (čeká: výběr prvního řezu)' && ok || ko "selhany-navazani-stav: $(stav) $o"
[ -z "$(git -C "$r" status --porcelain)" ] && [ "$(behu)" = 2 ] && [ ! -e "$r/docs/.orchestrator-session" ] && ok || ko "selhany-navazani-strom: behu=$(behu) $(git -C "$r" status --porcelain)"
# postup z hlášky: oprava mimo docs/ v pracovním stromu, git add opravených souborů, commit, nové spuštění setupu naváže
novy_repo selhany-oprava; printf 'AssertionError: expected false to be true\n' > "$h/vystup-1"; setup
echo opraveno > "$r/README.md"; git -C "$r" add README.md && git -C "$r" commit -q -m 'běh: start vize v (gitignore vize)' && setup
[ $rc -eq 0 ] && [ "$(stav)" = 'stav běhu: čeká: výběr prvního řezu' ] && [ -z "$(git -C "$r" status --porcelain)" ] && [ "$(git -C "$r" show HEAD:README.md)" = opraveno ] && ok || ko "selhany-oprava-navazani: rc=$rc $(stav) $(git -C "$r" status --porcelain) $o"
[ ! -e "$r/.git/dev-pipeline-setup-bezi" ] && ok || ko "selhany-oprava-priznak: příznak zůstal"
# selhaný commit navázání: původní stav (s id běhu Workflow a podtržítky) přežije v závorce a navázání ho vrátí
novy_repo selhany-navazani; setup; nova_session() { jq -n --arg s "$1" '{session_id:$s}' > "$r/docs/.orchestrator-session"; }
PUV='běží workflow blok-stavby řez 01 (wf_1a2b_3c-4d)'
sed -i '' "s/^stav běhu:.*/**Stav běhu:** $PUV/" "$r/docs/handoff.md"; nova_session sess-2; printf 'AssertionError: x\n' > "$h/vystup-2"; setup
[ $rc -eq 2 ] && [ "$(grep -m1 -i 'stav běhu' "$r/docs/handoff.md")" = "stav běhu: zastaveno: setup, commit navázání selhal v pre-commit bráně (předtím: $PUV)" ] && ok || ko "selhany-navazani-handoff: rc=$rc $(grep -m1 -i 'stav běhu' "$r/docs/handoff.md")"
git -C "$r" commit -q -m 'běh: navázání vize v (dokumenty běhu)' && setup
[ $rc -eq 0 ] && [ "$(stav)" = "stav běhu: $PUV" ] && [ -z "$(git -C "$r" status --porcelain)" ] && ok || ko "selhany-navazani-vraceno: rc=$rc $(stav) $(git -C "$r" status --porcelain) $o"

# razítko cronu docs/.cron-od: gitignorované, rozpracovaný strom nedělá a setup staré maže (nový i navázání)
novy_repo cron; echo 1700000000 > "$r/docs/.cron-od"; setup
[ $rc -eq 0 ] && [ ! -e "$r/docs/.cron-od" ] && grep -qxF 'docs/.cron-od' "$r/.gitignore" && ok || ko "cron-novy: rc=$rc $(ls -a "$r/docs") $o"
nova_session sess-2; date +%s > "$r/docs/.cron-od"; setup
[ $rc -eq 0 ] && [ ! -e "$r/docs/.cron-od" ] && [ -z "$(git -C "$r" status --porcelain)" ] && ok || ko "cron-navazani: rc=$rc $(git -C "$r" status --porcelain) $o"

# trvalé soubory projektu (docs/e2e/pasti.md) se s předchozí vizí nearchivují; ostatní dokumenty ano
novy_repo trvale; setup
printf '# Vize w\n\n## Plán řezů\n\n| # | název | stav |\n|---|---|---|\n| 01 | první | |\n' > "$r/docs/vize/w.md"
printf '# Pasti projektu\n\n- past jedna\n' > "$r/docs/e2e/pasti.md"; echo '# E2E 01' > "$r/docs/e2e/rez-01.md"; echo '# PRD 01' > "$r/docs/prd/rez-01-x.md"
git -C "$r" add -A; git -C "$r" commit -q -m 'vize v: řez 01, vize w'; nova_session sess-3; setup docs/vize/w.md
[ $rc -eq 0 ] && printf '%s' "$o" | grep -qF 'archiv: v → docs/archive/v' && ok || ko "trvale-archiv: rc=$rc $o"
[ "$(cat "$r/docs/e2e/pasti.md" 2>/dev/null)" = "$(printf '# Pasti projektu\n\n- past jedna')" ] && [ ! -e "$r/docs/archive/v/e2e/pasti.md" ] && ok || ko "trvale-pasti: $(ls "$r/docs/e2e" "$r/docs/archive/v/e2e" 2>&1)"
[ -f "$r/docs/archive/v/e2e/rez-01.md" ] && [ ! -e "$r/docs/e2e/rez-01.md" ] && [ -f "$r/docs/archive/v/prd/rez-01-x.md" ] && [ -z "$(git -C "$r" status --porcelain)" ] && ok || ko "trvale-ostatni: $(git -C "$r" status --porcelain) $(ls "$r/docs/e2e")"
# v docs/e2e zůstal jen trvalý soubor: další vize kvůli němu nezakládá prázdný archiv e2e
printf '# Vize z\n\n## Plán řezů\n\n| # | název | stav |\n|---|---|---|\n| 01 | první | |\n' > "$r/docs/vize/z.md"
git -C "$r" add -A; git -C "$r" commit -q -m 'vize z'; nova_session sess-4; setup docs/vize/z.md
[ $rc -eq 0 ] && [ -f "$r/docs/e2e/pasti.md" ] && [ ! -e "$r/docs/archive/w/e2e" ] && [ -f "$r/docs/archive/w/handoff.md" ] && ok || ko "trvale-jen-pasti: rc=$rc $(ls "$r/docs/archive/w" 2>&1) $o"

# navázání na tutéž vizi v nové session: rozpracované docs/ projdou a přibalí je commit navázání; kód mimo docs/ ne
rozpracuj_docs() { echo "- řez 01 uzavřen" >> "$r/docs/journal.md"; echo "# PRD 02" > "$r/docs/prd/rez-02-žluťoučký.md"; echo "# E2E" > "$r/docs/e2e/rez-02.md"; }
novy_repo navazani; setup; nova_session sess-2; rozpracuj_docs; setup
[ $rc -eq 0 ] && printf '%s' "$o" | grep -qF 'navázání: v projektu je stav téže vize (v)' && [ "$(zprava)" = 'běh: navázání vize v (dokumenty běhu)' ] && ok || ko "navazani-docs: rc=$rc $(zprava) $o"
[ -z "$(git -C "$r" status --porcelain -- docs/)" ] && git -C "$r" show --name-only --format= HEAD | grep -q 'rez-02' && grep -q '^session: sess-2' "$r/docs/handoff.md" && ok || ko "navazani-docs-strom: $(git -C "$r" status --porcelain) $(git -C "$r" show --name-only --format= HEAD)"
novy_repo navazani-kod; setup; nova_session sess-2; rozpracuj_docs; echo y >> "$r/README.md"; setup
[ $rc -eq 2 ] && printf '%s' "$o" | grep -qF 'pracovní strom není čistý' && printf '%s' "$o" | grep -qF ' README.md' && ! printf '%s' "$o" | grep -q 'journal' && ok || ko "navazani-kod: rc=$rc $o"
novy_repo jina-vize; setup; nova_session sess-2; rozpracuj_docs; jq '.slug = "jina"' "$r/docs/.orchestrator-run" > "$r/m.json" && mv "$r/m.json" "$r/docs/.orchestrator-run"; setup
[ $rc -eq 2 ] && printf '%s' "$o" | grep -qF 'docs/journal.md' && ok || ko "jina-vize-docs: rc=$rc $o"

# turbo bez propuštěné proměnné stropu: varování jen u turbo 2 (nebo neznámé verze) s vitestem; jméno podle verze vitestu
# (3 → VITEST_MAX_FORKS, 4 → VITEST_MAX_WORKERS, bez instalace obě)
turbo_repo() { # jméno turbo.json package.json [verze turba] [verze vitestu v kořeni] [verze vitestu v apps/web]
  novy_repo "$1"; printf '%s\n' "$2" > "$r/turbo.json"; printf '%s\n' "$3" > "$r/package.json"; echo node_modules > "$r/.gitignore"
  if [ -n "${4:-}" ]; then mkdir -p "$r/node_modules/turbo"; printf '{"version":"%s"}\n' "$4" > "$r/node_modules/turbo/package.json"; fi
  if [ -n "${5:-}" ]; then mkdir -p "$r/node_modules/vitest"; printf '{"version":"%s"}\n' "$5" > "$r/node_modules/vitest/package.json"; fi
  if [ -n "${6:-}" ]; then mkdir -p "$r/apps/web/node_modules/vitest"; printf '{"version":"%s"}\n' "$6" > "$r/apps/web/node_modules/vitest/package.json"; fi
  git -C "$r" add -A; git -C "$r" commit -q -m turbo; setup
}
VITEST='{"devDependencies":{"vitest":"^3.2.0","turbo":"^2.8.0"}}'
TASKS='"tasks":{"test":{"cache":false}}'
varuje() { printf '%s' "$o" | grep -qF "varování: turbo.json nepropouští $1 ("; }
nevaruje() { ! printf '%s' "$o" | grep -q 'nepropouští'; }
turbo_repo turbo-strict "{$TASKS}" "$VITEST" 2.8.9 3.2.7
[ $rc -eq 0 ] && varuje VITEST_MAX_FORKS && printf '%s' "$o" | grep -qF 'doplň VITEST_MAX_FORKS do "globalPassThroughEnv"' && ok || ko "turbo-strict: rc=$rc $o"
turbo_repo turbo-bez-verze "{$TASKS}" "$VITEST"
varuje 'VITEST_MAX_FORKS, VITEST_MAX_WORKERS' && ok || ko "turbo-bez-verze: $o"
turbo_repo turbo-propousti "{\"globalPassThroughEnv\":[\"VITEST_MAX_FORKS\"],$TASKS}" "$VITEST" 2.8.9 3.2.7
nevaruje && ok || ko "turbo-propousti: $o"
turbo_repo turbo-propousti-bez-instalace "{\"globalPassThroughEnv\":[\"VITEST_MAX_FORKS\"],$TASKS}" "$VITEST" 2.8.9
varuje VITEST_MAX_WORKERS && ok || ko "turbo-propousti-bez-instalace: $o"
turbo_repo vitest4-jen-forks "{\"globalPassThroughEnv\":[\"VITEST_MAX_FORKS\"],$TASKS}" "$VITEST" 2.8.9 4.0.18
varuje VITEST_MAX_WORKERS && ok || ko "vitest4-jen-forks: $o"
turbo_repo vitest4-workers "{\"globalPassThroughEnv\":[\"CLOUDFLARE_API_TOKEN\",\"VITEST_MAX_WORKERS\"],$TASKS}" "$VITEST" 2.8.9 4.0.18
nevaruje && ok || ko "vitest4-workers: $o"
turbo_repo vitest-smisene "{\"globalPassThroughEnv\":[\"VITEST_MAX_FORKS\"],$TASKS}" "$VITEST" 2.8.9 3.2.7 4.0.18
varuje VITEST_MAX_WORKERS && ok || ko "vitest-smisene: $o"
turbo_repo turbo-loose "{\"envMode\": \"loose\",$TASKS}" "$VITEST" 2.8.9 4.0.18
nevaruje && ok || ko "turbo-loose: $o"
turbo_repo turbo-1 '{"pipeline":{"test":{}}}' "$VITEST" 1.13.4 3.2.7
nevaruje && ok || ko "turbo-1: $o"
turbo_repo turbo-bez-vitestu "{$TASKS}" '{"devDependencies":{"jest":"^29.0.0"}}' 2.8.9
nevaruje && ok || ko "turbo-bez-vitestu: $o"

echo "orchestrate-setup: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
