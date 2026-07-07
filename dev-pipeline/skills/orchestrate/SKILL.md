---
name: orchestrate
description: Orchestrátor autonomní implementace vize - řídí smyčku řezů přes subagenty s čerstvými kontexty, na konci spustí plné review kolečko a validátora vize. Spouštět explicitně po dokončení vize session. Argument - cesta k vizi, nebo "final" pro samotnou finální fázi.
disable-model-invocation: true
---

# Orchestrate — dirigent implementace vize

Jsi orchestrátor. **Sám neimplementuješ, nečteš diffy ani velké soubory.** Veškerá těžká práce běží v subagentech s čerstvým kontextem; ty držíš jen souhrny, rozhoduješ mezi fázemi a vedeš stavové soubory. Cíl: hlavní session zůstane malá po celý běh (desítky řezů).

Kanonická definice fází řezu: `PIPELINE.md` ve vedlejším skillu `slice-run` (cestu odvoď z umístění tohoto SKILL.md: `../slice-run/PIPELINE.md`; pokud ji neznáš, najdi Globem `**/dev-pipeline/skills/slice-run/PIPELINE.md` v `~/.claude/plugins/` a `~/`). Přečti si ho jednou na začátku — kontrakt souborů a fáze z něj platí doslova. Subagentům vždy předávej jeho **absolutní cestu**.

## Setup (jednou na začátku běhu)

1. Urči vizi: z argumentu, jinak jediný/nejnovější soubor v `docs/vize/`. Pokud argument = `final`, přeskoč na Finální fázi.
2. Ověř čistý working tree. Vytvoř/checkoutuj branch `vize/<slug>`. Založ chybějící stavové soubory (`docs/journal.md`, `docs/handoff.md`, `docs/follow-ups.md`, `docs/prd/`, `docs/e2e/`), `touch docs/.orchestrator-run`.
3. Přečti si z CLAUDE.md projektu sekci o deploy + specifické pre-checky (např. kontrola aktivních runů před deployem) — budeš je předávat deploy agentům.
4. Zapiš start běhu do journalu.

## Hlavní smyčka (dokud nevznikne `docs/.vize-done`, max 20 řezů)

Pro každý řez spouštěj fáze jako subagenty (Agent tool, general-purpose, pokud není uvedeno jinak). Každému předej: cwd projektu, absolutní cestu k PIPELINE.md + číslo fáze, cestu k vizi a PRD, a instrukci „tvůj finální text je návratová hodnota pro orchestrátor — vrať stručný strukturovaný souhrn, žádné dumpy souborů".

1. **PRD agent** (PIPELINE fáze 1): rozhodne vize-done / pokračování rozpracovaného / nový řez; napíše PRD + E2E scénáře. Vrátí: číslo+slug řezu, cíl, akceptační kritéria, nebo `VIZE_DONE` se zdůvodněním. Pokud `VIZE_DONE` → ukonči smyčku.
2. **plan-check** (subagent_type `plan-check`, PIPELINE fáze 2): předej cestu k PRD s poznámkou, že jde o kontrolu plánu před implementací (úplnost vůči vizi, optimálnost, intent fit). Nálezy → krátký PRD-fix agent je zapracuje.
3. **Implementační agent** (PIPELINE fáze 3): TDD podle PRD. Vrátí: co změnil (soubory + podstata), stav testů/typechecku, poznámky pro journal.
4. **Lehké review** (PIPELINE fáze 4): invokuj skill `/code-review` (medium). Nálezy → fix agent (předej mu seznam nálezů, ne diff). Poté krátký verify agent: typecheck + testy.
5. **Deploy agent** (PIPELINE fáze 5): commit + deploy podle pravidel projektu. Vrátí: commit hash, deploy výsledek/health.
6. **e2e-verifier** (subagent_type `e2e-verifier`, PIPELINE fáze 6): verdikt per akceptační kritérium. FAIL → fix agent → deploy agent → e2e znovu; počítej pokusy dle failure policy PIPELINE.md (3. neúspěch = skipped, úklid přes fix agenta).
7. **Uzavření** (PIPELINE fáze 7): proveď sám — status flip PRD, append journal (z posbíraných souhrnů), přepiš handoff, follow-upy. Smaž `docs/.deploy-unlocked`.

Mezi řezy napiš uživateli 1–3 řádky průběhu (řez NN hotový/skipped, co je dál). Pokud mezitím napsal zprávu, odpověz a pokračuj.

## Finální fáze (po `docs/.vize-done` nebo argumentu `final`)

1. Invokuj skill `/dev-pipeline:review-kolecko` (plné kolečko nad `git diff main...HEAD`; opravy dělá samo).
2. Spusť subagenta `vize-validator` (předej cesty: vize, prd/, journal, follow-ups + jak se dostat do běžící appky).
3. Sekci „DODĚLAT AUTOMATICKY" z jeho reportu zpracuj jako mini-řezy hlavní smyčkou (max 5, pak stop — zbytek do follow-ups).
4. Smaž `docs/.orchestrator-run`. Závěrečný commit, pokud něco zbývá.
5. Notifikace uživateli: PushNotification tool, pokud je k dispozici; jinak `osascript -e 'display notification "Vize <slug> hotová" with title "dev-pipeline"'`.
6. Závěrečná zpráva: co je hotové (per řez, 1 řádek), skipped řezy + doporučení validátora, **ROZHODNUTÍ PRO TEBE** sekce z validátora (jen skutečné odchylky od vize, s doporučením), odkaz na journal.

## Disciplína kontextu (kritické)

- Nikdy nečti diffy, velké soubory ani celé reporty subagentů znovu — pracuj se souhrny, které vrátili.
- Vlastní editace omez na stavové soubory (PRD frontmatter, journal, handoff, markery).
- Po případném compactu tě hook re-injektuje `docs/handoff.md` — handoff proto udržuj tak, aby z něj šlo plynule navázat (branch, rozjetý řez + fáze, co dál).
- Žádné otázky na uživatele během běhu — rozhoduj podle vize, odchylky žurnaluj. Zastav se jen u nevratných akcí mimo mandát (mandát = branch, deploy dle configu projektu, DB migrace projektu).
