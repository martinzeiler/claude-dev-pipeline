---
name: prototyp
description: Postaví několik strukturálně různých variant jednoho návrhu, aby se dalo rozhodnout podíváním místo dohadováním - UI varianty za ?variant= uvnitř existující stránky, nebo TUI nad čistým logickým modulem. Volá se z /vize session u nové obrazovky, z fáze 1 u nového stavového automatu, nebo z fáze 3 u nového UI povrchu (neblokujícím způsobem). NEpoužívat na úpravu existující obrazovky ani na cokoli, co jde rozhodnout prózou.
---

# Prototyp — rozhodni podíváním, ne dohadováním

Prototyp existuje pro jedinou situaci: **akceptační kritérium nejde napsat, dokud se nerozhodne tvar**. Dokud jde napsat „po odeslání se zobrazí potvrzení a záznam je v seznamu", prototyp nepotřebuješ. Jakmile je zadání „nějak přehledně to tam dej", nemá implementace čím se řídit a vyrobí první věc, která ji napadne.

## Kdy prototypovat (a kdy ne)

**Ano:**
- **UI** — nová obrazovka nebo nová sekce s vlastní strukturou, u které si po jednom až dvou kolech otázek pořád nejsi jistý tvarem.
- **Logika** — nový stavový automat nebo podstatná změna přechodů v existujícím. Tady je hodnota jinde než u UI: nejde o vkus, ale o to, jestli model umí reprezentovat všechny stavy, které v realitě nastanou.

**Ne:**
- Přidání pole nebo tlačítka do **existující** obrazovky. Tvar je daný okolím; prototyp by ho jen znovu vymýšlel.
- Cokoli, co jde rozhodnout prózou. Prototyp je dražší než odstavec ve vizi.
- Backend bez rozhodovacího problému. CRUD nad známým schématem prototyp nepotřebuje.

Tři až čtyři prototypy za vizi je hodně. Když jich vychází víc, chybí ve vizi rozhodnutí, ne prototypy.

## Dvě větve

| | UI větev | Logická větev |
|---|---|---|
| Podklad | `UI.md` v tomhle adresáři | `LOGIC.md` v tomhle adresáři |
| Kdo rozhoduje | **uživatel podíváním** | **agent měřením** (uživatel jen když měření nerozhodne) |
| Kritérium | vkus + kritéria vize | co je nereprezentovatelné, co vede do nelegálního stavu |
| Kde se volá | `/vize`, fáze 3 | `/vize`, fáze 1 (PRD) |

Přečti si příslušný soubor a řiď se jím. Tenhle SKILL.md jen rozhoduje, která větev to je, a drží pravidla společná oběma.

## Společná pravidla

1. **Varianty musí být strukturálně různé.** Tři odstíny téhož layoutu nejsou tři varianty — je to jedna varianta třikrát. Když nedokážeš napsat jednou větou, čím se varianta B liší od A v **rozhodnutí** (ne ve vzhledu), zahoď ji a vymysli jinou.
2. **Vždy nejdřív najdi, co už existuje.** Prototyp, který ignoruje komponenty, konvence a názvosloví projektu, rozhoduje o něčem jiném než o tom, co se nakonec postaví. Přečti si `CLAUDE.md` projektu a nejbližší srovnatelnou obrazovku nebo modul dřív, než začneš.
3. **Prototyp je jednorázový.** Není to první verze implementace. Vítěz se **postaví znovu pořádně** podle konvencí projektu; kód variant se zahodí. Když tě láká vítěznou variantu „už jen dotáhnout", stavěl jsi implementaci, ne prototyp.
4. **Prototyp se nikdy nemerguje do main.** Varianty žijí na odhoditelné větvi (`prototyp/<slug>`) nebo v necommitnutém stromu; do vize branche patří jen výsledek — verdikt v dokumentu a případně vítězná varianta postavená načisto.
5. **Verdikt je součást výstupu, ne volitelná příloha.** Vždy: která varianta, **proti kterým kritériím** vyhrála, co se z poražených bere s sebou, a co zůstalo nerozhodnuté.

## Kde se prototyp v pipeline volá

**A. Z `/vize` session** (výchozí pro UI). Tvar UI se rozhoduje ve vizi (viz `vize/SKILL.md`, bod 7); prototyp je nástroj pro případ, kdy próza nestačí. Uživatel je u toho, takže rozhoduje on. Verdikt se zapíše do vize a orchestrátor pak staví podle něj.

**B. Z fáze 1 (PRD)** pro logiku, když PRD zavádí nový stavový automat nebo mění přechody v existujícím. Uživatel u toho není, takže rozhoduje měření: agent prožene model hraničními případy a nahlásí, co je nereprezentovatelné nebo co vede do nelegálního stavu. Tohle chytá přesně tu třídu chyby, kdy se postaví lane, která je v produkci trvale mrtvá, protože ji žádný reálný vstup neaktivuje. Výsledek jde do PRD, ne do samostatného dokumentu.

**C. Z fáze 3 pro nový UI povrch — nikdy blokujícím způsobem.** Autonomní běh se nezastavuje a nečeká na uživatele. Agent postaví varianty, **sám vybere s písemným zdůvodněním proti kritériím vize**, vítěze zapojí a varianty odloží na odhoditelnou větev. Do journalu zapíše verdikt a odkaz na tu větev — uživatel se na ně může podívat v závěrečné kontrole a rozhodnout jinak. Když vize tvar UI rozhodla (což by měla), tenhle případ nenastane: prototyp v fázi 3 je pojistka pro povrch, na který vize nemyslela.
