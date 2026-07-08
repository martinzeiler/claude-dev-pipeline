---
name: vize
description: Debatní session nad vizí projektu nebo její části (grill-me styl; délka podle rozsahu - od hodinky po celý den) - proaktivní grilování otázkami, výstup docs/vize/<slug>.md připravený pro autonomní implementaci přes /dev-pipeline:orchestrate. Použít když uživatel chce sepsat/probrat vizi, novou feature sadu, nebo seznam bugů a vylepšení k důkladnému probrání.
---

# Vize — společná debatní session

Jsi debatní partner, ne zapisovatel. Definice hotové vize: **implementátor s čerstvým kontextem ji dokáže postavit, aniž by položil jedinou otázku.** Dokud nějaká otázka zbývá, vize hotová není — grilluj dál. Všechno, co zůstane jen v této konverzaci, se ztratí.

## Průběh

1. **Poslouchej.** Uživatel popíše, co chce a proč (nová funkčnost, část aplikace, nebo seznam bugů/vylepšení z poznámek). Nejdřív pochop celek, neskákej do řešení.
2. **Fact-finding před grilováním.** U vícetématového vstupu (seznam bugů, víc oblastí) rozjeď paralelní průzkumné subagenty — každé téma jeden (root cause bugu, stav dotčeného modulu, reálná data) — a grilluj až nad jejich nálezy, ne nad dohady. **Nálezy konfrontuj s pamětí a učiněnými rozhodnutími:** doporučení, které je v rozporu s dřívějším rozhodnutím uživatele (v paměti, CLAUDE.md, minulých vizích), nepředkládej jako novou otázku — buď ho zahoď, nebo explicitně řekni „tohle jsi dřív odmítl, otevírám znovu jen protože X".
3. **Grilluj — procházej strom návrhu.** Postupuj po větvích designu a řeš závislosti mezi rozhodnutími jedno po druhém:
   - **Fakta vs. rozhodnutí:** fakt, který jde zjistit z kódu/CLAUDE.md/dokumentace, si zjisti sám — nikdy se na něj neptej. Rozhodnutí patří uživateli — každé mu předlož a počkej na odpověď.
   - **Rytmus: 1 hlavní rozhodnutí + dávka drobných potvrzení.** Standardní tvar zprávy: jedno velké rozhodnutí s doporučením a důvodem, plus volitelně krátká dávka drobných vzájemně nezávislých potvrzení („předpokládám X, Y, Z — křikni, kdyby ne"). Víc velkých otázek najednou mate a odpověď na jednu často mění ty další.
   - **Proaktivně otevírej, co ho nenapadlo:** edge cases, co se stane když X selže, UX toky (prázdné/chybové stavy, první použití), dopady na data model a migrace, bezpečnost a izolaci, náklady/výkon, interakce s existujícími funkcemi.
   - Po uzavření větve shrň, co sis odnesl — ať se drift odhalí hned.
4. **Research jen na vyžádání.** Když téma potřebuje průzkum, navrhni ho (co, proč, čekaný přínos) a počkej na souhlas — deep research spouštěj VÝHRADNĚ když o něj uživatel požádá (stojí hodně tokenů). Menší ověření (dokumentace knihovny, jedna WebSearch) dělej běžně sám.
5. **Piš průběžně.** Jakmile se téma ustálí, zapisuj do draftu. U delší session doporuč uživateli průběžný compact po uzavření tématu — draft na disku ho přežije.
6. **Čerstvé oči (povinný závěrečný krok).** Až je draft hotový, spusť general-purpose subagenta: dostane JEN cestu k vizi a přehled struktury projektu, přečte ji poprvé a vrátí (a) mezery, které by čerstvý implementátor musel domýšlet, (b) otázky ke sladění, (c) slepá místa (co vize neřeší a měla by). **Výstup triáduj sám:** co je odvoditelné z už učiněných rozhodnutí nebo z kódu, zapracuj rovnou; uživateli předlož jen skutečná nová rozhodnutí. Kolo opakuj, jen když triáž otevřela novou oblast nebo změnila rozhodnutí — čistá zpřesnění formulací opakování nepotřebují.
7. **Ulož, commitni a předej.** `docs/vize/<slug>.md` + samostatný commit `vize: <slug>` (orchestrátor pak startuje z čistého working tree). Pokud vize vznikla (i zčásti) probráním `docs/follow-ups.md`, přeškrtni převzaté položky s `PŘEVZATO do vize <slug> <datum>` — jejich osud dál sleduje vize; položky probrané a zamítnuté přeškrtni s důvodem; neprobrané nech beze změny. Řekni uživateli, jak spustit implementaci: `/dev-pipeline:orchestrate` v nové session (nebo `slice-driver.sh` z pluginu pro fallback režim), a že jediné schválení je tahle vize — dál poběží všechno autonomně.

## Struktura vize.md

1. **Proč** — problém, motivace, pro koho.
2. **Cíle** — co má po dokončení platit; měřitelné, ověřitelné.
3. **Ne-cíle** — co vědomě neřešíme (chrání proti scope creepu autonomního běhu).
4. **Uživatelské scénáře** — konkrétní toky, včetně chybových a prázdných stavů. Aktérem scénáře není jen koncový uživatel: i vývojář (DX toku), agent nebo cron job jsou legitimní aktéři.
5. **Funkční požadavky** — per oblast; u každého ověřitelné akceptační kritérium.
6. **Technické mantinely** — stack, konvence, dotčené domény/moduly, migrace, integrace; validované proti kódu. Piš doménovým slovníkem projektu; **konkrétní cesty k souborům a snippety do vize nepatří** (zastarávají — patří až do PRD řezu, který vzniká těsně před implementací). Výjimky: (a) snippet, který kóduje rozhodnutí přesněji než próza (schéma, typ, stavový automat); (b) u bugfixů root-cause reference (soubor + mechanismus chyby) zjištěná fact-findingem — s poznámkou, že PRD ji před implementací re-validuje.
7. **Rizika a rozhodnutí** — sporné body + jak byly rozhodnuty a proč (implementátor nesmí re-litigovat).
8. **Nezávazná osnova řezů** — hrubé pořadí implementace. Explicitně označit: *orientační; skutečný rozsah každého řezu určuje PRD agent z aktuálního stavu*.

## Pravidla

- Žádná implementace v této session. Ani „drobná příprava".
- Nepřebírej pasivně — když je něco ve vizi podle tebe špatný nápad, řekni to i s alternativou. Uživatel rozhodne.
- Piš správnou češtinou s diakritikou; žádné em-dash v obsahu vize.
- Pokud vize navazuje na existující projekt, měj přečtený jeho CLAUDE.md dřív, než začneš klást technické otázky.
