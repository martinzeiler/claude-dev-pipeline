---
name: review-kolecko
description: Plné závěrečné review kolečko nad diffem celé vize (git diff main...HEAD) jako jeden Workflow `dev-pipeline:blok-kolecko` - thermo-nuclear strukturální audit, code-review kolo 1, kolo 2 fan-outem pěti čoček s triáží, bezpečnost dvěma metodikami, nasazení a E2E kolečka, závěr; po každé opravné vlně brána a commit. Invokuje ho orchestrátor ve finální fázi vize, nebo uživatel explicitně nad větší sérií změn. Neinvokovat na jeden řez. Sken claude-security je zvláštní krok jen na vyžádání.
---

# Review kolečko — plný závěrečný audit

Patří jen do finální fáze vize (invokoval tě orchestrátor) nebo nad větší sérii změn na výslovnou žádost uživatele. Když ani jedno neplatí, zastav se a doporuč review přes agenta `dev-pipeline:code-review`. Na jeden řez se kolečko nespouští: per řez proběhlo thermo i code-review už v bloku stavby.

Celé kolečko je **jeden Workflow blok** `<plugin_root>/workflows/blok-kolecko.js`. Pořadí fází, stropy oprav, brány a commity jsou v jeho kódu, ne v tvém úsudku; ty ho spustíš, počkáš na notifikaci a zpracuješ návrat. Sám nic nereviewuješ ani neopravuješ a žádný report nečteš. Kontrakt souborů a agentů je v `../orchestrate/KONTRAKT.md`.

## Jediný krok

Do handoffu `stav běhu: běží workflow blok-kolecko (task <id>)` a spusť:

```
Workflow({ name: "dev-pipeline:blok-kolecko", args: {
  cwd, plugin_root, vize, produkt,
  base: "main",
  ne_cile: "<text sekce Ne-cíle z vize, do 1 500 znaků>",
  runbook, deploy_mode, deploy_okno, app_pristup
} })
```

Odkud jsou args: `cwd`, `plugin_root`, `vize` a `produkt` stejné jako u bloků řezů; `base` je `main`, jiný jen když ho invokace výslovně předá; `ne_cile` opiš z vize, kterou máš přečtenou (blok ho dá do rámce každého agenta včetně fix agentů, aby oprava nepřidala, co vize zakazuje); `runbook`, `deploy_mode`, `deploy_okno` a `app_pristup` z projektových faktů ze setupu (bez deploy konfigurace `deploy_mode: "commit-only"`, bez přístupu do aplikace poběží E2E jako doložení kritérií bez prohlížeče). Workflow běží na pozadí, výsledek přijde notifikací; tah ukonči.

Co blok udělá (pro orientaci, ne k zásahu): thermo → oprava jen BLOCKER/HIGH → brána → commit `kolecko: thermo` · code-review kolo 1 nad celou větví → opravy po disjunktních balíčcích souběžně → brána → commit · kolo 2: pět souběžných čoček (`data-a-izolace`, `kontrakty-a-volajici`, `regrese-z-historie`, `bezpecnost`, `testy-a-doktrina`) nad celým rozsahem, pak triáž jedním agentem (sloučení duplicit; opravit teď / follow-up jako kandidát na řez / odmítnout s důvodem / sporné k rozhodnutí) → opravy → brána → commit · bezpečnost: bezpečnostní čočka s checklistem (multi-tenant routy a nástroje včetně starých, sweep rizikových vzorů z CLAUDE.md, pre-existing nálezy platí) souběžně s `security-review` (agent ho zkusí přes Skill; když není k dispozici, udělá ekvivalentní průchod a v návratu to řekne) → opravy samostatnými commity `fix(security): …` · brána → nasazení → sestavení `docs/e2e/kolecko.md` z commitů kolečka → E2E verifikace (FAIL: jedna oprava, deploy, E2E znovu; vadné kritérium se neopravuje, jde k rozhodnutí) · závěr: journal, follow-ups, `docs/.review-passed`, commit docs. Žádná fáze se nepřeskakuje, protože minulá nic nenašla; brána má jednu opravu na vlnu; neúspěch fáze blok neopakuje.

## Co přijde zpět a co s tím

Návrat: `vysledek` (`hotovo` | `selhalo` s `faze` a `detail`), `thermo {nalezu, blokeru, opraveno}`, `review.kolo1 {nalezu, blokujicich, fix_agentu}`, `review.kolo2 {cocek, nalezu, opravit_ted, follow_up, odmitnuto, fix_agentu}`, `security {nalezu, blokujicich, commity}`, `verify`, `deploy {stav, commit}`, `e2e {vysledek, celkem, pass, castecne, fail, castecna_kriteria, vadna_kriteria}`, `commity`, `rozhodnuti`, `follow_ups`, `spory`, `odmitnute`, `reports`, `review_passed`.

- **Počty do zprávy uživateli**, jedním blokem: thermo N/B · kolo 1 N nálezů, F fix agentů · kolo 2 N nálezů → opravit / follow-up / odmítnuto · bezpečnost N nálezů, C commitů · E2E pass/celkem · commity kolečka. Nálezy nepřevyprávěj; follow-upy a odmítnuté nálezy už zapsal závěr bloku do journalu a follow-ups.
- **`rozhodnuti`** (sporné nálezy triáže a vadná kritéria E2E, každé s navrženou odpovědí): zpracuj podle sekce Otázky pro majitele ve skillu orchestrate: zapiš je do `docs/vize-spory.md` ve formátu z kontraktu (navrženou odpověď do „Jak jsem se zachoval“), běh jede podle návrhu, a v závěrečné zprávě jdou do **OTÁZKY S NAVRŽENOU ODPOVĚDÍ**; do **ROZHODNUTÍ PRO TEBE** jen ty, které mění Cíl, Ne-cíl nebo mantinel vize.
- **`review_passed: true`** = marker `docs/.review-passed` existuje, finální fáze pokračuje. `false` nebo `vysledek: selhalo`: řekni uživateli fázi a detail, nálezy z dokončených fází jsou v návratu a v journalu; kolečko lze spustit znovu se stejnými args a `resumeFromRunId` (dokončené fáze se neopakují). Zastavení (d) ze SKILL.md orchestrátora platí, když v nasazeném kódu zůstal blokující bezpečnostní nález, který blok nedokázal opravit.
- `spory` jednou odrážkou na záznam do handoffu jako po řezu.

## Fallback

Jen když Workflow tool v session není: projdi fáze ručně ve stejném pořadí přes agenty (`dev-pipeline:thermo-nuclear-review` → `dev-pipeline:fix` → `dev-pipeline:verify`; `dev-pipeline:code-review` rozsah větev → fix per balíček → verify; pět čoček agentem `dev-pipeline:code-review` s čočkou v zadání → triáž `general-purpose` → fix → verify; bezpečnostní čočka + `security-review`; deploy, E2E, závěr), reporty do `docs/reviews/kolecko-*.md`, commity `kolecko: <fáze>` přes `dev-pipeline:deploy` v režimu commit-only, a zapiš záznam `SELHALO` do `~/.claude/dev-pipeline-feedback.md` (co chybělo, jak se to obešlo). Tichá ruční náhrada bez záznamu je nejhorší varianta.

## Bezpečnostní sken claude-security (jen na vyžádání)

Sken pluginem `claude-security` **není součást kolečka** a nespouští se automaticky podle typu diffu. Spouští se výhradně, když hlavička vize nese `bezpecnostni_sken: changes` nebo `bezpecnostni_sken: codebase`, nebo když o něj uživatel výslovně požádá. Důkaz z běhu uklid-po-sklik: 178 agentů, čtyři hodiny, jeden LOW nález, který existoval už před větví, padlá sweep fáze po vypršení loginu a pravděpodobně vyvolaný usage limit.

Když je vyžádaný, spouští ho **orchestrátor přímo** `Workflow({ name: "claude-security:scan", … })`, nikdy přes subagenta `claude-security:claude-security` (ten Workflow tool nemá a sken neproběhne). Kořen pluginu: `~/.claude/plugins/cache/claude-plugins-official/claude-security/<verze>/`; recept je v jeho `skills/claude-security/jobs/scan-changes.md` (a `scan-codebase.md` pro celý repozitář). Postup pro `changes` po skončení kolečka (strom musí být čistý, sken bere jen commitnuté změny):

1. Rozsah: `MB=$(git merge-base main HEAD)`, range `"$MB..HEAD"` (vždy dvoustranný tvar). Velikost: `git diff --numstat "$MB..HEAD" -- <scope dirs>`; počet řádků výpisu = `diffFileCount`, součet dvou číselných sloupců = `diffLineCount` (když je v některém řádku `-`, `diffLineCount: null`).
2. Adresář: `mkdir -p CLAUDE-SECURITY-<UTC YYYYMMDD-HHMMSS>/.claude-security-run` a do obou úrovní `.gitignore` s jediným řádkem `*` (setup běhu dává `CLAUDE-SECURITY-*/` i do `.gitignore` projektu). `runDir` je vnitřní `.claude-security-run/`.
3. Stamp revize samostatným Bash voláním: `python3 "<kořen pluginu>/scripts/write_scan_meta.py" <runDir> <cwd> --mode changes --effort medium --base main --merge-base $MB --scope <dirs>`.
4. Spuštění:

   ```
   Workflow({ name: "claude-security:scan",
              args: { scanRoot: "<cwd absolutně>", runDir: "<cwd>/CLAUDE-SECURITY-<ts>/.claude-security-run",
                      mode: "changes", effort: "medium",
                      scope: ["<produkční adresáře změněných souborů>"], range: "<MB>..HEAD",
                      diffFileCount: <n>, diffLineCount: <n nebo null>,
                      scopeFileCount: null, fileCount: null, dirFileCounts: null,
                      focus: null } })
   ```

   `effort: medium` (při diffu do 5 souborů a 300 řádků běží jeden researcher, jinak plná matice; `high` zdvojnásobuje researchery i sweepy a vždy běží plnou maticí). `scope` jen produkční adresáře, kterých se změna dotkla: žádné `docs/`, žádné adresáře, kde větev jen mazala. Pro `codebase` mode `codebase` bez `range`, `scope` podle hlavičky vize.
5. **Model:** agenti skenu mají `model: inherit` a `effort: xhigh`, běží tedy na modelu session. Na Fable session to znamená 100 a více agentů Fable xhigh; když to nechceš platit, spusť sken ze session na Opus, nebo s tím počítej ve zprávě uživateli.
6. Výsledek přijde notifikací (na velké změně navazují další běhy; recept říká spouštět `save_result.py` a jeho `next:` řádek). Nálezy skenu jsou vstup pro `dev-pipeline:fix` agenty s cestou k reportu a identifikátory (opravy commity `fix(security): …`, pak `dev-pipeline:verify` a deploy). **Patche skenu se neaplikují**, jeho report (`CLAUDE-SECURITY-<ts>/CLAUDE-SECURITY-RESULTS.md`) zůstává mimo commit. Do journalu zapiš počty a co sken přinesl navíc proti bezpečnostní fázi kolečka.

## Pravidla

- Žádné kolo se nepřeskakuje, protože minulé nic nenašlo; to drží kód bloku.
- Paralelním fix agentům patří disjunktní množiny souborů, ne rozdělené nálezy; blok balíčky slučuje po souborech.
- Nález je pro fix agenta hypotéza; oprava nesmí obejít podstatu (žádný suppress, ignore, quick fix); sporný nález jde do journalu jako vědomé rozhodnutí, nebo do `rozhodnuti`, když mění vizi.
- Bezpečnostní nálezy se opravují hned, i pre-existing mimo diff; follow-up jen u sporného nálezu bez jasného fixu.
- Žádné plošné přestavby na konci vize: co je velké jako řez, je follow-up jako kandidát na příští vizi.
- Reporty konzumují agenti; ty držíš počty, cesty a rozhodnutí.
