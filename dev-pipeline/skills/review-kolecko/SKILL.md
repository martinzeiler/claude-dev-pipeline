---
name: review-kolecko
description: Závěrečné review kolečko nad diffem celé vize jako jeden Workflow blok-kolecko (thermo, code-review, dluh z follow-ups, bezpečnost, nasazení a E2E, závěr) a recept na sken claude-security jen na vyžádání. Spouští orchestrátor ve finální fázi, nebo uživatel nad větší sérií změn.
disable-model-invocation: true
---

# Review kolečko: plný závěrečný audit

Patří do finální fáze vize nebo nad větší sérii změn na výslovnou žádost uživatele; na jeden řez se nespouští (thermo i code-review proběhly v bloku stavby). Celé kolečko je **jeden Workflow blok** `<plugin_root>/workflows/blok-kolecko.js`: pořadí fází, stropy oprav, brány a commity jsou v jeho kódu (přehled v `../orchestrate/KONTRAKT.md`, sekce Bloky). Ty ho spustíš, počkáš na notifikaci a zpracuješ návrat; žádný report nečteš.

## Jediný krok

Handoff `stav běhu: běží workflow blok-kolecko (task <id>)`, args do souboru a spusť:

```
python3 <plugin_root>/scripts/args-bloku.py kolecko <cwd> --doplnit '{"base": "main"}'
Workflow({ name: "dev-pipeline:blok-kolecko", args: { cwd, plugin_root, args_file: "docs/.kolecko.json" } })
```

Stálá pole (`vize`, `produkt`, `ne_cile`, `runbook`, `deploy_mode`, `deploy_okno`, `app_pristup`, `rozhodnuti_majitele`, `rychle_kontroly`) načte blok z `docs/.run-args.json`; `base` je `main`, jiný jen na výslovné zadání. Mimo běh (bez `docs/.run-args.json`) předej args celé ve volání. Workflow běží na pozadí; tah ukonči.

## Co přijde zpět

Návrat pod 6 000 znaků: `vysledek` (`hotovo` | `selhalo` s `faze`, `detail`, `obnova_od`, u `deploy-infra` navíc `infra: true` | `zastaveno` s `faze: deploy-odklad` a `nejdriv`), `thermo {nalezu, blokeru, opraveno}`, `review.kolo1 {nalezu, blokujicich, fix_agentu}`, `dluh {opraveno, odmitnuto}`, `security {nalezu, blokujicich, commity}`, `verify`, `deploy`, `e2e {vysledek, celkem, pass, castecne, fail, castecna_kriteria, vadna_kriteria, prostredi}`, `commity`, `chybejici_commity`, `rozhodnuti`, `spory`, `review_passed`, `predavky`; seznamy jen počtem s `vysledek_soubor: "docs/.vysledek-kolecko.json"`.

- **Počty do zprávy** jedním blokem: thermo N/B · kolo 1 N nálezů, F fix agentů · dluh N opraveno · bezpečnost N nálezů, C commitů · E2E pass/celkem · commity kolečka. Nálezy nepřevyprávěj; follow-upy a odmítnuté zapsal závěr bloku.
- **`rozhodnuti`** (vadná kritéria, `prostredi`, kritéria, jejichž data Povolení vyrobit nedovoluje) zpracuj podle sekce Otázky pro majitele ve skillu orchestrate: do vize-spory s navrženou odpovědí, běh jede podle návrhu; záznam, který smíš uzavřít, uzavři sám, do dotazníku sekce Rozhodni jde jen to, co mění Cíl, Ne-cíl, Rozhodnutí, Povolení nebo mantinel, a právní či obsahové věci.
- **`review_passed: true`** = marker `docs/.review-passed` existuje. `false` nebo `selhalo`: řekni uživateli fázi a detail; zastavení (d) platí, když v nasazeném kódu zůstal blokující bezpečnostní nález. `faze: deploy` po bezpečnostní opravě z E2E: oprava zůstala necommitnutá a půjde do commitu obnovy, jmenuj ji. `deploy-infra` je zastavení (g), `deploy-odklad` cron na `nejdriv`; obnova podle `../orchestrate/OBNOVA.md` (kolečko ve dvou krocích).
- **`chybejici_commity`** neprázdné: závěr nenašel v gitu hlášený bezpečnostní commit; řekni to ve zprávě. `spory` jednou odrážkou do handoffu.

## Fallback

Jen když Workflow tool v session není: projdi fáze ručně ve stejném pořadí přes agenty pluginu (`thermo-nuclear-review` → `fix` → `verify`; `code-review` rozsah větev → fix per balíček → verify; dluh přes `scripts/follow-ups.py --osud oprava`; bezpečnostní čočka a `security-review`; deploy, E2E, závěr), reporty do `docs/reviews/kolecko-*.md`, commity `kolecko: <fáze>` přes `dev-pipeline:deploy` v režimu commit-only, a zapiš záznam `SELHALO` do `~/dev-pipeline-feedback.md`. Tichá ruční náhrada bez záznamu je nejhorší varianta.

## Sken claude-security (jen na vyžádání)

Sken pluginem `claude-security` není součást kolečka. Spouští se výhradně, když hlavička vize nese `bezpecnostni_sken: changes` nebo `codebase`, nebo o něj uživatel výslovně požádá: pouští přes sto agentů na modelu session (`model: inherit`, effort xhigh) a běží hodiny; na session s Fable je násobně dražší než na Opus. Spouští ho **orchestrátor přímo** `Workflow({ name: "claude-security:scan", … })`, nikdy přes subagenta (nemá Workflow tool). Kořen pluginu `~/.claude/plugins/cache/claude-plugins-official/claude-security/<verze>/`, recept v jeho `skills/claude-security/jobs/scan-changes.md` (`scan-codebase.md` pro celý repozitář). Postup pro `changes` po kolečku, nad čistým stromem:

1. Rozsah: `MB=$(git merge-base main HEAD)`, range `"$MB..HEAD"`; `git diff --numstat "$MB..HEAD" -- <scope dirs>`: počet řádků = `diffFileCount`, součet obou sloupců = `diffLineCount` (při `-` v řádku `null`).
2. Adresář `CLAUDE-SECURITY-<UTC YYYYMMDD-HHMMSS>/.claude-security-run` a do obou úrovní `.gitignore` s řádkem `*`; `runDir` je vnitřní adresář.
3. Stamp samostatným voláním: `python3 "<kořen pluginu>/scripts/write_scan_meta.py" <runDir> <cwd> --mode changes --effort medium --base main --merge-base $MB --scope <dirs>`.
4. `Workflow({ name: "claude-security:scan", args: { scanRoot: "<cwd>", runDir: "<cwd>/CLAUDE-SECURITY-<ts>/.claude-security-run", mode: "changes", effort: "medium", scope: ["<produkční adresáře změn>"], range: "<MB>..HEAD", diffFileCount: <n>, diffLineCount: <n|null>, scopeFileCount: null, fileCount: null, dirFileCounts: null, focus: null } })`. `scope` jen produkční adresáře, kterých se změna dotkla (žádné `docs/`); pro `codebase` mode `codebase` bez `range`.
5. Výsledek přijde notifikací (na velké změně navazují další běhy podle `save_result.py` a jeho řádku `next:`). Nálezy jsou vstup pro `dev-pipeline:fix` (cesta k reportu a id; opravy bez commitu, pak `verify`, po zelené bráně commit `fix(security): …` a deploy agentem). Patche skenu se neaplikují, report `CLAUDE-SECURITY-<ts>/CLAUDE-SECURITY-RESULTS.md` zůstává mimo commit. Do journalu počty a co sken přinesl navíc proti bezpečnostní fázi kolečka.

## Pravidla

- Žádná fáze review se nepřeskakuje, protože minulá nic nenašla; drží to kód bloku. Fix agenti kolečka necommitují, commitují jen kroky commitu a deploye po zelené bráně.
- Nález je pro fix agenta hypotéza; oprava neobchází podstatu (žádný suppress, ignore, quick fix); sporný nález jde do journalu jako vědomé rozhodnutí, nebo do `rozhodnuti`, když mění vizi.
- Bezpečnostní nálezy se opravují hned, i pre-existing mimo diff. Žádné plošné přestavby na konci vize: co je velké jako řez, je follow-up `[nápad]`.
