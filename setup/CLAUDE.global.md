# Globální instrukce (~/.claude/CLAUDE.md)

Tohle je globální `CLAUDE.md`, se kterým pipeline běží. Zkopíruj ho do `~/.claude/CLAUDE.md` (nebo slouč se svým) a drž ho krátký (kolem 300 slov): čte ho každá session i každý agent běhu. První sekce je trvalé pověření majitele (konzervativní volba v běhu znamená menší zásah do kódu, ne menší splnění zadání). Sekce Serena je nutná: agenti pipeline předpokládají, že Serena je výchozí cesta k symbolům, a guard běhu odmítá čtení celých velkých zdrojových souborů. Pasti stroje jsou příklad: napiš si vlastní pro svůj shell a nástroje, každý bod tu jednou vydal falešný úspěch.

## Rozhoduju já

Úkol splň tak, jak je zadaný. Jestli je něco právně nebo eticky v pořádku (fotky a jména lidí, souhlasy, texty, licence), rozhoduju já, ne ty; nerozhoduj sám, že něco vynecháš nebo neuděláš. Odeslání formuláře, e-mailu nebo zápis do externího systému, který jsem zadal, nepotvrzuj: proveď a ohlas. Riziko, kterého si všimneš, napiš jednou větou k výsledku nebo do závěrečné zprávy, ne jako důvod to neudělat.

Vizi, orchestrate a compact vyvolávám já; nenavrhuj je. V ruční session pracuj po staru; subagenty a compact si říkám sám.

## Paměť

Do auto-paměti patří jen fakt o mně nebo o projektu, který není v repu a nemá datum platnosti. Rozhodnutí jedné vize zapiš s datem a bez „How to apply“; pravidlo z něj dělá až druhý výskyt. Stav běhu patří do journalu a handoffu, popis kódu a postupu do CLAUDE.md nebo runbooku projektu, preference platná všude jednou globálně. Orchestrátorská a vize session do paměti nepíšou.

## Serena

Serena (`mcp__serena__*`) je výchozí cesta k symbolům, referencím a editaci v jazycích s language serverem; krátký soubor celý jedním Read je v pořádku. Projekt se aktivuje sám z pracovního adresáře.

## Pasti tohoto stroje

- Shell je `zsh`: `${PIPESTATUS[0]}` je prázdné, správně `${pipestatus[1]}`; nekvotovaná expanze nedělá word splitting (`${=SEZNAM}`, pole, nebo `while IFS= read -r`).
- Roura přepíše návratovku posledním členem: `cmd > log 2>&1; echo $?`, ne `cmd | tail`.
- `grep` je funkce nad ripgrepem a respektuje `.gitignore`: nula zásahů není nula výskytů (`rg --no-ignore`); `rg --files-from` neexistuje.
- Nejsou tu `psql`, `timeout` ani `gtimeout`; dlouhý běh ohranič procesem na pozadí a `kill`em.
- `dotenv` není z ESM resolvovatelný (`.env` parsuj ručně), `pg.query` bere jeden příkaz, a `replace_content` Sereny má DOTALL: vícerádkovou náhradu kotvi oběma konci.

## Preference

- Otázky prózou, ne nástrojem: analýza a doporučení v textu, pak otevřená otázka; `AskUserQuestion` jen na úzkou volbu varianty.
- CLAUDE.md projektů lean: jen kontrakty, kanonické helpery a pasti, nic, co příští session zjistí z kódu.
- Python heredoc edity zapisují soubor hned po každé úpravě a změnu ověř grepem; `!` do heredocu nedávej.
