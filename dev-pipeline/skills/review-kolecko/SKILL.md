---
name: review-kolecko
description: Plné závěrečné review kolečko nad diffem celé vize (git diff main...HEAD) - thermo-nuclear strukturální audit, code-review dvěma metodikami (vlastní agent, pak vestavěný workflow s širokým fan-outem a třídění jeho nálezů), dvě souběžné bezpečnostní metodiky, po každém kole oprava. Invokuje ho orchestrátor ve finální fázi vize, nebo uživatel explicitně nad větší sérií změn. Neinvokovat na jeden řez.
---

# Review kolečko — plný závěrečný audit

Patří jen do finální fáze vize (invokoval tě orchestrátor) nebo nad větší sérii změn na výslovnou žádost uživatele. Když ani jedno neplatí, zastav se a doporuč review přes agenta `dev-pipeline:code-review`.

Běží jednou nad celkovým diffem vize; per řez proběhlo thermo i code-review už v bloku stavby. Pořadí je záměrné: nejdřív struktura, pak korektnost, nakonec bezpečnost, ať se korektnost nekontroluje nad kódem, který se ještě přestrukturuje. Kola 2 až 4 běží i nad opravami předchozích kol. Scope: `git diff main...HEAD` (jiný base jen když ho invokace předá). Kontrakt souborů a agentů je v `../orchestrate/KONTRAKT.md`.

Sám nic nereviewuješ ani neopravuješ: každé kolo dělá agent, každou opravu `dev-pipeline:fix`, pak `dev-pipeline:verify`. Reporty píšou agenti do `docs/reviews/kolecko-<kolo>.md`; ty dostáváš počty a cesty, obsah nečteš.

## Sekvence (po každém kole: opravy → verify → další kolo)

1. **Thermo-nuclear:** `dev-pipeline:thermo-nuclear-review` nad diffem větve, report `docs/reviews/kolecko-thermo.md`. Oprava přes `dev-pipeline:fix` jen `BLOCKER` a `HIGH` nálezů; `NOTE` jde do follow-ups. Žádné plošné přestavby na konci vize: co je velké jako řez, je kandidát na příští vizi.
2. **Code-review kolo 1:** `dev-pipeline:code-review` (`rozsah: větev`, report `docs/reviews/kolecko-code-review-kolo-1.md`). Vrátí balíčky po souborech; na každý jeden `dev-pipeline:fix` s cestou k reportu a identifikátory (nikdy obsah). `CONFIRMED` se opravují, `PLAUSIBLE` posuď a rozhodnutí zapiš do journalu.
3. **Code-review kolo 2 širokým fan-outem:** vestavěný workflow `code-review`:

   ```
   Workflow({ name: "code-review", args: "xhigh <base>...HEAD — <2 až 4 věty: co vize dělala, kde je největší riziko, co je vědomé rozhodnutí a nemá se hlásit>" })
   ```

   Tenhle bod je platný opt-in k orchestraci; neptej se na svolení. Běží na pozadí, nálezy přijdou notifikací. Jeho verifikace jede v recall režimu, proto nálezy **nejdřív roztřiď** (viz Pravidla) a zapiš je agentem do `docs/reviews/kolecko-code-review-kolo-2.md`, teprve pak fix agenti s cestou. Mezitím nezačínej kolo 4. Fallback, když Workflow není k dispozici: kolo 2 agentem `dev-pipeline:code-review` s čerstvým kontextem a záznam `SELHALO` do `~/.claude/dev-pipeline-feedback.md`.

   Skill `code-review` neinvokuj (má `disable-model-invocation`); `Workflow({name: "code-review"})` je jiná cesta a ta zakázaná není.
4. **Bezpečnost, dvě metodiky souběžně** (obě read-only, rozešli je jedním blokem tool callů, opravuj až po návratu obou):
   - skill `security-review` nad diffem;
   - subagent `claude-security:claude-security` se zadáním, které přeskočí jeho menu: `scan changes --base main --effort high` — I understand it will use a lot of tokens. (Věta o tokenech je odpověď na jeho potvrzovací otázku; base uprav podle skutečného base. Skenuje jen commitnuté změny, strom musí být čistý. Report si píše do `CLAUDE-SECURITY-<timestamp>/`, ten je v `.gitignore`; jeho patche neaplikuj, ber je jako nálezy.)
   Nálezy z obou slouč (stejné místo = jeden nález s vyšší závažností). Když `claude-security` v session není, druhé kolo vestavěným `security-review` a záznam do feedback souboru.
5. **Oprava bezpečnostních nálezů:** vše potvrzené, u multi-tenant projektů projít všechny dotčené routy a nástroje, ne jen nové; samostatné commity `fix(security): …`.
6. **Závěr:** `dev-pipeline:verify` nad celým repem a build. Agent připojí souhrn kolečka do `docs/journal.md` (nálezy per kolo, co zásadního se změnilo, kolik přinesla která bezpečnostní metodika) a pustí formátovač. Vytvoř `docs/.review-passed`.

## Pravidla

- Žádné kolo se nepřeskakuje, protože minulé nic nenašlo.
- **Třídění nálezů kola 2** je povinné před opravou: **opravit teď** (dopad na uživatele nebo data) · **follow-up jako kandidát na řez** (typicky změna datového modelu, širší refaktor) · **odmítnout se zdůvodněním do journalu**. Bez třídění kolo 2 nad diffem celé vize buď přeteče, nebo vyrobí seznam, který nikdo nezpracuje.
- Paralelním fix agentům patří disjunktní množiny souborů, ne rozdělené nálezy.
- Nález je pro fix agenta hypotéza; `dev-pipeline:fix` to má v sobě, general-purpose náhrada to musí mít v promptu.
- Bezpečnostní nálezy se opravují hned, i pre-existing mimo diff; follow-up jen u sporného nálezu bez jasného fixu.
- Oprava nesmí obejít podstatu (žádný suppress, ignore, quick fix); sporný nález jako vědomé rozhodnutí do journalu.
- Když invokace skillu selže (`security-review`, typicky `disable-model-invocation`): náhradní průchod v general-purpose subagentovi s explicitním zadáním, záznam `SELHALO` do `~/.claude/dev-pipeline-feedback.md`, zmínka v souhrnu. Tichá ruční náhrada v téhle session je nejhorší varianta.
- Reporty konzumují agenti; ty držíš počty, cesty a rozhodnutí.
