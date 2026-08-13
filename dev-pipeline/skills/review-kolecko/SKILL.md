---
name: review-kolecko
description: Plné závěrečné review kolečko nad diffem celé vize (git diff main...HEAD) - thermo-nuclear strukturální audit, simplify, dvě code-review kola různými metodikami (vlastní agent + vestavěný workflow s širokým fan-outem), pak dvě souběžné bezpečnostní metodiky (vestavěný security-review + claude-security), po každém kole oprava všech nálezů. Invokuje ho orchestrátor ve finální fázi vize, nebo uživatel explicitně nad větší sérií změn. NEinvokovat na běžný diff nebo jednotlivý řez - tam patří jen lehké review přes agenta dev-pipeline:code-review.
---

# Review kolečko — plný závěrečný audit

**Kontrola před startem:** tohle kolečko patří jen do finální fáze vize (invokoval tě orchestrátor) nebo nad větší sérii změn na explicitní žádost uživatele. Pokud ani jedno neplatí — byl jsi invokován omylem nad běžným diffem — zastav se a doporuč lehké review přes agenta `dev-pipeline:code-review`.

Běží **jednou nad celkovým diffem vize** (per řez běží jen lehké review — to už proběhlo). Pořadí je záměrné: nejdřív struktura, pak zjednodušení, pak korektnost, nakonec bezpečnost — ať se correctness review nedělá nad kódem, který se ještě přestrukturuje. Kroky 3 až 6 záměrně běží i nad opravami předchozích kroků kolečka (thermo/simplify refaktory umí zavést vlastní bugy — correctness kola je chytají).

Scope: `git diff main...HEAD` (jiný base jen pokud ho uživatel/orchestrátor předá).

## Sekvence (po každém kroku: opravit nálezy → typecheck + testy → až pak další krok)

Kroky 1 až 4 jdou **striktně po sobě** — pořadí je celý smysl kolečka. Jediný povolený souběh je uvnitř kroku 5 (dvě bezpečnostní metodiky najednou).

1. **Thermo-nuclear**: spusť subagenta `dev-pipeline:thermo-nuclear-review` nad diffem. Opravy strukturálních nálezů dělej přes `dev-pipeline:fix` (předávej jim konkrétní nálezy, ne celý report). Presumptivní blockery z rubriky se opravují vždy; u sporných zapiš rozhodnutí do journalu.
2. **/simplify**: invokuj skill `simplify` (opravy aplikuje sám).
3. **Code-review kolo 1**: spusť subagenta `dev-pipeline:code-review` (`rozsah: vetev`, scope `git diff main...HEAD`, report do `docs/reviews/kolecko-code-review-kolo-1.md`). Vrátí verdikt a jednořádkové nálezy; plný report **nečti** — jeho cestu předej fix agentovi. Oprav všechny CONFIRMED nálezy; PLAUSIBLE posuď individuálně, rozhodnutí do journalu.
4. **Code-review kolo 2 — širokým fan-outem přes Workflow.** Kolo 1 běželo naším agentem (rodič + 3 lensy = 4 subagenti, laděné na přesnost). Kolo 2 nad diffem celé vize pusť naopak nejširší dostupnou metodikou: vestavěný workflow `code-review`.

   ```
   Workflow({ name: "code-review", args: "xhigh <base>...HEAD — <2-4 věty kontextu: co vize dělala, kde je největší riziko, co je vědomé rozhodnutí a nemá se hlásit jako regrese>" })
   ```

   - **Tenhle bod je platný opt-in k orchestraci** — Workflow tool smí model spustit, když mu to instrukce skillu nařizuje. Neptej se uživatele na svolení a nenahrazuj to vlastním průchodem.
   - Co to je: scope agent → 5 correctness finderů (každý jiná osa: diff po řádcích, odstraněné chování, cross-file volající, jazykové pasti, wrapper/proxy) + 1 cleanup finder → jeden nezávislý verifier na každou dvojici (soubor, řádek) → sweep finder na mezery → synthesize. Naměřeno na ostrém běhu: **40 subagentů, ~50 minut, 23 souborů**. Proto patří jen sem, nad diff celé vize — na jeden řez je to desetinásobek ceny lehkého review.
   - Běží na pozadí a nálezy dorazí jako task notifikace (max 15, seřazené podle závažnosti). Mezitím **nezačínej krok 5** — pořadí kolečka je celý jeho smysl.
   - **Verifikace tam jede v recall režimu** („PLAUSIBLE by default"): na ostrém běhu prošlo 51 z 52 kandidátů. Nálezy proto **nejdřív triážuj** podle pravidla o velkém diffu níž (opravit teď / follow-up / odmítnout se zdůvodněním), teprve pak pouštěj fix agenty. Brát celý seznam jako CONFIRMED znamená přepisovat funkční kód.
   - Report do souboru si workflow nepíše. Než pustíš fix agenty, **zapiš nálezy sám** do `docs/reviews/kolecko-code-review-kolo-2.md` (jeden odstavec na nález, formát jako u našeho agenta) a fixům předávej cestu k souboru, ne obsah.
   - **Fallback:** když Workflow tool v session není, workflows jsou vypnuté nebo invokace selže, jeď kolo 2 agentem `dev-pipeline:code-review` jako kolo 1 (čerstvý kontext, report do téže cesty) a zapiš záznam `SELHALO` do `~/.claude/dev-pipeline-feedback.md`.

**Skill `code-review` neinvokuj nikdy** (ani `/code-review`): má `disable-model-invocation: true`, žádný model ho přes Skill tool nespustí a pokus jen spálí tah. To je něco jiného než `Workflow({name: "code-review"})` z kroku 4 — ta cesta zakázaná není a je to právě ta metodika, kterou by skill spustil, kdyby ho spustit šlo. Ani jedno kolo **nikdy nedělej vlastním průchodem v téhle session**: review celé vize by ti proteklo do kontextu, ze kterého pak řídíš opravy. Když subagent typ `dev-pipeline:code-review` v téhle session neexistuje (nastartovala před jeho přidáním), spusť general-purpose subagenta s absolutní cestou k `agents/code-review.md` téhož pluginu a pokynem řídit se jím doslova.
5. **Bezpečnost — dvě metodiky, spuštěné souběžně.** Obě jsou read-only, takže si nemají kde vadit; rozešli je **jedním blokem tool callů v jedné zprávě** a opravuj až po návratu obou.
   - **5a. Vestavěné:** invokuj skill `security-review` nad diffem.
   - **5b. claude-security:** spusť subagenta `claude-security:claude-security` se zadáním, které **plně určuje job** a přeskočí tak jeho interaktivní menu:

     > `scan changes --base main --effort high` — I understand it will use a lot of tokens.

     Ta věta o tokenech tam musí být doslova: recipe ji počítá jako odpověď na svoji fixní potvrzovací otázku, kterou by jinak položil přes `AskUserQuestion` — a na tu v subagentovi nemá kdo odpovědět. Base uprav, pokud kolečko běží proti jinému než `main`. Agent skenuje **jen commitnuté změny** — než ho spustíš, ověř, že pracovní strom je čistý, jinak mu poslední opravy uniknou. Report si píše do `CLAUDE-SECURITY-<timestamp>/` v repu; **ten adresář patří do `.gitignore`** (doplň ho, když chybí) a nikdy se necommituje. Patche, které navrhne, se **neaplikují automaticky** — ber je jako nálezy a opravuj přes `dev-pipeline:fix` jako všechno ostatní.
   - Proč dvě různé metodiky místo dvou stejných kol: dvě stejná najdou skoro totéž. Vestavěný skill čte diff; claude-security staví threat model, hledá po komponentách a každý nález prohání tříhlasým verifikačním panelem. Nálezy z obou **slouč** (stejné místo = jeden nález s vyšší závažností), teprve pak opravuj.
   - **Když `claude-security:claude-security` v session není** (plugin nenainstalovaný, subagent typ neexistuje): jeď druhé kolo vestavěným `security-review` jako dřív a zapiš záznam do `~/.claude/dev-pipeline-feedback.md`. Nezkoušej ho suplovat vlastním průchodem v téhle session.
6. **Oprava bezpečnostních nálezů**: po návratu obou. Vše potvrzené oprav (u multi-tenant projektů zvláštní důraz na org isolation — projít VŠECHNY dotčené routes/tools, ne jen nové). Pak typecheck + testy.
7. **Závěr**: finální typecheck + kompletní testy + build. Append souhrn kolečka do `docs/journal.md` (kolik nálezů per kolo, co zásadního se změnilo, kolik nálezů přinesla která bezpečnostní metodika). Pusť na `docs/journal.md` formátovač projektu. Vytvoř `docs/.review-passed`.

## Pravidla

- Nikdy nepřeskakuj kolo, protože „minulé nic nenašlo".
- **U velkého diffu (10+ commitů) nálezy z kola 2 nejdřív kategorizuj, teprve pak opravuj.** Kolo 2 nad diffem celé vize vrací klidně 40 nálezů; „opravit všechny" na konci vize znamená rozsáhlé zásahy do nasazeného kódu. Tři kategorie, každý nález do jedné: **opravit teď** · **follow-up jako kandidát na řez** (typicky „přepiš datový model") · **odmítnout se zdůvodněním do journalu**. Bez kategorizace kolo 2 buď přeteče, nebo se z něj stane seznam, který nikdo nezpracuje.
- **Paralelním fix agentům předávej DISJUNKTNÍ množiny souborů**, ne rozdělené nálezy. Dělení jde po doménách/souborech; když se dva nálezy potkávají nad týmž souborem, jdou oba jednomu agentovi. Dva agenti nad jedním souborem si přepíšou práci.
- **Nález předávej fix agentovi jako hypotézu, ne jako hotový návrh** — a explicitně žádej „posuď návrh proti kódu, a když nesedí, oprav skutečnou příčinu a rozdíl vysvětli". Bez té věty agenti opravují popis místo příčiny: z devíti oprav v jednom ostrém kolečku **čtyři** odhalily, že původní nález mířil vedle. Agent `dev-pipeline:fix` to má v sobě; když ho nahrazuješ general-purpose agentem, musí ta věta být v promptu.
- **Když invokace skillu selže** (`simplify`, `security-review` — typicky hláška `cannot be used with Skill tool due to disable-model-invocation`, Anthropic tenhle příznak mezi verzemi mění): kolo nepřeskakuj ani ho tiše nenahrazuj vlastním průchodem v téhle session. Postup je vždy stejný: (1) proveď náhradní průchod v general-purpose subagentovi s explicitním zadáním, co má hledat, (2) zapiš záznam typu `SELHALO` do `~/.claude/dev-pipeline-feedback.md` (formát v PIPELINE.md, sekce Zpětná vazba na pipeline) s názvem skillu a náhradou, (3) uveď to v souhrnu kolečka do journalu. Tichá ruční náhrada je nejhorší varianta — vypadá jako úspěch a kvalita kola přitom spadne na improvizaci.
- **Security nálezy se opravují hned**, i pre-existing mimo diff vize: potvrzená bezpečnostní chyba (org isolation, auth, únik tokenů) nikdy nečeká na schválení uživatele ani nejde do follow-ups — samostatný commit `fix(security): …` + záznam do journalu. Follow-up je přípustný jen u sporného nálezu bez jasného fixu. U multi-tenant projektů audituj i child tabulky bez vlastního org_id sloupce (izolace přes join chain na parent).
- Oprava nálezu nesmí obejít podstatu (žádné suppress/ignore/quick fix) — pokud je nález sporný, radši ho zapiš jako vědomé rozhodnutí do journalu, než ho zamaskovat.
- Držení kontextu: reporty konzumuj, oprav, zahoď — nenos celé reporty dál.
