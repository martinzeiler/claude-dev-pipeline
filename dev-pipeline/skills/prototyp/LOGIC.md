# Prototyp — logická větev

Cíl: zjistit, **jestli navržený model unese realitu**, dřív než se podle něj postaví schéma, migrace a půlka backendu. Na rozdíl od UI větve tady nerozhoduje vkus — existuje objektivní kritérium a agent ho umí vyhodnotit sám, i když u toho uživatel není.

Kdy: PRD zavádí **nový stavový automat** nebo mění přechody v existujícím (stavy objednávky, lifecycle návrhu, fronta úloh, schvalovací tok, gating podle plánu). Typická chyba, kterou tohle chytá: postaví se lane, kterou v produkci **nikdy nic neaktivuje**, protože ji dřívější brána vyřadí u všech reálných vstupů — a zjistí se to až za dva měsíce.

## 1. Vytáhni logiku do čistého modulu

Prototypovat jde jen to, co jde spustit bez databáze, sítě a UI. Napiš **čistý modul** (typicky do scratchpadu session, ne do repa):

- vstupy jsou data, ne handle na služby,
- žádné I/O, žádný čas z `Date.now()` (čas je vstup), žádná náhoda,
- výstup je nový stav + seznam efektů jako **data** („odešli e-mail X"), ne provedené efekty.

Tvarem je to nejčastěji reducer: `(stav, událost) -> { stav, efekty[] }`. Když se logika do téhle formy vzepře, je to samo o sobě nález — znamená to, že rozhodování je promíchané s I/O a PRD by to mělo řešit.

Modul piš v jazyce projektu a s jeho typy (importuj skutečné enumy a Zod schémata, ne jejich kopie) — jinak prototyp ověřuje jiný model, než se postaví.

## 2. Postav nad ním malou TUI

Jeden příkaz, žádný build, žádný framework:

```bash
npx tsx <cesta>/prototyp.ts
```

Co má umět:
1. vypsat **aktuální stav** a **události, které jsou z něj legální**,
2. přijmout událost a ukázat nový stav + efekty,
3. `zpět` (drž historii stavů v poli — jde to na tři řádky),
4. `scénář <jméno>` — přehrát předpřipravenou posloupnost událostí najednou.

Interaktivní vstup přes `node:readline`. Renderuj stav tak, aby byl čitelný na jeden pohled (jeden řádek na klíčové pole), ne `JSON.stringify` celého objektu.

## 3. Prožeň to hraničními případy (tady je hodnota)

Tohle je vlastní přínos větve. Projdi systematicky:

- **Každý stav × každá událost.** Pro každou dvojici řekni: legální přechod, ignorovat, nebo chyba? Prázdné políčko v téhle tabulce je nerozhodnuté místo v návrhu.
- **Nedosažitelné stavy.** Do kterého stavu se nedá dostat žádnou posloupností událostí ze startu? Buď je zbytečný, nebo chybí přechod.
- **Slepé stavy.** Ze kterého stavu nevede žádný přechod ven? Když to není záměrný koncový stav, je to past.
- **Mrtvé lane.** Existuje větev logiky, kterou žádný **reálný** vstup neaktivuje, protože ji dřív vyřadí jiná podmínka? Ověř to skutečnými daty (read-only dotaz na produkci je při tvorbě PRD povolený), ne úvahou.
- **Nereprezentovatelné situace.** Popiš 3 až 5 situací, které v realitě nastanou (souběh, opakované odeslání, návrat po chybě, částečné selhání), a zkus je v modelu vyjádřit. Co nejde vyjádřit, je nález.
- **Souběh a idempotence.** Co se stane, když tatáž událost přijde dvakrát? Když dvě různé přijdou ve stejnou sekundu? (Pozor na modely, které rozlišují „novější" podle sekundového razítka — dvě události v téže vteřině nerozliší.)

## 4. Varianty modelu (když jsou)

Když PRD nabízí víc modelů (stavový automat vs. příznaky, jedna tabulka vs. dvě, stav na entitě vs. odvozený), postav **oba** jako čisté moduly nad **týmiž** scénáři a porovnej měřením:

| kritérium | model A | model B |
|---|---|---|
| nereprezentovatelné situace | | |
| nelegální stavy, které jde vyjádřit | | |
| počet přechodů | | |
| co se musí změnit, když přibude stav | | |

Vyhrává model, ve kterém **nejde vyjádřit nelegální stav** — ne ten s méně řádky.

## 5. Výstup

Jde do **PRD** (větev B) nebo do vize (větev A), ne do samostatného dokumentu:

```
Model: <který, a proč proti druhému>
Tabulka stav × událost: <legální přechody; hvězdička u těch, které PRD neřešilo>
Nálezy:
  - nereprezentovatelné: <situace → co v modelu chybí>
  - nelegální stavy: <co jde vyjádřit a nemělo by>
  - mrtvé lane: <větev → který reálný vstup ji nikdy neaktivuje, s dokladem>
Nerozhodnuto: <co prototyp neuzavřel>
```

Nálezy, které mění návrh, se **zapracují do PRD** dřív, než jde na `prd-check` — jinak checker kontroluje plán, o kterém už víš, že neplatí.

## 6. Úklid

Modul i TUI leží ve scratchpadu session a **do repa nejdou**. Co si zaslouží přežít, je (a) verdikt v PRD a (b) **testovací případy** — hraniční scénáře, které jsi vymyslel, patří do TDD červené fáze 3 jako skutečné testy nad skutečnou implementací. To je jediná část prototypu, která se recykluje.
