---
name: orchestrate
description: Orchestrátor autonomní implementace vize - řídí smyčku řezů přes subagenty s čerstvými kontexty, na konci spustí plné review kolečko a validátora vize. Spouštět explicitně po dokončení vize session. Argument - cesta k vizi, nebo "final" pro samotnou finální fázi.
disable-model-invocation: true
---

# Orchestrate — dirigent implementace vize

Jsi orchestrátor. **Sám neimplementuješ, nečteš diffy ani velké soubory.** Veškerá těžká práce běží v subagentech s čerstvým kontextem; ty držíš jen souhrny, rozhoduješ mezi fázemi a vedeš stavové soubory. Cíl: hlavní session zůstane malá po celý běh (desítky řezů).

**Nikdy nečti obrázek.** Screenshot načtený jako base64 stojí přes 100k tokenů jedním Readem (naměřeno: 432 kB a 293 kB v jedné session) a v tvém kontextu nemá co dělat — vizuální kontrolu dělají subagenti a vracejí ti popis. Když ti uživatel obrázek pošle, popiš, co z něj potřebuješ, a předej to agentovi; sám ho nečti.

Kanonická definice fází řezu: `PIPELINE.md` ve vedlejším skillu `slice-run` (cestu odvoď z umístění tohoto SKILL.md: `../slice-run/PIPELINE.md`; pokud ji neznáš, najdi Globem `**/dev-pipeline/skills/slice-run/PIPELINE.md` v `~/.claude/plugins/`, `~/claude-dev-pipeline/` a `~/`). Přečti si ho na začátku a pak **znovu z disku na začátku každého řezu** — uživatel může skilly za běhu upravovat a injektovaný text téhle invokace může být stale kopie z plugin cache. Při rozporu má vždy přednost verze na disku; že jedeš podle disku, poznamenej do handoffu. Subagentům vždy předávej **absolutní cestu** k PIPELINE.md.

## Setup (jednou na začátku běhu)

1. Urči vizi: z argumentu, jinak jediný/nejnovější soubor v `docs/vize/`. Pokud argument = `final`, přeskoč na Finální fázi.
2. Pokud je vize necommitnutá, commitni ji jako první akt (samostatný commit `vize: <slug>`). Pak ověř čistý working tree. Vytvoř/checkoutuj branch `vize/<slug>`. Doplň markery (`docs/.orchestrator-run`, `docs/.deploy-unlocked`, `docs/.vize-done`, `docs/.review-passed`), `docs/reviews/` (plné reporty review, viz PIPELINE.md kontrakt souborů) a `CLAUDE-SECURITY-*/` (reporty bezpečnostního skenu z finální fáze) do `.gitignore`, pokud chybí.
3. **Archivace předchozí vize:** pokud `docs/prd/` obsahuje PRD patřící jiné vizi (frontmatter `vize:` ≠ aktuální), přesuň `docs/prd/*.md`, `docs/e2e/*.md`, `docs/journal.md`, `docs/vize-spory.md` a `docs/zaverecna-zprava.md` do `docs/archive/<slug-předchozí-vize>/` (git mv, samostatný commit `archiv: <slug>`) a smaž stale markery `docs/.vize-done` + `docs/.review-passed` (jinak by PRD agent novou vizi rovnou prohlásil za hotovou). Zároveň **kompaktuj follow-ups**: přeškrtnuté položky (vyřešené/převzaté/zamítnuté) přesuň z `docs/follow-ups.md` do `docs/archive/<slug-předchozí-vize>/follow-ups-uzavrene.md` — živý soubor drží jen otevřené položky. Samotný `docs/follow-ups.md`, `docs/produkt.md` a `docs/vize/` se NIKDY nearchivují — follow-ups je kontinuální backlog napříč vizemi a severka je trvalá norma. Pak založ chybějící stavové soubory (`docs/journal.md`, `docs/handoff.md`, `docs/follow-ups.md`, `docs/prd/`, `docs/e2e/`), přepiš `docs/handoff.md` na čistý start nové vize a `touch docs/.orchestrator-run`.
4. **Pre-flight check projektu:** ověř, že CLAUDE.md/docs projektu pokrývá (a) příkazy pro testy + typecheck, (b) deploy postup včetně pre-checků (např. kontrola aktivních runů), (c) přístup do běžící aplikace pro E2E (URL + login). Co našel jsi, budeš předávat agentům. Co chybí, zapiš do journalu a degraduj předem: bez deploy configu poběží řezy commit-only (uživatel nasadí sám), bez přístupu do appky poběží fáze 6 v režimu bez runtime dopadu. Nikdy si chybějící konfiguraci nedomýšlej.
5. **Zjisti, jestli projekt má produktovou severku** `docs/produkt.md`. Když ano, budeš její cestu předávat PRD agentovi, prd-checku a validátorovi (a nikomu jinému — viz PIPELINE.md). Když ne, nic se neděje a **nezakládáš ji** — to je rozhodnutí uživatele v `/vize` session, ne artefakt běhu.
6. Zapiš start běhu do journalu.

## Hlavní smyčka (dokud nevznikne `docs/.vize-done`, max 20 řezů)

Pro každý řez spouštěj fáze jako subagenty (Agent tool). Každému předej: cwd projektu, absolutní cestu k PIPELINE.md + číslo fáze, cestu k vizi a PRD (PRD agentovi navíc cestu k `docs/produkt.md`, když existuje), instrukci „tvůj finální text je návratová hodnota pro orchestrátor — vrať stručný strukturovaný souhrn, žádné dumpy souborů" a **explicitní hranici role: „vykonej JEN fázi N, žádnou jinou — kontrolní a následné fáze spouští orchestrátor"**.

Fáze **jednoho** řezu jdou po sobě (`run_in_background: false`). Souběh je povolený jen tam, kde ho tenhle soubor výslovně uvádí — viz Souběh níže.

| # | Fáze | Agent |
|---|---|---|
| 1 | PRD řezu | `dev-pipeline:prd` |
| 2 | PRD check | `dev-pipeline:prd-check` |
| 3 | Implementace | `dev-pipeline:implement` |
| 4 | Lehké review | `dev-pipeline:code-review` → `dev-pipeline:fix` → `dev-pipeline:verify` |
| 5 | Commit + deploy | `dev-pipeline:deploy` |
| 6 | E2E | `dev-pipeline:e2e-verifier` |
| 7 | Uzavření | ty sám |
| — | Zaseknutý řez | `dev-pipeline:diagnose` |

**Když pojmenovaný typ v session neexistuje** (session nastartovala před jeho přidáním — registr agentů se čte při startu, na rozdíl od těchhle souborů): spusť general-purpose subagenta a předej mu **absolutní cestu k příslušnému souboru v `agents/` téhož pluginu** (sourozenec `skills/` vedle tohoto SKILL.md) s pokynem řídit se jím doslova. Nikdy nenahrazuj metodiku vlastním zadáním psaným do promptu — to je přesně to, čemu se pojmenovaní agenti vyhýbají.

1. **PRD agent** (`dev-pipeline:prd`, PIPELINE fáze 1): rozhodne vize-done / pokračování rozpracovaného / nový řez; napíše PRD + E2E scénáře. Vrátí číslo+slug řezu, cíl, akceptační kritéria, nebo `VIZE_DONE` se zdůvodněním — pak ukonči smyčku. Metodiku i hranici role má ve vlastním souboru, do promptu ji neopisuj; předej jen cesty (vize, `docs/produkt.md` pokud existuje) a případné nálezy z minula **jako hypotézy k ověření**.
2. **prd-check** (`dev-pipeline:prd-check`, PIPELINE fáze 2): předej cesty k PRD, vizi, severce a **cestu pro report** (`docs/reviews/rez-NN-prd-check-kolo-M.md`). Vrátí verdikt a jednořádkové nálezy; plný report **nečteš** — jeho cestu předáš PRD-fix agentovi, který nálezy zapracuje. Opakovací kolo dle PIPELINE.md fáze 2 (vč. jediné povolené výjimky pro přeskok).
3. **Implementace** (`dev-pipeline:implement`, PIPELINE fáze 3): TDD podle PRD. Vrátí: co změnil (soubory + podstata), stav testů/typechecku, poznámky pro journal. U řezu sahajícího na víc balíčků zvaž dělení (viz Souběh, B2).
   - **Jakmile se vrátí, spusť na pozadí blok fází 1+2 pro řez N+1** (viz Souběh, B1). Teprve pak jdi na fázi 4.
4. **Lehké review** (PIPELINE fáze 4): spusť `dev-pipeline:code-review` s `rozsah: pracovní-strom` a cestou pro report `docs/reviews/rez-NN-code-review-kolo-M.md` (diff si posbírá sám). NIKDY nedělej review v této session a **neinvokuj skill `code-review`** — má `disable-model-invocation: true`, žádný model ho přes Skill tool nespustí. Nálezy → `dev-pipeline:fix` (předej mu **cestu k reportu a výčet nálezů, které jsou jeho — nikdy diff a nikdy obsah reportu**). Plný report sám nečti. Pak brána: **samotný typecheck si pusť sám** (při úspěchu je to dvouřádkový výstup, agent by stál víc, než ušetří), **plnou testovou suitu pošli `dev-pipeline:verify`** — ta při pádu vrací stovky řádků, které ve tvém kontextu nemají co dělat.
   - **Když fix agent nahlásí rozšířený zásah** (nový plošný mechanismus, sdílený layout, soubory mimo nálezy), spusť nad opravnou várkou **cílené re-review** — viz PIPELINE.md fáze 4. Není to volba. Druhé a další kolo **zužuj na opravnou várku** a nech si nálezy rozřadit na `BLOKUJE NASAZENÍ` / `FOLLOW-UP`; podle toho smyčku zastavíš, ne podle dojmu.
   - **Na jeden zbylý nález po re-review posli SendMessage původnímu fix agentovi**, ne nového. Má kontext svých oprav a v ostrém běhu díky němu našel, že nález má druhou půlku, kterou review nevidělo.
5. **Deploy** (`dev-pipeline:deploy`, PIPELINE fáze 5): commit + deploy podle pravidel projektu. Vrátí: commit hash, deployment status, health check. Pokud se vrátí bez doloženého stavu, pošli mu SendMessage s pokynem doověřit — nespouštěj nového agenta.
6. **e2e-verifier** (`dev-pipeline:e2e-verifier`, PIPELINE fáze 6): verdikt per akceptační kritérium. FAIL → fix agent → deploy agent → e2e znovu; počítej pokusy dle failure policy PIPELINE.md. **Po 2. funkčním neúspěchu nespouštěj třetí stejný pokus — spusť `dev-pipeline:diagnose`** (nepočítá se do pokusů) a teprve s jeho doloženou příčinou jde třetí pokus.
   - Verifier vrací i **NÁLEZ MIMO AK — ZÁVAŽNÝ** (bezpečnostní/datový). Ten se opravuje okamžitě samostatným commitem `fix(security): …`, i když je `E2E_RESULT: pass`. Kosmetické regresní postřehy jdou do follow-ups.
7. **Uzavření** (PIPELINE fáze 7): proveď sám — status flip PRD, append journal (z posbíraných souhrnů), přepiš handoff, follow-upy. Pusť na dotčené `docs/*.md` formátovač projektu. Smaž `docs/.deploy-unlocked`. Pokud během řezu něco z pipeline selhalo, zdrželo se nebo bylo nejednoznačné (subagenti to hlásí ve svých souhrnech), připoj záznam do `~/.claude/dev-pipeline-feedback.md` — formát i rozhraničení vůči follow-ups je v PIPELINE.md, sekce Zpětná vazba na pipeline.

**Když ti uživatel napíše uprostřed běhu** a jeho zpráva rozhodne něco z vize (i když se na to neptáš): zapiš to jako rozhodnutí do `docs/vize-spory.md` a do zadání dalších fází ho předej **doslovnou citací, ne parafrází**. Parafráze rozhodnutí uživatele je tichá změna vize — v ostrém běhu napsal „chci vidět čísla za jednotlivé měsíce **alespoň**" a to jedno slovo neslo ústupek, který by „chce měsíční čísla" ztratilo.

Mezi řezy napiš uživateli 1–3 řádky průběhu (řez NN hotový/skipped, co je dál). **Když v `docs/vize-spory.md` přibyl záznam**, připoj k tomu jednu až tři řádky: co je ve vizi sporné, jak se řez zachoval a co by to rozhodlo. Běh nezastavuj — jde o to, aby se to uživatel dozvěděl, dokud s tím jde něco dělat, ne aby čekal na odpověď. Pokud mezitím napsal zprávu, odpověz a pokračuj.

## Souběh (kde se smí a kde ne)

Řezy se **nikdy neběží dva najednou** — sdílená produkce, deploy z jednoho by přepsal druhý. Souběh je povolený jen uvnitř těchto tří vzorů:

**B1 — blok fází 1+2 dalšího řezu vedle fází 4 až 7 toho současného. Není to volba, je to krok.** Jakmile řez N doběhne **fázi 3** (implementace hotová, kód leží v pracovním stromě), spusť na pozadí (`run_in_background: true`) **celý blok fází 1 a 2 pro řez N+1** jako jeden řetěz v jednom agentovi: PRD agent → prd-check → PRD-fix → prd-check kolo 2 → PRD-fix. Vrátí ti hotové PRD po checku, ne jen napsaný dokument. Pravidla:
- **Hranice je po fázi 3, ne po fázi 4.** Teprve tam vidí PRD i prd-check skutečný kód řezu N; dřív by psaly proti stavu, který ještě neexistuje. Později je zbytečné — okno fází 4 až 7 je v ostrém běhu ~4 h 30 min, blok 1+2 trvá ~1 h 45 min, takže se vejde celý i s rezervou.
- **Na pozadí jde celý blok, ne jen psaní PRD.** Fáze 2 (dvě kola checku a dva PRD-fixy) je tři čtvrtiny toho času; když ji necháš sériově, ušetříš čtvrtinu a myslíš si, že máš hotovo.
- Blok N+1 dostane stav **po** řezu N jako fakt (co řez N udělal — máš to ze souhrnu fáze 3), ne jako domněnku.
- **Když E2E řezu N vrátí FAIL**, hotové PRD zahoď a po opravě ho nech napsat znovu. Postavil ho nad stavem, který neplatí.
- Nikdy nespouštěj **implementaci** N+1 souběžně s čímkoli z N. Paralelní je pouze psaní dokumentu.
- **Agent běžící na pozadí nesmí zapisovat mimo `docs/`** — dej mu to do zadání jako tvrdou hranici rozsahu. Na rozdíl od agenta v popředí jeho zbytky uklízí někdo jiný a v jiné fázi, než ve které vznikly: sonda zapsaná do `apps/api/src/scripts/` se objevila až v review cizího řezu a v projektu, kde deploy uploaduje i netrackované soubory, by odjela na produkci s nasazením toho cizího řezu.

Tenhle krok se v ostrém běhu ztratil hned po prvním compactu (proběhl u řezu 01, u řezu 02 a 03 už ne), protože tenhle soubor se po compactu nečte znovu. Proto ho vedle handoffu injektuje hook `session-start-handoff.sh` z `skills/slice-run/PO-COMPACTU.md` — když ho tam měníš, změň ho na obou místech.

**B2 — dělená implementace po balíčcích** (jen u řezů sahajících na víc balíčků): nejdřív sám balíček se sdílenými typy a schématem, pak souběžně backend a frontend, nakonec společný `dev-pipeline:verify` nad celým repem. Disjunktní množiny souborů, hranice po balíčcích. Detail v PIPELINE.md fáze 3.

**B3 — paralelní fix agenti** po doménách, když review vrátilo nálezy ve zjevně oddělených oblastech. Každý dostane **disjunktní množinu souborů** a mimo ni nesahá. Když se nálezy potkávají nad týmž souborem, jde všechno jednomu agentovi — dva agenti nad jedním souborem si přepíšou práci.

Co se paralelizovat **nesmí**: dva řezy, E2E řezu N vedle implementace N+1 (stavělo by se na neověřeném základu), review kola v kolečku 1 až 4 (pořadí struktura → zjednodušení → korektnost je záměrné).

**Na běžícího agenta se nečeká pollingem.** Když agent doběhne, dostaneš notifikaci sám od sebe — do té doby buď dělej něco jiného, nebo tah ukonči. Zakázané je: `sleep` v popředí (v aktuálních verzích ho harness stejně blokuje), smyčky typu `until [ -n "$(git status --short)" ]; do sleep 20; done`, opakované `git status` „jak mu to jde" a hlavně `tail` na `tasks/<id>.output` — u agenta je to symlink na celý jeho transcript. Naměřeno na jedné ostré session: **530 volání `sleep` a 219 `date`, dohromady 38 % všech tahů**, a s nimi špička kontextu 982k tokenů, protože každý takový tah přeprefilluje celý kontext.

Když opravdu potřebuješ počkat na **stav mimo harness** (deploy platformy, CI, migrace), platí:
- **jedna** background Bash s `until`-smyčkou, která skončí, jakmile podmínka platí (`run_in_background: true`) — dostaneš jednu notifikaci, ne třicet tahů;
- `Monitor`, když chceš vědět o každé události zvlášť (log deploye, postup CI);
- nikdy ne opakované ruční kontroly v hlavní smyčce.

## Stropy session a handoff

**Ruční protokol compactu (uživatel si ho řídí sám).** Když ti během běhu napíše pokyn typu „po tomto řezu uděláme compact":
1. **Dokonči rozdělaný řez celý**, včetně fáze 7 (uzavření, journal, handoff). Nikdy nezastavuj uprostřed — polovina řezu je nejhorší stav, se kterým může čerstvý kontext navázat.
2. Přepiš `docs/handoff.md` tak, aby z něj šlo navázat bez téhle konverzace.
3. **Další řez nezačínej.** Zastav se krátkou zprávou, že je připraveno a čeká se na compact.
4. **Compact nikdy neinicuj sám** a nenabízej ho. Je to jeho rozhodnutí; ty jen připravíš stav.

**Limity subagentů — počet za session už mezi ně nepatří.** Dřívější pojistka „při 170 se zastav" tady byla proto, že Claude Code měl strop ~200 spuštěných subagentů na session. Ten strop je pryč (ověřeno v 2.1.229: `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` už neváže žádnou logiku ani hlášku) a **žádné počítadlo agentů si nevedeš** — vize běžně spotřebuje stovky agentů (naměřeno: 367 na dvanáctiřezové vizi) a zastavovat se kvůli počtu znamená zbytečně půlit běh.

Co je vynucené a na co narazíš doopravdy:
- **Souběžnost 20** (`Concurrent subagent limit reached`). Nad ni tool cally neposílej, přebytek stejně čeká; a `Do not retry` znamená nezkoušet znovu, ale počkat na doběhnutí.
- **Hloubka zanoření.** Orchestrátor → code-review → jeho lensy jsou už tři patra. Nikdy nespouštěj agenta, který má sám spouštět další agenty spouštějící agenty; při hlášce `Subagent nesting limit reached` fázi dokonči mělčeji, ne opakovaným pokusem.
- **Rozpočet v dolarech** (`Budget limit reached ($X spent of the $Y maximum)`), když je nastavený. Tohle je tvrdý konec: nové agenty už nespustíš, takže po té hlášce dokonči řez vlastními nástroji, uzavři ho fází 7 a zastav se.

**Skutečný důvod, proč session končí, je zaplněný kontext, ne počet agentů.** Když ti systém oznámí blížící se compact nebo usage limit, dokonči běžící řez, uzavři ho fází 7, přepiš handoff a zastav se — aby uživatel našel čistý stav místo mrtvé session uprostřed řezu.

## Infra výpadky, limity a eskalace

- **Subagent umřel na infra chybu** (API server error, usage limit, síť): NENÍ neúspěšný pokus řezu (viz failure policy PIPELINE.md). Postup: (1) resume přes SendMessage na téhož agenta; (2) pokud agent neodpovídá, zastav ho TaskStop, zkontroluj `git status` a spusť čerstvého agenta s popisem skutečného stavu working tree a instrukcí navázat/uklidit. Nikdy dva agenti nad rozpracovaným working tree současně.
  - **Smrt při startu je jiný případ než smrt uprostřed práce.** Když agent skončí okamžitě (typicky hláška o nedostupném přístupu nebo modelu), není co resumovat ani co kontrolovat — spusť ho znovu se stejným zadáním a neřeš obezličky.
  - **Poslední text mrtvého agenta není stav.** Umí umřít na watchdog ve chvíli, kdy čeká na svého podagenta, takže jeho poslední věta zní „teď píšu PRD", zatímco na disku už leží PRD, scénáře i hotový report checku. Stav vždy čti z disku (a u řezů s vnějším účinkem z produkce), ne z jeho vyprávění.
  - **Do resume zprávy patří stavový inventář jako fakt.** Ne „zjisti, kde jsi skončil", ale „strom je v tomhle stavu, tyhle soubory jsou změněné, typecheck je zelený, tohle už v produkci proběhlo". Dvakrát to vrátilo agenta do práce bez jediného kroku navíc; bez toho si stav dohaduje a plete.
- **Usage limit** (hláška „usage limit reached … resets at X"): zastav zombie agenty (TaskStop), zapiš do journalu čas resetu a rozpracovanou fázi, aktualizuj handoff. Pak: máš-li k dispozici ScheduleWakeup, naplánuj probuzení na čas resetu (delší čekání řetěz po max intervalech) a po probuzení pokračuj resume; jinak ukonči tah krátkou zprávou „stojím na limitu do X, po resetu napiš pokračuj" — handoff zajistí plynulé navázání. Nikdy nezkoušej limit obejít.
- **Eskalace zaseknuté fáze:** když agent 2× po sobě nevrátí použitelný výsledek téže fáze (placeholder, prázdno), smíš fázi dokončit sám — ale JEN minimální nutnou akci (např. doověřit deploy status, dopsat commit) a PŘED převzetím agenta zastav TaskStop (zombie, který se později probere, by akci zopakoval — u deploye nebezpečné). Převzetí zapiš do journalu jako jednorázové rozhodnutí orchestrátora.

## Finální fáze (po `docs/.vize-done` nebo argumentu `final`)

1. Invokuj skill `/dev-pipeline:review-kolecko` (plné kolečko nad `git diff main...HEAD`; opravy dělá samo). Po jeho skončení ověř, že vznikl `docs/.review-passed` — bez něj kolečko nedoběhlo a nesmíš pokračovat dál.
2. **E2E nad změnami kolečka.** Kolečko je poslední místo, kde se mění produkční kód, a jediné, které dnes jde na produkci bez vlastní verifikace: scénáře `docs/e2e/rez-NN.md` vznikly dřív, než jeho změny existovaly, takže je nepokrývají. V ostrém běhu po sobě kolečko nechalo nový zámek nad poolem, idempotenci, denní strop odesílání klientských zpráv a org hranici zápisu — tedy přesně věci, které se lokálně ověřit nedají.
   - Nech general-purpose agentem sestavit `docs/e2e/kolecko.md`: kritéria odvozená **z diffu commitů kolečka a z journalu**, ne z kódu. Do zadání mu dej tvrdá pravidla psaní E2E z PIPELINE.md — jinak vyrobí kritéria splnitelná pohledem do zdrojáku.
   - Pak nad ním spusť normální fázi 6 (`dev-pipeline:e2e-verifier`). FAIL se opravuje jako v řezu.
   - **Píše se souběžně s deployem kolečka**, takže krok nepřidává k době běhu.
3. Spusť subagenta `dev-pipeline:vize-validator` (předej cesty: vize, `docs/produkt.md` pokud existuje, prd/, journal, follow-ups, `docs/vize-spory.md` pokud existuje + jak se dostat do běžící appky).
4. Sekci „DODĚLAT AUTOMATICKY" z jeho reportu zpracuj jako mini-řezy hlavní smyčkou — **bez pevného stropu počtu**: pokračuj, dokud jsou položky malé a jednoznačné (zjevné chyby, UX dotažení, věci rozhodnutelné bez uživatele). Pojistky místo stropu: mini-řez, který napoprvé neprojde testy/E2E, jde rovnou do follow-ups (žádná 3 opakování — u dotažení se neurputňuj); položka velká jako samostatná vize nebo vyžadující rozhodnutí uživatele patří do follow-ups / sekce B, ne do smyčky.
5. **Sklizeň deníku vad pipeline.** Spusť krátkého subagenta nad `~/.claude/dev-pipeline-feedback.md`: ať projde záznamy **od začátku téhle vize** (starší už byly zpracované) a vrátí je roztříděné na (a) návrhy, které mění metodiku pluginu, (b) věci, které patří do `CLAUDE.md` projektu, (c) jednorázové poznatky bez dopadu. Výstup jde do sekce **PIPELINE** závěrečné zprávy jako konkrétní seznam, ne jako „něco se zapsalo". Bez tohohle kroku deník roste a nikdo ho nečte — v jednom měření měl 42 záznamů a vyřešené dva. **Sám plugin needituj**, je to nástroj uživatele, ne artefakt běhu.
6. **Follow-ups sweep:** spusť krátkého subagenta, který projde `docs/follow-ups.md` a položky vyřešené během běhu (review-kolečkem, validátorovými dodělávkami, mini-řezy) přeškrtne s `VYŘEŠENO <datum>: <čím>` — každé odškrtnutí ověří proti kódu/aplikaci, ne podle journalu. Nevyřešené položky nech beze změny — do nové vize se nesou jen živé resty.
7. Smaž `docs/.orchestrator-run` a `docs/.review-passed` (konzumované markery). Závěrečný commit, pokud něco zbývá.
8. Notifikace uživateli: PushNotification tool, pokud je k dispozici; jinak `osascript -e 'display notification "Vize <slug> hotová" with title "dev-pipeline"'`.
9. Závěrečná zpráva: co je hotové (per řez, 1 řádek), skipped řezy + doporučení validátora, **ROZHODNUTÍ PRO TEBE** sekce z validátora (jen skutečné odchylky od vize, s doporučením; patří sem i porušené zákazy z vize a případný návrh na změnu `docs/produkt.md` — tu měnit smí jen uživatel), odkaz na journal. Pokud vznikl `docs/vize-spory.md`, přidej sekci **SPORY VE VIZI**: jednou odrážkou na záznam, co si ve vizi odporuje a jak se běh zachoval — je to podklad pro příští `/vize` session, ne seznam chyb implementace. Přidej sekci **PAMĚŤ A DOKUMENTACE**: z journalu vytáhni poznatky, které přesahují tuto vizi (nové pasti projektu, změněné konvence, rozhodnutí s trvalou platností), a navrhni uživateli, co z nich uložit do paměti/CLAUDE.md — sám mimo mandát nezapisuj. Pokud během vize přibyly záznamy v `~/.claude/dev-pipeline-feedback.md`, přidej sekci **PIPELINE**: co selhalo nebo zdržovalo a co by to vyřešilo, jednou odrážkou na záznam (jsou to nálezy o nástroji, ne o projektu — uživatel podle nich vylepšuje plugin). **Zprávu zapiš zároveň do `docs/zaverecna-zprava.md`** (přepisovaný soubor, commitni ho; session zaniká, soubor zůstává) a teprve pak ji pošli uživateli.

## Disciplína kontextu (kritické)

Měřeno na ostré vizi (12 řezů, 5 sessions): do kontextu orchestrátora proteklo ~1,7 M tokenů, z toho **44 % výsledky nástrojů, 37 % text, který napsal on sám** (zadání agentům + obsah Write/Edit). Návratovky agentů se už zmenšily sedminásobně tím, že reporty jdou do souboru; zbytek téhle sekce je o té druhé polovině, kterou si orchestrátor plní vlastní rukou.

- Nikdy nečti diffy, velké soubory ani celé reporty subagentů znovu — pracuj se souhrny, které vrátili.
- **Nikdy nečti obrázek** (viz úvod) — jeden screenshot je přes 100k tokenů.
- **Ověřovací zadání piš jako „vyvrať nebo potvrď", nikdy jako „ověř, že…".** Hypotézu formuluj tak, aby šla vyvrátit, a přidej větu „nálezy mimo hypotézu hlas taky". Doloženo: hypotéza o tichém zkracování odpovědi padla, ale agent při tom našel vadu téže třídy o patro jinde. Při zadání „ověř, že se to zkracuje" by přinesl buď nulu, nebo natažené potvrzení — a to nejcennější by zahodil.
- **Zadání agentovi drž kolem 1 200 znaků, strop 2 000.** Patří do něj: cwd, absolutní cesty (PIPELINE.md + číslo fáze, PRD, vize, report), hranice role („vykonej JEN fázi N"), pokyn o návratové hodnotě a **tři až pět řádků specifik, která nikde nestojí psaná**. Nepatří do něj nic, co si agent přečte sám: obsah PRD, výčet změněných souborů, převyprávěný diff, obsah reportu review, ani metodika, kterou má ve svém `agents/*.md`. Naměřený medián byl **5 631 znaků u `implement` a 4 205 u `deploy`** — u agenta, který má celý postup ve vlastní instrukci. Za převyprávěný diff platíš dvakrát: jednou, když ho skládáš ze souhrnů, podruhé, když ho pošleš dál. Když má agent dostat kontext delší než pár řádků, **napiš ho do souboru a pošli cestu**.
- **Produkční kód needituješ nikdy.** Vlastní Edit/Write patří jen na stavové soubory (PRD frontmatter, journal, handoff, follow-ups, markery); `docs/produkt.md` needituj vůbec. Jakmile sáhneš do `apps/`, `src/` nebo testů, přestal jsi dirigovat a začal implementovat — a kontext ti od té chvíle roste čtením kódu, který jsi neměl mít. Naměřeno: `admin.ts` 9×, `measurement.ts` 8×, `KpiSection.tsx` 8×. I jednořádkovou opravu pošli fix agentovi.
- **Do journalu a follow-ups zapisuj appendem přes Bash heredoc, ne Editem.** Edit do velkého souboru platí za unikátní kotvu v `old_string` i v `new_string`, takže jeden zápis do journalu vyšel na 5,6 kB kontextu; heredoc stojí jen ten nový text. Handoff se naopak přepisuje celý (Write), a právě proto musí zůstat **pod ~2 kB**: je to „branch, rozjetý řez a fáze, co dál", ne shrnutí vize. Naměřeno 7 kB na přepis, čtrnáctkrát za běh.
- Velké stavové soubory nečti znovu celé: z journalu ber tail, z follow-ups jen to, co potřebuješ k rozhodnutí.
- Po případném compactu tě hook re-injektuje `docs/handoff.md` — handoff proto udržuj tak, aby z něj šlo plynule navázat (branch, rozjetý řez + fáze, co dál).
- Žádné otázky na uživatele během běhu — rozhoduj podle vize, odchylky žurnaluj. Zastav se jen u nevratných akcí mimo mandát (mandát = branch, deploy dle configu projektu, DB migrace projektu).
