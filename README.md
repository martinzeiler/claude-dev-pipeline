# claude-dev-pipeline

Osobní vývojová pipeline pro [Claude Code](https://claude.com/claude-code): **vize → plán řezů → autonomní běh → závěrečný audit → validace**. Člověk schvaluje jednou před během (vizi) a jednou po něm (merge do main). Mezi tím běží desítky hodin bez dohledu: orchestrátor v session drží vizi a plán, Workflow bloky pluginu staví řezy s pevnými stropy v kódu a fázoví agenti s modelem natvrdo dělají práci rukama. Stav žije v souborech projektu, ne v kontextu modelu.

Repo je zároveň plugin marketplace pro Claude Code. Plugin je v adresáři `dev-pipeline/`, návody a šablony pro instalaci v `setup/`.

**Obsah:** [Proč](#proč-to-existuje) · [Jak to funguje](#jak-to-funguje) · [Instalace od nuly](#instalace-od-nuly) · [Spuštění běhu](#spuštění-běhu) · [Reference](#reference) · [Zásady](#zásady-které-přežily-měření) · [Změny](#změny)

## Proč to existuje

Claude Code zvládne za jednu session postavit funkci, ale ne dodat celou vizi o deseti řezech přes dvě noci. Ne proto, že by modelu chyběla inteligence, ale protože dlouhý autonomní běh selhává na věcech, které v krátké session nevidíš. Každá vrstva téhle pipeline je odpověď na jednu takovou věc, změřenou na skutečných bězích (interní rozbory čtyř běhů nad produkčními projekty, ty si vedu mimo repo):

- **Kontext se rozteče.** Model, který čte PRD, diffy, reporty a logy, má po šesti hodinách plný kontext a po compactu neví, kde je. Proto orchestrátor **nikdy nečte kód, PRD, reporty ani diffy**; guard běhu mu to odmítne. Čte jen vizi, handoff (tabulku plánu do 4 kB), spory a follow-ups. Všechno ostatní dělají agenti s čerstvým kontextem a vracejí **strojový návrat podle schématu**, ne prózu. Cíl: kontext orchestrátora pod ~300k tokenů za dvanáct hodin, a drží.
- **Agent s plným kontextem dělá chyby a compact uprostřed práce mu vezme nit.** Nad ~300k tokenů kvalita postupně klesá a automatický compact subagenta uprostřed TDD smyčky zahodí, co měl rozdělané. V posledním běhu měly řezy průměrně přes 6 tisíc změněných řádků a implement agenti se zkompaktovali 92×. Proto se velký řez staví **po částech**: PRD architekt ho rozdělí na části po ~1–1,5 tisících řádků s vlastními soubory a kritérii, implementují je souběžně čerství agenti nad společným kontraktem a integrace je sešije. Když odhad nevyjde, **hlídač kontextu** agenta nad ~250k vyzve, ať dokončí rozdělaný krok, zapíše předávku a skončí, a blok pustí nástupce se stejným zadáním (štafeta). Agenti o limitu nevědí, aby nad ním nepřemýšleli a nekončili předčasně; zprávu jim přinese až hook.
- **Souběžní agenti přetíží stroj.** Pět částí, které zároveň pustí typecheck celého repa a plnou suitu, udusí notebook. Proto jdou těžké příkazy (suita, typecheck repa, instalace, build, commit s pre-commit branou) přes **frontu s váhami** v rozpočtu stroje. Počet agentů strop nemá: myslí na serverech, stroj zatěžují jen místní příkazy.
- **Úsudek modelu není deterministický běžec.** Když model sám rozhoduje, kolikrát opakovat review, kdy je brána zelená a jestli E2E „skoro prošlo“, dostaneš třetí kolo oprav ve tři ráno a řez uzavřený s jedním FAIL. Proto jsou pořadí kroků, stropy kol, opakování a diagnóza po druhém neúspěchu **v JavaScriptu Workflow bloků**, ne v promptu. Verdikt E2E se odvozuje z počtů, ne z textu verifikátora.
- **Zadání psané nad starším stromem.** PRD dalšího řezu vzniká souběžně se stavbou aktuálního (jinak by běh čekal). Jenže PRD psané čtyři řezy dopředu měří svět, který se mezitím čtyřikrát změnil. Proto je výhled PRD **přesně jeden řez** a blok stavby si před implementací PRD **přeměří nad dnešním stromem**.
- **Kritéria jako výčty jmen.** „Právě tyto čtyři soubory“ a opsané číslo bez dotazu byly příčinou obou opakovaných pokusů posledního běhu (dohromady 5,5 hodiny a 4,5 milionu výstupních tokenů navíc). Proto prd-check **spouští měřidla kritérií už v prvním kole** a výčet místo vlastnosti je nález; E2E verifikátor čísla přepočítává sám a umí říct „kritérium je vadné“, místo aby kvůli němu běžel další pokus.
- **Vize platí pro všechny, ne jen pro implementaci.** Fix agent, který nezná Ne-cíle vize, napíše kontrolní test nad zmrazeným souborem, a řez padne na kritériu, které to zakazuje. Proto Ne-cíle jdou do rámce **každého** agenta bloku, včetně oprav, thermo a E2E.
- **Verifikační divadlo.** „Deploy spuštěn“, „testy zelené“ podle cache, screenshot prvku v DOM. Proto brána vrací skutečné počty, exit kód a jména selhávajících testů, spouští i kontroly pre-commit hooku a měřidla kritérií a zelenou dá jen nad doloženým měřením, deploy čeká na doložený terminální stav a vrací dva nezávislé doklady, E2E vykonává scénáře v prohlížeči a částečné neprůchody nezaokrouhluje na PASS.
- **Otázky v noci nikdo nezodpoví.** Proto se běh **nikdy neptá** (hook `AskUserQuestion` odmítne) a zastavuje se jen ze sedmi vyjmenovaných důvodů, vždy s push notifikací. Kolize vize s pravidly projektu, vadné kritérium nebo nesplněný bod plánu jsou **otázky pro majitele s navrženou odpovědí**: běh jede podle návrhu, zapíše to a závěrečná zpráva to sebere na jedno místo.
- **Cena bez užitku.** Závěrečné kolečko jako 38 volání agentů v session trvalo 6,5 hodiny a přežilo compact uprostřed; bezpečnostní sken cizím pluginem spustil 178 agentů nejsilnějšího modelu za jeden nález, který existoval už před větví, a vyvolal usage limit. Proto je kolečko třetí Workflow blok a sken jen na vyžádání.

Poslední běh pro měřítko (verze 1.3.0, vize o 13 řezech nad produkčním monorepem): 25 postavených řezů, z toho deset vzniklých dělením, 156 tisíc změněných řádků, 94 hodin čistého běhu, 21 řezů na první pokus. Nejvíc času vzal týdenní limit účtu (22,5 h) a noční zastavení na přihlášení k platformě, o kterém člověk nedostal push (4 h). Na to odpovídá 1.4.0: části místo dělení řezů, štafeta místo compactu, preflight nasazení na startu a push při každém zastavení.

## Jak to funguje

### Tři vrstvy

1. **Orchestrátor** je skill `dev-pipeline:orchestrate` běžící v tvé session na nejsilnějším modelu, který máš. Drží celou vizi a plán řezů, vybírá řezy, schvaluje souhrn PRD, hlídá drift od Cílů, smí měnit cestu k Cílům (nikdy Cíle) a píše krátké zprávy o stavu. Nečte kód a needituje ho. Na všechno posílá bloky a agenty.
2. **Tři Workflow bloky pluginu** (`dev-pipeline/workflows/`) jsou deterministický běžec: `blok-prd.js` (PRD řezu a jeho kontrola), `blok-stavby.js` (implementace až uzavření řezu), `blok-kolecko.js` (závěrečný audit celé vize). Pořadí kroků, stropy kol, opakování, diagnóza a tvar návratů jsou v kódu. Bloky běží na pozadí přes nástroj `Workflow` a výsledek přijde orchestrátorovi notifikací.
3. **Fázoví agenti** (`dev-pipeline/agents/*.md`) mají jednu roli, model a effort natvrdo a strukturovaný návrat, který vynucuje schéma bloku. Reporty píšou do souborů, orchestrátor je nikdy nečte; čte je až fix agent, který dostane cestu a identifikátory nálezů.

### Stav žije na disku

Všechno, co běh potřebuje k navázání po compactu, po usage limitu nebo po restartu stroje, je v `docs/` cílového projektu: `handoff.md` (stav běhu a živá kopie plánu, do 4 kB, hook ho po compactu injektuje zpět), `prd/rez-NN-*.md` (PRD řezu; u velkého řezu kostra a PRD jednotlivých částí), `e2e/rez-NN*.md` (scénáře, doklad před migrací, zápis nasazení), `journal.md` (co se stalo), `follow-ups.md` (co zbývá, napříč vizemi), `vize-spory.md` (rozpory, předpoklady a otázky pro majitele), `reviews/` (plné reporty a předávky agentů, gitignorované), `.run-args.json` (stálé args bloků pro navázání po compactu), `.kontext.jsonl` (měření kontextu agentů), markery `.orchestrator-run`, `.verify-passed`, `.deploy-unlocked`, `.review-passed`, `.vize-done`. Kdo co smí psát a jaký to má tvar, říká jediný dokument: `dev-pipeline/skills/orchestrate/KONTRAKT.md`.

### Životní cyklus jedné vize

**Tvoje kroky jsou 1, 3 a 4. Krok 2 běží sám.**

1. **`/vize`** (interaktivní, jediný schvalovací bod před během). Debatní session: paralelní fact-finding nad kódem a daty (agent `pruzkum`, Sonnet, fakta s citacemi), research bez ptaní (agent `reserse`, Opus; Fable na vyžádání), seznam otevřených otázek v draftu, tvar UI a seznam UI ploch, **test smazání pro každý ochranný mechanismus** (zámek, strop, potvrzení musí sedět na hranici nevratnosti, jinak do vize nepatří), **Povolení pro zápis do živých systémů** (identita, pod kterou agenti zapisují, operace, meze, platnost; běh se pak už neptá), na konci **plán řezů** (tabulka: číslo, název, body vize, definice hotového, závislosti) a čerstvé oči (agent `cerstve-oci`, Opus) z několika rolí včetně role orchestrátora; úsudek zůstává v hlavním vlákně na modelu session: nálezy třídí do tří košů (rozhodnutí pro tebe, oprava vize, technický detail, který dohledá PRD) a další kolo pouští, jen když zbylo rozhodnutí pro tebe, čtvrté jen s tvým souhlasem. Tělo vize do 40k tokenů, přílohy v `docs/vize/<slug>/`. Výstup je commitnutý `docs/vize/<slug>.md`. Jediné místo, kde vzniká a mění se produktová severka `docs/produkt.md`.
2. **`/dev-pipeline:orchestrate docs/vize/<slug>.md`** napsané jako prompt v nové session (viz [Spuštění běhu](#spuštění-běhu)). Setup skript ověří čistý strom, archivuje stav předchozí vize, založí větev `vize/<slug>`, marker se session_id a handoff s tabulkou plánu, doplní `.gitignore` a `.prettierignore`, všechno commitne jedním commitem, a vypíše mapu sekcí vize a to, co chybí v nastavení Claude Code. Orchestrátor pak agentem ověří přihlášení k nasazovací platformě (preflight: selhání se dozvíš hned, dokud jsi u klávesnice), zapíše stálé args bloků do `docs/.run-args.json` a běží smyčka řezů; po posledním řádku plánu finální fáze.
3. **Přečti závěrečnou zprávu** `docs/zaverecna-zprava.md`: per řez jeden řádek, stav Cílů, ROZHODNUTÍ PRO TEBE (jen změny Cílů a mantinelů), OTÁZKY S NAVRŽENOU ODPOVĚDÍ (běh už jel podle návrhu, ty potvrdíš nebo obrátíš), SPORY VE VIZI, PAMĚŤ A DOKUMENTACE, PIPELINE. Proklikej aplikaci.
4. **Merge `vize/<slug>` do main** děláš ty. Autonomní běh na main nikdy nesahá.

### Jeden řez zblízka

**Blok PRD** (`blok-prd.js`): **PRD architekt** napíše `docs/prd/rez-NN-<slug>.md` a `docs/e2e/rez-NN.md` podle přiděleného řádku plánu, předpoklady vize ověří proti kódu a datům a rozsah nerozšiřuje; vizi čte výřezem (Proč, Cíle, Ne-cíle, body řádku, dotčená Povolení a Mantinely), ne celou. Řez nad ~1,5 tisíce změněných řádků rozdělí na **části** s disjunktními soubory, vlastními kritérii a závislostmi a sám napíše jen kostru: společná kritéria, sekci Kontrakt (sdílené typy, schéma a migrace, rozhraní mezi částmi) a tabulku Částí. PRD každé části pak souběžně napíše **autor části**, který čte kostru a jen kód své oblasti. Malý řez má PRD celé, jako dřív. Nezávislý `prd-check` pak kontroluje kostru (úplnost vůči vizi a řádku plánu, kvalita kritérií včetně **spuštění všech měřidel** nad dnešním stromem, rozsah, optimalita, disjunktnost částí, úplnost kontraktu) a souběžně každou část (technická validita proti skutečnému kódu). Při nálezech následuje zapracování a delta kontrola jen nad změněnými místy, a to jen po blokujících nálezech kola 1 (u lehkého profilu nikdy). Žádné třetí kolo; zbylé nálezy jdou stavbě jako hypotézy. Když by řez přesáhl ~12 tisíc řádků nebo ~10 částí, blok navrhne jeho rozdělení a rozhodne orchestrátor. PRD řezu závislého na právě stavěném vzniká souběžně: PRD stavěného řezu je kontrakt a rozhraní z něj jsou předpoklady, které stavba před implementací přeměří. PRD také řekne, zda řez potřebuje doklad před migrací, jaké kroky má deploy udělat po nasazení a jak jsou E2E scénáře rozdělené do nezávislých sekcí. Kritérium nad kódem nese značku [měřidlo] a měří ho brána; E2E ověřuje jen chování běžící aplikace. Režim `zapracovani` slouží orchestrátorovi, když souhrn PRD odmítne (odchylka od plánu, chybějící pokrytí bodů vize): jeden PRD agent + delta kontrola, ne nové PRD.

**Schválení souhrnu** dělá orchestrátor z návratu bloku, PRD samo nečte: pokrývá řádek plánu, nezavádí UI plochu mimo seznam ve vizi (lešení jen s přístupovou hranicí a řádkem plánu na jeho odstranění), zápis do živého systému jen s citovaným Povolením, odchylky od plánu přijme jako změnu cesty nebo pošle zpět.

**Blok stavby** (`blok-stavby.js`), jeden pokus:

| Fáze | Co se děje | Strop |
|---|---|---|
| Refresh PRD | jen když od PRD zestárl strom v překrývajících se oblastech (`prd_stale`): delta prd-check kritérií závislých na stromu (Opus medium), při nálezech zapracování | jen v 1. pokusu |
| Implementace | `implement`: TDD červená → zelená, doktrína CLAUDE.md projektu, Serena na symboly, build verze jako součást řezu. Malý řez staví jeden agent. Řez s částmi: **kontrakt** (společné věci; těla, která patří částem, zatím hlásí „neimplementováno“) → **části souběžně**, každá hned, jak jsou hotové její závislosti, jen ve svých souborech a jen se svými testy → **integrace** (typecheck celého repa, švy mezi částmi, změny, které části vrátily jako „mimo hranici“) | části bez stropu souběhu, brzdí jen fronta těžkých příkazů |
| Review | malý řez: `thermo-nuclear-review` ∥ `code-review` nad týmž stromem; řez s částmi: thermo a code-review **každé části jen nad jejími soubory** ∥ **integrační review** (kontrakt, švy, duplicity mezi částmi) → fix agenti souběžně po **disjunktních balíčcích souborů** (thermo BLOCKER/HIGH přidané k balíčku, který soubor vlastní) → při rozšířeném zásahu, blokujících nálezech nebo odmítnutém blokujícím nálezu kolo 2 jen nad opravnou várkou → nejvýš jedna další oprava, a to zúžením; lehký profil řezu (bez runtime dopadu) bez thermo a s jedním kolem | 2 kola |
| Brána | `verify`: typecheck, **jediná plná suita** řezu, kontroly pre-commit hooku projektu a měřidla kritérií [měřidlo]; zelená jen s exit kódem 0, aspoň jedním prošlým testem a všemi kontrolami a měřidly v pořádku; zapíše `docs/.verify-passed` s hashem stromu bez `docs/` | 1 oprava |
| Doklad | jen když PRD předepisuje doklad před migrací (mění nebo maže existující data, nevratná): `doklad` (Sonnet) pořídí snímek dotčených dat dotazy jen pro čtení do `docs/e2e/rez-NN-doklad-pred.md`; deploy bez něj migraci neaplikuje | 1 pokus navíc |
| Deploy | `deploy`: bezpečnostní opravy samostatnými commity `fix(security)`, jeden commit řezu na vize větvi (kód, docs řezu, sdílené dokumenty běhu; cizí rozpracované PRD ne), nasazení podle runbooku s pokyny majitele jako závazným postupem (přednost před skripty repa; u Pages ověří Production), čekání na terminální stav omezenou smyčkou, zakázané okno s rezervou, dva nezávislé doklady, **kroky po nasazení** předepsané v PRD (vynechaný krok je selhání) a zápis nasazení samostatným commitem; cizí a necommitnutou práci nevrací (guard to během běhu blokuje). Selhání mimo kód (přihlášení, účet, výpadek platformy) blok hned zastaví bez započtení pokusu | terminální stav |
| E2E | `e2e-verifier` v prohlížeči bez okna (`agent-browser`) nebo doložení kritérií bez prohlížeče; kód neověřuje (kritéria nad kódem změřila brána); nejdřív ověří prostředí (nasazená revize je commit řezu; jinak jedno dorovnání deployem, nikdy nenasazuje sám); **jeden verifikátor na každou skupinu sekcí do 12 kritérií**, souběžně; kolo 2 po opravě jen nad FAIL kritérii kola 1; verdikt per kritérium PASS / PASS-částečně / FAIL, **výsledek bloku z počtů**; vadné kritérium (nesplnitelné v prostředí, kolidující, předřezový nález, scénář zastaralý po opravě) se neopravuje, jde k rozhodnutí; závažné nálezy mimo kritéria: oprava, brána a nasazení se samostatným commitem `fix(security)` | 1 opakování |
| Uzavření | ověření commitu řezu a bezpečnostních commitů v gitu, PRD status a commit, srovnání PRD s realitou, položkové sesouhlasení thermo, kontrola dokladů předepsaných PRD, journal (odmítnuté nálezy, měřidla, kroky po nasazení, kontext agentů), follow-ups | 1 agent |

Až **tři pokusy** (mini-řezy finální fáze jeden); před třetím běží `diagnose` (reprodukční smyčka a doložená příčina, nic neopravuje). Další pokus řezu s částmi pustí jen části, které nedoběhly, a po selhání v bráně, nasazení nebo E2E místo částí jednoho opravného agenta. Funkční neúspěch je, když fáze doběhla a výsledek je špatně; infra smrt agenta (usage limit, API chyba) se opakuje uvnitř bloku a nepočítá se. Reporty pokusu 2 nepřepisují reporty pokusu 1 (číslo pokusu je v názvu). Každý agent bloku dostává v rámci zadání Ne-cíle vize, seznam toho, co pozdější řezy mažou, a hranice své role; handoff nečte (je to stav orchestrátora) a tah končí vždy strukturovaným návratem.

**Souběh:** v jednu chvíli nejvýš jeden blok stavby (bloky sdílejí pracovní strom) a nejvýš jeden blok PRD, ten pro **následující** řez, spuštěný ve stejném tahu jako stavba; řez závislý na právě stavěném dostane PRD souběžně s PRD stavěného řezu jako kontraktem. Po řezu dostaneš pevný blok sedmi řádků: commit, deploy, pokusy, E2E, review, thermo, části, předávky a nejvyšší kontext agentů, follow-ups, spory, otázky, změna plánu, stav Cílů, další řez.

### Kontext agentů: části a štafeta

Cíl je, aby žádný agent nepracoval nad ~300k tokenů kontextu a žádný subagent se nezkompaktoval uprostřed práce. Běh na to má tři jednotky:

- **Řez** je jednotka rizika a ověření: review, brána, nasazení a E2E proběhnou jednou za řez. Dělí se jen kvůli riziku (jednorázové Povolení, nevratná operace) a závislostem, protože každý řez navíc stojí asi 1,5 hodiny pevné části; dva malé sousední řezy smí orchestrátor sloučit.
- **Část** je jednotka kontextu: ~1–1,5 tisíce změněných řádků včetně testů, vlastní soubory, vlastní kritéria. Agent části čte kostru PRD bez sekcí jiných částí, PRD své části a kód své oblasti; cizí soubory neupravuje, neformátuje ani nevrací a změnu jinde vrátí integraci. Souběžně jich běží tolik, kolik dovolí závislosti.
- **Předávka** je pojistka, když odhad nevyjde. Hook `hlidac-kontextu.sh` měří kontext každého subagenta běhu z jeho transkriptu. Agentovi Workflow bloku (jen pro něj umí blok pustit nástupce; přímé subagenty orchestrátora jen měří) nad ~250k po každém nástroji připomene, ať dokončí rozdělaný krok, zapíše předávku (co je hotové a čím ověřené, co zbývá, zjištění, rozdělané soubory, obsah návratu) a skončí; nad ~290k mu dovolí už jen tohle. Blok pak pustí nástupce se stejným zadáním a předávkou, nejvýš třikrát na úkol. Agenti o limitu nevědí: prompty ani schémata kontext nezmiňují.

Měření jde do `docs/.kontext.jsonl`: `co-dela.sh` ukazuje kontext běžících agentů a uzavření řezu zapíše nejvyšší kontext podle typu agenta, compacty a předávky do journalu i do zprávy po řezu. Orchestrátor sám běží s `--autocompact 330k` (compact kolem 300k) a stav drží na disku.

### Zátěž stroje: fronta těžkých příkazů

Části běží souběžně bez stropu, protože agenti myslí na serverech; stroj zatěžují jen místní příkazy. Hook `fronta-tezkych.sh` pozná těžký příkaz subagenta a obalí ho skriptem `scripts/tezky.py`, který čeká, až se v rozpočtu stroje (výchozí 6 míst) uvolní jeho váha: plná suita a `git commit` s pre-commit branou 4, typecheck nebo lint celého repa 3, instalace, build a vitest nad adresářem 2, typecheck jednoho balíčku a cílené testy 1. Fronta je přísně v pořadí příchodu, místo mrtvého procesu se uvolní samo a po 5 minutách čekání se příkaz nespustí a agent dostane výpis, co frontu drží. E2E verifikátor těžké příkazy nesmí vůbec: ověřuje běžící aplikaci, kód měří brána. Rozpočet a limit čekání nastavíš proměnnými `DEV_PIPELINE_TEZKY_ROZPOCET` a `DEV_PIPELINE_TEZKY_MAX_CEKANI`.

### Finální fáze

Po posledním řádku plánu: **`blok-kolecko.js`** nad `git diff main...HEAD` (thermo → code-review kolo 1 → kolo 2 fan-outem pěti čoček s triáží opravit teď / follow-up / odmítnout → bezpečnost dvěma metodikami → nasazení → E2E scénáře kolečka a verifikace → journal a `docs/.review-passed`; po každé opravné vlně brána a commit) → sken `claude-security` **jen když o něj vize požádá** hlavičkou `bezpecnostni_sken: changes|codebase` → `vize-validator` s čerstvým kontextem (Cíle, zákazy, lešení, změny plánu, dotažení detailů; jeho „dodělat automaticky“ jdou jako mini-řezy s jedním pokusem) → odstranění lešení → sklizeň (přeškrtnutí vyřešených follow-ups, roztřídění feedbacku pipeline, co přibylo v CLAUDE.md projektu) → závěrečná zpráva → zastavení zbylých úloh na pozadí, zrušení cronu, notifikace.

### Drift, zastavení, otázky pro majitele

Plán ve vizi je závazný pro PRD agenta; **orchestrátor ho smí měnit, když to vede k Cílům lépe** (pořadí, dělení, sloučení, přidání řezu, který Cíl potřebuje, vypuštění řezu, který nic nepřidá), každou změnu zapíše a oznámí. Řez dělí jen kvůli riziku a závislostem, nebo když by přesáhl ~12 tisíc řádků či ~10 částí; velikost implementace řeší části. Nesmí měnit Cíle, Ne-cíle, Rozhodnutí ani severku, ani přidat rozsah, který žádný Cíl nepotřebuje. Nálezy review ani E2E nikdy nezakládají nový řez.

Zastaví se a čeká na člověka jen ze sedmi důvodů: (a) změna Cíle, Ne-cíle, Rozhodnutí nebo severky; (b) rozsah, který žádný Cíl nepotřebuje; (c) blok stavby selhal třikrát i s diagnózou; (d) blokující bezpečnostní nález v nasazeném kódu, který blok neopravil; (e) zápis do živého systému bez Povolení; (f) dvojnásobek řezů proti plánu; (g) nasazení selhalo mimo kód (přihlášení nebo účet CLI, výpadek platformy). Každé zastavení ti pošle push notifikací. Všechno ostatní řeší sám: předpoklad do `vize-spory.md`, konzervativní volba, jeď dál. Tři třídy věcí nejsou ani zastavení, ani jeho rozhodnutí: kolize vize s runbookem nebo CLAUDE.md projektu, vadné kritérium a vědomě nesplněný bod řádku plánu. Ty jdou do `vize-spory.md` **s navrženou odpovědí**, běh podle návrhu pokračuje a závěrečná zpráva je sebere.

### Hooky a guardy

Hooky pluginu (`dev-pipeline/hooks/hooks.json`) se samy hlídají markerem `docs/.orchestrator-run` a jeho `session_id`: v projektu bez běhu a v jiné session nedělají nic.

| Hook | Kdy | Co dělá |
|---|---|---|
| `guard-blast-radius.sh` | PreToolUse Bash, vždy | odmítne force-push, `git reset --hard` a `git clean -f` na main, `rm -rf` na kořeny, `rm` s nechráněnou proměnnou (`rm $S/*.ts`; návod na `rm -f "${S:?}"/soubor`, jinak by Claude Code položil dotaz na mazání, na který v noci nikdo neodpoví), nasazovací příkaz během běhu bez `docs/.deploy-unlocked` (jen spouštěný příkaz, ne text v commit message nebo grepu); během běhu i `git stash`, `git clean` a `checkout`/`restore` nad `docs/` a celým stromem |
| `guard-run.sh` | PreToolUse | orchestrátor: žádné `AskUserQuestion`, čtení jen vize, `produkt.md`, handoff, spory, follow-ups, `docs/.run-args.json`, `docs/.stavba-*.json`, `~/dev-pipeline-feedback.md` a soubory pluginu, žádné spouštění projektu (balíčkovač, testy, curl, deploy, diffy), editace jen v `docs/` a ve feedback souboru; subagenti: žádné čtení celého zdrojového souboru nad 350 řádků (Read bez offset/limit, `cat`, `sed -n` přes celek) s odkazem na Serenu; nikdo nepíše `docs/.verify-passed` ručně |
| `hlidac-kontextu.sh` | PostToolUse a PreToolUse, subagenti běhu | měří kontext subagenta z transkriptu; nad 250k připojí zprávu PŘEDÁVKA, nad 290k zamítne všechno kromě zápisu předávky a strukturovaného návratu; měření a compacty do `docs/.kontext.jsonl` |
| `fronta-tezkych.sh` | PreToolUse Bash, subagenti běhu | těžký příkaz obalí frontou s váhami (`scripts/tezky.py`) a timeoutem 10 min; E2E verifikátorovi suitu, typecheck, instalaci, build a `git worktree add` zamítne |
| `on-stop.sh` | Stop | tah orchestrátora smí skončit jen ve stavech `běží …`, `zastaveno …`, `hotovo`; jinak vrátí důvod a orchestrátor pokračuje |
| `pre-compact.sh` | PreCompact | varování, když handoff přesáhl 4 kB |
| `session-start-handoff.sh` | SessionStart (startup, compact, resume) | vrátí prvních 4 kB handoffu a `PO-COMPACTU.md` |
| `prompt-submit.sh` | UserPromptSubmit | při promptu `/dev-pipeline:orchestrate` uloží session_id do `docs/.orchestrator-session` pro setup |

PreToolUse a PostToolUse hooky mají timeout 30 s (pod zátěží stroje guard s kratším limitem propouštěl). Fail-open: nejednoznačný případ projde. Testy hooků včetně hlídače kontextu a fronty: `dev-pipeline/hooks/tests/run.sh`; guard blast-radius má navíc `scripts/test-guard.py`.

### Sledování běhu

- **Cron „zkontroluj stav běhu“** každých 30 minut: orchestrátor spustí `scripts/co-dela.sh --kratce`, jeho výstup vloží do odpovědi beze změny a připojí dvě věty (co se právě děje, co bude následovat), pak jedná podle handoffu (ztracená notifikace, čekající krok). Session tak nese časovou řadu toho, co agenti dělali. `TaskOutput` používá jen na dokončený Workflow, jehož výsledek nezpracoval; na agentní task nikdy (vrátil by kód a diffy).
- **`scripts/co-dela.sh`** čte journal a metadata agentů ze session Claude Code (`~/.claude/projects/<slug>/<session_id>/`), žádný model nevolá a nic z obsahu odpovědí nevypisuje. Výstup: hlavička běhu (vize, hotové řezy z handoffu), per blok jméno řezu, pokus, doba, fáze i/N s trváním a hotové fáze, živí agenti s modelem a časem od posledního zápisu, hotové bloky za posledních 30 minut jako `✓` a selhané jako `✗` s důvodem, agenti mlčící přes 20 minut. Části a nástupce po předávce ukazuje čitelně (`řez 05 · část K2 · pokus 1 · nástupce 2`), u běžících agentů kontext z `docs/.kontext.jsonl`, v souhrnu nejvyšší kontext podle typu agenta, compacty a předávky, a co drží frontu těžkých příkazů. Workflow obnovený pod stejným ID pozná a hlásí jako běžící. Živý agent je poslední start daného klíče, takže agent zabitý stall watchdogem a restartovaný se neukazuje dvakrát. Bez argumentu (v cwd projektu s běžícím orchestrátorem, nebo `--session <dir>` / `--transcript <cesta.jsonl>`) navíc poslední volání nástrojů. V session ho spustíš i ručně: `! bash ~/claude-dev-pipeline/dev-pipeline/scripts/co-dela.sh`.
- **Status line:** `setup/statusline.sh` volá `co-dela.sh --status` a přidá segment `▶ <živí agenti> · <nejdéle mlčící> · <m:ss>` (žlutě přes 15 min, červeně přes 30 min), a když něco čeká ve frontě těžkých příkazů, krátký údaj o frontě. Potřebuje `statusLine.refreshInterval` v `settings.json`, jinak se řádek během tichého Workflow nepřekreslí (ověřeno v Claude Code 2.1.274).
- **`/workflows`** v Claude Code ukazuje strom fází a po rozbalení prompt a aktivitu agenta; živý text agentů neukazuje nikde.
- **Zprávy orchestrátora:** pět řádků před řezem, pevný blok po řezu, krátká zpráva a push notifikace při zastavení. Nálezy nepřevypráví.

### Modely a cena

| Kde | Model / effort | Proč |
|---|---|---|
| orchestrátor (tvoje session) | nejsilnější dostupný s 1M kontextem: Opus 5.5 (`opus[1m]`) nebo Fable 5.1 | úsudek nad celou vizí, málo tokenů, hodně rozhodnutí |
| `prd`, `prd-check`, `implement`, `code-review`, `diagnose` | Opus high | tvoří zadání a kód, chyby tu jsou nejdražší |
| `thermo-nuclear-review`, `fix`, `e2e-verifier`, `implement` v roli integrace | Opus medium | ohraničená práce nad daným rozsahem |
| `verify` | Sonnet low, bez CLAUDE.md projektu | mechanické kroky se strojovým výsledkem |
| `deploy` | Sonnet medium, bez CLAUDE.md projektu | dlouhý řetězec kroků (commit s branou, nasazení, čekání, dva doklady), ve kterém se ověření nesmí přeskočit |
| `doklad` | Sonnet medium | dotazy jen pro čtení podle předpisu v PRD |
| `vize-validator` | Fable high | čerstvé oči na konci |
| vize session: `pruzkum` | Sonnet medium | fakta z kódu a dat s citacemi, bez úsudku |
| vize session: `reserse`, `cerstve-oci` | Opus high (rešerše na Fable na vyžádání) | svět venku a čtení vize z role; úsudek zůstává v hlavním vlákně |
| pomocné úlohy Claude Code | `ANTHROPIC_SMALL_FAST_MODEL=claude-sonnet-5-5` | podlaha je Sonnet, ne Haiku; jediné místo s pevnou verzí (proměnná zkratku nebere), po vydání nového Sonnetu ji přepiš |

Agenti mají model zapsaný zkratkou (`opus`, `sonnet`, `fable`) a Claude Code ji překládá na nejnovější model dané řady, takže nový model převezmou sami a plugin řídí jen effort; 29. 9. 2026 je `opus` Opus 5.5 a `sonnet` Sonnet 5.5. Zkratku stejné řady jako tvoje session Claude Code připne na model session (orchestrátor na Opusu, agenti `opus` na témž Opusu). Kterou verzi běh skutečně použil, ukazují transkripty (`message.model`) a `co-dela.sh`.

Poslední běh v číslech (výstupní tokeny): bloky celkem 30,6 M, z toho implementace 11,1 M, PRD 5,6 M, kontrola PRD 4,0 M, code-review 2,6 M, opravy 2,4 M, E2E 2,1 M; orchestrátor 0,6 M. Implementace byla polovina času stavby. Opakovaný pokus řezu stojí 2 až 3 hodiny a přes 2 M tokenů; proto tolik pravidel míří na kvalitu kritérií.

## Instalace od nuly

Postup pro nový stroj (macOS; Linux se liší jen v balíčkovači). Všechny cesty počítají s klonem v `~/claude-dev-pipeline`; jinou cestu propiš do `settings.json` a do `setup/statusline.sh` (proměnná `DEV_PIPELINE_REPO`). Na konci spusť `bash setup/check.sh`, který každý krok ověří.

### 1. Nástroje

| Nástroj | K čemu | Instalace |
|---|---|---|
| Claude Code ≥ 2.1.281 (ověřeno s 2.1.284) | `autoContinueAtUsageLimit`, `statusLine.refreshInterval`, `Workflow`, přepis příkazu hookem (`updatedInput`) pro frontu těžkých příkazů; starší verze nechá dotaz na mazání v `bypassPermissions` čekat bez limitu | podle [dokumentace](https://docs.claude.com/en/docs/claude-code) |
| git, `gh` (volitelně) | běh commituje na vize větvi | Xcode CLT / `brew install gh` |
| Node 22 | Workflow skripty, `agent-browser`, většina cílových projektů | `nvm install 22` |
| `jq` | hooky a skripty pluginu (hlídač kontextu čte transkripty) | `brew install jq` |
| `python3` | fronta těžkých příkazů (`scripts/tezky.py`), `co-dela.sh`, `module-health.py`, testy guardu | součást macOS (3.9 stačí) |
| `ripgrep` (volitelně) | agenti hledají textové vzory přes `rg`; Claude Code jim v Bash nástroji podstrkuje vlastní ripgrep funkcí `rg`, systémová binárka je jen pro tvůj terminál | `brew install ripgrep` |
| `uv` | instalace Sereny | `brew install uv` |
| `tmux` (volitelně) | `scripts/limit-watcher.sh` na běh mimo dohled | `brew install tmux` |

Do profilu shellu (`~/.zshrc`):

```bash
export PATH="$HOME/.local/bin:$PATH"        # serena, serena-hooks
export ANTHROPIC_SMALL_FAST_MODEL=claude-sonnet-5-5   # pomocné úlohy Claude Code na Sonnetu, ne Haiku; pevná verze, po vydání nového Sonnetu přepiš
export MCP_TIMEOUT=60000                    # start language serveru Sereny u velkého repa trvá déle než výchozí limit
```

Hlavní model Claude Code **nepinuj přes env** (`CLAUDE_MODEL` Claude Code nečte, `ANTHROPIC_MODEL` by znemožnil přepnutí za běhu); model a effort se nastavují v Claude Code (`/model`, `/config`), agenti pipeline mají model ve svých souborech.

### 2. Klon repa

```bash
git clone https://github.com/martinzeiler/claude-dev-pipeline.git ~/claude-dev-pipeline
chmod +x ~/claude-dev-pipeline/dev-pipeline/hooks/*.sh ~/claude-dev-pipeline/dev-pipeline/scripts/*.sh ~/claude-dev-pipeline/setup/*.sh
```

### 3. Serena (povinná)

[Serena](https://github.com/oraios/serena) je MCP server nad language servery: agenti pipeline hledají a editují kód **symbolem** (`find_symbol`, `find_referencing_symbols`, `replace_symbol_body`), ne čtením celých souborů, a guard běhu čtení celého velkého zdrojového souboru odmítne. Bez Sereny se agenti buď zaseknou na guardu, nebo spálí kontext na `cat`.

```bash
uv tool install serena-agent            # nainstaluje serena, serena-agent, serena-hooks do ~/.local/bin
serena --version                        # ověřeno s 1.7.1
claude mcp add --scope user serena -- "$HOME/.local/bin/serena" start-mcp-server --context claude-code --project-from-cwd
```

`--project-from-cwd` aktivuje projekt podle pracovního adresáře session, takže funguje ve všech projektech bez ručního `activate_project`. Při první aktivaci v projektu Serena založí `.serena/project.yml`; zkontroluj v něm `language_servers` (pro TypeScript/JavaScript `typescript`) a dej `.serena/` do `.gitignore` projektu. U velkého repa předem `serena project index`. Když soubor nevznikne, `serena project create`.

**Hooky Sereny** do `~/.claude/settings.json` (čtyři záznamy, jsou v `setup/settings.snippet.json`; cesty absolutní):

- `SessionStart` → `serena-hooks activate --client=claude-code` (aktivace projektu),
- `PreToolUse` (bez matcheru) → `serena-hooks remind --client=claude-code`: **zablokuje** třetí `Grep` nebo třetí `Read` zdrojového souboru v řadě a vrátí připomínku; symbolické volání Sereny čítač resetuje,
- `PreToolUse` s matcherem `mcp__serena__*` → `serena-hooks auto-approve --client=claude-code`,
- `SessionEnd` → `serena-hooks cleanup --client=claude-code`.

**Globální `~/.claude/CLAUDE.md`:** zkopíruj `setup/CLAUDE.global.md` (nebo jeho první sekci slouč se svým). Říká všem sessions i subagentům, že Serena je výchozí cesta k práci s kódem, s tabulkou „místo → použij“. Druhá sekce je příklad zvláštností stroje (zsh, roura přepisující návratovku, `grep` nad ripgrepem); napiš si vlastní.

### 4. Nastavení Claude Code

Slouč `setup/settings.snippet.json` do `~/.claude/settings.json` (nahraď `/Users/<user>`). Co jednotlivé klíče dělají:

- `extraKnownMarketplaces.claude-dev-pipeline` s `source: directory` na klon repa, `enabledPlugins["dev-pipeline@claude-dev-pipeline"]: true`.
- `autoContinueAtUsageLimit: true`: Workflow bloky po usage limitu pokračují samy, až se limit obnoví; bez toho běh nad ránem stojí.
- `agentPushNotifEnabled: true`: notifikace, když agent nebo Workflow skončí.
- `hooks`: čtyři hooky Sereny výše.
- `statusLine` s `refreshInterval: 30` (krok 8).
- Model a effort session: `/model` na nejsilnější dostupný (orchestrátor), effort `high` nebo `xhigh`. Agenti pipeline to nedědí, mají své; platí to i pro vize session, kde subagenty spouští skill přes tři agenty pluginu.
- `/autocompact 330k` napsané v session se uloží natrvalo (`autoCompactWindow: 330000` ve snippetu); `claude --autocompact 330k` platí jen pro jedno spuštění. Práh platí pro session i její subagenty: orchestrátor se zkompaktuje kolem 300k, kde model ještě drží kvalitu, a subagenty běhu předá nástupci hlídač kontextu dřív. Setup běhu hodnotu ohlásí a doporučí 330k, když je vyšší nebo se nedá zjistit.
- `sandbox.filesystem.allowWrite` s `~/dev-pipeline-feedback.md`: soubor s nálezy o pipeline leží v domovském adresáři, protože `~/.claude` je pro sandbox chráněná cesta a odemknout nejde. Bez sandboxu klíč neškodí.
- **Vypni pluginy, které běh nepotřebuje.** Výpis skillů a agentů všech zapnutých pluginů nese každý agent v systémovém promptu; v běhu CK-Go2 to bylo 34 kB na agenta, přes 200 agentů za běh.

Doporučené nastavení jazyka: `"language": "czech"`, pokud chceš zprávy běhu česky; texty pluginu jsou české.

### 5. Plugin dev-pipeline

```bash
claude plugin marketplace add ~/claude-dev-pipeline
claude plugin install dev-pipeline@claude-dev-pipeline
```

Nová session (registr agentů a Workflow se čte při startu). Ověření: `/dev-pipeline:` v promptu nabídne `vize`, `orchestrate`, `review-kolecko`, `prototyp`; `/workflows` zná `dev-pipeline:blok-prd`, `blok-stavby`, `blok-kolecko`.

**Refresh po editaci pluginu:** directory-source marketplace se kopíruje do cache a editace zdroje se do sessions nepropíše sama. Po změně zvedni `version` v `dev-pipeline/.claude-plugin/plugin.json` (při stejné verzi updater hlásí „already at latest“), pak `claude plugin update dev-pipeline@claude-dev-pipeline` a nová session. Při vývoji pluginu je jednodušší `claude --plugin-dir ~/claude-dev-pipeline/dev-pipeline`.

### 6. agent-browser (E2E v prohlížeči)

```bash
npm install -g agent-browser
agent-browser install          # stáhne prohlížeč
agent-browser doctor           # musí projít bez nálezu
```

E2E verifikátor s ním prochází scénáře krok za krokem (`agent-browser skills get core` si načte sám). Bez něj běh funguje, ale E2E degraduje na doložení kritérií bez prohlížeče. Ověřeno s 0.31.1.

### 7. Další pluginy z oficiálního marketplace

- **context7** (`claude plugin install context7@claude-plugins-official`): implement agent si přes něj načte aktuální dokumentaci knihovny, když pracuje s verzí, kterou nezná. Doporučeno.
- **claude-security** (`claude plugin install claude-security@claude-plugins-official`): bezpečnostní sken, který pipeline spouští **jen na vyžádání** (hlavička vize `bezpecnostni_sken: changes|codebase`). Jeho agenti mají `model: inherit`, běží tedy na modelu tvé session; na Fable session to je 100 a více agentů Fable xhigh. Volitelný.

### 8. Status line

```bash
cp ~/claude-dev-pipeline/setup/statusline.sh ~/.claude/statusline.sh && chmod +x ~/.claude/statusline.sh
```

a v `settings.json` `"statusLine": { "type": "command", "command": "bash ~/.claude/statusline.sh", "refreshInterval": 30 }` (je ve snippetu). Řádek ukáže model, zaplnění kontextu, větev a projekt, a při běhu segment živých agentů. Máš-li vlastní status line, přidej do ní jen posledních pět řádků skriptu.

### 9. Kontrola instalace

```bash
bash ~/claude-dev-pipeline/setup/check.sh            # OK / WARN / FAIL po krocích, návratový kód 1 při FAIL
bash ~/claude-dev-pipeline/dev-pipeline/hooks/tests/run.sh   # testy hooků
bash ~/claude-dev-pipeline/dev-pipeline/tests/sucho/run.sh    # suchý běh bloků
node ~/claude-dev-pipeline/dev-pipeline/scripts/wf-check.mjs ~/claude-dev-pipeline/dev-pipeline/workflows/*.js
```

**Suchý běh** spustí všechny tři Workflow bloky proti stubům agentů (odpověď podle labelu agenta) a projde jejich rozhodovací logiku bez jediného tokenu, včetně vzácných větví: předávka a vyčerpaný strop předávek, selhání části a opakování jen nehotových, požadavky mimo hranici, infra stop nasazení, diagnóza před třetím pokusem, obnova od fáze, bezpečnostní opravy, rozdělení E2E mezi verifikátory. Scénáře jsou v `dev-pipeline/tests/sucho/scenare/`; pusť ho po každé změně bloku.

### 10. Příprava cílového projektu

Pipeline čte projekt, nic mu nevnucuje. Co musí projekt mít, aby běh nedegradoval:

- **`CLAUDE.md`** s doktrínou (izolace dat, kanonické helpery, pasti platformy) a s **příkazy pro typecheck a testy**; do 400 řádků a zhruba 20 kB, každý agent ho nese v preambuli. Pravidla, ne deník: historie fází, stavy a výčty hotového patří do `docs/`. Setup nad limitem varuje.
- **Deploy runbook** (`docs/dev-runbook.md` nebo sekce Deploy v CLAUDE.md): postup nasazení, jak ověřit přihlášení CLI a účet (preflight na startu běhu), jak poznat terminální stav, zakázané okno nasazení s časovou zónou, behaviorální doklad. Bez něj běží řezy v režimu `commit-only` a nasazuješ ty.
- **Přístup do běžící aplikace pro E2E** (URL, přihlášení, testovací účet) v CLAUDE.md nebo runbooku. Prohlížeč běží bez okna, `--headed` do pokynů nepiš; profil prohlížeče musí přihlášení držet i tak. Bez přístupu E2E dokládá kritéria bez prohlížeče.
- **Pre-commit brána ve třech patrech** (doporučeno): staged jen `docs/**` a `*.md` → nic; typecheck a rychlé kontroly vždy; plná suita jen bez platného `docs/.verify-passed` (hash pracovního stromu bez `docs/` jako v `scripts/tree-hash.sh`; hook i skript musí počítat stejně). Vzor `.husky/pre-commit` v projektu Surya-PPC-Tool. Bez toho běh funguje, jen platí suitu dvakrát na řez.
- **Čistý pracovní strom** před startem; setup to vyžaduje. `docs/` a `.gitignore` doplní setup sám.
- **Povolení ve vizi** pro každý zápis do živého systému (účet, operace, meze), jinak se běh u takového řezu zastaví.

## Spuštění běhu

1. **Vize:** v projektu `claude`, pak `/dev-pipeline:vize` (nebo `/vize`). Výsledek je commitnutý `docs/vize/<slug>.md` s plánem řezů. Do hlavičky vize případně `bezpecnostni_sken: changes`, když chceš na konci sken claude-security.
2. **Nová session pro běh:**

   ```bash
   cd <projekt>
   claude --autocompact 330k
   ```

   `--autocompact 330k` nastaví práh automatického compactu na 330k tokenů (rozsah 100k až 1M), takže orchestrátor se zkompaktuje kolem 300k; v session jde totéž napsat jako `/autocompact 330k`. Orchestrátor compact sám neiniciuje; po compactu mu hook vrátí tabulku plánu a `PO-COMPACTU.md` a vizi si přečte znovu po sekcích (bez Funkčních požadavků a Tvaru UI, ty čtou PRD agenti). Zvol nejsilnější model (`/model`).
3. **Start:** napiš jako prompt `/dev-pipeline:orchestrate docs/vize/<slug>.md`. Musí to být prompt, ne příkaz z jiného místa: hook si z něj uloží identitu session, bez které setup neproběhne. Orchestrátor ověří přihlášení k nasazení (selhání ti řekne hned), vypíše pět řádků o vizi a spustí první blok PRD.
4. **Během běhu:** můžeš mu kdykoli napsat; odpoví z tabulky nebo pošle agenta, běh nepřeruší. Každých 30 minut uvidíš výstup `co-dela.sh --kratce`. Neposílej mu opravy ani úkoly do rozpracovaného řezu: vše, co víš navíc, mu řekni a on to předá dalším blokům jako hypotézu.
5. **Zastavení** ti přijde jako push notifikace. Po zastavení kvůli nasazení (přihlášení nebo účet CLI, výpadek platformy) oprav přístup a napiš orchestrátorovi: blok obnoví od nasazení a hotovou práci nepřehrává.
6. **Usage limit:** Workflow pokračuje sám (`autoContinueAtUsageLimit`), session stojí do resetu a pak jedná podle řádku `stav běhu:` v handoffu. Na běh mimo dohled slouží `scripts/limit-watcher.sh` v tmuxu. **Vypršelé přihlášení** nic neobnoví: `/login` musíš udělat ty; běžící Workflow do té doby padá na API chybách a po přihlášení ho orchestrátor spustí znovu s `resumeFromRunId`.
7. **Přerušení a navázání:** stav je v `docs/handoff.md`. Nová session v témže projektu s promptem `/dev-pipeline:orchestrate docs/vize/<slug>.md` pozná stejnou vizi, nic nearchivuje a naváže. Jen finální fázi spustíš argumentem `final`.
8. **Konec:** notifikace, `docs/zaverecna-zprava.md`, `stav běhu: hotovo`. Přečti zprávu, proklikej aplikaci, merge do main.

## Reference

### Skilly

| Skill | Kdo invokuje | Co dělá |
|---|---|---|
| `dev-pipeline:vize` | ty | debatní session nad vizí, na konci plán řezů, mantinely, Povolení, seznam UI ploch |
| `dev-pipeline:orchestrate` | ty, jako prompt | orchestrátor běhu; `final` spustí jen finální fázi |
| `dev-pipeline:review-kolecko` | orchestrátor ve finální fázi, nebo ty nad větší sérií změn | spustí `blok-kolecko`; nese recept pro sken claude-security na vyžádání |
| `dev-pipeline:prototyp` | ty | tři strukturálně různé UI varianty za `?variant=` (rozhoduješ ty) nebo TUI nad čistým modulem (rozhoduje měření); prototyp je jednorázový |
| `thermo-nuclear-code-quality-review` | agent `thermo-nuclear-review` | rubrika strukturálního auditu (hloubka modulů, švy, code-judo, test smazáním) |

### Agenti

| Agent | Model / effort | Role |
|---|---|---|
| `prd` | Opus high | PRD architekt (PRD a E2E scénáře podle řádku plánu, u velkého řezu kostra s Kontraktem a Částmi), autor části, zapracování nálezů s návratem změněných míst; kritéria jako vlastnost + měřidlo, ne výčet; do kódu odkazuje symbolem, ne číslem řádku |
| `prd-check` | Opus high | Nezávislá kontrola PRD (úplnost, validita proti kódu, kritéria s během měřidel, rozsah, optimalita); kostra (disjunktnost částí, kontrakt, odhady) a každá část zvlášť; delta kolo; refresh nad dnešním stromem |
| `implement` | Opus high (integrace medium) | TDD implementace v roli malý řez, kontrakt, část, integrace nebo oprava; část sahá jen do svých souborů; po restartu začíná inventurou stromu; testy k chování, ne k řezu; past ve svých souborech opravuje; hypotézy nerozšiřují PRD |
| `code-review` | Opus high | Korektnost; CONFIRMED/PLAUSIBLE a BLOKUJE/FOLLOW-UP; přísnější práh nad plochou zapisující do produkce; režim čočky pro kolečko; rozsah část nebo integrace (švy, duplicity mezi částmi); návrat jako balíčky po souborech, provázané soubory v jednom |
| `diagnose` | Opus high | Po dvou neúspěších: reprodukční smyčka a doložená příčina, neopravuje |
| `fix` | Opus medium | Oprava nálezů jako hypotéz v mezích Ne-cílů vize, třída místo výskytu; nikdy necommituje; odmítnutý blokující nález přeměří review 2; vrací změněná místa a rozšířený zásah |
| `thermo-nuclear-review` | Opus medium | Strukturální audit proti rubrice, doktríně projektu a Ne-cílům, nad řezem nebo jednou částí; BLOCKER/HIGH/NOTE |
| `e2e-verifier` | Opus medium | Kritéria proti běžící aplikaci, ne kódu (žádný worktree, instalace ani testy); prohlížeč bez okna; pod účtem člověka zapisuje jen podle Povolení a každý zápis doloží; nejdřív prostředí (nasazená revize), nikdy nenasazuje; PASS / PASS-částečně / FAIL, vadná kritéria s dokladem, nálezy mimo kritéria podle závažnosti; čísla přepočítává sám; kolo 2 jen FAIL, souběžně po skupinách sekcí do 12 kritérií |
| `deploy` | Sonnet medium, bez CLAUDE.md | Commit vlastního řezu a nasazení podle runbooku a pokynů majitele (přednost před skripty repa, Pages jen Production, migrace jen s dokladem); omezené smyčky, okno s rezervou, doložený stav; kroky po nasazení z PRD a zápis nasazení; bezpečnostní commity; selhání mimo kód hlásí zvlášť (`infra`); cizí práci nevrací; režim preflight jen ověří přihlášení |
| `doklad` | Sonnet medium | Jen když PRD předepisuje doklad před migrací: snímek dotčených dat dotazy jen pro čtení před nasazením |
| `verify` | Sonnet low, bez CLAUDE.md | Brána: typecheck, plná suita, kontroly pre-commit hooku a měřidla kritérií; skutečné výstupy s exit kódem; zelená zapíše `docs/.verify-passed` |
| `vize-validator` | Fable high | Čerstvé oči na konci: Cíle, zákazy, lešení, změny plánu, detaily |
| `plan-check` | Opus high | Mimo běh: post-implementační kontrola plánu, read-only |
| `pruzkum` | Sonnet medium | Vize session: fakta z kódu, dat a dokumentů projektu s citacemi; neposuzuje |
| `reserse` | Opus high (Fable na vyžádání) | Vize session: cizí API a knihovny (context7, web), svět venku, právní a produktová rešerše; podklad, ne návrh mechanismů |
| `cerstve-oci` | Opus high | Vize session: čtení hotové vize z přidělené role; vrací i nejisté nálezy, BLOKUJE jen to, co PRD agent z vize a kódu sám nerozhodne, ostatní ZDRŽUJE |

### Workflow bloky a skripty

- `workflows/blok-prd.js`, `blok-stavby.js`, `blok-kolecko.js`: argumenty a návraty v `skills/orchestrate/KONTRAKT.md`. Syntaxi kontroluje `scripts/wf-check.mjs` (skripty mají top-level `return`, holý `node --check` je odmítne).
- `scripts/orchestrate-setup.sh`: setup běhu (čistý strom, archiv předchozí vize do `docs/archive/<slug>/` a reportů do `docs/reviews/_archiv/<slug>/`, `.gitignore` a `.prettierignore`, větev, marker, handoff s plánem, jediný commit, mapa sekcí vize, kontrola nastavení Claude Code).
- `scripts/co-dela.sh`: co agenti dělají, jejich kontext a fronta těžkých příkazů (plný, `--kratce` pro cron s hlavičkou běhu a fázemi, `--status` pro status line).
- `scripts/tezky.py`: fronta těžkých příkazů (`vezmi`, `vrat`, `stav`); volá ji hook `fronta-tezkych.sh`.
- `scripts/verify-marker.sh`, `scripts/tree-hash.sh`: marker zelené brány a hash stromu bez `docs/`.
- `scripts/limit-watcher.sh`: hlídač usage limitu pro běh mimo dohled (tmux).
- `scripts/module-health.py`: měření poctivosti barelů pro thermo review.
- `scripts/test-guard.py`, `hooks/tests/run.sh`: testy hooků.
- `tests/sucho/run.sh`: suchý běh bloků se stuby agentů podle labelu (scénáře v `tests/sucho/scenare/`).

### Co dál mám na stroji (mimo plugin)

Pipeline to nepotřebuje, ale hodí se vědět, s čím byla laděná: pluginy `frontend-design`, `skill-creator`, `security-guidance`, `claude-md-management`, `claude-code-setup` z oficiálního marketplace (osobní použití, běh je nevolá); `typescript-lsp` vypnutý (Serena pokrývá totéž přes language server); Claude in Chrome (E2E ho nepoužívá, verifikátor běží přes `agent-browser`); terminál Warp (status line kreslí Claude Code sám, terminál na tom nic nemění). Nastavení `~/.claude/settings.json` bez osobních klíčů je v `setup/settings.snippet.json`.

## Brána projektu (pre-commit)

Z analýzy běhu sklik: 362 commitů, 55 % bez změny kódu (docs, build marker), plná suita ~5 min a rostla o minutu týdně; agenti navíc pouštěli plnou suitu opakovaně ve fix fázích. Od verze 1.0.0 běží plná suita jednou na řez (verify) a projekt má mít pre-commit hook ve třech patrech (krok 10 instalace). Bez něj běh funguje, jen platí suitu dvakrát.

## Zásady, které přežily měření

- **Nálezy jdou do souborů, návraty jsou strojové.** Reporty do `docs/reviews/` (gitignorováno), orchestrátor je nikdy nečte; schémata návratů vynucují Workflow bloky.
- **Kód se čte symbolem** (Serena), ne celými soubory; guard to u velkých zdrojových souborů vynutí i přes `cat` a `sed`.
- **Kritérium je vlastnost s měřidlem, ne výčet jmen.** Kritérium nad kódem má měřidlo v repu a značku [měřidlo] a měří ho brána nad odevzdávaným stromem; E2E ověřuje jen chování běžící aplikace. Starší revize se měří jen přes git objekty (`git show`, `git grep <rev>`), nikdy přes worktree a instalaci.
- **Brána měří totéž co commit.** Exit kód čtený zvlášť, nikdy přes rouru; aspoň jeden prošlý test; kontroly pre-commit hooku a měřidla kritérií. Zelená nad neproběhlým měřením je červená.
- **Agenti o limitu kontextu nevědí.** Prompty, soubory agentů ani schémata kontext nezmiňují, aby nad ním agent nepřemýšlel a nekončil předčasně; předávku mu nařídí až hook.
- **Testy patří k chování, ne k řezu.** Žádné soubory pojmenované po řezu; verifikační lešení se po ověření maže.
- **Past se opravuje, ne dokumentuje.** CLAUDE.md projektu jsou pravidla, ne deník běhu; finální fáze hlásí, co v něm během běhu přibylo.
- **Záporné kritérium se dokládá mutací, ne zelenou.** Kritérium o umístění má obě půlky. Mutace se vrací opačnou editací, nikdy `git checkout`, `restore`, `stash` ani `reset`.
- **Bezpečnostní nález se opravuje hned**, i pre-existing, samostatným commitem; fix agent necommituje, commit udělá krok commitu až po zelené bráně.
- **Na agenta se nečeká pollingem**; notifikace přijde sama, cron je záchranná síť. Dlouhé příkazy na pozadí přes `Monitor`, nikdy `while ! grep … sleep` (Claude Code smyčku po timeoutu přesune na pozadí a přežije agenta).
- **Ne-cíle vize platí pro každou fázi**, i pro opravy a review.
- **Jedna vize v čase per projekt** (sdílená produkce, sdílený limit).
- **Cizí nástroje na šetření tokenů** (proxy komprese, přesměrování čtení na jiný model) se nepoužívají: za cizí base URL Claude Code přijde o 1M kontext a předplatné je šedá zóna, a komprese výstupů by u kódu ušetřila jednotky procent. Rozbor je v interní analýze běhu sklik, mimo repo.

## Změny

- **1.4.1 (29. 9. 2026)** — z auditu promptů (`/doctor prompt-audit`) a `claude plugin validate`. **Filtry nálezů:** `plan-check` a `prd-check` hlásí i nejisté nálezy se značkou jistoty (1.3.0 filtr odstranila jinde, tyhle dva minula); thermo rubrika už předem netvrdí, že „code judo“ obvykle existuje. **Deploy** na Sonnet medium (Sonnet 5.5 má úrovně effortu přepočítané; deploy je dlouhý řetězec s doklady). **Rozpory:** čekání na proces na pozadí jednotně (vlastní dlouhý příkaz přes `Monitor`, vnější stav smyčkou se stropem, smyčka bez stropu nikdy); code-review a thermo čtou soubor do 350 řádků celý a větší po symbolech a částech (práh guardu); implement zná práh 350. **Skill prototyp** odpovídá dnešní architektuře: autonomní běh UI neprototypuje, plocha mimo vizi běh zastaví; UI část bez stacku jednoho projektu. **Prompty** bez jmen běhů a čísel řezů (pravidla a jejich důvody zůstávají). **Modely:** agenti dál jen se zkratkou modelu, nový model převezmou sami; README a `setup/check.sh` k `ANTHROPIC_SMALL_FAST_MODEL` (jediná pevná verze). **Manifesty:** `${CLAUDE_PLUGIN_ROOT}` v příkazech hooků v uvozovkách, popis marketplace.
- **1.4.0 (29. 9. 2026)** — z interní analýzy běhu bez-dluhu (35 bodů) a třídění deníku vad pipeline (všech 18 otevřených tříd). **Kontext agentů:** velký řez se staví po částech (PRD architekt píše kostru s Kontraktem a Částmi, autoři částí souběžně PRD částí, kontrola kostry a každé části zvlášť; ve stavbě kontrakt, části souběžně podle závislostí, integrace, review a thermo po částech a integrační review, další pokus jen nehotových částí); štafeta: hook `hlidac-kontextu.sh` vyzve subagenta nad 250k k předávce a nad 290k pustí jen ji, blok spustí nástupce (nejvýš 3 předávky), měření v `docs/.kontext.jsonl`; PRD agenti čtou výřez vize; agenti o limitu nevědí; orchestrátor na `--autocompact 330k` se stálými args v `docs/.run-args.json`. **Stroj:** fronta těžkých příkazů s váhami (`fronta-tezkych.sh`, `scripts/tezky.py`); E2E neověřuje kód (žádný worktree, instalace ani suita), prohlížeč bez okna; E2E verifikátor na každou skupinu sekcí do 12 kritérií. **Brána:** zelená jen s exit kódem 0 a aspoň jedním prošlým testem, spouští kontroly pre-commit hooku a měřidla kritérií [měřidlo]. **Nasazení:** preflight přihlášení při setupu, kroky po nasazení z PRD, zápis nasazení samostatným commitem, commit řezu doslova a ověřený uzavřením, infra selhání zastaví blok bez započtení pokusu, deploy v dalším pokusu zná příčinu předchozího selhání. **Bezpečnost:** fix agent necommituje, `fix(security)` commitne krok commitu po zelené bráně a uzavření ověří hashe. **Obnova:** arg `obnova` pro stavbu i kolečko, aby resume nevrátil z cache neplatnou bránu nebo deploy; `max_pokusu` (mini-řezy finální fáze 1), diagnóza jen před třetím pokusem. **Staré třídy:** restart a nástupce začínají inventurou stromu, tah končí jen strukturovaným návratem, handoff čte jen orchestrátor, oprava třídy místo výskytu, odmítnutý blokující nález přeměří review 2, poslední opravné kolo jen zúžením, provázané soubory v jednom balíčku, prd-check přeměřuje tvrzení o cizím kódu, E2E vadné kritérium „scénář zastaral po opravě“ a čitelnost jako FAIL, PRD odkazuje symbolem, ne číslem řádku, deploy uzná druhý doklad odložený nebo neexistující, commit s pre-commit branou s dlouhým timeoutem a bez `--no-verify`. **Guardy:** orchestrátor smí do `~/dev-pipeline-feedback.md`, blast-radius blokuje nechráněné `rm` s proměnnou (dotaz Claude Code na mazání stál běh 40 minut) a nasazení pozná jako spouštěný příkaz, timeout hooků 30 s; jména souborů agentů česky (Claude Code subagentům blokuje `summary`, `findings`, `analysis`, `report-…`). **Orchestrátor:** push při každém zastavení a nový důvod zastavení (g) pro selhání nasazení mimo kód; řezy dělí jen kvůli riziku a závislostem a smí sloučit malé sousední; pevný blok po řezu s částmi, předávkami a kontextem. **Vize:** čerstvé oči s triáží do tří košů, další kolo jen s rozhodnutím pro uživatele, čtvrté jen s jeho souhlasem; Povolení s identitou a nikdy jako drobnost k potvrzení; bezpečnostní vada nalezená ve vizi je hlavní rozhodnutí. **Nástroje:** suchý běh bloků se stuby agentů (`dev-pipeline/tests/sucho/run.sh`); `co-dela.sh` ukazuje části, nástupce, kontext a frontu a pozná obnovený Workflow.
- **1.3.0 (23. 9. 2026)** — přechod na Opus 5.5 podle příručky Anthropicu (sekce Opus 5.5 a audit promptů): agenti s `model: opus` běží na Opus 5.5 bez změny kódu (zkratka, ověřeno z transkriptu), effort subagentů zůstává; code-review a bezpečnostní review v kolečku nezahazují nejisté nálezy, hlásí je jako PLAUSIBLE a třídí se až za reviewerem; thermo hlásí všechny strukturální nálezy a třídí je značkami, rubrika bez výzvy k přehnané důkladnosti; `cerstve-oci` vrací i nejisté nálezy s označením, co blokuje, a kolo čerstvých očí končí, když nic neblokuje; skill vize bez pobídky k pěti až osmi průzkumným agentům; tabulky modelů v KONTRAKT a README bez čísel verzí; orchestrátor se nepopisuje jako nejsilnější model.
- **1.2.0 (22. 9. 2026)** — z interní analýzy běhu doplneni-webu na CK-Go2 (21 bodů): setup najde plán řezů i za podnadpisy a vybere tabulku se sloupcem `#`, hlásí chybějící nastavení (`autoContinueAtUsageLimit`, autocompact), vypíše mapu sekcí vize a doplní `.prettierignore`; bloky přijmou řez 0; orchestrátor smí číst `produkt.md`, čte vizi po sekcích a v cronu píše dvě věty; `co-dela.sh` počítá živé agenty podle klíče (stall restart), ukazuje jméno řezu, pokus, fázi i/N a důvod selhání; deploy agent bere pokyny majitele jako závazné, u Pages ověřuje Production, migraci aplikuje jen s dokladem a cizí práci nevrací (blast-radius guard během běhu blokuje `git stash`, `git clean` a `checkout`/`restore` nad `docs/`); e2e-verifier ověří prostředí a nikdy nenasazuje; nová fáze Doklad s agentem `doklad`; E2E kolo 2 jen nad FAIL, nad 12 kritérií dva verifikátoři; lehký profil řezu; PRD závislého řezu souběžně s PRD stavěného řezu jako kontraktem; refresh PRD jen při překryvu oblastí a na Opus medium; delta kontrola PRD jen po blokujících nálezech; follow-ups a vize-spory se čtou grepem po oblastech a nové položky nesou značku oblasti; tři agenti pro vize session (`pruzkum`, `reserse`, `cerstve-oci`), popis skillu vize zúžený; feedback soubor v `~/dev-pipeline-feedback.md` (sandbox); sklizeň necommituje.
- **1.1.0 (18. 9. 2026)** — z interní analýzy běhu uklid-po-sklik (26 bodů): blok stavby odvozuje verdikt E2E z počtů, zná stav „vada kritéria“, dělá refresh PRD nad dnešním stromem, dává všem agentům Ne-cíle vize, jména reportů nesou číslo pokusu, uzavření sesouhlasí thermo a doklady; blok PRD spouští měřidla kritérií už v kole 1 a má režim zapracování; nový Workflow `blok-kolecko` nahrazuje kolečko z 38 volání Agent v session; sken claude-security jen na vyžádání; orchestrátor drží výhled PRD jeden řez, `hypotezy.text` nerozšiřuje PRD, kolize a vadná kritéria jdou majiteli jako otázky s navrženou odpovědí, cron ukazuje `co-dela.sh --kratce`, `TaskOutput` jen na dokončený Workflow, úklid úloh na pozadí před `hotovo`; deploy čeká na okno s rezervou a omezenou smyčkou a commituje jen docs vlastního řezu; `scripts/co-dela.sh` a segment ve status line; adresář `setup/` s návodem, snippetem nastavení, status line, globálním CLAUDE.md a kontrolou instalace.
- **1.0.1 (17. 9. 2026)** — hash markeru verify bez `docs/`, `hypotezy.text` pro blok stavby.
- **1.0.0 (16. 9. 2026)** — orchestrátor v session, dva Workflow bloky, hooky běhu.
- **0.9.x (srpen až září 2026)** — pipeline řízená promptem v jedné session; rozbor v interní analýze běhu sklik, mimo repo.
