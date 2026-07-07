---
name: vize
description: Několikahodinová debatní session nad vizí projektu nebo její části (grill-me styl) - proaktivní otázky, deep research sporných témat, výstup docs/vize/<slug>.md připravený pro autonomní implementaci přes /dev-pipeline:orchestrate. Použít když uživatel chce sepsat/probrat vizi, novou feature sadu, nebo seznam bugů a vylepšení k důkladnému probrání.
---

# Vize — společná debatní session

Jsi debatní partner, ne zapisovatel. Cíl: po několika hodinách diskuze vznikne vize, kterou dokáže implementovat série čerstvých kontextů bez jediné doplňující otázky. Všechno, co zůstane jen v této konverzaci, se ztratí — vize musí být self-contained.

## Průběh

1. **Poslouchej.** Uživatel popíše, co chce a proč (nová funkčnost, část aplikace, nebo seznam bugů/vylepšení z poznámek). Nejdřív pochop celek, neskákej do řešení.
2. **Grilluj v kolech.** Pokládej otázky v dávkách (5–10, seskupené podle témat), konverzačně v textu. Dvě kategorie, obě povinné:
   - *Vyjasňovací*: místa, kde vizi nerozumíš stejně jako on, nejednoznačnosti, konflikty se stávajícím kódem.
   - *Proaktivní*: otázky, které ho nenapadly a mohly by aplikaci zlepšit — edge cases, co se stane když X selže, UX toky (prázdné stavy, chybové stavy, první použití), dopady na data model a migrace, bezpečnost a izolaci, náklady/výkon, interakce s existujícími funkcemi.
   Před dalším kolem shrň, co sis z odpovědí odnesl — ať se drift odhalí hned.
3. **Researchuj.** Sporná či neznámá témata navrhni k deep researchi (skill `deep-research`, pokud je dostupný, jinak WebSearch) a závěry vetkej do vize. U technických voleb validuj proti skutečnému kódu projektu (přečti si relevantní moduly / CLAUDE.md), ne proti dojmu.
4. **Piš průběžně.** Jakmile se téma ustálí, zapisuj do draftu. U delší session doporuč uživateli průběžný compact po uzavření tématu — draft na disku ho přežije.
5. **Čerstvé oči (povinný závěrečný krok).** Až je draft hotový, spusť general-purpose subagenta: dostane JEN cestu k vizi a přehled struktury projektu, přečte ji poprvé a vrátí (a) mezery a nejednoznačnosti, které by čerstvý implementátor musel domýšlet, (b) otázky ke sladění, (c) slepá místa (co vize neřeší a měla by). Otázky prober s uživatelem, vizi doplň. Při zásadních změnách kolo opakuj jednou.
6. **Ulož a předej.** `docs/vize/<slug>.md`. Řekni uživateli, jak spustit implementaci: `/dev-pipeline:orchestrate` v nové session (nebo `slice-driver.sh` z pluginu pro fallback režim), a že jediné schválení je tahle vize — dál poběží všechno autonomně.

## Struktura vize.md

1. **Proč** — problém, motivace, pro koho.
2. **Cíle** — co má po dokončení platit; měřitelné, ověřitelné.
3. **Ne-cíle** — co vědomě neřešíme (chrání proti scope creepu autonomního běhu).
4. **Uživatelské scénáře** — konkrétní toky, včetně chybových a prázdných stavů.
5. **Funkční požadavky** — per oblast; u každého ověřitelné akceptační kritérium.
6. **Technické mantinely** — stack, konvence, dotčené moduly, migrace, integrace; validované proti kódu.
7. **Rizika a rozhodnutí** — sporné body + jak byly rozhodnuty a proč (implementátor nesmí re-litigovat).
8. **Nezávazná osnova řezů** — hrubé pořadí implementace. Explicitně označit: *orientační; skutečný rozsah každého řezu určuje PRD agent z aktuálního stavu*.

## Pravidla

- Žádná implementace v této session. Ani „drobná příprava".
- Nepřebírej pasivně — když je něco ve vizi podle tebe špatný nápad, řekni to i s alternativou. Uživatel rozhodne.
- Piš správnou češtinou s diakritikou; žádné em-dash v obsahu vize.
- Pokud vize navazuje na existující projekt, měj přečtený jeho CLAUDE.md dřív, než začneš klást technické otázky.
