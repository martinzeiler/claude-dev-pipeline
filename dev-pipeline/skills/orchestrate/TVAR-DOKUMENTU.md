# Tvar dokumentů běhu

Pro agenty bloků: co kde leží, kdo to píše a v jakém tvaru. Čti jen sekce, které tvá role potřebuje (`grep -n '^## '`, pak `sed -n`); args, návraty a guardy jsou v `KONTRAKT.md`.

## Soubory běhu

- `docs/produkt.md` (vize session): produktová severka napříč vizemi
- `docs/vize/<slug>.md`, přílohy `docs/vize/<slug>/` (vize session): Cíle, Ne-cíle, Rozhodnutí, Mantinely a Povolení, UI plochy, Plán řezů; tělo kolem 85 kB, podklady v přílohách; během běhu neměnná
- `docs/prd/rez-NN-<slug>.md` (PRD architekt; status a commit uzavření): PRD řezu, u řezu s částmi kostra (níže)
- `docs/prd/rez-NN-cast-K1.md` (autor části): PRD části: postup ověřený proti kódu, precedent, pasti, testy k chování, mapa souborů a symbolů
- `docs/e2e/rez-NN.md` (PRD architekt): E2E scénáře v nezávislých sekcích (níže)
- `docs/e2e/rez-NN-doklad-pred.md` (agent `doklad`): snímek dat před nasazením: čas, revize, dotazy doslova a výsledky, populace jako seznam identit
- `docs/e2e/rez-NN-pred.md` (implementace nebo část): výsledek kroku před nasazením (čas, příkaz, výsledek, ověření); zápis do živého jen podle Povolení z PRD
- `docs/e2e/rez-NN-nasazeni.md` (deploy): zápis nasazení: čas, commit řezu, aplikace nasazené i nenasazené, doklady, kroky po nasazení, `Dveře: jednosměrné / obousměrné · Dosah: <slovo>`; samostatný commit
- `docs/e2e/rez-NN-<doklad>.md`, `docs/mereni/` (kdo doklad pořizuje): doklady řezu do commitu (měření, `rez-NN-diagnoza.md`, export), nikdy do `docs/reviews/`; surové výstupy měřidel (JSON, HAR, snímky) do gitignorovaného `docs/e2e/rez-NN-vykon/`
- `docs/journal.md` (uzavření, finální fáze): deník: hotové, odchylky, pokusy, odmítnuté nálezy, měřidla, kontext agentů; heredocem
- `docs/follow-ups.md` (uzavření, finální fáze, vize session): backlog napříč vizemi (níže)
- `docs/vize-spory.md` (kdokoli v běhu): rozpory, předpoklady, otázky pro majitele (níže)
- `docs/pojmy.md`, `docs/rozhodnuti.md` (vize session; pojmy i sklizeň): slovník a rozhodnutí projektu (níže); během běhu jen ke čtení
- `docs/reviews/rez-NN-p<pokus>-<typ>-kolo-M.md`, `kolecko-<typ>[-<kolo>].md` (kontrolní agenti): plné reporty (`prd-check` bez čísla pokusu); gitignorováno; čte je fix agent
- `docs/reviews/predavka-<agent_id>.md` (agent na výzvu PŘEDÁVKA): předávka nástupci: zadání větou, hotové a čím ověřené, co zbývá, zjištění, rozdělané soubory; cesta v poli `predavka`

Vlastní soubory pojmenuj česky (`rez-NN-<co>.md`); jména `summary`, `findings`, `analysis` a `report-…` Claude Code subagentům blokuje.

## Handoff

`docs/handoff.md` píše jen orchestrátor, do 4 kB; agenti ho nečtou. Hlavička `# Běh vize <slug>`, řádky `stav běhu: <hodnota>`, `branch: vize/<slug> · vize: docs/vize/<slug>.md · start: <datum>`, `session: <session_id>`; sekce Plán (živá kopie) s tabulkou `# | název | body vize | definice hotového | závislosti | stav | commit | E2E | pozn.`, Změny plánu (`- <datum> řez NN: <co a proč>`) a Poznámky pro navázání.

`stav běhu:` (čte ho Stop hook): `běží workflow <blok> řez NN (task <id>)`, `běží agent <co> (task <id>)` · `čeká: <krok>` · `zastaveno: (<písmeno>) <důvod>` · `zastaveno: odklad řez NN do <čas> (obnova cronem)` · `hotovo`, `hotovo (merge main)`.

## PRD a E2E

Frontmatter PRD: `rez`, `slug`, `status` (`in_progress` | `done` | `skipped`), `vize`, `body_vize` (`[C2, F4]`), `runtime_dopad` (`ne` = jen testy, tooling, dokumentace, bez deploye), `lesen` (`ano` = zkušební rozhraní s řádkem plánu na odstranění), `casti` (`K1,K2`, jen kostra), `pokusy` (blok stavby), `commit` (uzavření).

**Malý řez** (do ~2 k změněných řádků) má PRD celé. **Kostra řezu s částmi** nese cíl, rozsah, Pojmy, kritéria s ID, zákazy, UI plochu, doklad, Pozor na, Nasazení a kroky po něm, sekci Kontrakt (sdílené typy, schéma a migrace, signatury rozhraní mezi částmi, registrace tras; do ~1,5 k řádků, chování patří částem) a sekci Části s tabulkou `část | název | soubory a oblasti | kritéria | odhad řádků vč. testů | závisí na | poznámka`. Část má ~600 až ~1 k řádků v odhadu včetně testů a měřidel (skutečnost bývá 1,5× odhad), disjunktní soubory (sdílené do Kontraktu), vlastní kritéria a závislosti bez cyklu.

**Kritérium** má tvar „**AKn Název do 6 slov.** …“, je vlastnost s měřidlem, ne výčet jmen, ověřitelná testem, měřidlem nebo E2E krokem na nejvyšším švu. Kritérium nad kódem nese `[měřidlo]` a měří ho brána. Kritérium nad sítí, výkonem nebo cizí službou nese `N` běhů střídavě se základem, stanoviště jiné než tento stroj a toleranci (medián proti mediánu základu); bez stanoviště je to otázka pro majitele (`prostředí`). Kritérium nad daty vznikajícími časem má krok výroby dat podle Povolení.

**Nasazení a kroky po něm:** číslovaný seznam, číslo kroku je `id` a mezi verzemi PRD se nemění; podmíněný krok má obě větve (provedení, nebo `nevztahuje-se` s hodnotou). Krok před nasazením nezávislý na kódu řezu přiděluje PRD implementaci nebo části s citací Povolení. Doklad před nasazením (migrace mění nebo maže data, nebo nasazení přepíše protějšek kritéria) má vlastní sekci s dotazy; `doklad_pred` bez ní je blokující nález.

**E2E scénáře:** kroky v sekcích nezávislých na sobě (žádná nezávisí na datech, která jiná vytváří nebo maže); sekce nese odhad doby, dotčené oblasti PRD a `bez_soubehu`, když ji nejde měřit souběžně. Měřidlo nad populací má odhad doby (počet × čas na položku).

## Vize-spory

Nadpis `## <YYYY-MM-DD> | řez NN | <agent>` a pole:

```markdown
**Rozpor nebo předpoklad:** <co ve vizi chybí, odporuje si nebo neplatí; cituj vizi>
**Hledal jsem ve vizi:** <sekce a řádek, podle kterých jsem jel>
**Jak jsem se zachoval:** <podle čeho jsem jel a proč>
**Co by to rozhodlo:** <jednou větou>
**Proti vizi:** ř. N          (jen když navržená odpověď jde proti citovanému znění)
```

Zapisuje kdokoli; záznam bez citace řádku vize je blokující nález kontroly PRD. Běh pokračuje **konzervativní volbou**: ta znamená menší zásah do kódu a dat, ne menší splnění zadání. Právní, etická a obsahová rozhodnutí (co smí být na webu, čí jméno nebo fotka, souhlas, licence, vhodnost textu, co smí kdo dělat podle cizího práva) nejsou tvoje: udělej, co vize a podklady říkají, a riziko zapiš sem jako otázku s navrženou odpovědí „ponechat“, aby ji majitel potvrdil nebo obrátil. Vynechat, zjemnit nebo neudělat smíš jen to, co vize, mantinel nebo zákaz výslovně vylučuje. Zastavení (e) a bezpečnostní nálezy tím zůstávají.

**Otázky pro majitele** (kolize vize s pravidlem projektu, vadné kritérium, kritérium `prostředí`, nesplněný bod plánu) mají stejný tvar s navrženou odpovědí v „Jak jsem se zachoval: podle návrhu …“; běh podle návrhu pokračuje, zpráva je sebere do dotazníku. Rozhodnutí uživatele připojí orchestrátor pod záznam řádkem `**Rozhodnuto majitelem:** „<citace>“`; bez něj je záznam ve zprávě otevřená otázka. Značka (C, F, R, AK, část K) nese při první zmínce název do 5 slov.

## Follow-ups

Backlog napříč vizemi. Nadpis `## Řez NN <název>` zakládá uzavření jen pro svůj řez, kolečko píše pod `## Kolečko`. Položka: `- [řez NN · <oblast>] [<osud>] <text; u opravy cesta k souboru nebo místo UI>`. Osud: `rozhodnutí` (jmenuje majitele, Povolení, nebo jde proti vizi; říká, čí rozhodnutí a co by rozhodlo), `oprava` (cesta k souboru nebo konkrétní místo UI, bez rozhodnutí), `nápad` (návrh funkce nebo změny), `obsah` (text, data, obrázky od majitele). Vyřešené se přeškrtávají `~~…~~ VYŘEŠENO <datum>: <čím>`; zamítá jen vize session s důvodem; žádné promlčení. Nikdo ho nečte celý: `python3 <plugin_root>/scripts/follow-ups.py <cwd> [--osud X] [--oblast Y] [--rez NN] [--json]`; `[oprava]` opravuje vlna dluhu v kolečku, `[rozhodnutí]` vypíše zpráva vedle dotazníku.

## Pojmy a rozhodnutí

`docs/pojmy.md`: termíny projektu, 1–2 věty, bez cest; píše vize session, PRD architekt z něj bere Pojmy kostry a nové termíny vrací v `nove_pojmy`, sklizeň je připíše. `docs/rozhodnuti.md`: datovaná rozhodnutí R s „proč“ a „místo čeho“; nové rozhodnutí staré označí „překonáno <datum> kým“, nikdy nepřepíše; píše jen vize session. V běhu jsou oba jen ke čtení.

## Čekání na čas

> **Čekání na čas.** Kritérium, krok nebo scénář, který potřebuje data vznikající časem (provoz, plánované úlohy, činnost uživatelů, den, noc), změří běh nad daty, která sám vyrobí podle Povolení vize (ruční spuštění, testovací data, kratší okno), hned po nasazení. Na organický čas běh čeká jen tam, kde to vize výslovně vede jako rozhodnutí majitele s odhadem, o kolik hodin se běh prodlouží. Když Povolení výrobu dat nepokrývá, kritérium není „nesplnitelné v prostředí E2E“: je to otázka pro majitele (rozšířit Povolení, nebo čekat).

## Feedback pipeline

Vadu pipeline samotné (krok, který selhal, nejednoznačná instrukce, nástroj, který přestal fungovat) hlásí agent v návratu s dokladem (soubor a řádek, výstup příkazu); do `~/dev-pipeline-feedback.md` ji zapisuje orchestrátor (tvar ve skillu orchestrate).

## Společná pravidla agentů

- **Návrat je strojový** podle schématu, textová pole krátká; co se nevejde, jde do souboru v `docs/reviews/` (jen `.md` a `.json`; skripty do scratchpadu) a vrací se cesta. Tah končí jen strukturovaným návratem.
- **Dokumenty čti po sekcích:** vizi, PRD, scénáře a jiný dokument nad ~200 řádků `grep -n '^## '` a pak `sed -n a,bp` jen sekcí, které tvá role potřebuje. Kód symbolem (Serena), kde je language server; soubor do 350 řádků celý jedním Read, větší guard odmítne.
- **Proces na pozadí:** `run_in_background` a čekání v tomtéž tahu smyčkou s pevným počtem iterací (`for i in $(seq 1 26); do …; sleep 10; done`), jedno čekací volání nejvýš 4,5 minuty; `Monitor` v agentovi bloku nečeká.
- **Žádné otázky na uživatele**; handoff nečteš; auto-paměť se během běhu nepíše.
- **Sdílený strom:** po restartu i po předávce začni inventurou (`git status`, `git diff --stat`); cizí soubory neupravuj, neformátuj, nevracej; pracuj jen v hranici souborů své role, změnu jinde vrať v návratu. Mazání s proměnnou jen chráněně (`rm -f "${S:?}"/soubor`); žádný `git checkout`, `stash` ani `clean`.
- **Jména souborů** v `docs/reviews/` a `docs/e2e/`: `rez-NN-<co>.md`, `kolecko-<co>.md`; nikdy summary, findings, analysis ani report-.
- **Testy patří k chování, ne k řezu**; past v kódu se opravuje, ne dokumentuje.
