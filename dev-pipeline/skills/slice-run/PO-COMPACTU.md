# Kanonické kroky, které se ztrácejí compactem

Tenhle blok injektuje hook `session-start-handoff.sh` po každém compactu, vedle handoffu, a jen když běží autonomní běh (`docs/.orchestrator-run`).

Existuje proto, že `orchestrate/SKILL.md` se čte **jen jednou při invokaci** a compact ho nezachová. Doloženo měřením ostrého běhu: za tři řezy a dva compacty orchestrátor znovu nepřečetl ani `PIPELINE.md`, přestože mu to SKILL.md výslovně nařizuje — a souběžné psaní PRD proto proběhlo jen u prvního řezu, než přišel první compact. Spoléhat na to, že si orchestrátor po compactu sám něco dočte, nefunguje; injektovat to musí kód.

Drž tenhle soubor krátký. Jde do kontextu po každém compactu, takže sem patří jen to, co se prokazatelně ztrácí a co má okamžitý dopad na chování běhu.

## 1. PIPELINE.md čti znovu z disku

Na začátku každého dalšího řezu přečti kanonický `PIPELINE.md` z disku (absolutní cestu připojuje hook na konec tohoto bloku). Jedeš podle verze na disku, ne podle toho, co ti z procesu zbylo v komprimované historii — uživatel skilly upravuje za běhu.

## 2. Souběh: blok fází 1+2 dalšího řezu běží na pozadí (není to volba)

Jakmile řez N doběhne **fázi 3** (implementace hotová, kód leží v pracovním stromě), spusť na pozadí (`run_in_background: true`) **celý blok fází 1 a 2 pro řez N+1** jako jeden řetěz: PRD agent → prd-check → PRD-fix → prd-check kolo 2 → PRD-fix. Jeden background agent, který si ty kroky odjede sám a vrátí hotové PRD.

- Fáze 4, 5, 6 a 7 řezu N běží mezitím normálně. Na PRD řezu N+1 nesahají, takže si nekolidují.
- Hranice je **po fázi 3**, ne po fázi 4: teprve tam vidí PRD i prd-check skutečný kód řezu N. Dřív by psaly proti stavu, který ještě neexistuje.
- **Když E2E řezu N vrátí FAIL**, hotové PRD zahoď a po opravě ho nech napsat znovu. Stálo nad stavem, který neplatí.
- Nikdy nespouštěj **implementaci** N+1 souběžně s čímkoli z N. Paralelní je pouze psaní dokumentu.
- Dva řezy najednou nikdy — sdílená produkce.

Proč to není volitelné: blok fází 1+2 trvá v ostrém běhu okolo 1 h 45 min, okno fází 4 až 7 je 4 h 30 min. Sériově je to nejdražší část řezu, souběžně stojí nula.

## 3. Stropy session

- **Počet subagentů se nepočítá.** Strop ~200 na session už neplatí a žádné počítadlo si nevedeš; vize běžně spotřebuje stovky agentů. Vynucené jsou jen souběžnost (20 najednou), hloubka zanoření a dolarový rozpočet.
- **Zastavuješ se na kontextu, ne na agentech.** Když systém ohlásí blížící se compact, usage limit nebo vyčerpaný rozpočet, dokonči běžící řez, uzavři ho fází 7, přepiš handoff a zastav se.
- **Compact nikdy neinicuj sám a nenabízej ho.** Když si ho uživatel vyžádá, dokonči rozdělaný řez celý včetně fáze 7, přepiš handoff, další řez nezačínej a zastav se.

## 4. Disciplína kontextu

- **Nikdy nečti obrázek** — jeden screenshot je přes 100k tokenů. Vizuální kontrolu dělají subagenti a vracejí popis.
- Diffy, velké soubory a celé reporty subagentů nečti **znovu**; pracuj se souhrny, které vrátili. (Vizi a PIPELINE.md číst smíš — ty potřebuješ k rozhodování.)
- **Zadání agentovi ~1 200 znaků, strop 2 000**: cesty, hranice role, tři až pět řádků specifik. Nikdy do něj neopisuj obsah PRD, diff ani report — agent si je přečte sám z cesty. Delší kontext napiš do souboru a pošli cestu.
- **Produkční kód needituješ.** Vlastní Edit/Write jen na stavové soubory; i jednořádkovou opravu pošli fix agentovi. Do journalu a follow-ups zapisuj Bash heredocem, ne Editem; handoff drž pod 2 kB.
- **Na běžícího agenta se nečeká pollingem** — notifikace přijde sama. Žádný `sleep`, žádné smyčky nad `git status`, žádný `tail` na `tasks/<id>.output` (u agenta je to symlink na celý transcript). Na externí stav (deploy, CI) jedna background Bash s `until`-smyčkou nebo `Monitor`.
- Žádné otázky na uživatele během běhu — rozhoduj podle vize, odchylky žurnaluj.
