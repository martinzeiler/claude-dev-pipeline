# Fixture co-dela: zmrazená stavba řezu s částmi

Journal Workflow `wf_ece928d4-9a1` (blok stavby, řez 16 běhu zaklad-dat, 25. 10. 2026) ořezaný k času
`2026-10-25T18:07:00Z`: záznamy `started` agentů, kteří do té doby začali, a `result` těch, kteří do té doby skončili.
Pole jen ta, která `scripts/co-dela.sh` čte (`type`, `key`, `agentId`, `label`, `phase`); texty výsledků jsou zástupné,
výsledek části K1 nese **surové znaky U+2028 a U+2029** jako v původním journalu (to je kořen chyby: `str.splitlines()`
na nich řádek rozdělil, `result` se ztratil a hotový agent vypadal 42 minut jako živý a mlčící).

- `journal.jsonl`: 39 záznamů (1 launched, 20 started, 18 result).
- `casy.tsv`: `agentId`, vznik a poslední zápis transkriptu (UTC); test z nich dělá prázdné transkripty s `touch -d`.
- `meta/agent-<id>.meta.json`: `agentType`, `description`, `workflowPhase`, `model`.
- `faze.txt`: názvy fází bloku v pořadí (test z nich skládá `workflows/scripts/blok-stavby-<wf>.js`).

Test: `tests/skripty/co-dela.sh` (sekce 1.9.0) spouští `co-dela.sh --session <kopie> --ted 2026-10-25T18:07:00Z --kratce`
a čeká: K1 není mezi živými, fáze Části je hotová, živí jsou jen fix agenti bez výsledku, nikdo „nemlčí“.
