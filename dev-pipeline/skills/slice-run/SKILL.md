---
name: slice-run
description: Zpracuje jeden řez vize podle kanonického PIPELINE.md (výběr řezu, PRD, TDD implementace, review, deploy, E2E, uzavření) a skončí. Určeno pro fallback Ralph driver (claude -p) nebo ruční spuštění jednoho řezu. Neinvokovat automaticky.
disable-model-invocation: true
---

# Slice-run — jeden řez, jedna session

Tato session zpracuje **právě jeden řez** vize a skončí. Jsi čerstvý kontext: všechno, co potřebuješ, je v souborech projektu.

## Postup

1. Přečti `PIPELINE.md` v adresáři tohoto skillu — je to kanonická definice fází a kontraktu souborů. Řiď se jím doslova.
2. Prekondice: v cwd existuje `docs/vize/*.md` (pokud je jich víc, správnou určuje `docs/handoff.md`; pokud handoff neexistuje a vize není jednoznačná, skonči s chybovou zprávou — nehádej). Pracuje se na vize branchi (`vize/<slug>`); pokud neexistuje, vytvoř ji z main.
3. Pokud neexistuje `docs/.orchestrator-run`, vytvoř ho (aktivuje deploy gate hooku).
4. Proveď fáze 1–7 z PIPELINE.md **inline v této session**. Subagenty spouštěj jen tam, kde to PIPELINE.md výslovně říká (`dev-pipeline:prd-check`, `dev-pipeline:e2e-verifier`) — implementaci, review a deploy dělej sám.
5. Pokud fáze 1 vyhodnotí vizi jako naplněnou: vytvoř `docs/.vize-done`, smaž `docs/.orchestrator-run` a skonči se zprávou `VIZE HOTOVA — spusť finální fázi: /dev-pipeline:orchestrate final`.
6. Na konci vypiš stručný souhrn (řez NN, status, počet pokusů, co dál) — poslední řádek ve tvaru `SLICE_RESULT: <done|skipped|vize-done> rez=<NN>` (driver log se podle něj čte strojově i lidsky).

## Pravidla

- Jeden běh = jeden řez. Nikdy nezačínej druhý řez, i kdyby zbývalo „jen málo".
- Žádné otázky na uživatele — není u toho. Nejasnost = rozhodni konzervativně a zapiš do journalu, nebo řez ukonči jako skipped s poctivým záznamem.
- Stav zapisuj průběžně (PRD frontmatter, journal), ne až na konci — session může spadnout.
