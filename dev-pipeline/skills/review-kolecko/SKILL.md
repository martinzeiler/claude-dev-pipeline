---
name: review-kolecko
description: Plné závěrečné review kolečko nad diffem celé vize (git diff main...HEAD) jako jeden Workflow `dev-pipeline:blok-kolecko` - thermo-nuclear strukturální audit, code-review kolo 1, bezpečnost dvěma metodikami, nasazení a E2E kolečka, závěr; po každé opravné vlně brána a commit. Invokuje ho orchestrátor ve finální fázi vize, nebo uživatel explicitně nad větší sérií změn. Neinvokovat na jeden řez. Sken claude-security je zvláštní krok jen na vyžádání.
---

# Review kolečko — plný závěrečný audit

Patří jen do finální fáze vize (invokoval tě orchestrátor) nebo nad větší sérii změn na výslovnou žádost uživatele. Když ani jedno neplatí, zastav se a doporuč review přes agenta `dev-pipeline:code-review`. Na jeden řez se kolečko nespouští: per řez proběhlo thermo i code-review už v bloku stavby.

Celé kolečko je **jeden Workflow blok** `<plugin_root>/workflows/blok-kolecko.js`. Pořadí fází, stropy oprav, brány a commity jsou v jeho kódu, ne v tvém úsudku; ty ho spustíš, počkáš na notifikaci a zpracuješ návrat. Sám nic nereviewuješ ani neopravuješ a žádný report nečteš. Kontrakt souborů a agentů je v `../orchestrate/KONTRAKT.md`.

## Jediný krok

Do handoffu `stav běhu: běží workflow blok-kolecko (task <id>)`, args do souboru a spusť:

```
python3 <plugin_root>/scripts/args-bloku.py kolecko <cwd> --doplnit '{"base": "main"}'
Workflow({ name: "dev-pipeline:blok-kolecko", args: { cwd, plugin_root, args_file: "docs/.kolecko.json" } })
```

Odkud jsou args: `vize`, `produkt`, `ne_cile` (blok ho dá do rámce každého agenta včetně fix agentů, aby oprava nepřidala, co vize zakazuje), `runbook`, `deploy_mode`, `deploy_okno`, `app_pristup`, `rozhodnuti_majitele` (rozhodnutí majitele, která mění provoz běhu; jdou do rámce každého agenta včetně autora scénářů) a `rychle_kontroly` (fix agenti je pouštějí vedle dotčených testů) načte blok z `docs/.run-args.json` ze setupu běhu (bez deploy konfigurace `deploy_mode: "commit-only"`, bez přístupu do aplikace poběží E2E jako doložení kritérií bez prohlížeče); `base` je `main`, jiný jen když ho invokace výslovně předá. Mimo běh (uživatel výslovně, bez `docs/.run-args.json`) předej args celé ve volání: `{ cwd, plugin_root, vize, produkt, base, ne_cile, runbook, deploy_mode, deploy_okno, app_pristup, rychle_kontroly }`. Workflow běží na pozadí, výsledek přijde notifikací; tah ukonči.

Co blok udělá (pro orientaci, ne k zásahu): thermo → oprava jen BLOCKER/HIGH → brána → commit `kolecko: thermo` · code-review kolo 1 nad celou větví → opravy po disjunktních balíčcích souběžně → brána → commit · bezpečnost: bezpečnostní čočka s checklistem (multi-tenant routy a nástroje včetně starých, sweep rizikových vzorů z CLAUDE.md, pre-existing nálezy platí) souběžně s `security-review` (agent ho zkusí přes Skill; když není k dispozici, udělá ekvivalentní průchod a v návratu to řekne) → opravy bez commitu → brána → krok commitu nejdřív samostatně commitne `fix(security): …` (soubor, který nese i jinou změnu, jde řádkem `fix(security)` do commitu vlny) · brána (přeskočí se, když poslední brána byla zelená a strom se od ní nezměnil) → nasazení → sestavení `docs/e2e/kolecko.md` z commitů kolečka (kritéria `AKn`; kritérium nad populací vznikající časem autor vyrobí ručním během podle Povolení v kroku po nasazení kolečka, jinak ho nenapíše a vrátí v `rozhodnuti`, viz Čekání na čas ve skillu orchestrate) → E2E verifikace (FAIL: jedna oprava, deploy, E2E znovu; vadné kritérium se neopravuje, jde k rozhodnutí; závažný nález mimo kritéria: oprava bez commitu, brána, deploy se samostatným `fix(security)`) · závěr: ověření hashů bezpečnostních commitů, journal, follow-ups, plné seznamy výsledku do `docs/.vysledek-kolecko.json`, `docs/.review-passed`, commit docs. Kolo 2 s pěti čočkami a triáží se ve verzi 1.7.0 zrušilo (dva běhy po sobě nejnižší výnos, bezpečnost má vlastní fázi). Žádná fáze review se nepřeskakuje, protože minulá nic nenašla; brána má jednu opravu na vlnu; neúspěch fáze blok neopakuje. Fix agenti kolečka nikdy necommitují, ani bezpečnostní opravu: commitují jen kroky commitu a deploye po zelené bráně.

## Co přijde zpět a co s tím

Návrat (pod 6 000 znaků): `vysledek` (`hotovo` | `selhalo` s `faze`, `detail` a `obnova_od`; u `faze: deploy-infra` navíc `infra: true` | `zastaveno` s `faze: deploy-odklad` a `nejdriv`), `thermo {nalezu, blokeru, opraveno}`, `review.kolo1 {nalezu, blokujicich, fix_agentu}`, `security {nalezu, blokujicich, commity}`, `verify`, `deploy {stav, commit}`, `e2e {vysledek, celkem, pass, castecne, fail, castecna_kriteria, vadna_kriteria}`, `commity`, `chybejici_commity`, `rozhodnuti`, `spory`, `review_passed`, `predavky`; `follow_ups`, `odmitnute` a `reports` jen počtem s `vysledek_soubor: "docs/.vysledek-kolecko.json"` (plné znění tam, čteš ho jen při potřebě).

- **Počty do zprávy uživateli**, jedním blokem: thermo N/B · kolo 1 N nálezů, F fix agentů · bezpečnost N nálezů, C commitů · E2E pass/celkem · commity kolečka. Nálezy nepřevyprávěj; follow-upy a odmítnuté nálezy už zapsal závěr bloku do journalu a follow-ups.
- **`rozhodnuti`** (vadná kritéria E2E a kritéria, jejichž data Povolení vyrobit nedovoluje, každé s navrženou odpovědí; to druhé řeš podle sekce Čekání na čas ve skillu orchestrate): zpracuj podle sekce Otázky pro majitele ve skillu orchestrate: zapiš je do `docs/vize-spory.md` ve formátu z kontraktu (navrženou odpověď do „Jak jsem se zachoval“), běh jede podle návrhu, a v závěrečné zprávě jdou do **OTÁZKY S NAVRŽENOU ODPOVĚDÍ**; do **ROZHODNUTÍ PRO TEBE** jen ty, které mění Cíl, Ne-cíl nebo mantinel vize.
- **`review_passed: true`** = marker `docs/.review-passed` existuje, finální fáze pokračuje. `false` nebo `vysledek: selhalo`: řekni uživateli fázi a detail, nálezy z dokončených fází jsou v návratu a v journalu. Zastavení (d) ze SKILL.md orchestrátora platí, když v nasazeném kódu zůstal blokující bezpečnostní nález, který blok nedokázal opravit.
- **`vysledek: selhalo`, `faze: deploy` po bezpečnostní opravě z E2E:** oprava zůstala necommitnutá v pracovním stromě a nález je v `rozhodnuti`; po obnově ji commitne běžný deploy kolečka (ne jako samostatný `fix(security)`), proto ji ve zprávě uživateli jmenuj.
- **`vysledek: selhalo`, `faze: deploy-infra`** (`infra: true`): nasazení selhalo mimo kód (přihlášení nebo účet CLI, oprávnění, výpadek platformy). Je to zastavení (g) s push notifikací a `detail`; kód se neopravuje. Po nápravě člověkem obnova níže s `od_faze: "deploy"`.
- **`vysledek: zastaveno`, `faze: deploy-odklad`** s `nejdriv`: nasazení nesmí podle zakázaného okna, runbooku nebo podmínky proběhnout dřív. Není to zastavení (g): jednorázový cron na `nejdriv` a obnova níže s `od_faze: "deploy"`, uživateli jen informace.
- **Obnova po selhání** ve dvou krocích. (1) Nejdřív oprav strom agentem `dev-pipeline:fix` bez commitu: dostane fázi, `detail` a report selhané fáze (výstup brány, důvod commitu nebo report E2E) a pustí jen dotčené testy a typecheck, plnou suitu změří brána obnovy. U `deploy-infra` a u selhání, které opravu kódu nepotřebuje, tento krok vynech. (2) Pak kolečko obnov se stejnými args, `resumeFromRunId` z jeho výsledku a `obnova: { od_faze: "<obnova_od z návratu>", znacka: "<datum čas>" }` (fáze v pořadí `thermo`, `kolo 1`, `bezpecnost`, `deploy`, `zaver`; `obnova` jen ve volání a vždy s `od_faze`, bez něj ji blok ignoruje). Značka změní zadání brány, commitu, deploye a E2E od dané fáze, takže se přeměří nad opraveným stromem; review a opravy se vrátí z cache. Bez značky se z cache vrátí i červená brána; kopie skriptu s pozměněným promptem značku nenahrazuje a každá další obnova potřebuje značku novou.
- **`chybejici_commity`** neprázdné: závěr nenašel v gitu bezpečnostní commit, který hlásil krok commitu. Řekni to ve zprávě uživateli; journal ho už nese jako chybějící.
- `spory` jednou odrážkou na záznam do handoffu jako po řezu.

## Fallback

Jen když Workflow tool v session není: projdi fáze ručně ve stejném pořadí přes agenty (`dev-pipeline:thermo-nuclear-review` → `dev-pipeline:fix` → `dev-pipeline:verify`; `dev-pipeline:code-review` rozsah větev → fix per balíček → verify; bezpečnostní čočka + `security-review`; deploy, E2E, závěr), reporty do `docs/reviews/kolecko-*.md`, commity `kolecko: <fáze>` přes `dev-pipeline:deploy` v režimu commit-only, a zapiš záznam `SELHALO` do `~/dev-pipeline-feedback.md` (co chybělo, jak se to obešlo). Tichá ruční náhrada bez záznamu je nejhorší varianta.

## Bezpečnostní sken claude-security (jen na vyžádání)

Sken pluginem `claude-security` **není součást kolečka** a nespouští se automaticky podle typu diffu. Spouští se výhradně, když hlavička vize nese `bezpecnostni_sken: changes` nebo `bezpecnostni_sken: codebase`, nebo když o něj uživatel výslovně požádá. Důvod: sken pouští přes sto agentů na modelu session a běží hodiny, takže riskuje usage limit i vypršení přihlášení uprostřed sweepu.

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
5. **Model:** agenti skenu mají `model: inherit` a `effort: xhigh`, běží tedy na modelu session: 100 a více agentů na xhigh. Na session s Fable je sken několikanásobně dražší než na Opus; když to nechceš platit, spusť sken ze session na Opus, nebo s tím počítej ve zprávě uživateli.
6. Výsledek přijde notifikací (na velké změně navazují další běhy; recept říká spouštět `save_result.py` a jeho `next:` řádek). Nálezy skenu jsou vstup pro `dev-pipeline:fix` agenty s cestou k reportu a identifikátory (opravy bez commitu, pak `dev-pipeline:verify` a po zelené bráně commit `fix(security): …` a deploy agentem `dev-pipeline:deploy`). **Patche skenu se neaplikují**, jeho report (`CLAUDE-SECURITY-<ts>/CLAUDE-SECURITY-RESULTS.md`) zůstává mimo commit. Do journalu zapiš počty a co sken přinesl navíc proti bezpečnostní fázi kolečka.

## Pravidla

- Žádné kolo se nepřeskakuje, protože minulé nic nenašlo; to drží kód bloku.
- Paralelním fix agentům patří disjunktní množiny souborů, ne rozdělené nálezy; blok balíčky slučuje po souborech.
- Nález je pro fix agenta hypotéza; oprava nesmí obejít podstatu (žádný suppress, ignore, quick fix); sporný nález jde do journalu jako vědomé rozhodnutí, nebo do `rozhodnuti`, když mění vizi.
- Bezpečnostní nálezy se opravují hned, i pre-existing mimo diff; follow-up jen u sporného nálezu bez jasného fixu.
- Žádné plošné přestavby na konci vize: co je velké jako řez, je follow-up jako kandidát na příští vizi.
- Reporty konzumují agenti; ty držíš počty, cesty a rozhodnutí.
