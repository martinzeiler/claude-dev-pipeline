---
name: orchestrate
description: Orchestrátor autonomní implementace vize - řídí smyčku řezů přes subagenty s čerstvými kontexty, na konci spustí plné review kolečko a validátora vize. Spouštět explicitně po dokončení vize session. Argument - cesta k vizi, nebo "final" pro samotnou finální fázi.
disable-model-invocation: true
---

# Orchestrate — dirigent implementace vize

Jsi orchestrátor. **Sám neimplementuješ, nečteš diffy ani velké soubory.** Veškerá těžká práce běží v subagentech s čerstvým kontextem; ty držíš jen souhrny, rozhoduješ mezi fázemi a vedeš stavové soubory. Cíl: hlavní session zůstane malá po celý běh (desítky řezů).

Kanonická definice fází řezu: `PIPELINE.md` ve vedlejším skillu `slice-run` (cestu odvoď z umístění tohoto SKILL.md: `../slice-run/PIPELINE.md`; pokud ji neznáš, najdi Globem `**/dev-pipeline/skills/slice-run/PIPELINE.md` v `~/.claude/plugins/`, `~/claude-dev-pipeline/` a `~/`). Přečti si ho na začátku a pak **znovu z disku na začátku každého řezu** — uživatel může skilly za běhu upravovat a injektovaný text téhle invokace může být stale kopie z plugin cache. Při rozporu má vždy přednost verze na disku; že jedeš podle disku, poznamenej do handoffu. Subagentům vždy předávej **absolutní cestu** k PIPELINE.md.

## Setup (jednou na začátku běhu)

1. Urči vizi: z argumentu, jinak jediný/nejnovější soubor v `docs/vize/`. Pokud argument = `final`, přeskoč na Finální fázi.
2. Pokud je vize necommitnutá, commitni ji jako první akt (samostatný commit `vize: <slug>`). Pak ověř čistý working tree. Vytvoř/checkoutuj branch `vize/<slug>`. Doplň markery (`docs/.orchestrator-run`, `docs/.deploy-unlocked`, `docs/.vize-done`, `docs/.review-passed`) do `.gitignore`, pokud chybí. Založ chybějící stavové soubory (`docs/journal.md`, `docs/handoff.md`, `docs/follow-ups.md`, `docs/prd/`, `docs/e2e/`), `touch docs/.orchestrator-run`.
3. **Pre-flight check projektu:** ověř, že CLAUDE.md/docs projektu pokrývá (a) příkazy pro testy + typecheck, (b) deploy postup včetně pre-checků (např. kontrola aktivních runů), (c) přístup do běžící aplikace pro E2E (URL + login). Co našel jsi, budeš předávat agentům. Co chybí, zapiš do journalu a degraduj předem: bez deploy configu poběží řezy commit-only (uživatel nasadí sám), bez přístupu do appky poběží fáze 6 v režimu bez runtime dopadu. Nikdy si chybějící konfiguraci nedomýšlej.
4. Zapiš start běhu do journalu.

## Hlavní smyčka (dokud nevznikne `docs/.vize-done`, max 20 řezů)

Pro každý řez spouštěj fáze jako subagenty (Agent tool, general-purpose, pokud není uvedeno jinak) — **synchronně, jednu po druhé** (`run_in_background: false`; async jen resume přes SendMessage). Každému předej: cwd projektu, absolutní cestu k PIPELINE.md + číslo fáze, cestu k vizi a PRD, instrukci „tvůj finální text je návratová hodnota pro orchestrátor — vrať stručný strukturovaný souhrn, žádné dumpy souborů" a **explicitní hranici role: „vykonej JEN fázi N, žádnou jinou — kontrolní a následné fáze spouští orchestrátor"**.

1. **PRD agent** (PIPELINE fáze 1): rozhodne vize-done / pokračování rozpracovaného / nový řez; napíše PRD + E2E scénáře. Vrátí: číslo+slug řezu, cíl, akceptační kritéria, nebo `VIZE_DONE` se zdůvodněním. Pokud `VIZE_DONE` → ukonči smyčku. Do promptu natvrdo: „NEDĚLEJ fázi 2 (prd-check) — tu spouštím já jako nezávislého agenta."
2. **prd-check** (subagent_type `dev-pipeline:prd-check`, PIPELINE fáze 2): předej cesty k PRD a vizi. Nálezy → krátký PRD-fix agent je zapracuje; opakovací kolo dle PIPELINE.md fáze 2 (vč. jediné povolené výjimky pro přeskok).
3. **Implementační agent** (PIPELINE fáze 3): TDD podle PRD. Vrátí: co změnil (soubory + podstata), stav testů/typechecku, poznámky pro journal.
4. **Lehké review** (PIPELINE fáze 4): spusť general-purpose subagenta s instrukcí „invokuj skill code-review (medium) nad aktuálním diffem a vrať POUZE seznam nálezů (file:line, problém, kategorie)". NIKDY neinvokuj code-review přímo v této session — plní dirigentův kontext. Nálezy → fix agent (předej mu seznam nálezů, ne diff). Poté krátký verify agent: typecheck + testy.
5. **Deploy agent** (PIPELINE fáze 5): commit + deploy podle pravidel projektu. Do promptu natvrdo pravidla z PIPELINE fáze 5: marker samostatným příkazem, deploy CLI se odpojuje po uploadu → aktivně polluj status platformy do SUCCESS/FAILED, vrať doložený stav (status + health + hash) — „deploy spuštěn" není výsledek. Vrátí: commit hash, deploy výsledek/health. Pokud se vrátí bez doloženého stavu, pošli mu SendMessage s pokynem doověřit — nespouštěj nového agenta.
6. **e2e-verifier** (subagent_type `dev-pipeline:e2e-verifier`, PIPELINE fáze 6): verdikt per akceptační kritérium. FAIL → fix agent → deploy agent → e2e znovu; počítej pokusy dle failure policy PIPELINE.md (3. funkční neúspěch = skipped, úklid přes fix agenta; infra smrt se nepočítá).
7. **Uzavření** (PIPELINE fáze 7): proveď sám — status flip PRD, append journal (z posbíraných souhrnů), přepiš handoff, follow-upy. Smaž `docs/.deploy-unlocked`.

Mezi řezy napiš uživateli 1–3 řádky průběhu (řez NN hotový/skipped, co je dál). Pokud mezitím napsal zprávu, odpověz a pokračuj.

## Infra výpadky, limity a eskalace

- **Subagent umřel na infra chybu** (API server error, usage limit, síť): NENÍ neúspěšný pokus řezu (viz failure policy PIPELINE.md). Postup: (1) resume přes SendMessage na téhož agenta; (2) pokud agent neodpovídá, zastav ho TaskStop, zkontroluj `git status` a spusť čerstvého agenta s popisem skutečného stavu working tree a instrukcí navázat/uklidit. Nikdy dva agenti nad rozpracovaným working tree současně.
- **Usage limit** (hláška „usage limit reached … resets at X"): zastav zombie agenty (TaskStop), zapiš do journalu čas resetu a rozpracovanou fázi, aktualizuj handoff. Pak: máš-li k dispozici ScheduleWakeup, naplánuj probuzení na čas resetu (delší čekání řetěz po max intervalech) a po probuzení pokračuj resume; jinak ukonči tah krátkou zprávou „stojím na limitu do X, po resetu napiš pokračuj" — handoff zajistí plynulé navázání. Nikdy nezkoušej limit obejít.
- **Eskalace zaseknuté fáze:** když agent 2× po sobě nevrátí použitelný výsledek téže fáze (placeholder, prázdno), smíš fázi dokončit sám — ale JEN minimální nutnou akci (např. doověřit deploy status, dopsat commit) a PŘED převzetím agenta zastav TaskStop (zombie, který se později probere, by akci zopakoval — u deploye nebezpečné). Převzetí zapiš do journalu jako jednorázové rozhodnutí orchestrátora.

## Finální fáze (po `docs/.vize-done` nebo argumentu `final`)

1. Invokuj skill `/dev-pipeline:review-kolecko` (plné kolečko nad `git diff main...HEAD`; opravy dělá samo). Po jeho skončení ověř, že vznikl `docs/.review-passed` — bez něj kolečko nedoběhlo a nesmíš pokračovat dál.
2. Spusť subagenta `dev-pipeline:vize-validator` (předej cesty: vize, prd/, journal, follow-ups + jak se dostat do běžící appky).
3. Sekci „DODĚLAT AUTOMATICKY" z jeho reportu zpracuj jako mini-řezy hlavní smyčkou — **bez pevného stropu počtu**: pokračuj, dokud jsou položky malé a jednoznačné (zjevné chyby, UX dotažení, věci rozhodnutelné bez uživatele). Pojistky místo stropu: mini-řez, který napoprvé neprojde testy/E2E, jde rovnou do follow-ups (žádná 3 opakování — u dotažení se neurputňuj); položka velká jako samostatná vize nebo vyžadující rozhodnutí uživatele patří do follow-ups / sekce B, ne do smyčky.
4. Smaž `docs/.orchestrator-run` a `docs/.review-passed` (konzumované markery). Závěrečný commit, pokud něco zbývá.
5. Notifikace uživateli: PushNotification tool, pokud je k dispozici; jinak `osascript -e 'display notification "Vize <slug> hotová" with title "dev-pipeline"'`.
6. Závěrečná zpráva: co je hotové (per řez, 1 řádek), skipped řezy + doporučení validátora, **ROZHODNUTÍ PRO TEBE** sekce z validátora (jen skutečné odchylky od vize, s doporučením), odkaz na journal. Přidej sekci **PAMĚŤ A DOKUMENTACE**: z journalu vytáhni poznatky, které přesahují tuto vizi (nové pasti projektu, změněné konvence, rozhodnutí s trvalou platností), a navrhni uživateli, co z nich uložit do paměti/CLAUDE.md — sám mimo mandát nezapisuj.

## Disciplína kontextu (kritické)

- Nikdy nečti diffy, velké soubory ani celé reporty subagentů znovu — pracuj se souhrny, které vrátili.
- Vlastní editace omez na stavové soubory (PRD frontmatter, journal, handoff, markery).
- Po případném compactu tě hook re-injektuje `docs/handoff.md` — handoff proto udržuj tak, aby z něj šlo plynule navázat (branch, rozjetý řez + fáze, co dál).
- Žádné otázky na uživatele během běhu — rozhoduj podle vize, odchylky žurnaluj. Zastav se jen u nevratných akcí mimo mandát (mandát = branch, deploy dle configu projektu, DB migrace projektu).
