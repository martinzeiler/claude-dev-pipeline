---
name: review-kolecko
description: Plné závěrečné review kolečko nad diffem celé vize (git diff main...HEAD) - thermo-nuclear strukturální audit, simplify, 2x code-review, 2x security review, po každém kole oprava všech nálezů. Invokuje ho orchestrátor ve finální fázi vize, nebo uživatel explicitně nad větší sérií změn. NEinvokovat na běžný diff nebo jednotlivý řez - tam patří jen lehké review přes agenta dev-pipeline:code-review.
---

# Review kolečko — plný závěrečný audit

**Kontrola před startem:** tohle kolečko patří jen do finální fáze vize (invokoval tě orchestrátor) nebo nad větší sérii změn na explicitní žádost uživatele. Pokud ani jedno neplatí — byl jsi invokován omylem nad běžným diffem — zastav se a doporuč lehké review přes agenta `dev-pipeline:code-review`.

Běží **jednou nad celkovým diffem vize** (per řez běží jen lehké review — to už proběhlo). Pořadí je záměrné: nejdřív struktura, pak zjednodušení, pak korektnost, nakonec bezpečnost — ať se correctness review nedělá nad kódem, který se ještě přestrukturuje. Kola 3–6 záměrně běží i nad opravami předchozích kroků kolečka (thermo/simplify refaktory umí zavést vlastní bugy — correctness kola je chytají).

Scope: `git diff main...HEAD` (jiný base jen pokud ho uživatel/orchestrátor předá).

## Sekvence (po každém kroku: opravit nálezy → typecheck + testy → až pak další krok)

1. **Thermo-nuclear**: spusť subagenta `dev-pipeline:thermo-nuclear-review` nad diffem. Opravy strukturálních nálezů dělej přes fix subagenty (předávej jim konkrétní nálezy, ne celý report). Presumptivní blockery z rubriky se opravují vždy; u sporných zapiš rozhodnutí do journalu.
2. **/simplify**: invokuj skill `simplify` (opravy aplikuje sám).
3. **Code-review kolo 1**: spusť subagenta `dev-pipeline:code-review` (effort `high`, scope `git diff main...HEAD`). Oprav všechny CONFIRMED nálezy; PLAUSIBLE posuď individuálně, rozhodnutí do journalu.
4. **Code-review kolo 2**: znovu tentýž agent (čerstvý kontext) — ověří opravy a novým pohledem najde, co kolo 1 minulo. Oprav.

**Nikdy neinvokuj skill `code-review`** (ani `/code-review`): má `disable-model-invocation: true`, žádný model ho přes Skill tool nespustí. Kdybys ho po chybě nahradil vlastním průchodem, review celé vize by ti navíc proteklo do téhle session — proto obě kola vždy v subagentovi. Když subagent typ `dev-pipeline:code-review` v téhle session neexistuje (nastartovala před jeho přidáním), spusť general-purpose subagenta s absolutní cestou k `agents/code-review.md` téhož pluginu a pokynem řídit se jím doslova.
5. **Security kolo 1**: invokuj skill `security-review`. Oprav vše potvrzené (u multi-tenant projektů zvláštní důraz na org isolation — projít VŠECHNY dotčené routes/tools, ne jen nové).
6. **Security kolo 2**: znovu `security-review`. Oprav.
7. **Závěr**: finální typecheck + kompletní testy + build. Append souhrn kolečka do `docs/journal.md` (kolik nálezů per kolo, co zásadního se změnilo). Vytvoř `docs/.review-passed`.

## Pravidla

- Nikdy nepřeskakuj kolo, protože „minulé nic nenašlo".
- **Když invokace skillu selže** (`simplify`, `security-review` — typicky hláška `cannot be used with Skill tool due to disable-model-invocation`, Anthropic tenhle příznak mezi verzemi mění): kolo nepřeskakuj ani ho tiše nenahrazuj vlastním průchodem v téhle session. Postup je vždy stejný: (1) proveď náhradní průchod v general-purpose subagentovi s explicitním zadáním, co má hledat, (2) zapiš záznam typu `SELHALO` do `~/.claude/dev-pipeline-feedback.md` (formát v PIPELINE.md, sekce Zpětná vazba na pipeline) s názvem skillu a náhradou, (3) uveď to v souhrnu kolečka do journalu. Tichá ruční náhrada je nejhorší varianta — vypadá jako úspěch a kvalita kola přitom spadne na improvizaci.
- **Security nálezy se opravují hned**, i pre-existing mimo diff vize: potvrzená bezpečnostní chyba (org isolation, auth, únik tokenů) nikdy nečeká na schválení uživatele ani nejde do follow-ups — samostatný commit `fix(security): …` + záznam do journalu. Follow-up je přípustný jen u sporného nálezu bez jasného fixu. U multi-tenant projektů audituj i child tabulky bez vlastního org_id sloupce (izolace přes join chain na parent).
- Oprava nálezu nesmí obejít podstatu (žádné suppress/ignore/quick fix) — pokud je nález sporný, radši ho zapiš jako vědomé rozhodnutí do journalu, než ho zamaskovat.
- Držení kontextu: reporty konzumuj, oprav, zahoď — nenos celé reporty dál.
