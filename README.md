# claude-dev-pipeline

Osobní vývojová pipeline pro Claude Code: **vize → řezy → autonomní implementace → review → validace**. Jedno schválení (vize), zbytek běží bez dozoru. Stav žije v souborech projektu, ne v kontextu — každý řez proto může běžet s čerstvým kontextovým oknem.

## Instalace

Repo je zároveň plugin marketplace. Na novém stroji:

```bash
git clone <url-tohoto-repa> ~/claude-dev-pipeline
```

Do `~/.claude/settings.json` přidat:

```json
{
  "extraKnownMarketplaces": {
    "claude-dev-pipeline": {
      "source": { "source": "directory", "path": "/Users/<user>/claude-dev-pipeline" }
    }
  },
  "enabledPlugins": {
    "dev-pipeline@claude-dev-pipeline": true
  }
}
```

(Alternativně interaktivně: `/plugin marketplace add ~/claude-dev-pipeline` a `/plugin install dev-pipeline@claude-dev-pipeline`.)

Skripty musí být spustitelné: `chmod +x ~/claude-dev-pipeline/dev-pipeline/hooks/*.sh ~/claude-dev-pipeline/dev-pipeline/scripts/*.sh`

## DŮLEŽITÉ: refresh po editaci pluginu

Directory-source marketplace se při registraci **kopíruje do cache** — editace zdrojového adresáře se do sessions NEpropíše sama. Po každé změně pluginu (i po `git pull` na jiném stroji):

```
/plugin marketplace update claude-dev-pipeline
```

nebo neinteraktivně z terminálu: `claude plugin marketplace update claude-dev-pipeline`. Pak novou session (případně `/reload-plugins` v běžící). Při aktivním vývoji pluginu je jednodušší spouštět session s živým čtením bez cache:

**POZOR na verzi:** updater porovnává `version` v `plugin.json` — při stejné verzi hlásí „already at latest" a obsah cache NEobnoví (známý bug). Proto **každá změna pluginu = bump verze v `dev-pipeline/.claude-plugin/plugin.json`** (pak stačí `claude plugin update dev-pipeline@claude-dev-pipeline`). Nouzový workaround bez bumpu: `claude plugin uninstall dev-pipeline@claude-dev-pipeline && claude plugin install dev-pipeline@claude-dev-pipeline`.

```bash
claude --plugin-dir ~/claude-dev-pipeline/dev-pipeline
```

Příznak stale verze: session dostane při invokaci skillu starší obsah, než je na disku, nebo nezná nově přidané agenty (`dev-pipeline:*`).

## Workflow — celý cyklus jedné vize

**Tvoje kroky jsou jen 1, 4 a 5. Zbytek běží sám.**

1. **`/vize`** (interaktivní — jediný schvalovací bod). Debatní session, délka podle rozsahu: fact-finding průzkum, grilování otázkami s doporučeními, na závěr kontrola čerstvýma očima; deep research jen na vyžádání. Vstupem může být i backlog `docs/follow-ups.md` — session živé položky probere a roztřídí (převzaté do vize přeškrtne s `PŘEVZATO`, zamítnuté s důvodem). Výstup: `docs/vize/<slug>.md` commitnutý. Spouštěj na main, **až po merge předchozí vize** (branch nové vize vzniká z main).

2. **`/dev-pipeline:orchestrate`** — v nové session; na dlouhý běh „spusť a odejdi" v tmuxu s limit-watcherem (viz Usage limity). Co proběhne samo:
   - **Setup**: branch `vize/<slug>`; archivace předchozí vize (`prd/`, `e2e/`, `journal.md` → `docs/archive/<starý-slug>/`), kompakce follow-ups (přeškrtnuté → archiv, živý soubor = jen otevřené), smazání stale markerů; pre-flight check projektu (testy/deploy/přístup do appky). **Nic z toho neděláš ručně.**
   - **Smyčka řezů**: PRD (lazy rozsah z aktuálního stavu) → nezávislý prd-check → TDD implementace → lehké code-review → commit + deploy (s doloženým SUCCESS) → E2E verifikace (agent-browser) → uzavření (journal, handoff, follow-upy).
   - **Finální fáze**: plné review kolečko → vize-validator proti živé appce → mini-řezy z jeho nálezů → follow-ups sweep → notifikace + závěrečná zpráva.

3. **Přečti závěrečnou zprávu** — je v session I v souboru `docs/zaverecna-zprava.md`: co je hotové per řez, skipped řezy, sekce **Rozhodnutí pro tebe** (skutečné odchylky od vize s doporučením), sekce **Paměť a dokumentace** (co stojí za uložení). Pořadí čtení po běhu: `docs/zaverecna-zprava.md` (souhrn + rozhodnutí) → `docs/follow-ups.md` (živé resty) → `docs/journal.md` (detail per řez, jen když tě něco zajímá).

4. **Tvoje kontrola**: proklikej nasazenou aplikaci / otestuj, co vize slibuje. Případné opravy zadej téže orchestrátor session (nebo nové session s odkazem na journal).

5. **Merge do main — děláš ty, až po kontrole** (nebo na tvůj pokyn Claude: „mergni vizi do main" = checkout main → merge → push na GitHub → `git branch -d vize/<slug>`). Autonomní běh na main NIKDY nesahá. Po merge je cyklus uzavřený a můžeš od kroku 1 začít další vizi.

**Nikdy ručně nemažeš nic v `docs/`** — archivaci i kompakci dělá setup další vize; `docs/follow-ups.md` je kontinuální backlog napříč vizemi a díky kompakci neroste donekonečna.

### Fallback: Ralph driver (bez orchestrátor session)

```bash
~/claude-dev-pipeline/dev-pipeline/scripts/slice-driver.sh --watch   # sleduješ, řez odstartuješ ukončením session
~/claude-dev-pipeline/dev-pipeline/scripts/slice-driver.sh           # headless, spusť a odejdi
```

Stejný souborový kontrakt, každý řez = nová session. Po dokončení: `claude "/dev-pipeline:orchestrate final"`. Headless režim usage limit přežije sám (detekce hlášky → 30min čekání → retry, iterace se nepočítá).

### Usage limity při dlouhém běhu

Claude Code nemá auto-resume po usage limitu. Pipeline to řeší třemi vrstvami:

1. **Subagent umře na limit** → chybu vidí orchestrátor a řeší ji sám (TaskStop + resume; nepočítá se jako pokus řezu — viz failure policy v PIPELINE.md).
2. **Orchestrátor session sama narazí na limit** → stojí, dokud jí někdo nenapíše. Na dlouhé běhy „spusť a odejdi" proto orchestrátor spouštěj v tmuxu a vedle nech běžet watcher, který po resetu pošle „pokračuj":

```bash
tmux new -s pipeline          # v něm: claude → /dev-pipeline:orchestrate ...
~/claude-dev-pipeline/dev-pipeline/scripts/limit-watcher.sh   # druhý terminál
```

3. **Ralph driver (headless)** má retry vestavěný.

Ve všech případech platí: stav běhu žije v souborech (handoff, journal, PRD statusy), takže přerušení kdekoli je bezpečné — nejhorší scénář je čekání, nikdy ztráta práce.

## Souborový kontrakt (v repu cílového projektu)

| Soubor | Účel |
|---|---|
| `docs/vize/<slug>.md` | Vize (jediný schválený vstup) |
| `docs/prd/rez-NN-<slug>.md` | PRD řezu, vzniká lazy; frontmatter `status: in_progress\|done\|skipped` |
| `docs/journal.md` | Append-only deník: co, odchylky, rozhodnutí, pokusy |
| `docs/handoff.md` | Přepisovaný aktuální stav (kotva pro čerstvé kontexty; po compactu ho hook re-injektuje) |
| `docs/follow-ups.md` | Resty a nápady mimo scope |
| `docs/e2e/rez-NN.md` | E2E scénáře řezu (akceptační kritéria v krocích) |
| `docs/zaverecna-zprava.md` | Závěrečná zpráva finální fáze (souhrn, rozhodnutí pro tebe) — přepisovaný per vize |
| `docs/archive/<slug>/` | Archiv předchozí vize (prd/, e2e/, journal, zaverecna-zprava) — vytváří setup další vize |
| `docs/.vize-done` | Marker: vize naplněna |
| `docs/.orchestrator-run` | Marker: běží autonomní run (aktivuje deploy gate) |
| `docs/.deploy-unlocked` | Marker: deploy povolen (po zeleném review+testech) |
| `docs/.review-passed` | Marker: plné kolečko prošlo |

Kanonická definice fází: `dev-pipeline/skills/slice-run/PIPELINE.md` — **proces se mění jen tam**.

## Hooky (globální po zapnutí pluginu)

- **guard-blast-radius** (PreToolUse/Bash): blokuje force-push (vždy), `git reset --hard`/`git clean -f` na main, `rm -rf` na kořeny, a deploy během autonomního běhu bez `.deploy-unlocked`. Deterministický shell, běží i pod `--dangerously-skip-permissions`.
- **session-start-handoff** (SessionStart/compact): po compactu injektuje obsah `docs/handoff.md`.

## Zásady

- Review: per řez jen lehké (code-review medium); plné kolečko (thermo-nuclear → /simplify → 2× code-review → 2× security-review) jednou na konci vize.
- TDD červená → zelená: test/E2E scénář vzniká před implementací a musí nejdřív selhat ze správného důvodu.
- Zaseknutý řez: 3 **funkční** neúspěchy → `skipped` + poctivý záznam; vyhodnotí validátor na konci. Infra smrt agenta (limit, API error) se nepočítá — řeší se resume.
- Git: všechno na `vize/<slug>` branchi; merge do main dělá uživatel po vlastním otestování. Deploy target per projekt (sekce Deploy v CLAUDE.md projektu; staging = přepnutí configu, promotion = deploy téhož commitu).
- Autonomní běh se nikdy neptá uživatele; odchylky žurnaluje, rozhodnutí eskaluje až validátor v závěrečném reportu.
- **Jedna vize v čase per projekt.** Souběžné běhy na témže projektu si vzájemně přepisují nasazení (deploy z branche A smaže z produkce změny branche B), DB migrace a prompt seed — git worktree vyřeší jen checkout, ne sdílenou produkci; navíc oba běhy čerpají stejný usage limit. Víc témat najednou = jedna vize s více oblastmi (lazy slicing si je rozřeže). Souběh je v pořádku napříč různými projekty, nebo až bude staging per branch.
