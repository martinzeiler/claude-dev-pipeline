export const meta = {
  name: 'blok-stavby',
  description: 'dev-pipeline blok stavby jednoho řezu: implementace, thermo a code-review souběžně s opravami po balíčcích (max 2 kola), brána testů (jediná plná suita), deploy, E2E, uzavření. Až 3 pokusy, po 2. neúspěchu diagnóza.',
  whenToUse: 'Spouští orchestrátor /dev-pipeline:orchestrate po schválení PRD řezu. args: {cwd, plugin_root, vize, rez, prd_path, e2e_path, hypotezy, runtime_dopad, runbook, deploy_mode, app_pristup}. Bez args nic nedělá.',
  phases: [
    { title: 'Implementace', detail: 'TDD podle PRD' },
    { title: 'Review', detail: 'thermo a code-review souběžně, opravy po balíčcích (thermo nálezy v téže vlně), nejvýš 2 kola' },
    { title: 'Brána', detail: 'typecheck a plná suita jednou, jedna oprava; zelená zapíše marker docs/.verify-passed' },
    { title: 'Deploy', detail: 'commit a nasazení podle projektu' },
    { title: 'E2E', detail: 'akceptační kritéria proti běžící aplikaci' },
    { title: 'Diagnóza', detail: 'po 2. neúspěchu: reprodukce a příčina' },
    { title: 'Uzavření', detail: 'PRD status, journal, follow-ups' },
  ],
}

// ---------- vstup ----------
let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch { a = null } }
if (!a || typeof a !== 'object' || !a.cwd || !a.rez || !a.prd_path || !a.vize) {
  log('blok-stavby: chybí args (cwd, vize, rez, prd_path) – nic se nespustilo')
  return { ok: false, duvod: 'chybí args: cwd, vize, rez, prd_path' }
}
const S = v => String(v == null ? '' : v)
const NN = String(a.rez).padStart(2, '0')
const cwd = S(a.cwd)
const kontrakt = a.plugin_root ? `${a.plugin_root}/skills/orchestrate/KONTRAKT.md` : null
const prdPath = S(a.prd_path), e2ePath = S(a.e2e_path || `${cwd}/docs/e2e/rez-${NN}.md`)
const runtimeDopad = a.runtime_dopad !== false
const deployMode = a.deploy_mode === 'commit-only' ? 'commit-only' : 'config'
const runbook = a.runbook ? S(a.runbook) : null
const appPristup = a.app_pristup ? S(a.app_pristup) : null
const hyp = a.hypotezy && a.hypotezy.report ? a.hypotezy : null
const MAX_POKUSU = 3
const rep = (typ, kolo) => `${cwd}/docs/reviews/rez-${NN}-${typ}-kolo-${kolo}.md`

// ---------- pomocné ----------
const cekej = ms => (ms > 0 && typeof setTimeout === 'function') ? new Promise(r => setTimeout(r, ms)) : Promise.resolve()
async function run(prompt, opts) {
  const label = opts.label || 'agent'
  for (let i = 0; i <= 2; i++) {
    let r = null
    try { r = await agent(prompt, opts) } catch (e) { log(`${label}: spuštění selhalo (${String(e && e.message || e).slice(0, 120)})`) }
    if (r) return r
    if (i < 2) { log(`${label}: agent nevrátil výsledek, opakuji (${i + 1}/2)`); await cekej(15000 * (i + 1)) }
  }
  return null
}
const ramec = [
  `Projekt: ${cwd} (absolutní cesty; commity jen na vize větvi, nikdy na main).`,
  `Řez ${NN}: PRD ${prdPath} · E2E ${e2ePath} · vize ${a.vize}${kontrakt ? ` · kontrakt: ${kontrakt}` : ''}.`,
  'Běh je autonomní: uživatele se neptáš. Rozpor s vizí zapiš do docs/vize-spory.md, rozhodni konzervativně a pokračuj. Vykonáváš jen svou fázi; následné a kontrolní fáze spouští workflow.',
  'Tvůj finální výstup je strukturovaný návrat (schéma je vynucené). Do textových polí piš stručně; co se nevejde, napiš do souboru v docs/reviews/ a vrať cestu.',
].join('\n')
const M = { opusH: { model: 'opus', effort: 'high' }, opusM: { model: 'opus', effort: 'medium' }, sonL: { model: 'sonnet', effort: 'low' }, sonM: { model: 'sonnet', effort: 'medium' } }

// ---------- schémata ----------
const str = d => ({ type: 'string', description: d })
const arr = d => ({ type: 'array', items: { type: 'string' }, description: d })
const IMPL = { type: 'object', required: ['stav', 'souhrn', 'typecheck', 'testy_zelene'], properties: {
  stav: { type: 'string', enum: ['hotovo', 'castecne', 'selhalo'] },
  souhrn: str('max 10 řádků: co je postavené, čím je to ověřené'),
  oblasti: arr('změněné oblasti nebo moduly (ne výčet souborů)'),
  typecheck: { type: 'boolean' }, testy_zelene: { type: 'boolean' }, novych_testu: { type: 'integer' },
  odchylky_od_prd: arr('vědomé odchylky od PRD a proč'),
  pasti_opravene: arr('pasti v kódu, které jsi místo dokumentování opravil'),
  follow_ups: arr('resty mimo rozsah řezu, každý jednou větou s kontextem'),
  spory: arr('nové záznamy ve vize-spory'),
  souhrn_path: str('cesta k delšímu souhrnu v docs/reviews/, když byl potřeba'),
} }
const THERMO = { type: 'object', required: ['blokeru', 'nalezu', 'report_path', 'soubory'], properties: { blokeru: { type: 'integer', description: 'nálezy, které rubrika označuje za blokující' }, nalezu: { type: 'integer' }, report_path: str('absolutní cesta k reportu'), soubory: arr('soubory s nálezy BLOCKER a HIGH, cesty relativní ke kořeni projektu'), souhrn: str('max 3 řádky') } }
const FIX = { type: 'object', required: ['opraveno', 'zmenena_mista', 'typecheck', 'testy_zelene'], properties: {
  opraveno: { type: 'integer' },
  odmitnuto: { type: 'array', items: { type: 'object', required: ['id', 'duvod'], properties: { id: { type: 'string' }, duvod: { type: 'string' } } } },
  zmenena_mista: arr('soubor a symbol nebo oblast, kde jsi měnil'),
  rozsireny_zasah: { type: 'boolean', description: 'nový plošný mechanismus, sdílený layout či helper, nebo soubory mimo nálezy' },
  rozsireny_popis: str('co přesně a proč'),
  typecheck: { type: 'boolean' }, testy_zelene: { type: 'boolean' },
  follow_ups: arr('nálezy mimo rozsah řezu, které jsi neopravil'),
  commit: str('hash, jen když jsi měl za úkol samostatný commit'),
} }
const REVIEW = { type: 'object', required: ['nalezu', 'blokujicich', 'balicky', 'report_path'], properties: {
  nalezu: { type: 'integer' }, blokujicich: { type: 'integer' }, report_path: str('absolutní cesta k reportu'),
  balicky: { type: 'array', items: { type: 'object', required: ['soubory', 'nalezy'], properties: { soubory: arr('disjunktní množina souborů'), nalezy: arr('identifikátory nálezů z reportu'), security: { type: 'boolean' } } } },
  follow_up_ids: arr('nálezy, které nejsou k opravě v řezu (FOLLOW-UP)'),
} }
const VERIFY = { type: 'object', required: ['typecheck', 'proslo', 'selhalo'], properties: { typecheck: { type: 'boolean' }, proslo: { type: 'integer' }, selhalo: { type: 'integer' }, selhavajici: arr('jména selhávajících testů a chyby typecheck s file:line, max 20'), vystup_path: str('soubor s plným výstupem'), prikazy: arr('spuštěné příkazy'), marker: str('hash stromu z verify-marker.sh při zelené bráně, jinak prázdné') } }
const DEPLOY = { type: 'object', required: ['stav', 'commit'], properties: { stav: { type: 'string', enum: ['success', 'failed', 'commit-only'] }, commit: str('hash commitu řezu'), health: str('doklad, že běží: status platformy + behaviorální doklad'), url: str(''), duvod: str('při failed: přesná chyba') } }
const E2E = { type: 'object', required: ['vysledek', 'celkem', 'pass', 'castecne', 'fail', 'report_path'], properties: {
  vysledek: { type: 'string', enum: ['pass', 'pass-castecne', 'fail'] }, celkem: { type: 'integer' }, pass: { type: 'integer' }, castecne: { type: 'integer' }, fail: { type: 'integer' },
  fail_kriteria: arr('identifikátory a jednou větou co selhalo'), castecna_kriteria: arr('co se ověřilo jen zčásti a čím je nesena druhá půlka'),
  zavazne_mimo_ak: arr('bezpečnostní a datové nálezy mimo kritéria'), kosmeticke: arr('kosmetické regresní postřehy'), report_path: str('absolutní cesta k reportu'),
} }
const DIAG = { type: 'object', required: ['pricina', 'doporuceni', 'smycka_postavena'], properties: { pricina: str('file:line + mechanismus'), doporuceni: str('co má třetí pokus udělat jinak'), smycka_postavena: { type: 'boolean' }, repro_path: str('cesta k reprodukčním artefaktům') } }
const CLOSE = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, poznamka: str('co se nepodařilo zapsat') } }

// ---------- kroky ----------
const impl = (n, predchozi, diag) => run(`${ramec}

Úkol: implementuj řez ${NN} podle PRD (TDD červená až zelená, doktrína CLAUDE.md projektu, Serena na hledání symbolů). Pokus ${n} z ${MAX_POKUSU}.
${hyp ? `Zbylé nálezy prd-checku jako hypotézy k ověření, ne fakta: ${hyp.report} (${(hyp.ids || []).join(', ') || 'všechny'}).\n` : ''}${predchozi ? `Předchozí pokus selhal ve fázi „${predchozi.faze}“: ${S(predchozi.detail).slice(0, 600)}. Pracovní strom obsahuje jeho stav; navaž na něj, nezačínej od nuly a nepoužívej git příkazy, které strom vracejí.\n` : ''}${diag ? `Diagnóza po dvou neúspěších (doložená příčina): ${S(diag.pricina).slice(0, 500)} · doporučení: ${S(diag.doporuceni).slice(0, 400)}\n` : ''}Past v kódu, na kterou narazíš ve změněných souborech, oprav; mimo ně ji vrať jako follow-up „odstranit past X“. Testy piš k chování, ne k řezu; nepřidávej testovací soubory pojmenované po řezu. Průběžně spouštěj jen dotčené testy; plnou suitu a typecheck celého projektu jednou, na konci.${runbook ? ` Když postup nasazení (${runbook}) vyžaduje zvednutí build verze nebo markeru, udělej to teď jako součást řezu; při commitu se už nic nezvedá.` : ''} Nespouštěj review, deploy ani E2E.`,
  { label: `implement:řez ${NN}:${n}`, phase: 'Implementace', agentType: 'dev-pipeline:implement', schema: IMPL, ...M.opusH })

const thermo = () => run(`${ramec}

Úkol: thermo-nuclear review změn řezu ${NN} v pracovním stromě (diff si posbírej sám včetně netrackovaných souborů). Report do ${rep('thermo', 1)}. Vrať počty, cestu a soubory s nálezy BLOCKER a HIGH (relativně ke kořeni projektu). Souběžně běží code-review téhož stromu; kód se nemění.`,
  { label: `thermo:řez ${NN}`, phase: 'Review', agentType: 'dev-pipeline:thermo-nuclear-review', schema: THERMO, ...M.opusM })

const fixThermo = th => run(`${ramec}

Úkol: oprav strukturální nálezy thermo review řezu ${NN}: ${th.report_path}. Meze: jen soubory tohoto řezu (pracovní strom), jen nálezy, které rubrika označuje za blokující nebo které máš po ověření za jisté; sporné a cizí nech jako follow-up. Nezaváděj nové plošné mechanismy. Spouštěj jen dotčené testy a typecheck; plnou suitu nespouštěj, patří bráně. Necommituj.`,
  { label: `fix-thermo:řez ${NN}`, phase: 'Review', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const review = (kolo, rozsah) => run(`${ramec}

Úkol: code-review řezu ${NN}, kolo ${kolo}. ${kolo === 1 ? 'Rozsah: pracovní strom (celá změna řezu včetně netrackovaných souborů).' : `Rozsah: VÝHRADNĚ opravná várka: ${rozsah.join(' | ')}. Co prošlo kolem 1, znovu nekontroluj.`} Report do ${rep('code-review', kolo)}. Vrať počty, disjunktní balíčky po souborech s identifikátory nálezů a cestu; nálezy samotné nevracej. Každý nález v reportu nese BLOKUJE NASAZENÍ nebo FOLLOW-UP.`,
  { label: `review:řez ${NN}:${kolo}`, phase: 'Review', agentType: 'dev-pipeline:code-review', schema: REVIEW, ...M.opusH })

const fixBalicek = (r, b, i, kolo, th) => run(`${ramec}

Úkol: oprav nálezy řezu ${NN} (kolo ${kolo}).${b.nalezy.length ? ` Code-review report ${r.report_path}, tvoje nálezy: ${b.nalezy.join(', ')}.` : ''}${b.thermo && th ? ` Thermo report ${th.report_path}: nálezy BLOCKER a HIGH ve tvých souborech (NOTE jen když leží na místě, které stejně měníš); nezaváděj nové plošné mechanismy, sporné nech jako follow-up.` : ''} Sahej jen do souborů: ${b.soubory.join(', ')}; jiné soubory mohou souběžně opravovat jiní agenti. Root brána může být červená na cizích souborech, ověř svůj balíček. Spouštěj jen dotčené testy a typecheck; plnou suitu nespouštěj, patří bráně a souběžné agenty by vyhladověla. ${b.security ? 'Jde o bezpečnostní balíček: po opravě udělej samostatný commit fix(security): … a vrať hash.' : 'Necommituj.'} Každý nález je hypotéza: ověř proti kódu; co míří vedle, oprav skutečnou příčinu a rozdíl uveď. Nahlas rozšířený zásah, když překročí nálezy.`,
  { label: `fix:řez ${NN}:${kolo}.${i + 1}`, phase: 'Review', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const verify = k => run(`${ramec}

Úkol: brána řezu ${NN}, běh ${k}: spusť typecheck a testy projektu podle CLAUDE.md${runbook ? ` nebo runbooku ${runbook}` : ''}, plný výstup ulož do ${rep('verify', k)} a vrať skutečné výsledky (počty, jména selhávajících testů, chyby s file:line). Nic neopravuj a neinterpretuj.${a.plugin_root ? ` Když je typecheck i testy zelené, spusť \`bash ${a.plugin_root}/scripts/verify-marker.sh ${cwd} ${rep('verify', k)}\` a jeho výstup (hash stromu) vrať v poli marker; při červené bráně marker nezapisuj.` : ''}`,
  { label: `verify:řez ${NN}:${k}`, phase: 'Brána', agentType: 'dev-pipeline:verify', schema: VERIFY, ...M.sonL })

const fixBrana = v => run(`${ramec}

Úkol: brána řezu ${NN} je červená. Selhává: ${(v.selhavajici || []).slice(0, 20).join(' | ') || 'viz výstup'}${v.vystup_path ? ` · plný výstup: ${v.vystup_path}` : ''}. Oprav příčinu (ne test, pokud test není špatně); po opravě spusť dotčené testy a typecheck, plnou suitu pustí znovu brána. Necommituj.`,
  { label: `fix-brana:řez ${NN}`, phase: 'Brána', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const deploy = (k, pozn) => run(`${ramec}

Úkol: commit a nasazení řezu ${NN} (běh ${k}). Jeden commit na vize větvi včetně docs řezu: „rez ${NN}: <shrnutí z PRD>“${pozn ? ` (${pozn})` : ''}. Build verzi ani marker samostatným commitem nezvedáš (patří do řezu před bránou); když chybí a postup ji vyžaduje, zvedni ji a commitni spolu s obsahem. ${deployMode === 'commit-only' || !runtimeDopad ? 'Projekt nasazuje uživatel nebo řez nemá runtime dopad: skonči commitem, stav commit-only.' : `Deploy podle deploy konfigurace projektu${runbook ? ` (runbook: ${runbook})` : ' (sekce Deploy v CLAUDE.md projektu nebo docs/deploy.md)'}: marker docs/.deploy-unlocked vytvoř samostatným příkazem před deployem, počkej na doložený stav platformy (SUCCESS/FAILED) a vrať dva nezávislé doklady, že běží.`} Nikdy si nedomýšlej postup, který projekt nedokumentuje.`,
  { label: `deploy:řez ${NN}:${k}`, phase: 'Deploy', agentType: 'dev-pipeline:deploy', schema: DEPLOY, ...M.sonL })

const e2e = k => runtimeDopad
  ? run(`${ramec}

Úkol: E2E verifikace řezu ${NN}, kolo ${k}: projdi scénáře z ${e2ePath} proti běžící aplikaci${appPristup ? ` (přístup: ${appPristup})` : ' (přístup podle CLAUDE.md projektu)'}, verdikt per kritérium PASS / PASS-částečně / FAIL s důkazy do reportu ${rep('e2e', k)}. Vrať jen počty, FAIL a částečná kritéria, závažné nálezy mimo kritéria (bezpečnost, data) zvlášť od kosmetických. Testovací data s prefixem [E2E], po sobě ukliď.`,
    { label: `e2e:řez ${NN}:${k}`, phase: 'E2E', agentType: 'dev-pipeline:e2e-verifier', schema: E2E, ...M.opusM })
  : run(`${ramec}

Úkol: řez ${NN} nemá runtime dopad. Projdi akceptační kritéria z PRD bod po bodu a každé dolož konkrétním důkazem (výstup příkazu, existence a obsah souboru, spuštěný test), verdikt per kritérium do ${rep('e2e', k)}. Dočasné artefakty po sobě ukliď, pracovní strom nech čistý. Vrať jen počty a FAIL kritéria.`,
    { label: `kriteria:řez ${NN}:${k}`, phase: 'E2E', agentType: 'general-purpose', schema: E2E, ...M.opusM })

const fixE2E = (e, k) => run(`${ramec}

Úkol: E2E řezu ${NN} selhalo (kolo ${k}): report ${e.report_path}, FAIL kritéria: ${(e.fail_kriteria || []).join(' | ')}. Každý nález je hypotéza: reprodukuj, oprav příčinu, testy a typecheck zelené. Necommituj, commit a deploy dělá další krok.`,
  { label: `fix-e2e:řez ${NN}:${k}`, phase: 'E2E', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const fixSecurity = e => run(`${ramec}

Úkol: E2E řezu ${NN} našlo závažné nálezy mimo kritéria (bezpečnost/data): ${(e.zavazne_mimo_ak || []).join(' | ')} · report ${e.report_path}. Oprav okamžitě, i když jsou mimo rozsah řezu, samostatným commitem fix(security): … a vrať hash. Bez jasného fixu nález nech jako follow-up s důvodem.`,
  { label: `fix-security:řez ${NN}`, phase: 'E2E', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const diagnose = last => run(`${ramec}

Úkol: řez ${NN} dvakrát funkčně selhal, naposledy ve fázi „${last.faze}“: ${S(last.detail).slice(0, 800)}. Postav těsnou reprodukční smyčku a najdi doloženou příčinu; nic neopravuj, pracovní strom vrať do stavu, v jakém jsi ho našel. Vrať příčinu (file:line + mechanismus) a doporučení pro třetí pokus.`,
  { label: `diagnose:řez ${NN}`, phase: 'Diagnóza', agentType: 'dev-pipeline:diagnose', schema: DIAG, ...M.opusH })

const close = souhrn => run(`${ramec}

Úkol: uzavření řezu ${NN}. (1) PRD frontmatter: status: done, commit: ${souhrn.commit}. (2) Srovnej PRD a E2E scénáře s tím, co se skutečně postavilo; odchylky: ${JSON.stringify(souhrn.odchylky).slice(0, 1200)}. Dokument nesmí tvrdit něco jiného než kód; uprav dotčené věty. (3) Připoj do docs/journal.md heredocem záznam: datum, řez, co je hotové, odchylky, pokusy ${souhrn.pokusy}, E2E ${souhrn.e2e}, review ${souhrn.review}. (4) Připoj do docs/follow-ups.md tyto položky (jedna odrážka = jedna, s kontextem): ${JSON.stringify(souhrn.follow_ups).slice(0, 2500)}. (5) Smaž docs/.deploy-unlocked, když existuje. (6) Pusť formátovač projektu na dotčené docs/*.md, když ho projekt má. Necommituj (commituje další řez), do kódu nesahej.`,
  { label: `uzavření:řez ${NN}`, phase: 'Uzavření', agentType: 'general-purpose', schema: CLOSE, ...M.sonM })

// ---------- jeden pokus ----------
async function pokus(n, predchozi, diag) {
  const followUps = [], odchylky = [], spory = [], pasti = [], reports = []
  const fail = (faze, detail) => ({ vysledek: 'selhalo', faze, detail: S(detail).slice(0, 1500), follow_ups: followUps, odchylky, spory, pasti_opravene: pasti, reports })
  const sber = r => { if (!r) return; followUps.push(...(r.follow_ups || [])); odchylky.push(...(r.odchylky_od_prd || [])); spory.push(...(r.spory || [])); pasti.push(...(r.pasti_opravene || [])) }

  phase('Implementace')
  const im = await impl(n, predchozi, diag)
  if (!im) return fail('implementace', 'implementační agent nevrátil výsledek')
  sber(im); if (im.souhrn_path) reports.push(im.souhrn_path)
  log(`implementace (pokus ${n}): ${im.stav}, typecheck ${im.typecheck ? 'ok' : 'červený'}, testy ${im.testy_zelene ? 'zelené' : 'červené'}`)
  if (im.stav === 'selhalo') return fail('implementace', im.souhrn)

  phase('Review')
  const norm = f => S(f).replace(`${cwd}/`, '')
  const [th, r1] = await parallel([() => thermo(), () => review(1)])
  let kola = 0, nalezu = 0, blokujicich = 0, fixAgentu = 0, securityCommits = [], thermoFix = null
  let thermoZbyva = !!(th && th.nalezu > 0)
  if (th) { reports.push(th.report_path); log(`thermo: ${th.nalezu} nálezů, ${th.blokeru} blokujících`) }
  if (r1) {
    kola = 1; nalezu = r1.nalezu; blokujicich = r1.blokujicich; reports.push(r1.report_path)
    const balicky = (r1.balicky || []).map(b => ({ ...b, soubory: (b.soubory || []).map(norm), nalezy: b.nalezy || [], thermo: false }))
    const thermoSoubory = thermoZbyva ? [...new Set((th.soubory || []).map(norm).filter(Boolean))] : []
    if (thermoSoubory.length) {
      const zbytek = []
      for (const f of thermoSoubory) { const b = balicky.find(x => x.soubory.includes(f)); if (b) b.thermo = true; else zbytek.push(f) }
      if (zbytek.length) balicky.push({ soubory: zbytek, nalezy: [], security: false, thermo: true })
      thermoZbyva = false
    }
    log(`review 1: ${r1.nalezu} nálezů, ${r1.blokujicich} blokujících, ${balicky.length} balíčků${balicky.some(b => b.thermo) ? ' (thermo v téže vlně)' : ''}`)
    const opravy = (await parallel(balicky.map((b, i) => () => fixBalicek(r1, b, i, 1, th)))).filter(Boolean)
    fixAgentu += opravy.length; opravy.forEach(sber); opravy.forEach(f => { if (f.commit) securityCommits.push(f.commit) })
    const rozsireni = opravy.filter(f => f.rozsireny_zasah)
    const varka = [...new Set(opravy.flatMap(f => f.zmenena_mista || []))]
    if (opravy.length && (rozsireni.length || r1.blokujicich > 0 || (th && th.blokeru > 0))) {
      const r2 = await review(2, varka.length ? varka : ['celá opravná várka'])
      if (r2) {
        kola = 2; nalezu += r2.nalezu; blokujicich = r2.blokujicich; reports.push(r2.report_path)
        log(`review 2 (opravná várka): ${r2.nalezu} nálezů, ${r2.blokujicich} blokujících`)
        if (r2.blokujicich > 0 && r2.balicky.length) {
          const vsechny = { soubory: [...new Set(r2.balicky.flatMap(b => b.soubory))], nalezy: r2.balicky.flatMap(b => b.nalezy), security: r2.balicky.some(b => b.security), thermo: false }
          const f2 = await fixBalicek(r2, vsechny, 0, 2, th); fixAgentu += f2 ? 1 : 0; sber(f2); if (f2 && f2.commit) securityCommits.push(f2.commit)
          log('review: třetí kolo se nekoná, zbylé nálezy jdou do follow-ups')
        }
      }
    }
  } else log('review nevrátilo výsledek, pokračuji bránou')
  if (thermoZbyva) {
    thermoFix = await fixThermo(th); sber(thermoFix); fixAgentu += thermoFix ? 1 : 0
    if (thermoFix) log(`thermo oprava samostatně: ${thermoFix.opraveno} opraveno, ${(thermoFix.odmitnuto || []).length} odmítnuto`)
  }

  phase('Brána')
  let v = await verify(1)
  if (!v) return fail('brána', 'verify agent nevrátil výsledek')
  if (!(v.typecheck && v.selhalo === 0)) {
    log(`brána červená: typecheck ${v.typecheck ? 'ok' : 'chyby'}, ${v.selhalo} testů selhalo; jedna oprava`)
    const fb = await fixBrana(v); sber(fb); fixAgentu += fb ? 1 : 0
    v = await verify(2)
    if (!v || !(v.typecheck && v.selhalo === 0)) return fail('brána', v ? `typecheck ${v.typecheck}, selhalo ${v.selhalo}: ${(v.selhavajici || []).slice(0, 10).join(' | ')}` : 'verify bez výsledku')
  }
  log(`brána zelená: ${v.proslo} testů`)

  phase('Deploy')
  let d = await deploy(1)
  if (!d) return fail('deploy', 'deploy agent nevrátil výsledek')
  if (d.stav === 'failed') return fail('deploy', d.duvod)
  log(`deploy: ${d.stav}, commit ${d.commit}`)

  phase('E2E')
  let e = await e2e(1)
  if (!e) return fail('e2e', 'verifikátor nevrátil výsledek')
  reports.push(e.report_path)
  log(`E2E 1: ${e.vysledek} (${e.pass}/${e.celkem}, částečně ${e.castecne}, fail ${e.fail})`)
  if (e.vysledek === 'fail') {
    const fe = await fixE2E(e, 1); sber(fe); fixAgentu += fe ? 1 : 0
    const d2 = await deploy(2, 'oprava po E2E'); if (!d2 || d2.stav === 'failed') return fail('deploy', d2 ? d2.duvod : 'deploy bez výsledku')
    d = d2
    e = await e2e(2)
    if (!e) return fail('e2e', 'verifikátor nevrátil výsledek v kole 2')
    reports.push(e.report_path)
    log(`E2E 2: ${e.vysledek} (${e.pass}/${e.celkem}, fail ${e.fail})`)
    if (e.vysledek === 'fail') return fail('e2e', `FAIL kritéria po opravě: ${(e.fail_kriteria || []).join(' | ')}`)
  }
  followUps.push(...(e.kosmeticke || []).map(k => `[E2E kosmetika řez ${NN}] ${k}`))
  if ((e.zavazne_mimo_ak || []).length) {
    log(`E2E: ${e.zavazne_mimo_ak.length} závažných nálezů mimo kritéria, oprava samostatným commitem`)
    const fs = await fixSecurity(e); sber(fs); fixAgentu += fs ? 1 : 0; if (fs && fs.commit) securityCommits.push(fs.commit)
    const d3 = await deploy(3, 'bezpečnostní oprava'); if (d3 && d3.stav !== 'failed') d = d3; else log('deploy bezpečnostní opravy selhal, zůstává v pracovním stromě jako follow-up')
  }

  phase('Uzavření')
  const e2eText = `${e.vysledek} ${e.pass}/${e.celkem}${e.castecne ? ` (částečně ${e.castecne})` : ''}`
  const reviewText = `${kola} kol, ${nalezu} nálezů, ${fixAgentu} fix agentů`
  const c = await close({ commit: d.commit, odchylky, pokusy: n, e2e: e2eText, review: reviewText, follow_ups: followUps })
  return {
    vysledek: 'hotovo', pokusy: n, commit: d.commit, deploy: d.stav, health: S(d.health).slice(0, 300),
    e2e: { vysledek: e.vysledek, celkem: e.celkem, pass: e.pass, castecne: e.castecne, fail: e.fail, castecna_kriteria: e.castecna_kriteria || [] },
    review: { kola, nalezu, blokujicich, fix_agentu: fixAgentu, security_commity: securityCommits },
    thermo: th ? { nalezu: th.nalezu, blokeru: th.blokeru, oprava: th.nalezu === 0 ? 'nic' : (thermoFix ? 'samostatně' : 've vlně review') } : null,
    follow_ups: followUps, odchylky, spory, pasti_opravene: pasti, reports,
    uzavreni: c ? c.ok : false,
  }
}

// ---------- pokusy ----------
let last = null, diag = null
for (let n = 1; n <= MAX_POKUSU; n++) {
  if (n === MAX_POKUSU) { phase('Diagnóza'); diag = await diagnose(last); log(diag ? `diagnóza: ${S(diag.pricina).slice(0, 160)}` : 'diagnóza bez výsledku') }
  const res = await pokus(n, last, diag)
  if (res.vysledek === 'hotovo') { log(`řez ${NN} hotový na pokus ${n}, commit ${res.commit}`); return { ok: true, rez: NN, ...res } }
  log(`pokus ${n} selhal ve fázi ${res.faze}`)
  last = res
}
return { ok: true, rez: NN, vysledek: 'selhalo', pokusy: MAX_POKUSU, faze: last.faze, detail: last.detail, diagnoza: diag ? { pricina: diag.pricina, doporuceni: diag.doporuceni, repro: S(diag.repro_path) } : null, follow_ups: last.follow_ups, spory: last.spory, reports: last.reports }
