# claude-dev-pipeline

Osobní vývojová pipeline pro [Claude Code](https://claude.com/claude-code): **vize → plán řezů → autonomní běh → závěrečný audit → validace**. Člověk schvaluje jednou před během (vizi) a jednou po něm (merge do main). Mezi tím běží desítky hodin bez dohledu: orchestrátor v session drží vizi a plán, Workflow bloky pluginu staví řezy s pevnými stropy v kódu a fázoví agenti s modelem natvrdo dělají práci rukama. Stav žije v souborech projektu, ne v kontextu modelu.

Repo je zároveň plugin marketplace pro Claude Code. Plugin je v adresáři `dev-pipeline/`, návody a šablony pro instalaci v `setup/`.

**Obsah:** [Proč](#proč-to-existuje) · [Jak to funguje](#jak-to-funguje) · [Instalace od nuly](#instalace-od-nuly) · [Spuštění běhu](#spuštění-běhu) · [Reference](#reference) · [Zásady](#zásady-které-přežily-měření) · [Změny](#změny)

## Proč to existuje

Claude Code zvládne za jednu session postavit funkci, ale ne dodat celou vizi o deseti řezech přes dvě noci. Ne proto, že by modelu chyběla inteligence, ale protože dlouhý autonomní běh selhává na věcech, které v krátké session nevidíš. Každá vrstva téhle pipeline je odpověď na jednu takovou věc, změřenou na skutečných bězích (interní rozbory dvou běhů nad produkčním projektem, ty si vedu mimo repo):

- **Kontext se rozteče.** Model, který čte PRD, diffy, reporty a logy, má po šesti hodinách plný kontext a po compactu neví, kde je. Proto orchestrátor **nikdy nečte kód, PRD, reporty ani diffy**; guard běhu mu to odmítne. Čte jen vizi, handoff (tabulku plánu do 4 kB), spory a follow-ups. Všechno ostatní dělají agenti s čerstvým kontextem a vracejí **strojový návrat podle schématu**, ne prózu. Cíl: kontext orchestrátora pod ~300k tokenů za dvanáct hodin, a drží.
- **Úsudek modelu není deterministický běžec.** Když model sám rozhoduje, kolikrát opakovat review, kdy je brána zelená a jestli E2E „skoro prošlo“, dostaneš třetí kolo oprav ve tři ráno a řez uzavřený s jedním FAIL. Proto jsou pořadí kroků, stropy kol, opakování a diagnóza po druhém neúspěchu **v JavaScriptu Workflow bloků**, ne v promptu. Verdikt E2E se odvozuje z počtů, ne z textu verifikátora.
- **Zadání psané nad starším stromem.** PRD dalšího řezu vzniká souběžně se stavbou aktuálního (jinak by běh čekal). Jenže PRD psané čtyři řezy dopředu měří svět, který se mezitím čtyřikrát změnil. Proto je výhled PRD **přesně jeden řez** a blok stavby si před implementací PRD **přeměří nad dnešním stromem**.
- **Kritéria jako výčty jmen.** „Právě tyto čtyři soubory“ a opsané číslo bez dotazu byly příčinou obou opakovaných pokusů posledního běhu (dohromady 5,5 hodiny a 4,5 milionu výstupních tokenů navíc). Proto prd-check **spouští měřidla kritérií už v prvním kole** a výčet místo vlastnosti je nález; E2E verifikátor čísla přepočítává sám a umí říct „kritérium je vadné“, místo aby kvůli němu běžel další pokus.
- **Vize platí pro všechny, ne jen pro implementaci.** Fix agent, který nezná Ne-cíle vize, napíše kontrolní test nad zmrazeným souborem, a řez padne na kritériu, které to zakazuje. Proto Ne-cíle jdou do rámce **každého** agenta bloku, včetně oprav, thermo a E2E.
- **Verifikační divadlo.** „Deploy spuštěn“, „testy zelené“ podle cache, screenshot prvku v DOM. Proto verify agent vrací skutečné počty a jména selhávajících testů, deploy čeká na doložený terminální stav a vrací dva nezávislé doklady, E2E vykonává scénáře v prohlížeči a částečné neprůchody nezaokrouhluje na PASS.
- **Otázky v noci nikdo nezodpoví.** Proto se běh **nikdy neptá** (hook `AskUserQuestion` odmítne) a zastavuje se jen ze šesti vyjmenovaných důvodů. Kolize vize s pravidly projektu, vadné kritérium nebo nesplněný bod plánu jsou **otázky pro majitele s navrženou odpovědí**: běh jede podle návrhu, zapíše to a závěrečná zpráva to sebere na jedno místo.
- **Cena bez užitku.** Závěrečné kolečko jako 38 volání agentů v session trvalo 6,5 hodiny a přežilo compact uprostřed; bezpečnostní sken cizím pluginem spustil 178 agentů nejsilnějšího modelu za jeden nález, který existoval už před větví, a vyvolal usage limit. Proto je kolečko třetí Workflow blok a sken jen na vyžádání.

Výsledek posledního běhu pro měřítko: vize o devíti řezech nad produkčním monorepem, 40 hodin 50 minut včetně usage limitu, sedm řezů na první pokus, dva na druhý, závěrečný validátor pět Cílů ze šesti splněných, jeden zčásti. Člověk zasáhl dvakrát: přihlášení, které vypršelo, a `/exit` na konci.

## Jak to funguje

### Tři vrstvy

1. **Orchestrátor** je skill `dev-pipeline:orchestrate` běžící v tvé session na nejsilnějším modelu, který máš. Drží celou vizi a plán řezů, vybírá řezy, schvaluje souhrn PRD, hlídá drift od Cílů, smí měnit cestu k Cílům (nikdy Cíle) a píše krátké zprávy o stavu. Nečte kód a needituje ho. Na všechno posílá bloky a agenty.
2. **Tři Workflow bloky pluginu** (`dev-pipeline/workflows/`) jsou deterministický běžec: `blok-prd.js` (PRD řezu a jeho kontrola), `blok-stavby.js` (implementace až uzavření řezu), `blok-kolecko.js` (závěrečný audit celé vize). Pořadí kroků, stropy kol, opakování, diagnóza a tvar návratů jsou v kódu. Bloky běží na pozadí přes nástroj `Workflow` a výsledek přijde orchestrátorovi notifikací.
3. **Fázoví agenti** (`dev-pipeline/agents/*.md`) mají jednu roli, model a effort natvrdo a strukturovaný návrat, který vynucuje schéma bloku. Reporty píšou do souborů, orchestrátor je nikdy nečte; čte je až fix agent, který dostane cestu a identifikátory nálezů.

### Stav žije na disku

Všechno, co běh potřebuje k navázání po compactu, po usage limitu nebo po restartu stroje, je v `docs/` cílového projektu: `handoff.md` (stav běhu a živá kopie plánu, do 4 kB, hook ho po compactu injektuje zpět), `prd/rez-NN-*.md` a `e2e/rez-NN.md` (zadání a scénáře), `journal.md` (co se stalo), `follow-ups.md` (co zbývá, napříč vizemi), `vize-spory.md` (rozpory, předpoklady a otázky pro majitele), `reviews/` (plné reporty, gitignorované), markery `.orchestrator-run`, `.verify-passed`, `.deploy-unlocked`, `.review-passed`, `.vize-done`. Kdo co smí psát a jaký to má tvar, říká jediný dokument: `dev-pipeline/skills/orchestrate/KONTRAKT.md`.

### Životní cyklus jedné vize

**Tvoje kroky jsou 1, 3 a 4. Krok 2 běží sám.**

1. **`/vize`** (interaktivní, jediný schvalovací bod před během). Debatní session: paralelní fact-finding nad kódem a daty, research bez ptaní, seznam otevřených otázek v draftu, tvar UI a seznam UI ploch, **test smazání pro každý ochranný mechanismus** (zámek, strop, potvrzení musí sedět na hranici nevratnosti, jinak do vize nepatří), **Povolení pro zápis do živých systémů** (účet, operace, meze, platnost; běh se pak už neptá), na konci **plán řezů** (tabulka: číslo, název, body vize, definice hotového, závislosti) a čerstvé oči z několika rolí včetně role orchestrátora. Tělo vize do 40k tokenů, přílohy v `docs/vize/<slug>/`. Výstup je commitnutý `docs/vize/<slug>.md`. Jediné místo, kde vzniká a mění se produktová severka `docs/produkt.md`.
2. **`/dev-pipeline:orchestrate docs/vize/<slug>.md`** napsané jako prompt v nové session (viz [Spuštění běhu](#spuštění-běhu)). Setup skript ověří čistý strom, archivuje stav předchozí vize, založí větev `vize/<slug>`, marker se session_id a handoff s tabulkou plánu, a všechno commitne jedním commitem. Pak běží smyčka řezů a po posledním řádku plánu finální fáze.
3. **Přečti závěrečnou zprávu** `docs/zaverecna-zprava.md`: per řez jeden řádek, stav Cílů, ROZHODNUTÍ PRO TEBE (jen změny Cílů a mantinelů), OTÁZKY S NAVRŽENOU ODPOVĚDÍ (běh už jel podle návrhu, ty potvrdíš nebo obrátíš), SPORY VE VIZI, PAMĚŤ A DOKUMENTACE, PIPELINE. Proklikej aplikaci.
4. **Merge `vize/<slug>` do main** děláš ty. Autonomní běh na main nikdy nesahá.

### Jeden řez zblízka

**Blok PRD** (`blok-prd.js`): PRD agent napíše `docs/prd/rez-NN-<slug>.md` a `docs/e2e/rez-NN.md` podle přiděleného řádku plánu, předpoklady vize ověří proti kódu a datům, rozsah nerozšiřuje → nezávislý `prd-check` (úplnost vůči vizi a řádku plánu, technická validita proti skutečnému kódu, kvalita kritérií včetně **spuštění všech měřidel** nad dnešním stromem, rozsah, optimalita) → při nálezech zapracování PRD agentem → delta kontrola jen nad změněnými místy. Žádné třetí kolo; zbylé nálezy jdou stavbě jako hypotézy. Režim `zapracovani` slouží orchestrátorovi, když souhrn PRD odmítne (odchylka od plánu, chybějící pokrytí bodů vize): jeden PRD agent + delta kontrola, ne nové PRD.

**Schválení souhrnu** dělá orchestrátor z návratu bloku, PRD samo nečte: pokrývá řádek plánu, nezavádí UI plochu mimo seznam ve vizi (lešení jen s přístupovou hranicí a řádkem plánu na jeho odstranění), zápis do živého systému jen s citovaným Povolením, odchylky od plánu přijme jako změnu cesty nebo pošle zpět.

**Blok stavby** (`blok-stavby.js`), jeden pokus:

| Fáze | Co se děje | Strop |
|---|---|---|
| Refresh PRD | jen když od PRD zestárl strom (`prd_stale`): delta prd-check kritérií závislých na stromu, při nálezech zapracování | jen v 1. pokusu |
| Implementace | `implement`: TDD červená → zelená, doktrína CLAUDE.md projektu, Serena na symboly; plná suita jednou na konci; build verze jako součást řezu | 1 agent |
| Review | `thermo-nuclear-review` ∥ `code-review` nad týmž stromem → fix agenti souběžně po **disjunktních balíčcích souborů**, thermo BLOCKER/HIGH přidané k balíčku, který soubor vlastní → při rozšířeném zásahu nebo blokujících nálezech kolo 2 jen nad opravnou várkou → nejvýš jedna další oprava | 2 kola |
| Brána | `verify`: typecheck a **jediná plná suita** řezu; zelená zapíše `docs/.verify-passed` s hashem stromu bez `docs/` | 1 oprava |
| Deploy | `deploy`: jeden commit na vize větvi (kód, docs řezu, sdílené dokumenty běhu; cizí rozpracované PRD ne), nasazení podle runbooku, čekání na terminální stav omezenou smyčkou, zakázané okno s rezervou, dva nezávislé doklady | terminální stav |
| E2E | `e2e-verifier` v prohlížeči (`agent-browser`) nebo doložení kritérií bez prohlížeče; verdikt per kritérium PASS / PASS-částečně / FAIL, **výsledek bloku z počtů**; vadné kritérium (nesplnitelné v prostředí, kolidující, předřezový nález) se neopravuje, jde k rozhodnutí; závažné nálezy mimo kritéria samostatným commitem `fix(security)` | 1 opakování |
| Uzavření | PRD status a commit, srovnání PRD s realitou, položkové sesouhlasení thermo, kontrola dokladů předepsaných PRD, journal, follow-ups | 1 agent |

Až **tři pokusy**; před třetím běží `diagnose` (reprodukční smyčka a doložená příčina, nic neopravuje). Funkční neúspěch je, když fáze doběhla a výsledek je špatně; infra smrt agenta (usage limit, API chyba) se opakuje uvnitř bloku a nepočítá se. Reporty pokusu 2 nepřepisují reporty pokusu 1 (číslo pokusu je v názvu). Každý agent bloku dostává v rámci zadání Ne-cíle vize, seznam toho, co pozdější řezy mažou, a hranice své role.

**Souběh:** v jednu chvíli nejvýš jeden blok stavby (bloky sdílejí pracovní strom) a nejvýš jeden blok PRD, ten pro **následující** řez, spuštěný ve stejném tahu jako stavba. Po řezu dostaneš pevný blok šesti řádků: commit, deploy, pokusy, E2E, review, thermo, follow-ups, spory, otázky, změna plánu, stav Cílů, další řez.

### Finální fáze

Po posledním řádku plánu: **`blok-kolecko.js`** nad `git diff main...HEAD` (thermo → code-review kolo 1 → kolo 2 fan-outem pěti čoček s triáží opravit teď / follow-up / odmítnout → bezpečnost dvěma metodikami → nasazení → E2E scénáře kolečka a verifikace → journal a `docs/.review-passed`; po každé opravné vlně brána a commit) → sken `claude-security` **jen když o něj vize požádá** hlavičkou `bezpecnostni_sken: changes|codebase` → `vize-validator` s čerstvým kontextem (Cíle, zákazy, lešení, změny plánu, dotažení detailů; jeho „dodělat automaticky“ jdou jako mini-řezy s jedním pokusem) → odstranění lešení → sklizeň (přeškrtnutí vyřešených follow-ups, roztřídění feedbacku pipeline, co přibylo v CLAUDE.md projektu) → závěrečná zpráva → zastavení zbylých úloh na pozadí, zrušení cronu, notifikace.

### Drift, zastavení, otázky pro majitele

Plán ve vizi je závazný pro PRD agenta; **orchestrátor ho smí měnit, když to vede k Cílům lépe** (pořadí, dělení, sloučení, přidání řezu, který Cíl potřebuje, vypuštění řezu, který nic nepřidá), každou změnu zapíše a oznámí. Nesmí měnit Cíle, Ne-cíle, Rozhodnutí ani severku, ani přidat rozsah, který žádný Cíl nepotřebuje. Nálezy review ani E2E nikdy nezakládají nový řez.

Zastaví se a čeká na člověka jen ze šesti důvodů: (a) změna Cíle, Ne-cíle, Rozhodnutí nebo severky; (b) rozsah, který žádný Cíl nepotřebuje; (c) blok stavby selhal třikrát i s diagnózou; (d) blokující bezpečnostní nález v nasazeném kódu, který blok neopravil; (e) zápis do živého systému bez Povolení; (f) dvojnásobek řezů proti plánu. Všechno ostatní řeší sám: předpoklad do `vize-spory.md`, konzervativní volba, jeď dál. Tři třídy věcí nejsou ani zastavení, ani jeho rozhodnutí: kolize vize s runbookem nebo CLAUDE.md projektu, vadné kritérium a vědomě nesplněný bod řádku plánu. Ty jdou do `vize-spory.md` **s navrženou odpovědí**, běh podle návrhu pokračuje a závěrečná zpráva je sebere.

### Hooky a guardy

Hooky pluginu (`dev-pipeline/hooks/hooks.json`) se samy hlídají markerem `docs/.orchestrator-run` a jeho `session_id`: v projektu bez běhu a v jiné session nedělají nic.

| Hook | Kdy | Co dělá |
|---|---|---|
| `guard-blast-radius.sh` | PreToolUse Bash, vždy | odmítne force-push, `git reset --hard` a `git clean -f` na main, `rm -rf` na kořeny, deploy během běhu bez `docs/.deploy-unlocked` |
| `guard-run.sh` | PreToolUse | orchestrátor: žádné `AskUserQuestion`, čtení jen vize, handoff, spory, follow-ups a soubory pluginu, žádné spouštění projektu (balíčkovač, testy, curl, deploy, diffy), editace jen v `docs/`; subagenti: žádné čtení celého zdrojového souboru nad 350 řádků (Read bez offset/limit, `cat`, `sed -n` přes celek) s odkazem na Serenu; nikdo nepíše `docs/.verify-passed` ručně |
| `on-stop.sh` | Stop | tah orchestrátora smí skončit jen ve stavech `běží …`, `zastaveno …`, `hotovo`; jinak vrátí důvod a orchestrátor pokračuje |
| `pre-compact.sh` | PreCompact | varování, když handoff přesáhl 4 kB |
| `session-start-handoff.sh` | SessionStart (startup, compact, resume) | vrátí prvních 4 kB handoffu a `PO-COMPACTU.md` |
| `prompt-submit.sh` | UserPromptSubmit | při promptu `/dev-pipeline:orchestrate` uloží session_id do `docs/.orchestrator-session` pro setup |

Fail-open: nejednoznačný případ projde. Testy hooků: `dev-pipeline/hooks/tests/run.sh` (88 případů). Guard blast-radius má vlastní `scripts/test-guard.py`.

### Sledování běhu

- **Cron „zkontroluj stav běhu“** každých 30 minut: orchestrátor spustí `scripts/co-dela.sh --kratce` a jeho výstup vloží do odpovědi beze změny, pak jedná podle handoffu (ztracená notifikace, čekající krok). Session tak nese časovou řadu toho, co agenti dělali. `TaskOutput` používá jen na dokončený Workflow, jehož výsledek nezpracoval; na agentní task nikdy (vrátil by kód a diffy).
- **`scripts/co-dela.sh`** čte journal a metadata agentů ze session Claude Code (`~/.claude/projects/<slug>/<session_id>/`), žádný model nevolá a nic z obsahu odpovědí nevypisuje. Bez argumentu (v cwd projektu s běžícím orchestrátorem, nebo `--session <dir>` / `--transcript <cesta.jsonl>`) vypíše běžící Workflow, živé agenty s fází, modelem, časem od posledního zápisu a posledními voláními nástrojů, a označí agenty mlčící přes 20 minut. V session ho spustíš i ručně: `! bash ~/claude-dev-pipeline/dev-pipeline/scripts/co-dela.sh`.
- **Status line:** `setup/statusline.sh` volá `co-dela.sh --status` a přidá segment `▶ <živí agenti> · <nejdéle mlčící> · <m:ss>` (žlutě přes 15 min, červeně přes 30 min). Potřebuje `statusLine.refreshInterval` v `settings.json`, jinak se řádek během tichého Workflow nepřekreslí (ověřeno v Claude Code 2.1.274).
- **`/workflows`** v Claude Code ukazuje strom fází a po rozbalení prompt a aktivitu agenta; živý text agentů neukazuje nikde.
- **Zprávy orchestrátora:** pět řádků před řezem, pevný blok po řezu, krátká zpráva při zastavení. Nálezy nepřevypráví.

### Modely a cena

| Kde | Model / effort | Proč |
|---|---|---|
| orchestrátor (tvoje session) | nejsilnější dostupný; poslední běh Fable 5.1, alternativa Opus 5 s 1M kontextem | úsudek nad celou vizí, málo tokenů, hodně rozhodnutí |
| `prd`, `prd-check`, `implement`, `code-review`, `diagnose` | Opus 5 high | tvoří zadání a kód, chyby tu jsou nejdražší |
| `thermo-nuclear-review`, `fix`, `e2e-verifier` | Opus 5 medium | ohraničená práce nad daným rozsahem |
| `verify`, `deploy` | Sonnet 5 low, bez CLAUDE.md projektu | mechanické kroky se strojovým výsledkem |
| `vize-validator` | Fable 5.1 high | čerstvé oči na konci |
| pomocné úlohy Claude Code | `ANTHROPIC_SMALL_FAST_MODEL=claude-sonnet-5` | podlaha je Sonnet, ne Haiku |

Poslední běh v číslech (výstupní tokeny): bloky PRD 1,9 M, bloky stavby 6,0 M, orchestrátor 0,7 M, bezpečnostní sken cizím pluginem 1,8 M. Implementace a review tvoří přes 80 % agentních minut. Opakovaný pokus řezu stojí 2 až 3 hodiny a přes 2 M tokenů; proto tolik pravidel míří na kvalitu kritérií.

## Instalace od nuly

Postup pro nový stroj (macOS; Linux se liší jen v balíčkovači). Všechny cesty počítají s klonem v `~/claude-dev-pipeline`; jinou cestu propiš do `settings.json` a do `setup/statusline.sh` (proměnná `DEV_PIPELINE_REPO`). Na konci spusť `bash setup/check.sh`, který každý krok ověří.

### 1. Nástroje

| Nástroj | K čemu | Instalace |
|---|---|---|
| Claude Code ≥ 2.1.271 | `autoContinueAtUsageLimit`, `statusLine.refreshInterval`, `Workflow` | podle [dokumentace](https://docs.claude.com/en/docs/claude-code) |
| git, `gh` (volitelně) | běh commituje na vize větvi | Xcode CLT / `brew install gh` |
| Node 22 | Workflow skripty, `agent-browser`, většina cílových projektů | `nvm install 22` |
| `jq` | hooky a skripty pluginu | `brew install jq` |
| `python3` | `co-dela.sh`, `module-health.py`, testy guardu | součást macOS (3.9 stačí) |
| `ripgrep` (volitelně) | agenti hledají textové vzory přes `rg`; Claude Code jim v Bash nástroji podstrkuje vlastní ripgrep funkcí `rg`, systémová binárka je jen pro tvůj terminál | `brew install ripgrep` |
| `uv` | instalace Sereny | `brew install uv` |
| `tmux` (volitelně) | `scripts/limit-watcher.sh` na běh mimo dohled | `brew install tmux` |

Do profilu shellu (`~/.zshrc`):

```bash
export PATH="$HOME/.local/bin:$PATH"        # serena, serena-hooks
export ANTHROPIC_SMALL_FAST_MODEL=claude-sonnet-5   # pomocné úlohy Claude Code na Sonnetu, ne Haiku
export MCP_TIMEOUT=60000                    # start language serveru Sereny u velkého repa trvá déle než výchozí limit
```

Hlavní model Claude Code **nepinuj přes env** (`CLAUDE_MODEL` Claude Code nečte, `ANTHROPIC_MODEL` by znemožnil přepnutí za běhu); model a effort se nastavují v Claude Code (`/model`, `/config`), agenti pipeline mají model ve svých souborech.

### 2. Klon repa

```bash
git clone https://github.com/martinzeiler/claude-dev-pipeline.git ~/claude-dev-pipeline
chmod +x ~/claude-dev-pipeline/dev-pipeline/hooks/*.sh ~/claude-dev-pipeline/dev-pipeline/scripts/*.sh ~/claude-dev-pipeline/setup/*.sh
```

### 3. Serena (povinná)

[Serena](https://github.com/oraios/serena) je MCP server nad language servery: agenti pipeline hledají a editují kód **symbolem** (`find_symbol`, `find_referencing_symbols`, `replace_symbol_body`), ne čtením celých souborů, a guard běhu čtení celého velkého zdrojového souboru odmítne. Bez Sereny se agenti buď zaseknou na guardu, nebo spálí kontext na `cat`.

```bash
uv tool install serena-agent            # nainstaluje serena, serena-agent, serena-hooks do ~/.local/bin
serena --version                        # ověřeno s 1.7.1
claude mcp add --scope user serena -- "$HOME/.local/bin/serena" start-mcp-server --context claude-code --project-from-cwd
```

`--project-from-cwd` aktivuje projekt podle pracovního adresáře session, takže funguje ve všech projektech bez ručního `activate_project`. Při první aktivaci v projektu Serena založí `.serena/project.yml`; zkontroluj v něm `language_servers` (pro TypeScript/JavaScript `typescript`) a dej `.serena/` do `.gitignore` projektu. U velkého repa předem `serena project index`. Když soubor nevznikne, `serena project create`.

**Hooky Sereny** do `~/.claude/settings.json` (čtyři záznamy, jsou v `setup/settings.snippet.json`; cesty absolutní):

- `SessionStart` → `serena-hooks activate --client=claude-code` (aktivace projektu),
- `PreToolUse` (bez matcheru) → `serena-hooks remind --client=claude-code`: **zablokuje** třetí `Grep` nebo třetí `Read` zdrojového souboru v řadě a vrátí připomínku; symbolické volání Sereny čítač resetuje,
- `PreToolUse` s matcherem `mcp__serena__*` → `serena-hooks auto-approve --client=claude-code`,
- `SessionEnd` → `serena-hooks cleanup --client=claude-code`.

**Globální `~/.claude/CLAUDE.md`:** zkopíruj `setup/CLAUDE.global.md` (nebo jeho první sekci slouč se svým). Říká všem sessions i subagentům, že Serena je výchozí cesta k práci s kódem, s tabulkou „místo → použij“. Druhá sekce je příklad zvláštností stroje (zsh, roura přepisující návratovku, `grep` nad ripgrepem); napiš si vlastní.

### 4. Nastavení Claude Code

Slouč `setup/settings.snippet.json` do `~/.claude/settings.json` (nahraď `/Users/<user>`). Co jednotlivé klíče dělají:

- `extraKnownMarketplaces.claude-dev-pipeline` s `source: directory` na klon repa, `enabledPlugins["dev-pipeline@claude-dev-pipeline"]: true`.
- `autoContinueAtUsageLimit: true`: Workflow bloky po usage limitu pokračují samy, až se limit obnoví; bez toho běh nad ránem stojí.
- `agentPushNotifEnabled: true`: notifikace, když agent nebo Workflow skončí.
- `hooks`: čtyři hooky Sereny výše.
- `statusLine` s `refreshInterval: 30` (krok 8).
- Model a effort session: `/model` na nejsilnější dostupný (orchestrátor), effort `high` nebo `xhigh`. Agenti pipeline to nedědí, mají své.

Doporučené nastavení jazyka: `"language": "czech"`, pokud chceš zprávy běhu česky; texty pluginu jsou české.

### 5. Plugin dev-pipeline

```bash
claude plugin marketplace add ~/claude-dev-pipeline
claude plugin install dev-pipeline@claude-dev-pipeline
```

Nová session (registr agentů a Workflow se čte při startu). Ověření: `/dev-pipeline:` v promptu nabídne `vize`, `orchestrate`, `review-kolecko`, `prototyp`; `/workflows` zná `dev-pipeline:blok-prd`, `blok-stavby`, `blok-kolecko`.

**Refresh po editaci pluginu:** directory-source marketplace se kopíruje do cache a editace zdroje se do sessions nepropíše sama. Po změně zvedni `version` v `dev-pipeline/.claude-plugin/plugin.json` (při stejné verzi updater hlásí „already at latest“), pak `claude plugin update dev-pipeline@claude-dev-pipeline` a nová session. Při vývoji pluginu je jednodušší `claude --plugin-dir ~/claude-dev-pipeline/dev-pipeline`.

### 6. agent-browser (E2E v prohlížeči)

```bash
npm install -g agent-browser
agent-browser install          # stáhne prohlížeč
agent-browser doctor           # musí projít bez nálezu
```

E2E verifikátor s ním prochází scénáře krok za krokem (`agent-browser skills get core` si načte sám). Bez něj běh funguje, ale E2E degraduje na doložení kritérií bez prohlížeče. Ověřeno s 0.31.1.

### 7. Další pluginy z oficiálního marketplace

- **context7** (`claude plugin install context7@claude-plugins-official`): implement agent si přes něj načte aktuální dokumentaci knihovny, když pracuje s verzí, kterou nezná. Doporučeno.
- **claude-security** (`claude plugin install claude-security@claude-plugins-official`): bezpečnostní sken, který pipeline spouští **jen na vyžádání** (hlavička vize `bezpecnostni_sken: changes|codebase`). Jeho agenti mají `model: inherit`, běží tedy na modelu tvé session; na Fable session to je 100 a více agentů Fable xhigh. Volitelný.

### 8. Status line

```bash
cp ~/claude-dev-pipeline/setup/statusline.sh ~/.claude/statusline.sh && chmod +x ~/.claude/statusline.sh
```

a v `settings.json` `"statusLine": { "type": "command", "command": "bash ~/.claude/statusline.sh", "refreshInterval": 30 }` (je ve snippetu). Řádek ukáže model, zaplnění kontextu, větev a projekt, a při běhu segment živých agentů. Máš-li vlastní status line, přidej do ní jen posledních pět řádků skriptu.

### 9. Kontrola instalace

```bash
bash ~/claude-dev-pipeline/setup/check.sh            # OK / WARN / FAIL po krocích, návratový kód 1 při FAIL
bash ~/claude-dev-pipeline/dev-pipeline/hooks/tests/run.sh   # 88 testů hooků
node ~/claude-dev-pipeline/dev-pipeline/scripts/wf-check.mjs ~/claude-dev-pipeline/dev-pipeline/workflows/*.js
```

### 10. Příprava cílového projektu

Pipeline čte projekt, nic mu nevnucuje. Co musí projekt mít, aby běh nedegradoval:

- **`CLAUDE.md`** s doktrínou (izolace dat, kanonické helpery, pasti platformy) a s **příkazy pro typecheck a testy**; do 400 řádků, každý agent ho nese v preambuli. Pravidla, ne deník.
- **Deploy runbook** (`docs/dev-runbook.md` nebo sekce Deploy v CLAUDE.md): postup nasazení, jak poznat terminální stav, zakázané okno nasazení s časovou zónou, behaviorální doklad. Bez něj běží řezy v režimu `commit-only` a nasazuješ ty.
- **Přístup do běžící aplikace pro E2E** (URL, přihlášení, testovací účet) v CLAUDE.md nebo runbooku. Bez něj E2E dokládá kritéria bez prohlížeče.
- **Pre-commit brána ve třech patrech** (doporučeno): staged jen `docs/**` a `*.md` → nic; typecheck a rychlé kontroly vždy; plná suita jen bez platného `docs/.verify-passed` (hash pracovního stromu bez `docs/` jako v `scripts/tree-hash.sh`; hook i skript musí počítat stejně). Vzor `.husky/pre-commit` v projektu Surya-PPC-Tool. Bez toho běh funguje, jen platí suitu dvakrát na řez.
- **Čistý pracovní strom** před startem; setup to vyžaduje. `docs/` a `.gitignore` doplní setup sám.
- **Povolení ve vizi** pro každý zápis do živého systému (účet, operace, meze), jinak se běh u takového řezu zastaví.

## Spuštění běhu

1. **Vize:** v projektu `claude`, pak `/dev-pipeline:vize` (nebo `/vize`). Výsledek je commitnutý `docs/vize/<slug>.md` s plánem řezů. Do hlavičky vize případně `bezpecnostni_sken: changes`, když chceš na konci sken claude-security.
2. **Nová session pro běh:**

   ```bash
   cd <projekt>
   claude --autocompact 400k
   ```

   `--autocompact 400k` nastaví práh automatického compactu na 400k tokenů (rozsah 100k až 1M); v session jde totéž napsat jako `/autocompact 400k`. Orchestrátor compact sám neiniciuje; po compactu mu hook vrátí tabulku plánu a `PO-COMPACTU.md` a vizi si přečte znovu celou. Zvol nejsilnější model (`/model`).
3. **Start:** napiš jako prompt `/dev-pipeline:orchestrate docs/vize/<slug>.md`. Musí to být prompt, ne příkaz z jiného místa: hook si z něj uloží identitu session, bez které setup neproběhne. Orchestrátor vypíše pět řádků o vizi a spustí první blok PRD.
4. **Během běhu:** můžeš mu kdykoli napsat; odpoví z tabulky nebo pošle agenta, běh nepřeruší. Každých 30 minut uvidíš výstup `co-dela.sh --kratce`. Neposílej mu opravy ani úkoly do rozpracovaného řezu: vše, co víš navíc, mu řekni a on to předá dalším blokům jako hypotézu.
5. **Usage limit:** Workflow pokračuje sám (`autoContinueAtUsageLimit`), session stojí do resetu a pak jedná podle řádku `stav běhu:` v handoffu. Na běh mimo dohled slouží `scripts/limit-watcher.sh` v tmuxu. **Vypršelé přihlášení** nic neobnoví: `/login` musíš udělat ty; běžící Workflow do té doby padá na API chybách a po přihlášení ho orchestrátor spustí znovu s `resumeFromRunId`.
6. **Přerušení a navázání:** stav je v `docs/handoff.md`. Nová session v témže projektu s promptem `/dev-pipeline:orchestrate docs/vize/<slug>.md` pozná stejnou vizi, nic nearchivuje a naváže. Jen finální fázi spustíš argumentem `final`.
7. **Konec:** notifikace, `docs/zaverecna-zprava.md`, `stav běhu: hotovo`. Přečti zprávu, proklikej aplikaci, merge do main.

## Reference

### Skilly

| Skill | Kdo invokuje | Co dělá |
|---|---|---|
| `dev-pipeline:vize` | ty | debatní session nad vizí, na konci plán řezů, mantinely, Povolení, seznam UI ploch |
| `dev-pipeline:orchestrate` | ty, jako prompt | orchestrátor běhu; `final` spustí jen finální fázi |
| `dev-pipeline:review-kolecko` | orchestrátor ve finální fázi, nebo ty nad větší sérií změn | spustí `blok-kolecko`; nese recept pro sken claude-security na vyžádání |
| `dev-pipeline:prototyp` | ty | tři strukturálně různé UI varianty za `?variant=` (rozhoduješ ty) nebo TUI nad čistým modulem (rozhoduje měření); prototyp je jednorázový |
| `thermo-nuclear-code-quality-review` | agent `thermo-nuclear-review` | rubrika strukturálního auditu (hloubka modulů, švy, code-judo, test smazáním) |

### Agenti

| Agent | Model / effort | Role |
|---|---|---|
| `prd` | Opus 5 high | PRD a E2E scénáře podle řádku plánu; kritéria jako vlastnost + měřidlo, ne výčet; zapracování nálezů s návratem změněných míst |
| `prd-check` | Opus 5 high | Nezávislá kontrola PRD (úplnost, validita proti kódu, kritéria s během měřidel, rozsah, optimalita); delta kolo; refresh nad dnešním stromem |
| `implement` | Opus 5 high | TDD implementace; testy k chování, ne k řezu; past ve svých souborech opravuje; hypotézy nerozšiřují PRD |
| `code-review` | Opus 5 high | Korektnost; CONFIRMED/PLAUSIBLE a BLOKUJE/FOLLOW-UP; přísnější práh nad plochou zapisující do produkce; režim čočky pro kolečko; návrat jako balíčky po souborech |
| `diagnose` | Opus 5 high | Po dvou neúspěších: reprodukční smyčka a doložená příčina, neopravuje |
| `fix` | Opus 5 medium | Oprava nálezů jako hypotéz v mezích Ne-cílů vize; vrací změněná místa a rozšířený zásah |
| `thermo-nuclear-review` | Opus 5 medium | Strukturální audit proti rubrice, doktríně projektu a Ne-cílům; BLOCKER/HIGH/NOTE |
| `e2e-verifier` | Opus 5 medium | Kritéria proti běžící aplikaci; PASS / PASS-částečně / FAIL, vadná kritéria s dokladem, nálezy mimo kritéria podle závažnosti; čísla přepočítává sám |
| `deploy` | Sonnet 5 low, bez CLAUDE.md | Commit vlastního řezu a nasazení podle runbooku; omezené smyčky, okno s rezervou, doložený stav |
| `verify` | Sonnet 5 low, bez CLAUDE.md | Typecheck a plná suita, skutečné výstupy; zelená zapíše `docs/.verify-passed` |
| `vize-validator` | Fable 5.1 high | Čerstvé oči na konci: Cíle, zákazy, lešení, změny plánu, detaily |
| `plan-check` | Opus 5 high | Mimo běh: post-implementační kontrola plánu, read-only |

### Workflow bloky a skripty

- `workflows/blok-prd.js`, `blok-stavby.js`, `blok-kolecko.js`: argumenty a návraty v `skills/orchestrate/KONTRAKT.md`. Syntaxi kontroluje `scripts/wf-check.mjs` (skripty mají top-level `return`, holý `node --check` je odmítne).
- `scripts/orchestrate-setup.sh`: setup běhu (čistý strom, archiv předchozí vize do `docs/archive/<slug>/` a reportů do `docs/reviews/_archiv/<slug>/`, větev, marker, handoff, jediný commit).
- `scripts/co-dela.sh`: co agenti dělají (plný, `--kratce`, `--status`).
- `scripts/verify-marker.sh`, `scripts/tree-hash.sh`: marker zelené brány a hash stromu bez `docs/`.
- `scripts/limit-watcher.sh`: hlídač usage limitu pro běh mimo dohled (tmux).
- `scripts/module-health.py`: měření poctivosti barelů pro thermo review.
- `scripts/test-guard.py`, `hooks/tests/run.sh`: testy guardů.

### Co dál mám na stroji (mimo plugin)

Pipeline to nepotřebuje, ale hodí se vědět, s čím byla laděná: pluginy `frontend-design`, `skill-creator`, `security-guidance`, `claude-md-management`, `claude-code-setup` z oficiálního marketplace (osobní použití, běh je nevolá); `typescript-lsp` vypnutý (Serena pokrývá totéž přes language server); Claude in Chrome (E2E ho nepoužívá, verifikátor běží přes `agent-browser`); terminál Warp (status line kreslí Claude Code sám, terminál na tom nic nemění). Nastavení `~/.claude/settings.json` bez osobních klíčů je v `setup/settings.snippet.json`.

## Brána projektu (pre-commit)

Z analýzy běhu sklik: 362 commitů, 55 % bez změny kódu (docs, build marker), plná suita ~5 min a rostla o minutu týdně; agenti navíc pouštěli plnou suitu opakovaně ve fix fázích. Od verze 1.0.0 běží plná suita jednou na řez (verify) a projekt má mít pre-commit hook ve třech patrech (krok 10 instalace). Bez něj běh funguje, jen platí suitu dvakrát.

## Zásady, které přežily měření

- **Nálezy jdou do souborů, návraty jsou strojové.** Reporty do `docs/reviews/` (gitignorováno), orchestrátor je nikdy nečte; schémata návratů vynucují Workflow bloky.
- **Kód se čte symbolem** (Serena), ne celými soubory; guard to u velkých zdrojových souborů vynutí i přes `cat` a `sed`.
- **Kritérium je vlastnost s měřidlem, ne výčet jmen.** Měří se před uzavíracím commitem a v prostředí, které E2E má; měřidlo bere revizi parametrem.
- **Testy patří k chování, ne k řezu.** Žádné soubory pojmenované po řezu; verifikační lešení se po ověření maže.
- **Past se opravuje, ne dokumentuje.** CLAUDE.md projektu jsou pravidla, ne deník běhu; finální fáze hlásí, co v něm během běhu přibylo.
- **Záporné kritérium se dokládá mutací, ne zelenou.** Kritérium o umístění má obě půlky. Mutace se vrací opačnou editací, nikdy `git checkout`, `restore`, `stash` ani `reset`.
- **Bezpečnostní nález se opravuje hned**, i pre-existing, samostatným commitem.
- **Na agenta se nečeká pollingem**; notifikace přijde sama, cron je záchranná síť. Dlouhé příkazy na pozadí přes `Monitor`, nikdy `while ! grep … sleep` (Claude Code smyčku po timeoutu přesune na pozadí a přežije agenta).
- **Ne-cíle vize platí pro každou fázi**, i pro opravy a review.
- **Jedna vize v čase per projekt** (sdílená produkce, sdílený limit).
- **Cizí nástroje na šetření tokenů** (proxy komprese, přesměrování čtení na jiný model) se nepoužívají: za cizí base URL Claude Code přijde o 1M kontext a předplatné je šedá zóna, a komprese výstupů by u kódu ušetřila jednotky procent. Rozbor je v interní analýze běhu sklik, mimo repo.

## Změny

- **1.1.0 (18. 9. 2026)** — z interní analýzy běhu uklid-po-sklik (26 bodů): blok stavby odvozuje verdikt E2E z počtů, zná stav „vada kritéria“, dělá refresh PRD nad dnešním stromem, dává všem agentům Ne-cíle vize, jména reportů nesou číslo pokusu, uzavření sesouhlasí thermo a doklady; blok PRD spouští měřidla kritérií už v kole 1 a má režim zapracování; nový Workflow `blok-kolecko` nahrazuje kolečko z 38 volání Agent v session; sken claude-security jen na vyžádání; orchestrátor drží výhled PRD jeden řez, `hypotezy.text` nerozšiřuje PRD, kolize a vadná kritéria jdou majiteli jako otázky s navrženou odpovědí, cron ukazuje `co-dela.sh --kratce`, `TaskOutput` jen na dokončený Workflow, úklid úloh na pozadí před `hotovo`; deploy čeká na okno s rezervou a omezenou smyčkou a commituje jen docs vlastního řezu; `scripts/co-dela.sh` a segment ve status line; adresář `setup/` s návodem, snippetem nastavení, status line, globálním CLAUDE.md a kontrolou instalace.
- **1.0.1 (17. 9. 2026)** — hash markeru verify bez `docs/`, `hypotezy.text` pro blok stavby.
- **1.0.0 (16. 9. 2026)** — orchestrátor v session, dva Workflow bloky, hooky běhu.
- **0.9.x (srpen až září 2026)** — pipeline řízená promptem v jedné session; rozbor v interní analýze běhu sklik, mimo repo.
