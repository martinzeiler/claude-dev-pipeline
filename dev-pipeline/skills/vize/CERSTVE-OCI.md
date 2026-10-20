# Čerstvé oči: role, triáž, kola

Načti v kroku 12 Průběhu, až je draft vize hotový. Spusť **paralelně několik** agentů `dev-pipeline:cerstve-oci`; každý dostane jen cestu k vizi, přehled struktury projektu a **jednu roli**, ze které vizi čte poprvé.

## Role

- **implementátor**: co bych musel domyslet, abych to postavil bez jediné otázky; kde jsou dvě čtení téže věty.
- **orchestrátor**: má každý Cíl řez a každý řez definici hotového; který z důvodů zastavení (seznam v `../orchestrate/SKILL.md`, sekce Zastavení) by předvídatelně nastal; na jaký zápis chybí Povolení; která UI plocha chybí v seznamu; které kritérium, krok nebo scénář čeká na čas a o kolik hodin to běh prodlouží; má každé kritérium a scénář, které potřebují něco spustit nebo zapsat v živém systému, v Povolení místo (i přeměření po opravě a E2E kolečka, u Povolení s počty kusů rezervu); má řádek „Merge do main po běhu“ a mají kroky na pozadí hranici souborů.
- **UX**: které stavy obrazovek vize neřeší (prázdný, chybový, načítací, první použití, desetkrát víc dat).
- **data a migrace**: co to udělá se schématem a s existujícími daty, co je nevratné, co chybí dopočítat.
- **provoz a bezpečnost**: kdo to smí, co se loguje, co se stane, když integrace spadne nebo dojde limit.
- **konzistence příloh**: jen když vize má přílohy (`docs/vize/<slug>/`), vždy v kole 1: zastaralá rozhodnutí v příloze, fakta a počty v rozporu s tělem nebo s kódem a daty. Nad ~300 kB příloh rozděl přílohy mezi dva agenty. Nesoulad oprav v příloze, nebo přílohu označ „přepsáno vizí §X“. PRD agent přílohu čte, když se jí řez dotýká; chybný počet z přílohy jinak dojde až do sporu v běhu.

Role přidávej podle toho, čeho se vize dotýká (platby, i18n, SEO, výkon, offline); vynech ty, které vize nepotřebuje. Sekci Otevřené otázky a stavové poznámky session agenti nehodnotí.

## Triáž do tří košů

1. **Rozhodnutí uživatele**: nové rozhodnutí, změna Cíle, Ne-cíle, Rozhodnutí nebo mantinelu, nové nebo širší Povolení, nová UI plocha, a vždy věta, která přidává čekání, odklad, nejzazší čas nebo podmínku „jinak se odloží“.
2. **Oprava vize**: rozpor mezi dvěma místy vize nebo mezi vizí a přílohou, který rozhodneš z už učiněných rozhodnutí.
3. **Technický detail**, který PRD agent dohledá v kódu a prd-check ověří (jméno sloupce, pořadí migrace, chování trasy, přesné počty); do vize se nepíše.

Koš 1 předlož uživateli, koš 2 zapracuj, koš 3 zahoď. Značky BLOKUJE a ZDRŽUJE od agentů jsou vstup triáže, ne podmínka dalšího kola.

**Do koše 3 nikdy, i když je agent značí „zdržuje“:** Ne-cíl v rozporu s požadavkem nebo kritériem; kritérium, jehož ověření vyžaduje zápis nebo prostředí mimo Povolení; nemechanické pravidlo pro hromadný zápis do produkce (párování, import, mazání podle pravidla); kritérium závislé na řezu, který plán staví později; čekání na čas (koš 1 vždy). PRD agent je nerozhodne, jen vyloží po svém a spor se vrátí v běhu. Patří do koše 2, a když je nejde rozhodnout z učiněných rozhodnutí (Povolení by se muselo rozšířit, Ne-cíl změnit), do koše 1.

**Návrh opravy od agenta je hypotéza, ne text do vize.** Tvrzení o kódu nebo datech v návrhu (role, soubor v repu, výpadek, viditelná plocha, počet) ověř před zápisem průzkumem nebo jedním dotazem; pravidlo pro hromadný zápis (párování, import, úklid, detektor) zapiš s testem na vzorku: kolik záznamů projde a kolik ne; znění opravy piš tak, aby šlo vyložit jen jedním způsobem.

**Koš 2 zapracuj jednou dávkou** (jeden skript nebo jeden přepis dotčených sekcí), ne desítkami samostatných Editů: každý Edit při velkém kontextu znovu čte celé vlákno.

## Další kola

Další kolo pusť jen tehdy, když koš 1 posledního kola nebyl prázdný, a jen s rolemi, které ho naplnily. Do zadání jim dej číslo kola, seznam míst změněných od minulého kola a **doslova věty, které vložila triáž**, s pokynem „tyto věty čti jako nové a jejich tvrzení o kódu a datech ověř proti kódu“; před spuštěním kola zkontroluj, že zadání nese věty doslova, ne jen seznam sekcí.

Kolo, po jehož triáži zůstane koš 1 prázdný, je poslední: zapracuj koš 2 a vizi ulož. Věty, které koš 2 posledního kola vložil, už žádné kolo nepřečte: jejich tvrzení o kódu, knihovně a datech ověř sám jedním dotazem nebo agentem `pruzkum`.

Po každém kole napiš uživateli jednou větou, kolik nálezů šlo do kterého koše (všechny tři zvlášť) a jestli pouštíš další kolo a proč. **Čtvrté a každé další kolo jen s jeho souhlasem.** Každé kolo čte i text, který přidalo zapracování předchozích, takže smyčka bez tohoto pravidla nemá pevný bod.
