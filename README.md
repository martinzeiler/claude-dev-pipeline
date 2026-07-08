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

## Workflow

1. **`/vize`** — debatní session (délka podle rozsahu): fact-finding průzkum, grilování otázkami (vyjasňovací + proaktivní), na závěr kontrola čerstvýma očima; deep research jen na vyžádání. Výstup `docs/vize/<slug>.md` včetně nezávazné osnovy řezů, commitnutý. **Tohle je jediný schvalovací bod.**
2. **`/dev-pipeline:orchestrate`** — v nové session. Orchestrátor drží jen souhrny; každou fázi každého řezu dělá subagent s čerstvým kontextem: PRD (rozsah řezu se určuje lazy z aktuálního stavu, ne z osnovy) → plan-check → TDD implementace → lehké code-review → commit + deploy → E2E verifikace (agent-browser) → uzavření (journal, handoff, status). Po naplnění vize: plné review kolečko, vize-validator, mini-řezy z jeho nálezů, notifikace.
3. Hotovo. Závěrečná zpráva obsahuje i sekci **Rozhodnutí pro tebe** (jen skutečné odchylky od vize) a odkaz na deník.

### Mezi vizemi (lifecycle stavových souborů)

Po dokončení vize: otestuj branch, mergni do main, smaž vize branch — **nic v `docs/` ruční nemažeš**. Setup další vize sám archivuje `prd/`, `e2e/` a `journal.md` předchozí vize do `docs/archive/<slug>/` a smaže stale markery. `docs/follow-ups.md` je kontinuální backlog napříč vizemi: vyřešené položky se přeškrtávají (per řez i závěrečným sweepem), položky převzaté do nové vize přeškrtne /vize session s `PŘEVZATO do vize <slug>`. Novou vizi začínej až po merge té předchozí (branch nové vize vzniká z main).

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
| `docs/archive/<slug>/` | Archiv předchozí vize (prd/, e2e/, journal) — vytváří setup další vize |
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
