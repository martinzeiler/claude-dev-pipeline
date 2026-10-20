# Slovník návrhu

Sdílený slovník pro review (thermo, code-review, prd-check, fix). Používej tyhle termíny přesně; ne „komponenta“, „služba“, „API“ ani „boundary“.

- **Modul**: cokoli s rozhraním a implementací, bez ohledu na měřítko (funkce, třída, balíček, svislý řez).
- **Rozhraní**: všechno, co volající musí vědět, aby modul použil správně: signatura, invarianty, pořadí volání, chybové režimy, konfigurace, výkon. Víc než typ.
- **Implementace**: tělo modulu.
- **Hloubka**: páka na rozhraní. Hluboký modul má mnoho chování za malým rozhraním; mělký má rozhraní skoro tak složité jako implementaci. Hloubka se neměří poměrem řádků.
- **Šev**: místo, kde jde změnit chování bez editace v tom místě; tam leží rozhraní modulu. Kam dát šev je samostatné rozhodnutí.
- **Adaptér**: konkrétní věc, která na švu plní rozhraní (role, ne obsah). Na hranici systému legitimní, uvnitř podezřelý. **Jeden adaptér je hypotetický šev, dva jsou skutečný**: šev bez dvou adaptérů je jen nepřímost.
- **Páka**: co dává hloubka volajícím: víc chování na jednotku naučeného rozhraní.
- **Lokalita**: co dává hloubka údržbě: změna, chyba, znalost a ověření se soustředí na jedno místo.
- **Test smazáním**: smaž modul v hlavě. Zmizí složitost? Byl průchozí. Objeví se u N volajících? Vydělával si na sebe.
- **Rozhraní je testovací povrch**: testy a volající překračují týž šev. Kdo chce testovat za rozhraní, má modul špatného tvaru. Vnitřní švy (privátní, pro vlastní testy) se rozhraním nevystavují.
- **Kategorie závislostí** (určují, jak se modul testuje přes šev): v procesu (čistý výpočet: sloučit a testovat přímo), lokálně nahraditelná (má lokální náhradu v suitě), vzdálená vlastní (port na švu, adaptér pro provoz a pro test), skutečně externí (cizí služba: vstřikovaný port, v testu mock).
- **Nahraď, nevrstvi**: po prohloubení modulu staré testy mělkých částí smaž a piš nové na rozhraní. Test, který se musí měnit při refaktoru bez změny chování, testuje za rozhraní.
