# Globální instrukce (~/.claude/CLAUDE.md)

Tohle je globální `CLAUDE.md`, se kterým pipeline běží. Zkopíruj ho do `~/.claude/CLAUDE.md` (nebo slouč se svým). První sekce je nutná: agenti pipeline předpokládají, že Serena je výchozí cesta k práci s kódem, a guard běhu odmítá čtení celých velkých zdrojových souborů. Druhá sekce je příklad „zvláštností stroje“: napiš si vlastní pro svůj shell a nástroje, protože každý bod v ní jednou vydal falešný úspěch.

## Serena — symbolické nástroje mají přednost

Serena (`mcp__serena__*`) je na tomto stroji nastavená ve všech projektech a je **výchozí
cesta k práci s kódem**. Není to doplněk k `Read`/`Grep` — u zdrojových souborů je nahrazuje.
Platí to i pro subagenty.

Místo → použij:

| Když chceš | Nepoužívej | Použij |
|---|---|---|
| tělo jedné funkce/třídy | `Read` celého souboru | `find_symbol` (`include_body=true`) |
| přehled, co v souboru je | `Read` celého souboru | `get_symbols_overview` |
| kdo symbol volá | `Grep` podle jména | `find_referencing_symbols` |
| kde je symbol definovaný | `Grep` | `find_declaration` |
| implementace interface/abstraktní metody | `Grep` | `find_implementations` |
| přepsat funkci/metodu | `Edit` | `replace_symbol_body` |
| přejmenovat napříč projektem | `Grep` + série `Edit` | `rename_symbol` |
| smazat symbol i s referencemi | ruční mazání | `safe_delete_symbol` |
| přidat kód před/za symbol | `Edit` | `insert_before_symbol` / `insert_after_symbol` |

Textové nástroje zůstávají správné pro: `.astro`, `.md`, konfigurace, logy, hledání
řetězců (ne symbolů), soubory mimo jazyky s language serverem, a rychlé přečtení
krátkého souboru celého.

Pozn.: `PreToolUse` hook `serena-hooks remind` **zablokuje** třetí `Grep` nebo třetí `Read`
zdrojového souboru v řadě (a čtvrté smíšené volání) a vrátí připomínku. Jakékoli symbolické
volání Sereny čítač resetuje. Není to náhodná chyba — je to signál, že jsi měl sáhnout po
symbolickém nástroji.

Serenu neaktivuj ručně; projekt se aktivuje sám z pracovního adresáře (`--project-from-cwd`).

## Zvláštnosti tohoto stroje (shell a nástroje)

Vlastnosti **stroje**, ne projektu: každá z nich vydá „úspěch", ačkoli nic neměřila, nebo ukáže
na špatnou příčinu. Projektové věci (adresy, přihlášení, interní síť) patří do runbooku repa.

- **Shell je `zsh`, ne bash.** `${PIPESTATUS[0]}` se rozvine na **prázdno** a kontrola návratovky
  roury tím netvrdí nic; správně je `${pipestatus[1]}` (zsh indexuje od 1). A `zsh` **nedělá word
  splitting** na nekvotovaných expanzích: `for X in $SEZNAM` dostane jedno slovo, takže se odešle
  slepenec a protistrana odpoví věcně (`NOT_FOUND`) — chyba tedy nemlčí, ale ukazuje na cizí
  systém. Správně `${=SEZNAM}`, pole, nebo `while IFS= read -r` nad souborem.
- **Roura přepíše návratovku** návratovkou posledního členu: `git commit … | tail` ohlásí úspěch
  nad commitem, který pre-commit brána odmítla, a `vitest … | grep` vrátí 0 nad během, který
  neproběhl. Přesměruj do souboru a návratovku čti zvlášť: `cmd > log 2>&1; echo $?`.
- **`grep` je tu funkce nad ripgrepem**, takže respektuje `.gitignore` a o vynechaných cestách
  mlčí — nula zásahů neznamená nula výskytů. Ignorované cesty prohledej zvlášť (`rg --no-ignore`,
  `git status --porcelain --ignored`). **`rg --files-from` neexistuje.**
- **Nejsou tu `psql`, `timeout` ani `gtimeout`** (coreutils nainstalované nejsou). Dlouhý běh
  ohranič procesem na pozadí a `kill`em, ne časovým limitem, který v prostředí není.
- **`dotenv` není z ESM skriptu resolvovatelný** — `.env` parsuj ručně. A `pg.query` bere
  **jeden** příkaz, ne dávku oddělenou středníky (pole dotazů + cyklus).
- **`replace_content` Sereny má v regexu DOTALL**, takže `.*` přeskočí konce řádků a jediná
  náhrada ustřihne stovky řádků. Vícerádkovou náhradu kotvi **oběma** konci, nebo edituj po
  blocích; u netrackovaného souboru neexistuje záchranná síť.
