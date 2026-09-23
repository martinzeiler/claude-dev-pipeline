# KONTRAKT — soubory, markery, agenti a bloky běhu vize

Jediný zdroj pravdy pro **tvar** věcí v autonomním běhu: co kde leží, kdo to smí psát, co který agent vrací. **Proces** (kdo co kdy spouští) je ve dvou místech: rozhodování orchestrátora v `SKILL.md` vedle tohoto souboru, deterministické kroky se stropy ve `workflows/blok-prd.js` a `workflows/blok-stavby.js`. Změna tvaru se dělá tady; změna kroků v těch souborech.

## Soubory (stav žije na disku, nikdy jen v kontextu)

| Soubor | Kdo píše | Obsah |
|---|---|---|
| `docs/produkt.md` | jen `/vize` session | Produktová severka: trvalá norma napříč vizemi (severka, kontrolovatelné mantinely, trvalá ne-rozhodnutí). Nepovinná; čte ji orchestrátor (mantinely při sporech), PRD agent, prd-check a validátor |
| `docs/vize/<slug>.md` | jen `/vize` session | Vize včetně Cílů, Ne-cílů, Rozhodnutí, Mantinelů a Povolení, UI ploch a Plánu řezů. **Během běhu neměnná.** Tělo do 40k tokenů, přílohy v `docs/vize/<slug>/` |
| `docs/handoff.md` | jen orchestrátor | Stav běhu a živá kopie plánu, **do 4 kB**. Tvar níže. Hook ho po compactu injektuje (jen prvních 4 096 B) |
| `docs/prd/rez-NN-<slug>.md` | PRD agent (blok PRD), status a commit uzavření | PRD řezu, frontmatter níže |
| `docs/e2e/rez-NN.md` | PRD agent | E2E scénáře: akceptační kritéria v krocích, včetně vstupu, který vyrobí potřebný druh dat; v sekcích, které jsou na sobě nezávislé (nad 12 kritérií je ověřují dva verifikátoři souběžně) |
| `docs/e2e/rez-NN-doklad-pred.md` | agent `doklad` (blok stavby, jen když PRD předepisuje doklad před migrací) | Snímek dotčených dat před nasazením: čas, revize, dotazy doslova a výsledky. Deploy bez něj migraci neaplikuje |
| `docs/journal.md` | uzavření řezu (append), finální fáze | Deník: co je hotové, odchylky, pokusy, výsledky. Zapisuje se heredocem, nikdy Editem |
| `docs/follow-ups.md` | uzavření řezu (append), finální fáze, `/vize` | Kontinuální backlog napříč vizemi. Jedna odrážka = jedna položka s kontextem, začíná značkou `[řez NN · <oblast>]` (nebo `[kolečko · <oblast>]`), aby šly položky číst grepem po oblastech; vyřešené se přeškrtávají `~~…~~ VYŘEŠENO <datum>: <čím>`; setup další vize přeškrtnuté přesune do archivu. Nikdo v běhu ho nečte celý: PRD, prd-check i sklizeň grepují podle bodů vize, modulů, cest a oblastí |
| `docs/vize-spory.md` | kdokoli v běhu (append) | Rozpory a předpoklady k vizi; tvar níže. Běh se kvůli nim nezastavuje |
| `docs/reviews/rez-NN-p<pokus>-<typ>-kolo-M.md`, `docs/reviews/kolecko-<typ>[-<kolo>][-<čočka>].md` | kontrolní agenti | Plné reporty (`prd-check`, `prd-refresh`, `thermo`, `code-review`, `verify`, `e2e`) a delší souhrny; blok PRD bez čísla pokusu (`rez-NN-prd-check-kolo-M.md`). Číslo pokusu v názvu: pokus 2 nepřepisuje reporty pokusu 1. **Gitignorováno.** Orchestrátor je nikdy nečte; čte je fix agent, který dostane cestu. Setup další vize je přesune do `docs/reviews/_archiv/<slug>/` |
| `docs/zaverecna-zprava.md` | finální fáze | Závěrečná zpráva, přepisovaný soubor |
| `docs/archive/<slug>/` | setup další vize | Archiv předchozího běhu: handoff, journal, vize-spory, prd/, e2e/, zpráva, uzavřené follow-ups |
| `docs/.orchestrator-run` | setup; maže finální fáze | Marker běhu, JSON `{session_id, started, vize, slug, branch}`. Hooky podle `session_id` poznají orchestrátorskou session; deploy gate v `guard-blast-radius.sh` podle existence |
| `docs/.orchestrator-session` | hook `prompt-submit.sh` | `{session_id, at}` při promptu `/dev-pipeline:orchestrate`; setup ho spotřebuje |
| `docs/.deploy-unlocked` | deploy agent samostatným příkazem; maže uzavření | Odemyká deploy příkaz v guardu |
| `docs/.review-passed` | review-kolecko; maže finální fáze | Kolečko doběhlo celé |
| `docs/.verify-passed` | jen verify agent přes `scripts/verify-marker.sh` po zelené bráně; nikdo ručně (guard odmítne) | `{tree, at, log}`: hash pracovního stromu bez `docs/` (`scripts/tree-hash.sh`: `git write-tree` nad dočasným indexem po `git add -A` a `git rm -r --cached -- docs`), nad kterým prošla zelená plná suita. Pre-commit hook projektu při shodě hashe plnou suitu přeskočí; změna souboru mimo `docs/` hash mění, dokumenty běhu (handoff, PRD dalšího řezu, journal) ho nechávají platný, proto žádný test projektu nesmí číst `docs/` |
| `docs/.vize-done` | finální fáze | Běh skončil (ukončuje `limit-watcher.sh`) |

Markery a `docs/reviews/` jsou v `.gitignore` (setup je doplní). Secrets do žádného z těchto souborů nepatří.

### `docs/handoff.md`

```
# Běh vize <slug>
stav běhu: <hodnota>
branch: vize/<slug> · vize: docs/vize/<slug>.md · start: <datum>
session: <session_id>

## Plán (živá kopie)
| # | název | body vize | definice hotového | závislosti | stav | commit | E2E | pozn. |

## Změny plánu
- <datum> řez NN: <co a proč>   (cesta k Cílům, nikdy Cíle)

## Poznámky pro navázání
```

Hodnoty `stav běhu:` (čte je Stop hook): `běží workflow <blok> řez NN (task <id>)`, dvojice `běží workflow blok-stavby řez NN (task <id>) + blok-prd řez MM (task <id>)`, `běží workflow blok-kolecko (task <id>)` nebo `běží agent <co> (task <id>)` = práce jede na pozadí, tah smí skončit (u agenta bez task id Stop hook projde, ale cron nemá co sledovat) · `čeká: <další krok>` = orchestrátor má něco udělat, tah nesmí skončit · `zastaveno: (<písmeno>) <důvod>` = čeká se na uživatele · `hotovo`.

### Frontmatter PRD

```yaml
---
rez: 3
slug: bulk-actions
status: in_progress   # in_progress | done | skipped
vize: docs/vize/<slug>.md
body_vize: [C2, F4, F5]
runtime_dopad: ano    # ne = jen testy, tooling, dokumentace: bez deploye, kritéria se dokládají bez prohlížeče
lesen: ne             # ano = řez staví zkušební rozhraní; plán má řádek na jeho odstranění
pokusy: 1             # zapisuje blok stavby
commit: <hash>        # doplní uzavření
---
```

### `docs/vize-spory.md`

```markdown
## <YYYY-MM-DD> | řez NN | <agent>
**Rozpor nebo předpoklad:** <co ve vizi chybí, odporuje si nebo neplatí; cituj vizi>
**Jak jsem se zachoval:** <podle čeho jsem jel a proč>
**Co by to rozhodlo:** <jednou větou>
```

Zapisuje kdokoli, běh pokračuje konzervativní variantou. Rozhodnutí uživatele, které přijde během běhu, zapisuje orchestrátor **doslovnou citací**, ne parafrází. **Otázky pro majitele** (kolize vize s runbookem nebo CLAUDE.md projektu, vadné kritérium z E2E, vědomě nesplněný bod řádku plánu) mají stejný tvar s navrženou odpovědí v „Jak jsem se zachoval: podle návrhu …“; běh podle návrhu pokračuje, závěrečná zpráva je sebere do sekce OTÁZKY S NAVRŽENOU ODPOVĚDÍ. Nemíchat s journalem (co se stalo) ani s follow-ups (co zbývá).

### `~/dev-pipeline-feedback.md` (mimo repo)

Vady a brzdy **pipeline samotné** (krok, který selhal; instrukce, která byla nejednoznačná; nástroj, který přestal fungovat). Leží v domovském adresáři, ne v `~/.claude`: ta cesta je pro sandbox Claude Code chráněná a `allowWrite` ji neodemkne (setup snippet dává `~/dev-pipeline-feedback.md` do `sandbox.filesystem.allowWrite`). Zapisuje orchestrátor při uzavření řezu ze souhrnů agentů; agent problém hlásí ve svém návratu. Formát: `## <datum> | <projekt> | <krok>` · `Typ: SELHALO | POMALÉ | NEJASNÉ | ZLEPŠENÍ` · co se stalo · jak se to obešlo · návrh. Vždy zapiš selhanou invokaci skillu (`disable-model-invocation`).

## Agenti

| Agent | Model / effort | Role | Píše | Vrací (strojově, schéma vynucuje workflow) |
|---|---|---|---|---|
| `prd` | Opus high | PRD a E2E řezu podle řádku plánu; zapracování nálezů | `docs/prd/`, `docs/e2e/`, vize-spory | cesty, cíl, počet kritérií, souhrn ≤ 20 řádků, lešení, zápis do živého, runtime dopad, nové UI plochy, body vize, odchylky od plánu; při zapracování změněná místa a odmítnuté nálezy |
| `prd-check` | Opus high | Nezávislá kontrola PRD (úplnost, validita proti kódu, kritéria, rozsah, optimalita); delta kolo jen nad změněnými místy | report | verdikt, počty, osy, identifikátory nálezů, cesta k reportu |
| `implement` | Opus high | TDD implementace podle PRD; opravuje pasti ve svých souborech | kód, testy | stav, souhrn ≤ 10 řádků, oblasti, typecheck, testy, odchylky od PRD, opravené pasti, follow-ups, spory |
| `thermo-nuclear-review` | Opus medium | Strukturální audit změn řezu | report | počty (blokery, nálezy), cesta |
| `code-review` | Opus high | Korektnost změn; nálezy CONFIRMED/PLAUSIBLE, každý BLOKUJE NASAZENÍ nebo FOLLOW-UP | report | počty, disjunktní balíčky po souborech s identifikátory nálezů, cesta |
| `fix` | Opus medium | Oprava nálezů jako hypotéz (thermo, review, brána, E2E, bezpečnost) | kód, testy | opraveno, odmítnuto s důvodem, změněná místa, rozšířený zásah, typecheck, testy, follow-ups, commit u bezpečnostních oprav |
| `verify` | Sonnet low, bez CLAUDE.md | Typecheck a testy, skutečné výstupy | výstup do reports | typecheck, počty, selhávající testy, cesta k výstupu |
| `deploy` | Sonnet low, bez CLAUDE.md | Commit a nasazení podle deploy konfigurace nebo runbooku projektu, doložený stav; pokyny majitele (`app_pristup`) mají přednost před skripty repa; u Pages ověřuje Production; migraci aplikuje jen s dokladem; cizí a necommitnutou práci nevrací | commit, marker deploy | stav, commit, health, url |
| `doklad` | Sonnet medium | Jen když PRD předepisuje doklad před migrací: snímek dotčených dat dotazy jen pro čtení před nasazením | `docs/e2e/rez-NN-doklad-pred.md` | ok, cesta, souhrn, důvod |
| `e2e-verifier` | Opus medium | Kritéria proti běžící aplikaci, PASS / PASS-částečně / FAIL, nálezy mimo kritéria zvlášť; nejdřív ověří prostředí (nasazená revize = commit řezu), nikdy nenasazuje, přístup jen ze zadání; kolo 2 jen nad FAIL kritérii; při souběhu jen přidělené sekce | report | výsledek, počty, FAIL a částečná kritéria, závažné mimo kritéria, kosmetické, `prostredi`, cesta |
| `diagnose` | Opus high | Po 2. neúspěchu: reprodukční smyčka a doložená příčina, nic neopravuje | dočasné artefakty | příčina, doporučení, cesta k reprodukci |
| `vize-validator` | Fable high | Finální srovnání vize s realitou | report | dodělat automaticky, rozhodnutí pro uživatele, verdikt |
| `plan-check` | Opus high | Mimo běh: post-implementační kontrola plánu | nic | verdikt |

Agenti vize session (mimo běh, spouští je skill `vize`): `pruzkum` (Sonnet medium; fakta z kódu, dat a dokumentů s citacemi, bez úsudku), `reserse` (Opus high; cizí API, svět venku, právní a produktová rešerše; Fable na vyžádání parametrem volání `model`), `cerstve-oci` (Opus high; čtení hotové vize z přidělené role). Bezejmenný `general-purpose` nebo `Explore` dědí model i effort session, proto je skill vize nepoužívá.

Model je v souborech agentů i ve Workflow zapsaný zkratkou (`opus`, `sonnet`, `fable`) a Claude Code ji překládá na nejnovější model dané řady; kterou verzi běh skutečně použil, ukazují transkripty (`message.model`) a `co-dela.sh`.

Deploy a verify nedostávají CLAUDE.md projektu; projektová specifika (příkazy, deploy, přístupy) dostávají odkazem na `docs/dev-runbook.md` nebo sekci CLAUDE.md, kterou jim workflow předá.

Pravidla společná všem agentům: návrat je strojový (schéma), textová pole krátká, co se nevejde jde do souboru v `docs/reviews/` a vrací se cesta · žádné otázky na uživatele · rozpor s vizí do vize-spory a konzervativní volba · vykonávat jen svou fázi · kód číst symbolem (Serena), ne celé velké soubory (guard běhu velké čtení odmítne) · testy patří k chování, ne k řezu: žádné soubory pojmenované po řezu · past v kódu se opravuje, ne dokumentuje.

## Bloky (Workflow skripty pluginu)

**`dev-pipeline:blok-prd`** · args `{cwd, plugin_root, vize, produkt, rez, plan_row, hypotezy, follow_ups, app_pristup, profil, kontrakt_prd, kontrakt_rez}` (`app_pristup` pokyny majitele k prostředí; `profil: "lehky"` u řezu bez runtime dopadu; `kontrakt_prd`/`kontrakt_rez` u řezu závislého na právě stavěném: PRD stavěného řezu je kontrakt a rozhraní z něj jsou předpoklady, které stavba přeměří) · kroky: PRD → prd-check kolo 1 (měřidla kritérií se spouští už tady; výčet místo vlastnosti a kritérium závislé na uzavíracím commitu jsou nálezy; doklad před migrací předepsaný právě tehdy, když je potřeba; sekce E2E nezávislé) → zapracování (jen při needs-fixes) → delta kontrola nad změněnými místy **jen po blokujících nálezech kola 1, u lehkého profilu nikdy**. **Žádné třetí kolo**, zbylé nálezy se vrací jako `hypotezy_pro_stavbu` (bez delta kontroly report kola 1 s příznakem `zapracovano`). Režim `rezim: "zapracovani"` (+ `prd_path`, `e2e_path`, `nalezy: [...]`): orchestrátor odmítl odchylku od plánu nebo chybí pokrytí bodů vize; běží jen zapracování + delta kontrola, ne nové PRD. Návrat: cesty, souhrn pro schválení, příznaky (lešení, zápis do živého, runtime dopad, nové UI plochy), body vize, odchylky od plánu, spory, výsledek kontroly, `rezim`, `profil`, `oblasti` (dotčené moduly), `doklad_pred` + `doklad_popis`, `e2e_sekce`, `kontrakt_rez`.

**`dev-pipeline:blok-stavby`** · args `{cwd, plugin_root, vize, rez, prd_path, e2e_path, hypotezy, ne_cile, prd_stale, mazane_pozdeji, deploy_okno, runtime_dopad, runbook, deploy_mode, app_pristup, profil, doklad_pred, kriteria, e2e_sekce}` (`hypotezy` = `{report, ids}` z bloku PRD + `text`: pole vět orchestrátora, které nikdy nerozšiřují rozsah PRD; `ne_cile` text Ne-cílů vize do 1 500 znaků, jde do rámce každého agenta bloku; `prd_stale` řezy uzavřené od startu bloku PRD, jen s překryvem oblastí nebo závislostí, každý s oblastmi; `mazane_pozdeji` co mažou pozdější řádky plánu; `deploy_okno` zakázané okno nasazení z runbooku; `app_pristup` pokyny majitele, pro deploy závazné; `profil: "lehky"` bez thermo a s jedním kolem review; `doklad_pred`, `kriteria`, `e2e_sekce` z návratu bloku PRD) · jeden pokus: refresh PRD (jen při neprázdném `prd_stale`, jen v pokusu 1: delta prd-check kritérií závislých na stromu na Opus medium → při needs-fixes zapracování PRD agentem) → implement (plná suita jednou na konci, build verze jako součást řezu) → thermo ∥ code-review kolo 1 (souběžně nad týmž stromem) → fix per balíček souběžně, thermo nálezy BLOCKER/HIGH přidané k balíčku, který soubor vlastní, zbytek jako vlastní balíček (fix agenti pouštějí jen dotčené testy) → (při rozšířeném zásahu, blokujících review nebo blokujících thermo) kolo 2 nad opravnou várkou → nejvýš jedna další oprava → verify (jediná plná suita; zelená zapíše `docs/.verify-passed`; + jedna oprava + verify) → **doklad** (jen při `doklad_pred`, když blok nasazuje: Sonnet agent pořídí `docs/e2e/rez-NN-doklad-pred.md`, jeden pokus navíc, bez dokladu řez ve fázi `doklad` selže) → deploy (jeden commit včetně docs, bez samostatného build-marker commitu; migrace jen s dokladem) → E2E (nad 12 kritérií a s `e2e_sekce` dva verifikátoři souběžně, každý nad svými sekcemi, počty se sčítají; verifikátor nejdřív ověří prostředí, `prostredi` neprázdné = jedno dorovnání deployem a přeměření, bez fix agenta; verdikt z počtů: `fail > 0` je fail bez ohledu na text; + jedna oprava, deploy, **kolo 2 jen nad FAIL kritérii kola 1** a smoke ostatních ploch, výsledné počty složené z obou kol; **vadné kritérium** ve `vadna_kriteria` s dokladem druhu se neopravuje ani neopakuje, řez se uzavře a kritérium jde v `rozhodnuti` orchestrátorovi) → bezpečnostní nálezy mimo kritéria samostatným commitem → uzavření (PRD status a commit, srovnání PRD s realitou, položkové sesouhlasení thermo BLOCKER/HIGH do journalu nebo follow-ups, kontrola dokladů předepsaných PRD/vizí v commitu, journal, follow-ups). **Až 3 pokusy, před třetím diagnóza.** Návrat: `vysledek` hotovo|selhalo, pokusy, commit, deploy, `oblasti`, E2E počty včetně `vadna_kriteria`, review počty (`security_commity` bez prázdných položek), thermo včetně `nesesouhlaseno`, `rozhodnuti`, follow-ups, odchylky, `chybejici_doklady`, spory, opravené pasti, cesty k reportům; při selhání fáze, detail a diagnóza.

**`dev-pipeline:blok-kolecko`** · args `{cwd, plugin_root, vize, produkt, base, ne_cile, runbook, deploy_mode, deploy_okno, app_pristup}` (`app_pristup` jde i deploy agentovi jako závazný postup) · závěrečné kolečko vize jako jeden Workflow: thermo (oprava jen BLOCKER/HIGH) → code-review kolo 1 (opravy po disjunktních balíčcích souběžně) → kolo 2 fan-outem pěti čoček nad celým rozsahem a triáž jedním agentem (opravit teď / follow-up kandidát na řez / odmítnout s důvodem / sporné do `rozhodnuti`) → bezpečnost (bezpečnostní čočka s checklistem ∥ `security-review`, commity `fix(security)`) → brána, nasazení, `docs/e2e/kolecko.md` a E2E verifikace (jedna oprava; kolo 2 jen nad FAIL kritérii kola 1) → závěr (journal, follow-ups, `docs/.review-passed`, commit docs). Po každé opravné vlně verify (jedna oprava) a commit `kolecko: <fáze>` přes deploy agenta v režimu commit-only. Žádná fáze se nepřeskakuje; neúspěch fáze blok neopakuje, vrací `vysledek: selhalo` s fází a `review_passed: false`. Sken claude-security do bloku nepatří, je to samostatný krok orchestrátora jen na vyžádání (hlavička vize `bezpecnostni_sken:`), postup ve skillu `review-kolecko`.

Funkční neúspěch = fáze doběhla a výsledek je špatně; infra smrt agenta (limit, API chyba) se opakuje uvnitř bloku a nepočítá se. Workflow po usage limitu pokračuje sám, když má uživatel `autoContinueAtUsageLimit: true`.

**Sledování běhu:** `scripts/co-dela.sh` čte journal a metadata agentů ze session Claude Code (`~/.claude/projects/<slug>/<session_id>/`), žádný model nevolá a nic z obsahu odpovědí nevypisuje. Živý agent je poslední `started` daného `key` bez `result`/`failed` (stall watchdog restartuje agenta se stejným `key`; starý start není živý). Výstup: hlavička běhu z handoffu (vize, hotové řezy), per blok jméno řezu, pokus, doba, fáze i/N s trváním (fáze ze skriptu bloku), hotové fáze, živí agenti s modelem a časem od posledního zápisu; hotové bloky za posledních 30 min jako `✓ …` a selhané jako `✗ … selhalo: <důvod>`. Bez argumentu (v cwd projektu s markerem běhu) navíc poslední volání nástrojů; `--kratce` je tvar pro cron orchestrátora (do 12 řádků); `--status` je segment pro status line (JSON status line na stdin, prázdný výstup, když nic neběží).

## Guardy běhu (hooky pluginu, aktivní jen při shodě `session_id` s markerem)

Orchestrátorská session: `AskUserQuestion` odmítnut · Read/Grep/Glob jen vize, produkt.md, handoff, vize-spory, follow-ups a soubory pluginu · Bash bez čtení a spouštění projektu (balíčkovač, testy, curl, deploy, diffy) · Write/Edit jen do `docs/`. Subagenti: celý zdrojový soubor nad 350 řádků se nečte (Read bez offset/limit, `cat`, `sed -n` přes celek, `head`/`tail` nad práh). Všichni: `docs/.verify-passed` se nepíše ručně (Write/Edit ani přesměrování v Bash), jen `scripts/verify-marker.sh`. Blast-radius guard během běhu (marker existuje) všem blokuje `git stash` (mimo `list`/`show`), `git clean` a `git checkout --`/`git restore` nad tečkou, `docs/` nebo celým stromem: vrátily by necommitnutou práci jiných agentů; vrácení vlastního souboru mimo `docs/` projde.

## Brána projektu (doporučený tvar pre-commit hooku)

Blok stavby pouští plnou suitu jednou (verify). Aby ji pre-commit hook projektu nepouštěl podruhé nad týmž stromem a neplatil ji za commity bez kódu, doporučený tvar hooku má tři patra: (1) staged jen `docs/**` a `*.md` → hook končí; (2) typecheck a rychlé kontroly vždy; (3) plná suita jen tehdy, když `docs/.verify-passed` nenese hash aktuálního stromu bez `docs/` (výpočet stejný jako v `scripts/tree-hash.sh`: kopie indexu, `git add -A`, `git rm -r --cached -- docs`, `git write-tree`; obě strany musí počítat stejně, jinak se marker nikdy neshodne a suita běží vždy). Vzor: `.husky/pre-commit` v Surya-PPC-Tool. Bez takového hooku běh funguje, jen platí suitu dvakrát. Stop hook: tah orchestrátora smí skončit jen ve stavech `běží…`, `zastaveno…`, `hotovo`. PreCompact: varování při handoffu nad 4 kB.
