---
name: review-kolecko
description: Plné závěrečné review kolečko nad diffem celé vize (git diff main...HEAD) - thermo-nuclear strukturální audit, /simplify, 2x code-review, 2x security review, po každém kole oprava všech nálezů. Invokuje ho orchestrátor ve finální fázi vize, nebo uživatel explicitně nad větší sérií změn. NEinvokovat na běžný diff nebo jednotlivý řez - tam patří jen lehké /code-review.
---

# Review kolečko — plný závěrečný audit

Běží **jednou nad celkovým diffem vize** (per řez běží jen lehké review — to už proběhlo). Pořadí je záměrné: nejdřív struktura, pak zjednodušení, pak korektnost, nakonec bezpečnost — ať se correctness review nedělá nad kódem, který se ještě přestrukturuje.

Scope: `git diff main...HEAD` (jiný base jen pokud ho uživatel/orchestrátor předá).

## Sekvence (po každém kroku: opravit nálezy → typecheck + testy → až pak další krok)

1. **Thermo-nuclear**: spusť subagenta `dev-pipeline:thermo-nuclear-review` nad diffem. Opravy strukturálních nálezů dělej přes fix subagenty (předávej jim konkrétní nálezy, ne celý report). Presumptivní blockery z rubriky se opravují vždy; u sporných zapiš rozhodnutí do journalu.
2. **/simplify**: invokuj skill `simplify` (opravy aplikuje sám).
3. **Code-review kolo 1**: invokuj skill `code-review` (high). Oprav všechny CONFIRMED nálezy; PLAUSIBLE posuď individuálně, rozhodnutí do journalu.
4. **Code-review kolo 2**: znovu `code-review` — ověří opravy a čerstvým pohledem najde, co kolo 1 minulo. Oprav.
5. **Security kolo 1**: invokuj skill `security-review`. Oprav vše potvrzené (u multi-tenant projektů zvláštní důraz na org isolation — projít VŠECHNY dotčené routes/tools, ne jen nové).
6. **Security kolo 2**: znovu `security-review`. Oprav.
7. **Závěr**: finální typecheck + kompletní testy + build. Append souhrn kolečka do `docs/journal.md` (kolik nálezů per kolo, co zásadního se změnilo). Vytvoř `docs/.review-passed`.

## Pravidla

- Nikdy nepřeskakuj kolo, protože „minulé nic nenašlo".
- Oprava nálezu nesmí obejít podstatu (žádné suppress/ignore/quick fix) — pokud je nález sporný, radši ho zapiš jako vědomé rozhodnutí do journalu, než ho zamaskovat.
- Držení kontextu: reporty konzumuj, oprav, zahoď — nenos celé reporty dál.
