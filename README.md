# claude-dev-pipeline

Osobní vývojová pipeline pro Claude Code: **vize → plán řezů → autonomní běh → závěrečný audit → validace**. Jedno schválení před během (vize) a jedna lidská brána po něm (merge do main). Od verze 1.0.0 má běh tři vrstvy:

1. **Orchestrátor** je nejsilnější model v session uživatele. Drží celou vizi a plán řezů, vybírá řezy, schvaluje souhrn PRD, hlídá drift, smí měnit cestu k Cílům (nikdy Cíle) a píše krátké zprávy o stavu. Nečte kód, PRD, reporty ani diffy; na všechno posílá agenty. Kontext drží pod ~300k tokenů za dvanáct hodin.
2. **Dva Workflow bloky pluginu** (`workflows/blok-prd.js`, `workflows/blok-stavby.js`) jsou deterministický běžec řezu: pořadí kroků, stropy kol, opakování, diagnóza po druhém neúspěchu a strojové návraty jsou v kódu, ne v úsudku modelu.
3. **Fázoví agenti** s modelem a effortem natvrdo (`agents/*.md`), každý s jednou rolí a strukturovaným návratem.

Stav běhu žije v souborech projektu (`docs/handoff.md` s tabulkou plánu do 4 kB, PRD, journal, follow-ups), ne v kontextu.

## Instalace

Repo je zároveň plugin marketplace. Na novém stroji:

```bash
git clone <url-tohoto-repa> ~/claude-dev-pipeline
```

Do `~/.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "claude-dev-pipeline": {
      "source": { "source": "directory", "path": "/Users/<user>/claude-dev-pipeline" }
    }
  },
  "enabledPlugins": { "dev-pipeline@claude-dev-pipeline": true },
  "autoContinueAtUsageLimit": true
}
```

(Interaktivně: `/plugin marketplace add ~/claude-dev-pipeline`, `/plugin install dev-pipeline@claude-dev-pipeline`.) Skripty musí být spustitelné: `chmod +x ~/claude-dev-pipeline/dev-pipeline/hooks/*.sh ~/claude-dev-pipeline/dev-pipeline/scripts/*.sh`. `autoContinueAtUsageLimit` nechá Workflow bloky pokračovat po usage limitu samy (Claude Code 2.1.271+).

Volitelně plugin **claude-security** (`/plugin install claude-security@claude-plugins-official`): sken se spouští **jen na vyžádání** (hlavička vize `bezpecnostni_sken: changes|codebase`, nebo výslovná žádost), přímo Workflowem `claude-security:scan` z orchestrátora; jeho agenti dědí model session, na Fable session to je 100+ agentů Fable xhigh. Recept ve skillu `review-kolecko`.

### Co teď agenti dělají

`dev-pipeline/scripts/co-dela.sh` čte journal a metadata agentů ze session (žádný model, žádné diffy) a vypíše běžící Workflow, živé agenty s fází, modelem, časem od posledního zápisu a posledními voláními. Tři režimy: bez argumentu plný výpis (v cwd projektu s běžícím orchestrátorem, nebo `--session <dir>` / `--transcript <cesta.jsonl>`), `--kratce` pro cron orchestrátora (každých 30 minut ho vloží do odpovědi, takže session nese časovou řadu toho, co agenti dělali), `--status` pro status line. Status line: `~/.claude/statusline.sh` volá `co-dela.sh --status` a přidá segment `▶ <živí agenti> · <nejdéle mlčící> · <m:ss>` (žlutě přes 15 min, červeně přes 30 min); v `settings.json` je `statusLine.refreshInterval: 30`, bez něj se řádek během tichého Workflow nepřekreslí (ověřeno v Claude Code 2.1.274). V session jde skript zavolat i ručně přes `! bash ~/claude-dev-pipeline/dev-pipeline/scripts/co-dela.sh`.

### Refresh po editaci pluginu

Directory-source marketplace se kopíruje do cache; editace zdrojového adresáře se do sessions nepropíše sama. Po každé změně: bump `version` v `dev-pipeline/.claude-plugin/plugin.json` (při stejné verzi updater hlásí „already at latest" a cache neobnoví), pak `claude plugin update dev-pipeline@claude-dev-pipeline` a nová session. Při vývoji pluginu je jednodušší `claude --plugin-dir ~/claude-dev-pipeline/dev-pipeline`. Nový agent nebo workflow = nová session (registr se čte při startu).

## Cyklus jedné vize

**Tvoje kroky jsou 1, 3 a 4. Krok 2 běží sám.**

1. **`/vize`** (interaktivní, jediný schvalovací bod před během). Debatní session v grill-me stylu: široký paralelní fact-finding, research bez ptaní, seznam otevřených otázek v draftu, tvar UI a seznam UI ploch, **test smazání pro každý ochranný mechanismus** (zámek, strop, potvrzení musí sedět na hranici nevratnosti, jinak do vize nepatří), **Povolení pro zápis do živých systémů** (účet, operace, meze, platnost; běh se pak už neptá), na konci **plán řezů** (tabulka: číslo, název, body vize, definice hotového, závislosti) a čerstvé oči z několika rolí včetně role orchestrátora. Tělo vize do 40k tokenů, přílohy v `docs/vize/<slug>/`. Výstup `docs/vize/<slug>.md` commitnutý. Jediné místo, kde vzniká a mění se produktová severka `docs/produkt.md`.
2. **Napsat jako prompt `/dev-pipeline:orchestrate docs/vize/<slug>.md`** v nové session na nejsilnějším modelu (hook si z toho promptu uloží identitu session; spuštěno jinak se setup nemá čeho chytit). Doporučeno `/autocompact 400k`. Co proběhne samo:
   - **Setup** (`scripts/orchestrate-setup.sh`): čistý strom, archivace stavu předchozí vize do `docs/archive/<slug>/` (přeškrtnuté follow-ups do archivu, živý soubor jen otevřené), `.gitignore`, větev `vize/<slug>`, marker `docs/.orchestrator-run` se session_id, handoff s tabulkou plánu z vize; necommitnutá vize, gitignore, archiv i stavové soubory jdou do **jediného commitu** (projekt s pomalou pre-commit bránou ji platí jednou). Reporty předchozí vize jdou do `docs/reviews/_archiv/<slug>/`. Pak cron „zkontroluj stav běhu" každých 30 minut, který nejdřív vloží výstup `co-dela.sh --kratce` (co agenti dělají) a teprve pak jedná podle handoffu.
   - **Smyčka řezů**: orchestrátor vybere řádek plánu → `Workflow dev-pipeline:blok-prd` (PRD a E2E scénáře → prd-check → zapracování → delta kontrola nad změněnými místy; žádné třetí kolo, zbylé nálezy jdou stavbě jako hypotézy) → schválení souhrnu PRD proti vizi (body vize, žádná UI plocha mimo seznam, zápis do živého jen s Povolením) → `Workflow dev-pipeline:blok-stavby` (refresh PRD nad dnešním stromem, když od PRD zestárl · implementace s plnou suitou jednou na konci → thermo **souběžně** s code-review → opravy po balíčcích souběžně, thermo nálezy v téže vlně, nejvýš dvě kola review → brána: **jediná plná suita**, zelená zapíše `docs/.verify-passed` → deploy jedním commitem včetně docs → E2E s jedním opakováním, verdikt z počtů; vadné kritérium (nesplnitelné, kolidující, předřezový nález) se neopravuje, řez se uzavře a kritérium jde majiteli jako otázka s navrženou odpovědí → bezpečnostní nálezy samostatným commitem → uzavření: PRD status, sesouhlasení thermo, kontrola dokladů, journal, follow-ups; až tři pokusy, před třetím diagnóza) → aktualizace tabulky, pevný blok zprávy uživateli, další řez. **Blok PRD dalšího řezu běží souběžně se stavbou aktuálního, výhled je přesně jeden řez** (PRD psané dál dopředu vzniklo nad stromem, který se do stavby změnil); handoff nese oba tasky. Každý agent bloku stavby dostává Ne-cíle vize v rámci zadání, i fix a thermo. Odmítnutou odchylku PRD řeší blok PRD v režimu zapracování (jeden PRD agent + delta kontrola), ne nové PRD.
   - **Drift**: orchestrátor mění cestu, ne cíl (pořadí, dělení, sloučení, přidání řezu, který Cíl potřebuje), každou změnu zapíše a oznámí. Nálezy review ani E2E nikdy nezakládají řez. Zastaví se jen ze šesti důvodů: změna Cíle, Ne-cíle, rozhodnutí nebo severky · rozsah, který žádný Cíl nepotřebuje · blok stavby selhal třikrát i s diagnózou · blokující bezpečnostní nález v nasazeném kódu · zápis do živého systému bez Povolení · dvojnásobek řezů proti plánu. Otázky během běhu hook odmítá.
   - **Finální fáze**: review kolečko jako `Workflow dev-pipeline:blok-kolecko` (thermo → code-review kolo 1 → kolo 2 fan-outem pěti čoček s triáží → bezpečnost → nasazení a E2E kolečka → `docs/.review-passed`; po každé vlně oprav brána a commit) → sken claude-security jen na vyžádání → vize-validator (Fable) → mini-řezy z jeho sekce „dodělat automaticky" → odstranění lešení → sklizeň follow-ups, feedback souboru a velikosti CLAUDE.md → závěrečná zpráva do `docs/zaverecna-zprava.md` (ROZHODNUTÍ PRO TEBE jen změny Cílů a mantinelů; OTÁZKY S NAVRŽENOU ODPOVĚDÍ pro kolize, vadná kritéria a nesplněné body) → zastavení zbylých úloh na pozadí a notifikace.
3. **Přečti závěrečnou zprávu** (per řez jeden řádek, stav Cílů, Rozhodnutí pro tebe, Spory ve vizi, Paměť a dokumentace, Pipeline) a proklikej aplikaci.
4. **Merge `vize/<slug>` do main** děláš ty. Autonomní běh na main nikdy nesahá.

Kdykoli během běhu můžeš orchestrátorovi napsat: odpoví z tabulky nebo pošle agenta, běh nepřeruší. Po compactu mu hook vrátí tabulku plánu a krátký `PO-COMPACTU.md`; vizi si přečte znovu celou.

## Agenti

| Agent | Model / effort | Role |
|---|---|---|
| `prd` | Opus 5 high | PRD a E2E scénáře podle řádku plánu; zapracování nálezů s návratem změněných míst |
| `prd-check` | Opus 5 high | Nezávislá kontrola PRD (úplnost, validita proti kódu, kritéria, rozsah, optimalita); delta kolo |
| `implement` | Opus 5 high | TDD implementace; testy k chování, ne k řezu; past ve svých souborech opravuje |
| `code-review` | Opus 5 high | Korektnost; nálezy CONFIRMED/PLAUSIBLE a BLOKUJE/FOLLOW-UP; návrat jako balíčky po souborech |
| `diagnose` | Opus 5 high | Po dvou neúspěších: reprodukční smyčka a doložená příčina, neopravuje |
| `fix` | Opus 5 medium | Oprava nálezů jako hypotéz; vrací změněná místa a rozšířený zásah |
| `thermo-nuclear-review` | Opus 5 medium | Strukturální audit; nálezy BLOCKER/HIGH/NOTE pro omezenou opravu |
| `e2e-verifier` | Opus 5 medium | Kritéria proti běžící aplikaci, PASS / PASS-částečně / FAIL, nálezy mimo kritéria podle závažnosti |
| `deploy` | Sonnet 5 low, bez CLAUDE.md | Commit a nasazení podle runbooku projektu, doložený stav |
| `verify` | Sonnet 5 low, bez CLAUDE.md | Typecheck a plná suita (jediná v řezu), skutečné výstupy; zelená zapíše `docs/.verify-passed` přes `scripts/verify-marker.sh` |
| `vize-validator` | Fable 5.1 high | Čerstvé oči na konci: Cíle, zákazy, lešení, změny plánu, detaily |
| `plan-check` | Opus 5 high | Mimo běh: post-implementační kontrola plánu |

Effort `xhigh` se nepoužívá nikde; kvalita má přednost před úsporou, ale měřeno na minulém běhu rozhoduje o tokenech počet tahů na agenta a velikost preambule, ne účet za přemýšlení. Tvar souborů, markerů a návratů je v `dev-pipeline/skills/orchestrate/KONTRAKT.md`.

## Hooky

Všechny hooky běhu se samy hlídají markerem `docs/.orchestrator-run` a jeho `session_id`: v projektu bez běhu a v jiné session téhož projektu nedělají nic (cizí session dostane jednu větu, že orchestrace běží jinde).

- **guard-blast-radius** (PreToolUse/Bash, vždy): force-push, `git reset --hard` a `git clean -f` na main, `rm -rf` na kořeny, deploy během běhu bez `docs/.deploy-unlocked`.
- **guard-run** (PreToolUse): v orchestrátorské session odmítne `AskUserQuestion`, čtení projektu mimo vizi, handoff, vize-spory, follow-ups a soubory pluginu, spouštění projektu (balíčkovač, testy, curl, deploy, diffy) a editaci mimo `docs/`; u subagentů čtení celého zdrojového souboru nad 350 řádků (Read bez offset/limit, `cat`, `sed -n` přes celek, `head`/`tail` nad práh), s odkazem na Serenu. Fail-open: nejednoznačné projde.
- **on-stop** (Stop): tah orchestrátora smí skončit jen ve stavech `běží …`, `zastaveno …`, `hotovo`; jinak vrátí důvod a orchestrátor pokračuje.
- **pre-compact** (PreCompact): varování, když handoff přesáhl 4 kB.
- **session-start-handoff** (SessionStart startup/compact/resume): orchestrátorské session po compactu a resume vrátí prvních 4 kB handoffu a `PO-COMPACTU.md`.
- **prompt-submit** (UserPromptSubmit): při promptu `/dev-pipeline:orchestrate` uloží session_id do `docs/.orchestrator-session` pro setup.

Guard běhu navíc odmítá ruční zápis `docs/.verify-passed` (Write/Edit i přesměrování v Bash); ten smí jen `scripts/verify-marker.sh`.

Testy hooků: `dev-pipeline/hooks/tests/run.sh` (88 případů nad syntetickými vstupy, bash 3.2). Guard blast-radius má vlastní `scripts/test-guard.py`.

## Brána projektu (pre-commit)

Z analýzy běhu sklik: 362 commitů, 55 % bez změny kódu (docs, build marker), plná suita ~5 min a rostla o minutu týdně; agenti navíc pouštěli plnou suitu opakovaně ve fix fázích. Verze 1.0.0 proto pouští plnou suitu jednou na řez (verify) a doporučuje pre-commit hook projektu ve třech patrech: staged jen `docs/**` a `*.md` → nic; typecheck a rychlé kontroly vždy; plná suita jen bez platného `docs/.verify-passed` (hash pracovního stromu bez `docs/` jako v `scripts/tree-hash.sh`, takže dokumenty běhu marker nezneplatní; hook i skript musí počítat stejně). Vzor je `.husky/pre-commit` v Surya-PPC-Tool. Bez takového hooku běh funguje, jen platí suitu dvakrát.

## Zásady, které přežily měření

- **Nálezy jdou do souborů, návraty jsou strojové.** Reporty do `docs/reviews/` (gitignorováno), orchestrátor je nikdy nečte; schémata návratů vynucují Workflow bloky.
- **Kód se čte symbolem** (Serena), ne celými soubory; guard to u velkých zdrojových souborů vynutí i přes `cat` a `sed`.
- **Testy patří k chování, ne k řezu.** Žádné soubory pojmenované po řezu; verifikační lešení se po ověření maže.
- **Past se opravuje, ne dokumentuje.** CLAUDE.md projektu jsou pravidla, ne deník běhu; finální fáze hlásí, co v něm během běhu přibylo.
- **Záporné kritérium se dokládá mutací, ne zelenou.** Kritérium o umístění má obě půlky. Mutace se vrací opačnou editací, nikdy `git checkout`, `restore`, `stash` ani `reset`.
- **Bezpečnostní nález se opravuje hned**, i pre-existing, samostatným commitem.
- **Na agenta se nečeká pollingem**; notifikace přijde sama, cron je záchranná síť. Dlouhé příkazy na pozadí.
- **Jedna vize v čase per projekt** (sdílená produkce, sdílený limit).
- **Cizí nástroje na šetření tokenů** (proxy komprese, přesměrování čtení na jiný model) se nepoužívají: za cizí base URL Claude Code přijde o 1M kontext a předplatné je šedá zóna, a komprese výstupů by u kódu ušetřila jednotky procent. Rozbor v `docs/analyza-behu-sklik-2026-09.md`, část 9.

## Prototypy — `/dev-pipeline:prototyp`

Pro situaci, kdy akceptační kritérium nejde napsat, dokud se nerozhodne tvar: tři strukturálně různé UI varianty za `?variant=` v existující stránce (rozhoduje uživatel), nebo TUI nad čistým modulem (rozhoduje měření). Prototyp je jednorázový, vítěz se staví znovu podle konvencí projektu.

## Zkoušky nové verze

1. `dev-pipeline/hooks/tests/run.sh` a `node dev-pipeline/scripts/wf-check.mjs dev-pipeline/workflows/*.js` (Workflow skripty mají top-level `return`, holý `node --check` je odmítne).
2. Matcher hooku na `AskUserQuestion` ověřen interaktivně 16. 9. 2026 (Claude Code 2.1.273, zkušební session: PreToolUse deny model dostal, nástroj se nespustil). V `claude -p` nástroj není, tam se ověřit nedá.
3. Workflow s agentem pluginu ověřen 16. 9. 2026: `agent(..., { agentType: "dev-pipeline:verify", model, effort, schema })` dostal prompt agenta z pluginu, model a effort z opts, návrat přes StructuredOutput.
4. První ostrý běh: úklidová mini-vize v existujícím projektu, včetně nové `/vize` session.

## Změny

- **1.1.0 (18. 9. 2026)** — z analýzy běhu uklid-po-sklik (`docs/analyza-behu-uklid-po-sklik-2026-09.md`, 26 bodů): blok stavby odvozuje verdikt E2E z počtů, zná stav „vada kritéria“, dělá refresh PRD nad dnešním stromem, dává všem agentům Ne-cíle vize, jména reportů nesou číslo pokusu, uzavření sesouhlasí thermo a doklady; blok PRD spouští měřidla kritérií už v kole 1 a má režim zapracování; nový Workflow `blok-kolecko` nahrazuje kolečko z 38 volání Agent v session; sken claude-security jen na vyžádání; orchestrátor drží výhled PRD jeden řez, `hypotezy.text` nerozšiřuje PRD, kolize a vadná kritéria jdou majiteli jako otázky s navrženou odpovědí, cron ukazuje `co-dela.sh --kratce`, `TaskOutput` jen na dokončený Workflow, úklid úloh na pozadí před `hotovo`; deploy čeká na okno s rezervou a omezenou smyčkou a commituje jen docs vlastního řezu; `scripts/co-dela.sh` a segment ve status line.
- **1.0.1 (17. 9. 2026)** — hash markeru verify bez `docs/`, `hypotezy.text` pro blok stavby.
- **1.0.0 (16. 9. 2026)** — orchestrátor v session, dva Workflow bloky, hooky běhu.
