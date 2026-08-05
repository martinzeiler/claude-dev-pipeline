# claude-dev-pipeline

Osobní vývojová pipeline pro Claude Code: **vize → řezy → autonomní implementace → review → validace**. Jedno schválení (vize), zbytek běží bez dozoru. Stav žije v souborech projektu, ne v kontextu — každý řez proto může běžet s čerstvým kontextovým oknem.

## Instalace

Repo je zároveň plugin marketplace. Na novém stroji:

```bash
git clone <url-tohoto-repa> ~/claude-dev-pipeline
```

Do `~/.claude/settings.json` přidat:

```json
{
  "extraKnownMarketplaces": {
    "claude-dev-pipeline": {
      "source": { "source": "directory", "path": "/Users/<user>/claude-dev-pipeline" }
    }
  },
  "enabledPlugins": {
    "dev-pipeline@claude-dev-pipeline": true
  }
}
```

(Alternativně interaktivně: `/plugin marketplace add ~/claude-dev-pipeline` a `/plugin install dev-pipeline@claude-dev-pipeline`.)

Skripty musí být spustitelné: `chmod +x ~/claude-dev-pipeline/dev-pipeline/hooks/*.sh ~/claude-dev-pipeline/dev-pipeline/scripts/*.sh`

Volitelně: plugin **claude-security** (`/plugin install claude-security@claude-plugins-official`) — review kolečko ho použije jako druhou bezpečnostní metodiku. Bez něj poběží obě kola vestavěným `security-review` a zapíše se to do deníku pipeline.

## DŮLEŽITÉ: refresh po editaci pluginu

Directory-source marketplace se při registraci **kopíruje do cache** — editace zdrojového adresáře se do sessions NEpropíše sama. Po každé změně pluginu (i po `git pull` na jiném stroji):

```
/plugin marketplace update claude-dev-pipeline
```

nebo neinteraktivně z terminálu: `claude plugin marketplace update claude-dev-pipeline`. Pak novou session (případně `/reload-plugins` v běžící). Při aktivním vývoji pluginu je jednodušší spouštět session s živým čtením bez cache:

**POZOR na verzi:** updater porovnává `version` v `plugin.json` — při stejné verzi hlásí „already at latest" a obsah cache NEobnoví (známý bug). Proto **každá změna pluginu = bump verze v `dev-pipeline/.claude-plugin/plugin.json`** (pak stačí `claude plugin update dev-pipeline@claude-dev-pipeline`). Nouzový workaround bez bumpu: `claude plugin uninstall dev-pipeline@claude-dev-pipeline && claude plugin install dev-pipeline@claude-dev-pipeline`.

```bash
claude --plugin-dir ~/claude-dev-pipeline/dev-pipeline
```

Příznak stale verze: session dostane při invokaci skillu starší obsah, než je na disku, nebo nezná nově přidané agenty (`dev-pipeline:*`).

## Workflow — celý cyklus jedné vize

**Tvoje kroky jsou jen 1, 4 a 5. Zbytek běží sám.**

1. **`/vize`** (interaktivní — jediný schvalovací bod). Debatní session, délka podle rozsahu: fact-finding průzkum, grilování otázkami s doporučeními, průběžný seznam otevřených otázek v draftu (session končí, až je prázdný), na závěr kontrola čerstvýma očima; deep research jen na vyžádání. Vize rozhoduje i **tvar UI** (primární akce, hierarchie, hustota, prázdný/chybový/načítací stav) — bez toho si ho implementace domýšlí a pokaždé jinak; když próza nestačí, `/dev-pipeline:prototyp`. Vstupem může být i backlog `docs/follow-ups.md` — session živé položky probere a roztřídí (převzaté do vize přeškrtne s `PŘEVZATO`, zamítnuté s důvodem). Výstup: `docs/vize/<slug>.md` commitnutý. Je to zároveň **jediné místo, kde se zakládá a mění produktová severka `docs/produkt.md`** (viz níže). Spouštěj na main, **až po merge předchozí vize** (branch nové vize vzniká z main).

2. **`/dev-pipeline:orchestrate`** — v nové session; na dlouhý běh „spusť a odejdi" v tmuxu s limit-watcherem (viz Usage limity). Co proběhne samo:
   - **Setup**: branch `vize/<slug>`; archivace předchozí vize (`prd/`, `e2e/`, `journal.md` → `docs/archive/<starý-slug>/`), kompakce follow-ups (přeškrtnuté → archiv, živý soubor = jen otevřené), smazání stale markerů; pre-flight check projektu (testy/deploy/přístup do appky). **Nic z toho neděláš ručně.**
   - **Smyčka řezů**: PRD (lazy rozsah z aktuálního stavu) → nezávislý prd-check → TDD implementace → lehké code-review → commit + deploy (s doloženým SUCCESS) → E2E verifikace (agent-browser) → uzavření (journal, handoff, follow-upy).
   - **Finální fáze**: plné review kolečko → vize-validator proti živé appce → mini-řezy z jeho nálezů → follow-ups sweep → notifikace + závěrečná zpráva.
   - **Souběh** (ať se využije pětihodinové okno): **celý blok PRD + prd-check dalšího řezu běží na pozadí** vedle fází 4 až 7 toho současného, a startuje hned po implementaci (od 0.5.0; v 0.4.0 startoval až po review a přesouval jen psaní PRD, což byla čtvrtina toho času). Dál: implementace řezu sahajícího na víc balíčků se dělí (nejdřív sdílené typy, pak backend a frontend souběžně); fix agenti běží paralelně nad disjunktními soubory; obě bezpečnostní metodiky v kolečku běží najednou. **Dva řezy najednou nikdy** — sdílená produkce.
   - **Co přežije compact** (od 0.5.0): `orchestrate/SKILL.md` se čte jen jednou při invokaci, takže se z běhu tiše vytrácely kroky, které jsou v něm — souběh proběhl jen do prvního compactu. Hook `session-start-handoff.sh` proto po compactu injektuje vedle handoffu i `skills/slice-run/PO-COMPACTU.md` (souběh, stropy subagentů, disciplína kontextu). Když měníš souběh, měň ho na obou místech.
   - **Stropy**: při 170 spuštěných subagentech orchestrátor dokončí řez, zapíše handoff a sám se zastaví (strop session je ~200 a naražení uprostřed řezu = mrtvá session). Když napíšeš „po tomto řezu uděláme compact", dokončí řez celý, připraví handoff a počká — compact nikdy neinicuje sám.

3. **Přečti závěrečnou zprávu** — je v session I v souboru `docs/zaverecna-zprava.md`: co je hotové per řez, skipped řezy, sekce **Rozhodnutí pro tebe** (skutečné odchylky od vize s doporučením), sekce **Paměť a dokumentace** (co stojí za uložení). Pořadí čtení po běhu: `docs/zaverecna-zprava.md` (souhrn + rozhodnutí) → `docs/follow-ups.md` (živé resty) → `docs/journal.md` (detail per řez, jen když tě něco zajímá).

4. **Tvoje kontrola**: proklikej nasazenou aplikaci / otestuj, co vize slibuje. Případné opravy zadej téže orchestrátor session (nebo nové session s odkazem na journal).

5. **Merge do main — děláš ty, až po kontrole** (nebo na tvůj pokyn Claude: „mergni vizi do main" = checkout main → merge → push na GitHub → `git branch -d vize/<slug>`). Autonomní běh na main NIKDY nesahá. Po merge je cyklus uzavřený a můžeš od kroku 1 začít další vizi.

**Nikdy ručně nemažeš nic v `docs/`** — archivaci i kompakci dělá setup další vize; `docs/follow-ups.md` je kontinuální backlog napříč vizemi a díky kompakci neroste donekonečna.

### Fallback: Ralph driver (bez orchestrátor session)

```bash
~/claude-dev-pipeline/dev-pipeline/scripts/slice-driver.sh --watch   # sleduješ, řez odstartuješ ukončením session
~/claude-dev-pipeline/dev-pipeline/scripts/slice-driver.sh           # headless, spusť a odejdi
```

Stejný souborový kontrakt, každý řez = nová session. Po dokončení: `claude "/dev-pipeline:orchestrate final"`. Headless režim usage limit přežije sám (detekce hlášky → 30min čekání → retry, iterace se nepočítá).

### Usage limity při dlouhém běhu

Claude Code nemá auto-resume po usage limitu. Pipeline to řeší třemi vrstvami:

1. **Subagent umře na limit** → chybu vidí orchestrátor a řeší ji sám (TaskStop + resume; nepočítá se jako pokus řezu — viz failure policy v PIPELINE.md).
2. **Orchestrátor session sama narazí na limit** → stojí, dokud jí někdo nenapíše. Na dlouhé běhy „spusť a odejdi" proto orchestrátor spouštěj v tmuxu a vedle nech běžet watcher, který po resetu pošle „pokračuj":

```bash
tmux new -s pipeline          # v něm: claude → /dev-pipeline:orchestrate ...
~/claude-dev-pipeline/dev-pipeline/scripts/limit-watcher.sh   # druhý terminál
```

3. **Ralph driver (headless)** má retry vestavěný.

Ve všech případech platí: stav běhu žije v souborech (handoff, journal, PRD statusy), takže přerušení kdekoli je bezpečné — nejhorší scénář je čekání, nikdy ztráta práce.

## Souborový kontrakt (v repu cílového projektu)

| Soubor | Účel |
|---|---|
| `docs/produkt.md` | **Produktová severka** — trvalá norma napříč vizemi: severka (2-3 věty), kontrolovatelné mantinely, trvalá ne-rozhodnutí. Max ~1 strana. Zakládá a mění ji **jen `/vize` session**; autonomní běh ji čte a nikdy needituje. Čtou ji čtyři místa: `/vize`, PRD, `prd-check` (osa A), `vize-validator`. Nepovinná — bez ní se nic nevynucuje. Řeší třídu chyby „každý řez byl správně, výsledná obrazovka je nepoužitelná" |
| `docs/vize/<slug>.md` | Vize (jediný schválený vstup) |
| `docs/vize-spory.md` | Append-only kanál pro **rozpory ve vizi samotné** nalezené za běhu. Agent zapíše a jede dál (běh se nezastaví), orchestrátor to vypíše mezi řezy — dozvíš se to, dokud s tím jde něco dělat, ne až v závěrečné zprávě |
| `docs/prd/rez-NN-<slug>.md` | PRD řezu, vzniká lazy; frontmatter `status: in_progress\|done\|skipped` |
| `docs/journal.md` | Append-only deník: co, odchylky, rozhodnutí, pokusy |
| `docs/handoff.md` | Přepisovaný aktuální stav (kotva pro čerstvé kontexty; po compactu ho hook re-injektuje) |
| `docs/follow-ups.md` | Resty a nápady mimo scope |
| `docs/e2e/rez-NN.md` | E2E scénáře řezu (akceptační kritéria v krocích) |
| `docs/zaverecna-zprava.md` | Závěrečná zpráva finální fáze (souhrn, rozhodnutí pro tebe) — přepisovaný per vize |
| `docs/archive/<slug>/` | Archiv předchozí vize (prd/, e2e/, journal, zaverecna-zprava) — vytváří setup další vize |
| `docs/.vize-done` | Marker: vize naplněna |
| `docs/.orchestrator-run` | Marker: běží autonomní run (aktivuje deploy gate) |
| `docs/.deploy-unlocked` | Marker: deploy povolen (po zeleném review+testech) |
| `docs/.review-passed` | Marker: plné kolečko prošlo |
| `~/.claude/dev-pipeline-feedback.md` | **Globální, mimo repo projektu i pluginu** (přežije reinstalaci). Append-only deník vad a brzd pipeline samotné: co selhalo a muselo se obejít, co trvalo nesmyslně dlouho, kde je instrukce nejednoznačná. Zapisuje orchestrátor při uzavření řezu a review-kolečko při selhání kroku; závěrečná zpráva to shrne v sekci **Pipeline**. Čti ho, když se chystáš plugin vylepšovat — resty projektu tu nemají co dělat, ty patří do `docs/follow-ups.md`. |

Kanonická definice fází: `dev-pipeline/skills/slice-run/PIPELINE.md` — **proces se mění jen tam**.

## Agenti

Pojmenovaní agenti mají pevnou metodiku **a pevný reasoning effort ve frontmatteru** — role, která přemýšlí, ho má natvrdo na `xhigh`, aby ji nešlo shodit změnou globálního nastavení; mechanická role jede níž, protože její výstup se tím nezhorší.

| Agent | Effort | Role |
|---|---|---|
| `prd-check` | xhigh | Kontrola PRD před implementací (fáze 2) — vč. zákazů z vize a severky |
| `implement` | xhigh | TDD implementace řezu (fáze 3) |
| `code-review` | xhigh | Correctness review (fáze 4 a kolečko), nad velkým diffem fan-out na 3 lensy |
| `thermo-nuclear-review` | xhigh | Strukturální audit (kolečko kolo 1) — vč. osy „barrel, který nikdo nepoužívá" |
| `e2e-verifier` | xhigh | E2E verifikace proti běžící appce (fáze 6) |
| `vize-validator` | xhigh | Čerstvé oči na konci vize |
| `diagnose` | xhigh | Zaseknutý řez: reprodukční smyčka + doložená příčina, **neopravuje** |
| `plan-check` | xhigh | Post-implementační kontrola plánu (mimo pipeline) |
| `fix` | high | Oprava nálezů — nález bere jako **hypotézu**, ne jako zadání |
| `deploy` | medium | Commit + deploy s doloženým stavem (fáze 5) |
| `verify` | low | Typecheck + testy, nic needituje |

**Nový agent = nová session.** Registr agentů se čte při startu, na rozdíl od skill souborů; běžící session pojmenovaný typ neuvidí a spadne na general-purpose náhradu.

## Prototypy — `/dev-pipeline:prototyp`

Pro jedinou situaci: **akceptační kritérium nejde napsat, dokud se nerozhodne tvar**.

- **UI větev** — 3 strukturálně různé varianty (různá rozhodnutí, ne odstíny) přímo uvnitř existující stránky, přepínání `?variant=a|b|c` + plovoucí lišta. Rozhoduješ ty podíváním. Lišta je gatovaná na `VITE_PROTOTYPE=1`, ne na `NODE_ENV` — admin i portál se nasazují jako produkční build, takže dev-only podmínka by ji vypnula přesně tam, kde ji chceš vidět.
- **Logická větev** — malá TUI nad čistým modulem (reducer / stavový automat). Rozhoduje **měření**, ne vkus: agent prožene model hraničními případy a nahlásí, co je nereprezentovatelné, které stavy jsou nedosažitelné a která lane je v produkci trvale mrtvá. Zvládne se bez tebe.

Kdy volat: z `/vize` (výchozí pro UI), z fáze 1 u nového stavového automatu, z fáze 3 u nového UI povrchu — tam **nikdy blokujícím způsobem**, agent vybere sám s písemným zdůvodněním a varianty odloží na odhoditelnou větev. Prototyp je jednorázový: vítěz se staví znovu podle konvencí projektu, kód variant se zahazuje.

Kdy neprototypovat: přidání pole do existující obrazovky (tvar je daný okolím) a cokoli, co jde rozhodnout prózou.

## Hooky (globální po zapnutí pluginu)

- **guard-blast-radius** (PreToolUse/Bash): blokuje force-push (vždy), `git reset --hard`/`git clean -f` na main, `rm -rf` na kořeny, a deploy během autonomního běhu bez `.deploy-unlocked`. Deterministický shell, běží i pod `--dangerously-skip-permissions`.
- **session-start-handoff** (SessionStart/compact): po compactu injektuje obsah `docs/handoff.md`.

## Zásady

- **Plné reporty review se nevrací orchestrátorovi** (od 0.5.0). `prd-check` i `code-review` píšou rozbor do `docs/reviews/rez-NN-*.md` (gitignorováno) a vrací jen verdikt plus jednořádkové nálezy; cestu k reportu dostane fix agent, orchestrátor obsah nikdy nečte. Měřeno na ostrém běhu: návratové hodnoty agentů byly přes polovinu jeho kontextu a jednotlivé reporty měly 11-15 tisíc znaků, které jen přeposílal dál.
- Review: per řez jen lehké (agent `dev-pipeline:code-review`, `rozsah: pracovní-strom`); plné kolečko jednou na konci vize — thermo-nuclear → simplify → 2× code-review → **dvě souběžné bezpečnostní metodiky** (vestavěný `security-review` + subagent `claude-security:claude-security` se zadáním `scan changes --base main --effort high`). Dvě různé metodiky najdou různé věci, dvě stejné skoro totéž: vestavěný skill čte diff, claude-security staví threat model a každý nález prohání tříhlasým verifikačním panelem. Jeho reporty (`CLAUDE-SECURITY-*/`) patří do `.gitignore` a patche se **neaplikují automaticky** — jsou to nálezy jako každé jiné. Vestavěný skill `code-review` se nepoužívá — má `disable-model-invocation: true`, takže ho žádný model přes Skill tool nespustí; agent je jeho náhrada s pevně danou metodikou.
- **Zákaz z vize musí dojít až do testu.** Pipeline z každého zákazu, kterého se řez dotkne, vyrobí **záporné akceptační kritérium** („X **není** v Y") — kladná půlka („X je v panelu ✓") projde i tehdy, když je X zároveň tam, kde být nemá. Hlídá to `prd-check` (osa A, hledá zákazy v celé vizi, ne jen v Ne-cílech), ověřuje `e2e-verifier` na obou půlkách a křížově kontroluje `vize-validator`. Zákaz proto ve vizi piš jako zákaz, ne jako povzdech uprostřed odstavce.
- **Zaseknutý řez se diagnostikuje, ne opakuje.** Po 2. funkčním neúspěchu jede `dev-pipeline:diagnose`: postaví reprodukční smyčku a vrátí doloženou příčinu, ale neopravuje. Teprve s ní jde třetí pokus. Diagnostický běh se do pokusů nepočítá.
- TDD červená → zelená: test/E2E scénář vzniká před implementací a musí nejdřív selhat ze správného důvodu.
- Zaseknutý řez: 3 **funkční** neúspěchy → `skipped` + poctivý záznam; vyhodnotí validátor na konci. Infra smrt agenta (limit, API error) se nepočítá — řeší se resume.
- Git: všechno na `vize/<slug>` branchi; merge do main dělá uživatel po vlastním otestování. Deploy target per projekt (sekce Deploy v CLAUDE.md projektu; staging = přepnutí configu, promotion = deploy téhož commitu).
- Autonomní běh se nikdy neptá uživatele; odchylky žurnaluje, rozhodnutí eskaluje až validátor v závěrečném reportu.
- **Jedna vize v čase per projekt.** Souběžné běhy na témže projektu si vzájemně přepisují nasazení (deploy z branche A smaže z produkce změny branche B), DB migrace a prompt seed — git worktree vyřeší jen checkout, ne sdílenou produkci; navíc oba běhy čerpají stejný usage limit. Víc témat najednou = jedna vize s více oblastmi (lazy slicing si je rozřeže). Souběh je v pořádku napříč různými projekty, nebo až bude staging per branch.
