# PIPELINE.md — kanonická definice jednoho řezu

Tento dokument je jediný zdroj pravdy pro zpracování jednoho řezu vize. Čtou ho:
- `/dev-pipeline:orchestrate` — každou fázi spouští jako samostatného subagenta s čerstvým kontextem,
- `/dev-pipeline:slice-run` — provede všechny fáze inline v jedné session (fallback driver režim).

Změna procesu se dělá VÝHRADNĚ tady, ne v jednotlivých skill souborech.

## Kontrakt souborů (stav žije na disku, nikdy jen v kontextu)

| Soubor | Režim | Obsah |
|---|---|---|
| `docs/produkt.md` | read-only pro autonomní běh | **Produktová severka** — trvalá norma napříč vizemi (viz níže). Nepovinný soubor; když chybí, nic se neděje |
| `docs/vize/<slug>.md` | read-only pro pipeline | Vize + nezávazná osnova řezů |
| `docs/vize-spory.md` | append-only, per vize | Rozpory a chyby nalezené **ve vizi** během běhu (viz níže) |
| `docs/prd/rez-NN-<slug>.md` | 1 soubor per řez, vzniká lazy | PRD řezu, frontmatter níže |
| `docs/journal.md` | append-only, per vize | Deník: co, odchylky, rozhodnutí, pokusy |
| `docs/handoff.md` | přepisovaný | Aktuální stav pro čerstvý kontext |
| `docs/follow-ups.md` | append-only, **kontinuální napříč vizemi** | Nápady/resty mimo scope; vyřešené/převzaté se přeškrtávají; setup další vize přeškrtnuté přesune do archivu (živý soubor = jen otevřené) |
| `docs/e2e/rez-NN.md` | per řez | E2E scénáře (akceptační kritéria v krocích) |
| `docs/reviews/rez-NN-*.md` | per kolo, **gitignorováno** | Plné reporty `prd-check` a `code-review`. Pracovní materiál mezi reviewerem a fix agentem; orchestrátor dostává jen verdikt a cestu, obsah nikdy nečte |
| `docs/zaverecna-zprava.md` | přepisovaný, per vize | Závěrečná zpráva finální fáze (co je hotové, rozhodnutí pro uživatele) |
| `docs/archive/<slug>/` | vzniká při startu další vize | Archiv předchozí vize: prd/, e2e/, journal.md, zaverecna-zprava.md |
| `docs/.vize-done` | marker | Vize naplněna, smyčka končí |
| `docs/.orchestrator-run` | marker | Běží autonomní run (aktivuje deploy gate v hooku) |
| `docs/.deploy-unlocked` | marker | Deploy povolen (vytváří fáze 5, maže fáze 7) |

Markery (`.orchestrator-run`, `.deploy-unlocked`, `.vize-done`, `.review-passed`), adresář `docs/reviews/` a adresáře `CLAUDE-SECURITY-*/` (reporty bezpečnostního skenu z finální fáze) patří do `.gitignore` — setup je tam doplní, pokud chybí. Nikdy je necommituj do řezu.

Frontmatter PRD:
```yaml
---
rez: 3
slug: bulk-actions
status: in_progress   # in_progress | done | skipped
vize: docs/vize/<slug>.md
pokusy: 1             # počet zahájených průchodů fází 3-6 (1 = první pokus); zvyšuje se jen po funkčním neúspěchu
runtime_dopad: ano    # ne = řez bez runtime dopadu (jen testy/tooling/dokumentace), viz fáze 4
---
```

## Produktová severka `docs/produkt.md` (nepovinná, ale když je, je závazná)

Vize říká, co se má postavit **teď**. Severka říká, co má platit **pořád** — a je jediné místo, kde autonomní běh vidí normu přesahující jednu vizi. Bez ní se stane tohle: každý řez je sám o sobě správný, každý přidá do formuláře svoje pole podle svého PRD, a po deseti řezech je obrazovka nepoužitelná, aniž by kterékoli PRD chybovalo. Lokální optimum proti globálnímu.

Tvar (max ~1 strana, jinak ji nikdo nečte):

1. **Severka** — 2 až 3 věty, co se má v aplikaci stát. Ne slogan, ale věta, podle které jde poznat špatné rozhodnutí.
2. **Mantinely** — krátký seznam **kontrolovatelných** pravidel, ne přání. Kontrolovatelné = někdo v pipeline umí říct „tohle to porušuje" a ukázat kde.
3. **Trvalá ne-rozhodnutí** — co uživatel opakovaně odmítl a nemá se to vracet.

**Kdo ji čte (a nikdo jiný):** `/vize` session, fáze 1 (PRD), agent `prd-check` (osa A) a `vize-validator` na konci. Implementační, fix, deploy, verify a e2e agenti ji **nedostávají** — vykonávají PRD, ve kterém je rozhodnutí už zapečené, a čtvrtá norma navíc by jim jen rozšířila prostor k improvizaci.

**Autonomní běh ji NIKDY needituje.** Je to pevný bod, proti kterému se běh měří; kdyby si ho směl přepsat, dopsal by se do souladu a měření by ztratilo smysl. Měnit ji smí jen `/vize` session (uživatel je u toho) nebo uživatel sám na základě návrhu ze závěrečné zprávy. Validátor smí změnu **navrhnout** v sekci ROZHODNUTÍ PRO UŽIVATELE, nikdy provést.

**Když severka neexistuje**, nic se nevynucuje a nikdo ji nezakládá za běhu — je to rozhodnutí uživatele, ne artefakt pipeline.

## Kanál pro rozpor s vizí `docs/vize-spory.md`

Agent, který během běhu narazí na **chybu nebo rozpor ve vizi samotné** (dva body si odporují, zákaz koliduje s požadavkem, vize předpokládá něco, co v kódu neplatí), měl dosud jediný odtok: journal, který nikdo nečte až do závěrečné zprávy. Tam už je pozdě.

Nový append-only soubor. Zapisuje do něj **kdokoli** — PRD agent, prd-check, implementační agent, reviewer, verifier:

```markdown
## <YYYY-MM-DD> | řez NN | <fáze/agent>
**Rozpor:** <co ve vizi si odporuje nebo neplatí — cituj vizi>
**Jak jsem se zachoval:** <podle čeho jsem jel a proč>
**Co by to rozhodlo:** <co potřebuje uživatel rozhodnout, jednou větou>
```

**Běh se kvůli tomu nezastavuje.** Agent se rozhodne konzervativně, zapíše a jede dál — autonomie zůstává. Orchestrátor při uzavření řezu nové záznamy **vypíše uživateli** mezi řezy (1 až 3 řádky vedle běžného průběhu), takže se to dozví, dokud s tím jde něco dělat. Validátor je na konci projde znovu proti realitě.

Nemíchej to s journalem (co se stalo) ani s follow-ups (co ještě zbývá udělat). Sem patří výhradně „vize říká něco, co nesedí".

## Zpětná vazba na pipeline (globální soubor mimo repo projektu)

`~/.claude/dev-pipeline-feedback.md` — append-only, vzniká lazy při prvním záznamu. Patří sem všechno, co je vada nebo brzda **pipeline samotné**: krok, který selhal a musel se obejít, fáze, která trvala nesmyslně dlouho, instrukce, která se ukázala jako nejednoznačná, nástroj, který přestal fungovat. Resty projektu zůstávají v `docs/follow-ups.md` — nemíchej to; tenhle soubor čte údržba pluginu, ne vývoj projektu, a musí přežít i jeho reinstalaci (proto leží mimo plugin i mimo projekt).

```markdown
## <YYYY-MM-DD> | <projekt> | <fáze nebo krok>
**Typ:** SELHALO | POMALÉ | NEJASNÉ | ZLEPŠENÍ
**Co se stalo:** <konkrétně, včetně chybové hlášky, když nějaká byla>
**Jak se to obešlo:** <co proběhlo místo toho, nebo „nic, krok vypadl">
**Návrh:** <co by to vyřešilo natrvalo; když nevíš, napiš to>
```

Nikdy nepřepisuj cizí záznamy, jen připoj vlastní na konec. Zapisuje ten, kdo drží stav běhu (orchestrátor při uzavření řezu ze souhrnů subagentů, v single-session režimu ty sám); subagent problém hlásí ve svém výstupu, sám nezapisuje.

**Vždy zapiš, když selhala invokace skillu.** Typicky `Skill <name> cannot be used with Skill tool due to disable-model-invocation` — Anthropic tenhle příznak u vestavěných skillů mění mezi verzemi a bez záznamu se to projeví jen jako tiché zhoršení kvality kroku. Uveď název skillu a čím jsi ho nahradil.

**Hranice fází (závazné pro všechny agenty):** každý agent vykonává VÝHRADNĚ fázi, kterou dostal v zadání — nikdy si sám nespouští fázi následující ani kontrolní, i kdyby to vypadalo efektivně (kontrola ztrácí nezávislost, když si ji spustí kontrolovaný). Záznamy v journalu typu „rozhodnutí orchestrátora" jsou jednorázové výjimky pro danou situaci, ne precedenty — agent je z vlastní iniciativy nereplikuje.

**Souběh fází je věc orchestrátora, ne agentů.** Fáze jednoho řezu jdou po sobě. Souběžně smí běžet jen tyhle tři vzory a rozhoduje o nich orchestrátor:

- **Blok fází 1+2 dalšího řezu vedle fází 4 až 7 toho současného** — startuje po fázi 3, popsáno na konci fáze 3 níž. Není to volba.
- **Dělená implementace po balíčcích** — fáze 3.
- **Paralelní fix agenti nad disjunktními soubory** — fáze 4.

V inline režimu `slice-run` se nic z toho nepoužívá — jedna session, jedna fáze po druhé.

## Fáze 1 — Výběr a PRD řezu

Vstup: vize, `docs/produkt.md` (produktová severka, pokud existuje), `docs/prd/` (stav dokončených/přeskočených řezů), tail `docs/journal.md`, `docs/handoff.md`, aktuální stav kódu (git log branch, struktura relevantních modulů). Read-only dotazy na produkci (SQL county, API čtení) jsou při tvorbě PRD povolené a žádoucí — předpoklady vize se validují proti realitě, ne přebírají.

1. Pokud existuje PRD se `status: in_progress`, pokračuj v něm (nedokončený řez z minula) a přeskoč na fázi, kde skončil (viz journal).
2. Jinak rozhodni: **je vize naplněna?** Projdi vizi bod po bodu proti stavu done řezů. Pokud ano → vytvoř `docs/.vize-done`, zapiš zdůvodnění do journalu a SKONČI (žádný další řez).
3. Jinak urči rozsah dalšího řezu **z aktuálního stavu**, ne z osnovy — osnova ve vizi je orientační, realita po předchozích řezech má přednost. Řez = souvislý, samostatně testovatelný a nasaditelný kus vize: **ucelená funkce nebo skupina souvisejících menších věcí, nikdy mini-funkce** — režie PRD + review + deploy + E2E se musí vyplatit, drobnosti seskupuj do jednoho řezu. Velikostní vodítko: práce na řezu se má pohodlně vejít do ~250k tokenů kontextu (implementační session/agent); tolerance do ~400k, když si iterace a dolaďování řeknou, výš nikdy — pokud odhad zjevně přesahuje, rozděl na dva ucelené řezy.
4. Napiš `docs/prd/rez-NN-<slug>.md`: cíl řezu, vazba na konkrétní body vize, rozsah (co ano / co ne), technický postup validovaný proti kódu (soubory, moduly, migrace), **akceptační kritéria** (ověřitelná, každé buď testem, nebo E2E krokem; formuluj je na nejvyšším možném švu — user-visible chování, ne implementační detail), rizika. Zapiš E2E scénáře do `docs/e2e/rez-NN.md`.

### Zákaz z vize se převádí na záporné kritérium (povinné)

Projdi vizi na **zákazy, kterých se řez dotýká** — a hledej je v celém textu, ne jen v sekci Ne-cíle. Zákaz bývá formulovaný prózou uprostřed funkčních požadavků nebo v sekci Rizika a rozhodnutí: „majitel to výslovně odmítl", „nejde do", „nikdy", „bez toho, aby".

Každý takový zákaz musí být v PRD zapsaný jako **akceptační kritérium v záporném tvaru**: „X **není** v Y", ověřitelné testem nebo E2E krokem. Kladná půlka nestačí — „X je v panelu ✓" projde i tehdy, když je X zároveň v pruhu, kde být nemá.

Dvě pravidla navíc, protože samotné záporné kritérium se dá obejít, aniž by kdokoli lhal:

- **Kritérium piš proti důvodu zákazu, ne proti jménu komponenty.** Zákazy bývají ve tvaru „nesmí X, protože Y" a závazné je to **Y**. Když vize říká „svátková tlačítka nejdou do horního pruhu, **protože by ho zabrala**", je zákaz o vodorovném prostoru nad výpisem — a kritérium psané proti komponentě jménem „horní pruh" projde, i když ta tlačítka skončí v řádku hned pod ní.
- **Nezužuj zákaz a neodkládej jeho důsledek.** Když v PRD píšeš „zákaz mluví jen o …, a tam to nejde" nebo „ale tímhle vznikne <to, čemu zákaz brání> → vyřeší se v dalším řezu", nerozhoduješ o rozsahu řezu, ale **měníš vizi** — a to smí jen uživatel. Zapiš to do `docs/vize-spory.md` a v PRD nech konzervativní variantu (zákaz platí v širším výkladu).

Přesně takhle jednou zákaz z vize prošel PRD, prd-checkem, review i E2E verifikací a vyplaval až v závěrečné zprávě: PRD záporné kritérium mělo, jen si předtím zákaz zúžilo na jednu komponentu a duplicitu, kterou tím vyrobilo, si samo popsalo a odložilo do follow-upu.

### PRD popisuje celou obrazovku, ne jen svůj přírůstek

Když řez přidává do **existující** UI plochy (formulář, panel, sekce nastavení), PRD musí uvést **stav té plochy po změně**: kolik sekcí a polí tam bude celkem, jak jsou seskupené, co je primární akce. Ne jen „přidáme dvě pole". Zjisti si to z kódu — dohledej komponentu a spočítej, co tam je dnes.

Důvod je empirický: obrazovka se nestane nepřehlednou jedním řezem. Stane se jí tím, že se na celek nikdy nikdo nepodíval, protože každé PRD legitimně popisovalo jen svůj kousek.

### Široký mechanický refaktor: rozšiř → přemigruj → smrskni

Definice řezu žádá vertikální, samostatně nasaditelný kus. Široká mechanická změna (přejmenovat sloupec, přetypovat sdílený symbol, změnit tvar konstanty používané na 40 místech) se do toho tvaru nevejde: jako jeden řez je moc velká, rozdělená po souborech není samostatně nasaditelná.

Forma pro ni je **expand–contract** a v PRD se to napíše výslovně:

1. **Rozšiř** — zaveď nový tvar **vedle** starého, oba funkční. Nasaditelné samo o sobě, nic nerozbije.
2. **Přemigruj po dávkách** — volající převeď na nový tvar; každá dávka je samostatně nasaditelná a ověřitelná.
3. **Smrskni** — smaž starý tvar. Až když v kódu nikdo nezůstal (dolož grepem, ne dojmem).

Každý krok je vlastní řez, nebo jsou kroky 1+3 malé natolik, že se přilepí k sousedním řezům. Co se **nesmí** stát: začít krokem 2 bez kroku 1, nebo krok 3 „už rovnou", protože „to snad nikdo nepoužívá".

### E2E krok podmíněný typem dat si musí ten typ vyrobit

Když akceptační kritérium ověřuje UI prvek, který se objeví **jen u určitého druhu dat** (typ podnětu, stav objednávky, role uživatele), scénář v `docs/e2e/rez-NN.md` musí předepsat i **vstup, který ten druh dat vyrobí**. Jinak krok testuje shodu náhody a vypadá jako FAIL implementace, přestože se prvek u zvoleného vstupu nemá zobrazit nikdy.

## Fáze 2 — PRD check

Spusť subagenta `dev-pipeline:prd-check` nad čerstvým PRD (předej cesty k PRD, vizi, — pokud existuje — k `docs/produkt.md` a **cestu pro report** `docs/reviews/rez-NN-prd-check-kolo-M.md`; kontroluje úplnost vůči vizi a severce včetně zákazů převedených na záporná kritéria, technickou validitu proti kódu, kvalitu akceptačních kritérií a rozsah řezu). Vrátí ti verdikt a jednořádkové nálezy; plný rozbor je v reportu, který **nečteš** — jeho cestu jen předáš PRD-fix agentovi. Nálezy zapracuj do PRD; při `needs-fixes` po zapracování spusť prd-check znovu (max 2 kola). Smysl opakovacího kola: nový check s čerstvým kontextem ověřuje, že zapracování nálezy skutečně vyřešilo — není to duplicitní kontrola. Opakovací kolo smí přeskočit JEN orchestrátor, a jen když byly nálezy čistě formulační (žádný technický ani akceptační dopad); přeskok zapíše do journalu jako jednorázové rozhodnutí. Fázi 2 NIKDY nespouští PRD agent sám (viz Hranice fází). Neptej se uživatele — jediný schválený vstup je vize; odchylky od osnovy jen zapiš do journalu se zdůvodněním. (Agent `plan-check` je post-implementační nástroj — v pipeline se nepoužívá.)

## Fáze 3 — Implementace (TDD)

Vykonává ji agent `dev-pipeline:implement` (metodika je v něm; tahle sekce je nadřazená, když se rozejdou).

1. **Červená napřed:** pro každé akceptační kritérium s testovatelným povrchem napiš nejdřív test (vitest, pokud projekt harness má) a ověř, že selhává ze správného důvodu (chybějící funkčnost, ne syntax error). U kritérií pokrytých jen E2E ověř červenou přes agenta `dev-pipeline:e2e-verifier` (scénář z `docs/e2e/` proti běžící appce PŘED implementací), pokud to dává smysl (u zcela nové obrazovky netřeba).
   - **Když se červená ověřuje vrácením už existující implementace, dělej to po jednom a hned vracej zpět.** V tu chvíli je v pracovním stromě dočasně rozbitý kód a agent utnutý přesně tam po sobě nechá strom, ze kterého nikdo nepozná, co bylo dočasné — jednou to skončilo tím, že se zdánlivě zelený běh postavil nad kódem, ze kterého byl odstraněný guard.
   - **Stav ověřuj grepem nad konkrétním symbolem, ne pamětí.** „Vrátil jsem to zpátky" není doklad.
2. Implementuj podle PRD. Řiď se CLAUDE.md cílového projektu (konvence, pasti, helpers) — má přednost před obecnými zvyky. Soubory >500 LOC edituj přes Serena symbol tools, pokud je projekt má nakonfigurované.
3. **Nová/neznámá verze knihovny** (major upgrade, API novější než tvá znalost): načti si aktuální dokumentaci PŘED implementací. context7 MCP je dostupný i subagentům — tooly jsou jen deferred: nejdřív je načti přes ToolSearch (`select:mcp__plugin_context7_context7__resolve-library-id,mcp__plugin_context7_context7__query-docs`), pak je volej normálně; „tool neexistuje" bez předchozího ToolSearch NENÍ důkaz nedostupnosti. Když context7 v prostředí opravdu není, použij WebFetch na oficiální release notes / migration guide. Major upgrade nikdy naslepo z trénovacích dat.
4. Testy do zelené. Typecheck projektu musí projít.

**Dělená implementace (volitelná, u řezů sahajících na víc balíčků).** Když řez mění sdílené typy/schéma **i** backend **i** frontend, smí se fáze rozdělit mezi víc agentů — ale jen v tomhle pořadí a s disjunktními množinami souborů:

1. **Nejdřív sám** balíček se sdílenými typy a schématem (enumy, Zod, DB schema). Na něm stojí zbytek, takže paralelně běžet nemůže.
2. **Pak souběžně** backend a frontend, každý svůj balíček. Sdílené typy už jsou hotové, takže si nemají kde kolidovat.
3. **Nakonec společný verify** (typecheck + testy nad celým repem) — teprve ten je brána fáze.

Dva agenti nad týmž souborem si přepíšou práci; hranice jde po balíčcích, ne po „tématech". Když řez sahá jen na jeden balíček, dělení nemá smysl a nedělá se.

### Konec fáze 3 spouští blok 1+2 dalšího řezu (orchestrátor, na pozadí)

Jakmile implementace řezu N doběhne, orchestrátor spustí **na pozadí celý blok fází 1 a 2 pro řez N+1** jako jeden řetěz v jednom agentovi: PRD → prd-check → PRD-fix → prd-check kolo 2 → PRD-fix. Teprve pak jde řez N do fáze 4. (V inline režimu `slice-run` se tohle nedělá.)

Proč zrovna tady:

- **Dřív ne.** Fáze 1 i 2 se opírají o skutečný kód (PRD píše technický postup proti němu, prd-check osa B ho ověřuje). Před koncem fáze 3 by psaly proti stavu, který ještě neexistuje.
- **Později ne.** Blok 1+2 trvá v ostrém běhu ~1 h 45 min a je to nejdražší část řezu; okno fází 4 až 7 je ~4 h 30 min. Po fázi 3 se vejde celý i s rezervou, po fázi 4 už jen tak tak.
- **Celý blok, ne jen psaní PRD.** Fáze 2 (dvě kola checku + dva PRD-fixy) je tři čtvrtiny toho času.
- **Když E2E řezu N vrátí FAIL**, hotové PRD se zahazuje a po opravě píše znovu — stálo nad stavem, který neplatí.
- Implementace N+1 souběžně s čímkoli z N **nikdy**. Paralelní je pouze psaní dokumentu.

**Scratch skripty patří mimo repo** (do scratchpadu session), aby po fázi nezůstal špinavý strom. U pnpm workspace projektů to má daň, na kterou nezávisle narazili tři agenti: `/private/tmp` nemá `node_modules` a `tsx` resolvuje od souboru, ne od cwd. Na CJS pomůže `cwd=<app>` + `NODE_PATH=<repo>/<app>/node_modules`; **na ESM `NODE_PATH` neplatí** a jediná spolehlivá cesta je `createRequire('<repo>/<app>/package.json')`. A `pg.query` bere **jeden** příkaz, ne `psql`-styl dávku oddělenou středníky.

## Fáze 4 — Lehké review + opravy

1. Spusť subagenta `dev-pipeline:code-review` (`rozsah: pracovní-strom`, plus cesta pro report `docs/reviews/rez-NN-code-review-kolo-M.md`) nad aktuální rozpracovanou změnou — diff si posbírá sám včetně netrackovaných souborů. Vrátí ti strojový verdikt a jednořádkové nálezy; plný report **nečteš**, jeho cestu předáš fix agentovi. Oprav všechny CONFIRMED nálezy přes agenta `dev-pipeline:fix` (dostane cestu k reportu a výčet, které nálezy jsou jeho); PLAUSIBLE posuď a rozhodnutí zapiš do journalu.
2. Znovu typecheck + testy (agent `dev-pipeline:verify`).

**Cílené re-review, když oprava přeroste reviewovanou změnu.** Když fix agent nasadí **nový plošný mechanismus**, sáhne do **sdíleného layoutu nebo kanonického helperu**, nebo zasáhne soubory **mimo** ty, ke kterým se nálezy vztahovaly, spusť nad **tou opravnou várkou** druhé cílené code-review. Není to opakování kola 1 — je to první nezávislý pohled na kód, který kolem 1 neprošel. Vyplácí se to doložitelně: jedno takové re-review našlo druhou kopii téhož úniku PII živou v produkci a tři latentní díry v čerstvě nasazeném guardu. Fix agent má povinnost rozšířený zásah nahlásit; když ho nahlásí, re-review není volba.

**Paralelní fix agenti dostávají disjunktní množiny souborů.** Nikdy „ty vezmi tyhle nálezy, ty tamty", když se nálezy potkávají nad týmž souborem — hranice se dělá po souborech, ne po nálezech.

**Nikdy neinvokuj skill `code-review`** (ani `/code-review`): má `disable-model-invocation: true`, takže ho žádný model přes Skill tool nespustí a improvizovaná náhrada dělá review pokaždé jinak hluboko. Agent `dev-pipeline:code-review` je jeho definovaná náhrada.

**Když subagent typ `dev-pipeline:code-review` neexistuje** (session nastartovala před jeho přidáním — registr agentů se čte při startu, na rozdíl od těchhle souborů): spusť general-purpose subagenta a předej mu absolutní cestu k `agents/code-review.md` téhož pluginu (sourozenec `skills/` vedle tohohle souboru) s pokynem řídit se jím doslova. Review nikdy nedělej vlastní improvizovanou metodikou.

**Bezpečnostní nález = oprav hned:** potvrzená security chyba (org isolation, auth, únik tokenů/credentials) se opravuje okamžitě v aktuální fázi, i když je pre-existing a mimo scope řezu — samostatný commit `fix(security): …` + záznam do journalu. Neodkládá se do follow-ups a nečeká na schválení uživatele; do follow-ups smí jen sporný nález bez jasného fixu (se zdůvodněním).

(Plné kolečko — thermo-nuclear, simplify, 2× code-review, 2× security — běží až JEDNOU na konci celé vize, ne per řez.)

**Řez bez runtime dopadu** (jen testy, tooling, dokumentace): zapiš to do PRD frontmatteru (`runtime_dopad: ne`) — fáze 5 se pak redukuje na commit (bez deploye; commit smí udělat orchestrátor sám, deploy agent netřeba) a fáze 6 na: kompletní test run + typecheck A nezávislý průchod akceptačních kritérií PRD **bod po bodu s verdiktem per kritérium**. Fázi 6 v tomto režimu dělá general-purpose verifikační subagent (ne `dev-pipeline:e2e-verifier` — ten je read-only a bez browseru tu není potřeba): každé kritérium doloží konkrétním důkazem — výstupem příkazu, existencí a obsahem souboru — ne souhrnným „testy zelené". Dočasné verifikační artefakty (scratch skripty, záměrně failující commit pro důkaz červené) jsou povolené, agent je po ověření uklidí a working tree nechá čistý.

## Fáze 5 — Commit + deploy

1. Commit na vize branchi (nikdy na main). Zpráva: `rez NN: <shrnutí>`. Jedna logická jednotka práce = jeden commit; rollback řezu = `git reset --hard` na `commit` hash z frontmatteru posledního done PRD (po opravných iteracích může mít řez víc commitů, HEAD~1 nestačí).
2. Přečti deploy config projektu (sekce Deploy v CLAUDE.md projektu, případně `docs/deploy.md`). Dodrž projektová pravidla (pre-checky, build verze, pořadí). **Pokud projekt žádný deploy config nemá**, fáze končí commitem: zapiš do journalu „projekt bez deploy configu, nasazení dělá uživatel" a fáze 6 poběží proti lokálně spuštěné aplikaci (pokud ji CLAUDE.md umí spustit), jinak v režimu bez runtime dopadu. Nikdy nevymýšlej deploy postup, který projekt nedokumentuje.
3. Vytvoř `docs/.deploy-unlocked` **samostatným příkazem** (nikdy `touch … && deploy` v jednom — guard hook čte marker před spuštěním příkazu, kombinovaný příkaz zablokuje; teprve marker odemyká deploy), pak proveď deploy a **počkej na jeho dokončení**. Pozor: deploy CLI se často odpojí hned po uploadu (detached build) — „počkej" znamená aktivně pollovat status platformy až do SUCCESS/FAILED, ne čekat na exit příkazu. Výstup fáze MUSÍ být doložený stav, ne slib: deployment status SUCCESS (např. `railway deployment list --json`) + health check odpověď + commit hash. „Deploy spuštěn", „čekám na build" nebo obecný placeholder NENÍ výsledek — fáze bez doloženého stavu se považuje za nedokončenou a stav se musí doověřit.

## Fáze 6 — E2E verifikace

Spusť subagenta `dev-pipeline:e2e-verifier`: dostane cestu k PRD a `docs/e2e/rez-NN.md`, projde scénáře v agent-browseru proti nasazené aplikaci a vrátí verdikt per akceptační kritérium. Neprošlá kritéria → vrať se do fáze 3 (oprav, re-deploy, re-verify).

**Nález mimo akceptační kritéria má vlastní osud.** Verifier hlásí odděleně (a) kosmetické regresní postřehy a (b) **závažné nálezy mimo AK** — bezpečnostní a datové (únik PII, chybějící autorizace, cross-tenant průnik, token v URL nebo logu). Na kategorii (b) platí **totéž pravidlo jako na security nález ve fázi 4**: opravuje se okamžitě, samostatným commitem `fix(security): …`, i když je pre-existing a mimo scope řezu, i když všechna akceptační kritéria prošla. Verdikt `E2E_RESULT: pass` a závažný nález mimo AK se nevylučují — obojí se zpracuje. Tenhle případ nastal doslova: `pass` na 12 ze 14 kritérií a vedle toho únik PII u 13 ze 14 formulářů webu; proces pro něj místo neměl a rozhodovalo se ad hoc.

Kategorie (a) jde do follow-ups, ne do opravy.

## Fáze 7 — Uzavření řezu

1. PRD frontmatter: `status: done` + `commit: <hash posledního commitu řezu>` (strojová kotva pro rollback dalších řezů). Smaž `docs/.deploy-unlocked`.
2. Append do `docs/journal.md`: datum, řez NN, co je hotové, odchylky od vize/osnovy + proč, změněná rozhodnutí, počet pokusů, výsledek E2E.
3. Nápady a resty mimo scope → append `docs/follow-ups.md` (jedna odrážka = jedna položka, s kontextem proč). Pokud řez mimochodem vyřešil existující follow-up, položku nemaž, ale přeškrtni (`~~text~~`) a připiš `VYŘEŠENO <datum>: <čím, commit>` — odškrtávat smí jen ten, kdo si vyřešení ověřil proti kódu/aplikaci, ne podle dojmu.
4. Přepiš `docs/handoff.md`: branch, poslední done řez, stav (co funguje), co je logicky další, klíčové pasti/poznatky z tohoto řezu (max ~30 řádků — čte to čerstvý kontext, stručnost > úplnost). Neduplikuj obsah PRD/journalu — odkazuj cestou. Do handoffu ani journalu nikdy nepatří secrets (klíče, hesla, tokeny).
5. **CLAUDE.md hygiena:** pokud řez změnil něco, co CLAUDE.md projektu tvrdí (příkazy, konvence, struktura, pasti), aktualizuj ho — ale minimálně: NIC, co se dá zjistit z kódu; udržuj CLAUDE.md co nejmenší; tvrzení, která přestala platit, smaž (neopravuj kolem nich). Když řez CLAUDE.md nemění, nesahej na něj. **`docs/produkt.md` v autonomním běhu neupravuj nikdy** — viz sekce Produktová severka.
6. **Formátování stavových souborů.** Fáze, která zapsala do `docs/*.md` (journal, handoff, follow-ups, vize-spory), na ně **rovnou pustí formátovač projektu** (`prettier --write <soubory>` nebo co projekt používá). Zapisuje se heredocem a `format:check` pak spadne někomu, kdo ty soubory nezaložil ani needitoval — a musí sáhnout na cizí stavový soubor, aby jeho fáze mohla skončit zeleně.

## Failure policy

- **Funkční neúspěch ≠ infra smrt.** Do `pokusy` se počítá jen **funkční neúspěch**: fáze doběhla a výsledek je špatně (testy červené po implementaci, E2E FAIL, deploy FAILED z důvodu v kódu). **Infra smrt** — agent/session utnutá usage limitem, API server errorem, síťovým výpadkem — se NEpočítá: práce se obnoví resume (viz níže) a pokračuje se, jako by přerušení nenastalo.
- **Resume po infra smrti:** navaž na rozpracovanou práci (orchestrátor: SendMessage na utnutého agenta; inline režim: pokračuj z transkriptu). NIKDY nespouštěj duplicitního agenta nad rozpracovaným working tree — nejdřív zastav původního (TaskStop), zkontroluj `git status` a teprve podle skutečného stavu rozhodni, zda resume, nebo čerstvý agent s instrukcí uklidit pozůstatky.
- **Resume agenta utnutého při ověřování červené: nejdřív ověř integritu stromu.** Ten krok dočasně vrací implementaci, takže agent, který v něm umřel, mohl nechat strom v „opraveném" i v rozbitém stavu a sám to po probuzení neví (jednou to doslova hlásil: „the harness left `write.ts` patched"). Ověř grepem nad klíčovými symboly + typecheckem, jaký stav skutečně je, a **popiš mu ho v resume zprávě jako fakt** — ať si ho nedohaduje. Bez toho se běh postaví nad kódem, ze kterého byl odstraněný guard.
- Po každém **funkčním** neúspěchu průchodu fází 3–6 zvyš `pokusy` ve frontmatteru PRD.
- **Po 2. funkčním neúspěchu NEjeď třetí pokus toutéž cestou.** Dva pokusy selhaly proto, že se opravovalo podle hypotézy; třetí stejný pokus je třetí selhání. Místo něj spusť agenta `dev-pipeline:diagnose` s jediným úkolem — postavit reprodukční smyčku a najít doloženou příčinu. Neopravuje. Teprve s jeho diagnózou jde třetí pokus (fix nebo implementační agent dostane příčinu, ne nález). Diagnostický běh **se do `pokusy` nepočítá** — nic neimplementuje. Když diagnóza vrátí „smyčku nejde postavit" a řekne, co k tomu chybí, jde řez do `skipped` rovnou a ten zápis je pro validátora cennější než třetí slepý pokus.
- Po **3. neúspěšném pokusu**: `status: skipped`, smaž `.deploy-unlocked`, vrať branch do čistého stavu (`git reset --hard` na `commit` hash z frontmatteru posledního done PRD; není-li žádný done řez, na výchozí commit branche), zapiš do journalu CO selhalo a PROČ (přesné chybové výstupy, ne dojmy) a připoj diagnózu. Pokračuje se dalším řezem; skipped řezy řeší validátor na konci.
- Permission denial v headless režimu = zapiš do journalu, co bylo zamítnuto, a zachovej se jako u neúspěšného pokusu. Nikdy neobcházej zamítnutí jinou cestou.
- Nikdy žádné quick fixy / silent fallbacky, aby fáze „prošla" — radši skipped řez s poctivým záznamem.
