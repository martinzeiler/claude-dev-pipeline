# PIPELINE.md — kanonická definice jednoho řezu

Tento dokument je jediný zdroj pravdy pro zpracování jednoho řezu vize. Čtou ho:
- `/dev-pipeline:orchestrate` — každou fázi spouští jako samostatného subagenta s čerstvým kontextem,
- `/dev-pipeline:slice-run` — provede všechny fáze inline v jedné session (fallback driver režim).

Změna procesu se dělá VÝHRADNĚ tady, ne v jednotlivých skill souborech.

## Kontrakt souborů (stav žije na disku, nikdy jen v kontextu)

| Soubor | Režim | Obsah |
|---|---|---|
| `docs/vize/<slug>.md` | read-only pro pipeline | Vize + nezávazná osnova řezů |
| `docs/prd/rez-NN-<slug>.md` | 1 soubor per řez, vzniká lazy | PRD řezu, frontmatter níže |
| `docs/journal.md` | append-only | Deník: co, odchylky, rozhodnutí, pokusy |
| `docs/handoff.md` | přepisovaný | Aktuální stav pro čerstvý kontext |
| `docs/follow-ups.md` | append-only | Nápady/resty mimo scope aktuálního řezu |
| `docs/e2e/rez-NN.md` | per řez | E2E scénáře (akceptační kritéria v krocích) |
| `docs/.vize-done` | marker | Vize naplněna, smyčka končí |
| `docs/.orchestrator-run` | marker | Běží autonomní run (aktivuje deploy gate v hooku) |
| `docs/.deploy-unlocked` | marker | Deploy povolen (vytváří fáze 5, maže fáze 7) |

Markery (`.orchestrator-run`, `.deploy-unlocked`, `.vize-done`, `.review-passed`) patří do `.gitignore` — setup je tam doplní, pokud chybí. Nikdy je necommituj do řezu.

Frontmatter PRD:
```yaml
---
rez: 3
slug: bulk-actions
status: in_progress   # in_progress | done | skipped
vize: docs/vize/<slug>.md
pokusy: 1
---
```

## Fáze 1 — Výběr a PRD řezu

Vstup: vize, `docs/prd/` (stav dokončených/přeskočených řezů), tail `docs/journal.md`, `docs/handoff.md`, aktuální stav kódu (git log branch, struktura relevantních modulů).

1. Pokud existuje PRD se `status: in_progress`, pokračuj v něm (nedokončený řez z minula) a přeskoč na fázi, kde skončil (viz journal).
2. Jinak rozhodni: **je vize naplněna?** Projdi vizi bod po bodu proti stavu done řezů. Pokud ano → vytvoř `docs/.vize-done`, zapiš zdůvodnění do journalu a SKONČI (žádný další řez).
3. Jinak urči rozsah dalšího řezu **z aktuálního stavu**, ne z osnovy — osnova ve vizi je orientační, realita po předchozích řezech má přednost. Řez = souvislý, samostatně testovatelný a nasaditelný kus vize: **ucelená funkce nebo skupina souvisejících menších věcí, nikdy mini-funkce** — režie PRD + review + deploy + E2E se musí vyplatit, drobnosti seskupuj do jednoho řezu. Velikostní vodítko: práce na řezu se má pohodlně vejít do ~250k tokenů kontextu (implementační session/agent); tolerance do ~400k, když si iterace a dolaďování řeknou, výš nikdy — pokud odhad zjevně přesahuje, rozděl na dva ucelené řezy.
4. Napiš `docs/prd/rez-NN-<slug>.md`: cíl řezu, vazba na konkrétní body vize, rozsah (co ano / co ne), technický postup validovaný proti kódu (soubory, moduly, migrace), **akceptační kritéria** (ověřitelná, každé buď testem, nebo E2E krokem; formuluj je na nejvyšším možném švu — user-visible chování, ne implementační detail), rizika. Zapiš E2E scénáře do `docs/e2e/rez-NN.md`.

## Fáze 2 — PRD check

Spusť subagenta `dev-pipeline:prd-check` nad čerstvým PRD (předej cesty k PRD a vizi; kontroluje úplnost vůči vizi, technickou validitu proti kódu, kvalitu akceptačních kritérií a rozsah řezu). Nálezy zapracuj do PRD; při `needs-fixes` po zapracování spusť prd-check znovu (max 2 kola). Neptej se uživatele — jediný schválený vstup je vize; odchylky od osnovy jen zapiš do journalu se zdůvodněním. (Agent `plan-check` je post-implementační nástroj — v pipeline se nepoužívá.)

## Fáze 3 — Implementace (TDD)

1. **Červená napřed:** pro každé akceptační kritérium s testovatelným povrchem napiš nejdřív test (vitest, pokud projekt harness má) a ověř, že selhává ze správného důvodu (chybějící funkčnost, ne syntax error). U kritérií pokrytých jen E2E ověř červenou přes agenta `dev-pipeline:e2e-verifier` (scénář z `docs/e2e/` proti běžící appce PŘED implementací), pokud to dává smysl (u zcela nové obrazovky netřeba).
2. Implementuj podle PRD. Řiď se CLAUDE.md cílového projektu (konvence, pasti, helpers) — má přednost před obecnými zvyky. Soubory >500 LOC edituj přes Serena symbol tools, pokud je projekt má nakonfigurované.
3. Testy do zelené. Typecheck projektu musí projít.

## Fáze 4 — Lehké review + opravy

1. Spusť `/code-review` (medium effort) nad aktuálním diffem. Oprav všechny CONFIRMED nálezy; PLAUSIBLE posuď a rozhodnutí zapiš do journalu.
2. Znovu typecheck + testy.

(Plné kolečko — thermo-nuclear, /simplify, 2× code-review, 2× security — běží až JEDNOU na konci celé vize, ne per řez.)

**Řez bez runtime dopadu** (jen testy, tooling, dokumentace): zapiš to do PRD frontmatteru (`runtime_dopad: ne`) — fáze 5 se pak redukuje na commit (bez deploye) a fáze 6 na: kompletní test run + typecheck A nezávislý průchod akceptačních kritérií PRD **bod po bodu s verdiktem per kritérium** (verifikační agent v roli e2e-verifiera nad neběžícím povrchem: každé kritérium doloží konkrétním důkazem — výstupem příkazu, existencí a obsahem souboru — ne souhrnným „testy zelené").

## Fáze 5 — Commit + deploy

1. Commit na vize branchi (nikdy na main). Zpráva: `rez NN: <shrnutí>`. Jedna logická jednotka práce = jeden commit; rollback řezu = `git reset --hard` na `commit` hash z frontmatteru posledního done PRD (po opravných iteracích může mít řez víc commitů, HEAD~1 nestačí).
2. Přečti deploy config projektu (sekce Deploy v CLAUDE.md projektu, případně `docs/deploy.md`). Dodrž projektová pravidla (pre-checky, build verze, pořadí).
3. Vytvoř `docs/.deploy-unlocked` (teprve teď — hook guard jinak deploy zablokuje), proveď deploy a **počkej na jeho dokončení**. Výstup fáze MUSÍ být doložený stav, ne slib: deployment status SUCCESS (např. `railway deployment list --json`) + health check odpověď + commit hash. „Deploy spuštěn" nebo obecný placeholder NENÍ výsledek — fáze bez doloženého stavu se považuje za nedokončenou a stav se musí doověřit.

## Fáze 6 — E2E verifikace

Spusť subagenta `dev-pipeline:e2e-verifier`: dostane cestu k PRD a `docs/e2e/rez-NN.md`, projde scénáře v agent-browseru proti nasazené aplikaci a vrátí verdikt per akceptační kritérium. Neprošlá kritéria → vrať se do fáze 3 (oprav, re-deploy, re-verify).

## Fáze 7 — Uzavření řezu

1. PRD frontmatter: `status: done` + `commit: <hash posledního commitu řezu>` (strojová kotva pro rollback dalších řezů). Smaž `docs/.deploy-unlocked`.
2. Append do `docs/journal.md`: datum, řez NN, co je hotové, odchylky od vize/osnovy + proč, změněná rozhodnutí, počet pokusů, výsledek E2E.
3. Nápady a resty mimo scope → append `docs/follow-ups.md` (jedna odrážka = jedna položka, s kontextem proč).
4. Přepiš `docs/handoff.md`: branch, poslední done řez, stav (co funguje), co je logicky další, klíčové pasti/poznatky z tohoto řezu (max ~30 řádků — čte to čerstvý kontext, stručnost > úplnost). Neduplikuj obsah PRD/journalu — odkazuj cestou. Do handoffu ani journalu nikdy nepatří secrets (klíče, hesla, tokeny).
5. **CLAUDE.md hygiena:** pokud řez změnil něco, co CLAUDE.md projektu tvrdí (příkazy, konvence, struktura, pasti), aktualizuj ho — ale minimálně: NIC, co se dá zjistit z kódu; udržuj CLAUDE.md co nejmenší; tvrzení, která přestala platit, smaž (neopravuj kolem nich). Když řez CLAUDE.md nemění, nesahej na něj.

## Failure policy

- Každý neúspěšný průchod fází 3–6 zvyš `pokusy` ve frontmatteru PRD. Po **3. neúspěšném pokusu**: `status: skipped`, smaž `.deploy-unlocked`, vrať branch do čistého stavu (`git reset --hard` na `commit` hash z frontmatteru posledního done PRD; není-li žádný done řez, na výchozí commit branche), zapiš do journalu CO selhalo a PROČ (přesné chybové výstupy, ne dojmy). Pokračuje se dalším řezem; skipped řezy řeší validátor na konci.
- Permission denial v headless režimu = zapiš do journalu, co bylo zamítnuto, a zachovej se jako u neúspěšného pokusu. Nikdy neobcházej zamítnutí jinou cestou.
- Nikdy žádné quick fixy / silent fallbacky, aby fáze „prošla" — radši skipped řez s poctivým záznamem.
