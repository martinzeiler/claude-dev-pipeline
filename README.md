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

## Workflow

1. **`/vize`** — několikahodinová debatní session: grilování otázkami (vyjasňovací + proaktivní), deep research, na závěr kontrola čerstvýma očima. Výstup `docs/vize/<slug>.md` včetně nezávazné osnovy řezů. **Tohle je jediný schvalovací bod.**
2. **`/dev-pipeline:orchestrate`** — v nové session. Orchestrátor drží jen souhrny; každou fázi každého řezu dělá subagent s čerstvým kontextem: PRD (rozsah řezu se určuje lazy z aktuálního stavu, ne z osnovy) → plan-check → TDD implementace → lehké code-review → commit + deploy → E2E verifikace (agent-browser) → uzavření (journal, handoff, status). Po naplnění vize: plné review kolečko, vize-validator, mini-řezy z jeho nálezů, notifikace.
3. Hotovo. Závěrečná zpráva obsahuje i sekci **Rozhodnutí pro tebe** (jen skutečné odchylky od vize) a odkaz na deník.

### Fallback: Ralph driver (bez orchestrátor session)

```bash
~/claude-dev-pipeline/dev-pipeline/scripts/slice-driver.sh --watch   # sleduješ, řez odstartuješ ukončením session
~/claude-dev-pipeline/dev-pipeline/scripts/slice-driver.sh           # headless, spusť a odejdi
```

Stejný souborový kontrakt, každý řez = nová session. Po dokončení: `claude "/dev-pipeline:orchestrate final"`.

## Souborový kontrakt (v repu cílového projektu)

| Soubor | Účel |
|---|---|
| `docs/vize/<slug>.md` | Vize (jediný schválený vstup) |
| `docs/prd/rez-NN-<slug>.md` | PRD řezu, vzniká lazy; frontmatter `status: in_progress\|done\|skipped` |
| `docs/journal.md` | Append-only deník: co, odchylky, rozhodnutí, pokusy |
| `docs/handoff.md` | Přepisovaný aktuální stav (kotva pro čerstvé kontexty; po compactu ho hook re-injektuje) |
| `docs/follow-ups.md` | Resty a nápady mimo scope |
| `docs/e2e/rez-NN.md` | E2E scénáře řezu (akceptační kritéria v krocích) |
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
- Zaseknutý řez: 3 pokusy → `skipped` + poctivý záznam; vyhodnotí validátor na konci.
- Git: všechno na `vize/<slug>` branchi; merge do main dělá uživatel po vlastním otestování. Deploy target per projekt (sekce Deploy v CLAUDE.md projektu; staging = přepnutí configu, promotion = deploy téhož commitu).
- Autonomní běh se nikdy neptá uživatele; odchylky žurnaluje, rozhodnutí eskaluje až validátor v závěrečném reportu.
