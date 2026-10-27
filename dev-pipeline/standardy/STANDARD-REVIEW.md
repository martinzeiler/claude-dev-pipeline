# Standard pro review

Čtou ho code-review, thermo, prd-check a fix. Implementace ho nečte; co je tady, hlídá review a opravuje fix. Slovník: `SLOVNIK-NAVRHU.md` vedle.

## Přednost a mlčení

1. **Repo má přednost.** `CLAUDE.md` a `CODING_STANDARDS.md` projektu přebíjí všechno níže; kde projekt tvar výslovně předepisuje nebo dovoluje (kanonický helper, barel jako kontrakt, záměrná konsolidace), nález nevzniká.
2. **Co hlídá nástroj, nepsat.** Lint, typecheck, formátovač a testy nejsou standard pro review; jejich nálezy se neopisují.
3. Smell z baseline je úsudek s označením („možná Závist“), ne tvrdé porušení. Tvrdé je jen porušení výslovného pravidla projektu.

## Tři třídy špatných testů

- **Tautologický**: očekávaná hodnota nemůže s kódem nesouhlasit: počítá se stejně jako kód (`expected = items.reduce(...)`), vyrábí ji týž helper, který volá implementace, nebo je to snapshot či golden vyrobený kódem bez ověření obsahu; test projde z konstrukce a zůstane zelený nad vadným kódem. Náprava: očekávaná hodnota z nezávislého zdroje (známý literál, spec, propočet rukou): `expect(soucet([{ cena: 10 }, { cena: 5 }])).toBe(15)`.
- **Svázaný s implementací**: padá při refaktoru bez změny chování: mock vlastního modulu, počty a pořadí volání, čtení privátního stavu, test, který čte zdrojový soubor a hlídá tvar kódu, ověření obejitím rozhraní (přímý dotaz do DB místo čtení přes rozhraní). Náprava: test na rozhraní, popisuje co, ne jak.
- **Neselhatelný**: mock na hranici schová chybové režimy služby, test projde i bez implementace, nebo tvrzení platí z aritmetiky pro každý vstup. Náprava: chybový režim vyvolat, červenou doložit. Hranice: tautologický bere očekávání z kódu, neselhatelný projde bez něj.

Mock jen na hranici systému (cizí API, čas, náhoda, výjimečně souborový systém); vlastní modul ani vnitřního spolupracovníka nikdy. Test pojmenovaný po řezu nebo dokládající jen to, že řez proběhl, je nález.

## Smell baseline (co to je → jak opravit)

- **Nejasné jméno**: jméno neříká, co funkce dělá nebo co proměnná drží → přejmenuj; když poctivé jméno nejde najít, je nejasný návrh.
- **Duplicitní kód**: týž tvar logiky na dvou místech změny → vytáhni sdílený tvar, volej z obou.
- **Závist**: metoda sahá do cizích dat víc než do vlastních → přesuň ji k datům.
- **Shluk dat**: stejná pole nebo parametry cestují spolu → jeden typ.
- **Posedlost primitivy**: řetězec nebo číslo zastupuje doménový pojem → malý vlastní typ.
- **Opakované větvení**: tentýž `switch` nebo kaskáda `if` nad týmž typem na víc místech → polymorfismus, nebo jedna sdílená mapa.
- **Rozstřel**: jedna logická změna nutí editovat mnoho souborů → sdruž, co se mění spolu.
- **Rozbíhavá změna**: jeden modul se mění z víc nesouvisejících důvodů → rozděl podle důvodu změny.
- **Spekulativní obecnost**: abstrakce, parametr nebo hák pro potřebu, kterou zadání nemá → smaž, inlinuj zpět.
- **Řetěz zpráv**: `a.b().c().d()`, na kterém volající nemá záviset → schovej za jednu metodu prvního objektu.
- **Prostředník**: třída nebo funkce, která hlavně deleguje dál → vynech, volej cíl přímo.
- **Odmítnuté dědictví**: potomek ignoruje nebo přepisuje většinu zděděného → kompozice místo dědičnosti.
