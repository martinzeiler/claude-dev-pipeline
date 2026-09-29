export const meta = {
  name: 'blok-kolecko',
  description: 'dev-pipeline závěrečné review kolečko vize jako Workflow: thermo → code-review kolo 1 → kolo 2 fan-outem pěti čoček s triáží → bezpečnost (čočka + security-review) → deploy a E2E kolečka → závěr. Po každé opravné vlně verify a commit; bezpečnostní opravy commitne krok commitu po zelené bráně samostatně. Bez opakování fází; neúspěch vrací fázi, detail a fázi pro obnovu.',
  whenToUse: 'Spouští orchestrátor /dev-pipeline:orchestrate ve finální fázi vize (skill dev-pipeline:review-kolecko), nebo uživatel výslovně nad větší sérií změn. args: {cwd, plugin_root, vize, produkt, base, ne_cile, runbook, deploy_mode, deploy_okno, app_pristup}; obnova po selhání navíc obnova: {od_faze, znacka} spolu s resumeFromRunId. Bez args nic nedělá. Ne na jeden řez.',
  phases: [
    { title: 'Thermo', detail: 'strukturální audit větve, oprava jen BLOCKER/HIGH, brána, commit' },
    { title: 'Code-review 1', detail: 'korektnost celé větve, opravy po balíčcích souběžně, brána, commit' },
    { title: 'Code-review 2', detail: 'pět čoček souběžně nad celým rozsahem, triáž (opravit teď / follow-up / odmítnout), opravy, brána, commit' },
    { title: 'Bezpečnost', detail: 'bezpečnostní čočka s checklistem ∥ security-review, opravy bez commitu, brána, samostatný commit fix(security)' },
    { title: 'Deploy a E2E', detail: 'brána, nasazení, E2E scénáře kolečka a verifikace, jedna oprava' },
    { title: 'Závěr', detail: 'journal, follow-ups, docs/.review-passed, commit docs' },
  ],
}

// ---------- vstup ----------
let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch { a = null } }
if (!a || typeof a !== 'object' || !a.cwd || !a.vize) {
  log('blok-kolecko: chybí args (cwd, vize) – nic se nespustilo')
  return { ok: false, duvod: 'chybí args: cwd, vize' }
}
const S = v => String(v == null ? '' : v)
const cwd = S(a.cwd)
const base = a.base ? S(a.base) : 'main'
// Pravidla běhu (KONTRAKT.md: soubory, frontmatter PRD, vize-spory); v rámci se nejmenují „kontrakt“, jako ve stavbě a v bloku PRD,
// kde by agent dostal dva různé kontrakty (tento soubor a sekci Kontrakt kostry PRD).
const pravidlaBehu = a.plugin_root ? `${a.plugin_root}/skills/orchestrate/KONTRAKT.md` : null
const produkt = a.produkt ? S(a.produkt) : null
const neCile = a.ne_cile ? S(a.ne_cile).slice(0, 1500) : ''
const runbook = a.runbook ? S(a.runbook) : null
const deployMode = a.deploy_mode === 'commit-only' ? 'commit-only' : 'config'
const runtimeDopad = deployMode !== 'commit-only'
const appPristup = a.app_pristup ? S(a.app_pristup) : null
// Zakázané okno nasazení z runbooku projektu (text), deploy čeká s rezervou.
const deployOkno = a.deploy_okno ? S(a.deploy_okno).slice(0, 300) : ''
const e2ePath = `${cwd}/docs/e2e/kolecko.md`
const rep = (...casti) => `${cwd}/docs/reviews/kolecko-${casti.filter(Boolean).join('-')}.md`
const rozsah = `git diff ${base}...HEAD plus pracovní strom (opravy předchozích kol kolečka, včetně netrackovaných souborů)`
// Obnova po zastavení (bod 20): orchestrátor obnovuje blok přes resumeFromRunId a nezměněný prompt se vrátí z cache,
// v běhu bez-dluhu i s červenou bránou (třída B1). Značka od dané fáze změní zadání brány, commitu, deploye a E2E,
// takže se přeměří nad dnešním stromem; review, čočky a opravy se vrátí z cache (jejich práce už je ve stromu).
const FAZE = [['Thermo', 'thermo'], ['Code-review 1', 'kolo 1'], ['Code-review 2', 'kolo 2'], ['Bezpečnost', 'bezpecnost'], ['Deploy a E2E', 'deploy'], ['Závěr', 'zaver']]
const bezDiakritiky = v => S(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
const obnovaOd = a.obnova && typeof a.obnova === 'object' ? FAZE.findIndex(([, k]) => k === bezDiakritiky(a.obnova.od_faze)) : -1
// Neznámá fáze přeměří brány od thermo: brána navíc stojí minuty, červená brána z cache zmaří celou obnovu.
const obnova = a.obnova && typeof a.obnova === 'object' ? { od: Math.max(0, obnovaOd), znacka: S(a.obnova.znacka).trim() || 'bez značky' } : null
// Commit a deploy po obnově mohou najít commit a fix(security) z přerušeného běhu (pád po commitu): bez věty je commitnou podruhé.
const obnovaVeta = (ph, commitu) => obnova && FAZE.findIndex(([t]) => t === ph) >= obnova.od ? `\nObnova běhu (${obnova.znacka}): výsledek této fáze z přerušeného běhu neplatí; změř a proveď ji znovu nad dnešním stavem.${commitu ? ' Commit kolečka nebo fix(security) z přerušeného běhu může už existovat (git log --grep): nový nedělej, vrať jejich hashe; změny pracovního stromu, které v nich nejsou, commitni dalším commitem.' : ''}` : ''
// Fáze selhání → od_faze obnovy (návrat obnova_od): orchestrátor ji nemusí odvozovat.
const OBNOVA_OD = { thermo: 'thermo', 'code-review kolo 1': 'kolo 1', 'code-review kolo 2': 'kolo 2', 'bezpečnost': 'bezpecnost', deploy: 'deploy', 'deploy-infra': 'deploy', e2e: 'deploy' }

// ---------- pomocné ----------
const cekej = ms => (ms > 0 && typeof setTimeout === 'function') ? new Promise(r => setTimeout(r, ms)) : Promise.resolve()
// Opakované zadání nezná stav předchůdce (třída C2): strom může nést jeho rozdělanou práci, nový agent ji dřív přepsal od nuly.
const C2 = 'Předchozí běh tohoto zadání skončil bez výsledku a pracovní strom může nést jeho rozdělanou práci: začni inventurou (git status, git diff --stat) a navaž na ni, nezačínej od nuly.'
async function run(prompt, opts) {
  const label = opts.label || 'agent'
  for (let i = 0; i <= 2; i++) {
    let r = null
    try { r = await agent(i >= 1 ? `${prompt}\n\n${C2}` : prompt, opts) } catch (e) { log(`${label}: spuštění selhalo (${String(e && e.message || e).slice(0, 120)})`) }
    if (r) return r
    if (i < 2) { log(`${label}: agent nevrátil výsledek, opakuji (${i + 1}/2)`); await cekej(15000 * (i + 1)) }
  }
  return null
}
// Štafeta: agent, který práci předal (zpráva PŘEDÁVKA z hooku hlídače kontextu), dostane nástupce se stejným zadáním
// a předávkou. Nástupce vrací návrat za celé zadání včetně práce předchůdce. Nejvýš 3 předávky, čtvrtá je selhání fáze.
// Předávka platí jen jako cesta, kterou jmenuje hook (docs/reviews/predavka-<agent_id>.md), a jen nová: v revizi 1.4.0 vyplnil
// agent pole textem „žádná“ a nástupce zopakoval cestu předchůdce; obojí blok bral jako další předávku a po třetí fázi zahodil.
const MAX_PREDAVEK = 3
const PREDAVKA_CESTA = /\/docs\/reviews\/predavka-[^/\s]+\.md$/
let predavekCelkem = 0
// Labely, jejichž fáze skončila na stropu předávek: důvod selhání je strop, ne „agent nevrátil výsledek“ (to je jiná vada).
const vycerpane = new Set()
const nic = (label, kdo) => vycerpane.has(label) ? `${kdo}: strop předávek vyčerpán (${MAX_PREDAVEK} předávky, ${label})` : `${kdo} nevrátil výsledek`
async function runSePredavkou(prompt, opts) {
  const label = opts.label || 'agent'
  vycerpane.delete(label)
  let r = await run(prompt, opts)
  const predane = []
  for (let n = 1; r && S(r.predavka).trim(); n++) {
    const soubor = S(r.predavka).trim()
    if (!PREDAVKA_CESTA.test(soubor) || predane.includes(soubor)) {
      log(`${label}${n > 1 ? `:n${n}` : ''}: pole predavka „${soubor.slice(0, 160)}“ není nová předávka (${predane.includes(soubor) ? 'cesta předávky předchůdce' : 'není cesta docs/reviews/predavka-….md'}); návrat beru jako konečný`)
      break
    }
    predane.push(soubor)
    predavekCelkem++
    if (n > MAX_PREDAVEK) { vycerpane.add(label); log(`${label}: předávky vyčerpány (${n}. předávka, strop ${MAX_PREDAVEK}); fáze selhala na stropu předávek, ne na chybějícím výsledku (${soubor})`); return null }
    log(`${label}: předávka ${n}/${MAX_PREDAVEK} (${soubor})`)
    r = await run(`${prompt}\n\nNavazuješ na předchůdce, který práci na tomto zadání předal. Nejdřív přečti předávku ${soubor} a pokračuj od ní: hotové neopakuj, co předávka uvádí jako ověřené, znovu neověřuj, stav stromu si potvrď přes git status. Strukturovaný návrat vrať za celé zadání včetně práce předchůdce (počty, seznamy, follow-upy a nálezy z předávky).`,
      { ...opts, label: `${label}:n${n + 1}` })
  }
  return r
}
const ramec = [
  `Projekt: ${cwd} (absolutní cesty; commity jen na vize větvi, nikdy na ${base}).`,
  `Závěrečné kolečko vize ${a.vize}${produkt ? ` · severka ${produkt}` : ''}${pravidlaBehu ? ` · pravidla běhu (soubory, frontmatter PRD, vize-spory): ${pravidlaBehu}` : ''}. Rozsah: ${rozsah}.`,
  neCile ? `Ne-cíle vize platí pro každou fázi včetně oprav: ${neCile}` : '',
  'Běh je autonomní: uživatele se neptáš. Rozpor s vizí zapiš do docs/vize-spory.md, rozhodni konzervativně a pokračuj. Vykonáváš jen svou fázi; následné a kontrolní fáze spouští workflow.',
  'docs/handoff.md je stav orchestrátora, ne tvůj vstup: nečti ho; co máš vědět, je v tomto zadání.',
  'Tvůj finální výstup je strukturovaný návrat (schéma je vynucené). Do textových polí piš stručně; co se nevejde, napiš do souboru v docs/reviews/ a vrať cestu.',
  'Tah končí jen strukturovaným návratem. Na proces, který jsi pustil na pozadí, nečekáš ukončením tahu: počkej na něj v tomtéž tahu (vlastní dlouhý příkaz přes `Monitor`, vnější stav jako nasazení smyčkou s pevným počtem iterací v jednom Bash volání), nebo ho ukonči. Smyčka bez stropu iterací je zakázaná: po timeoutu se přesune na pozadí a přežije tě.',
  // Kolečko nemá číslo řezu, vzor souboru je proto kolecko-<co>.md (jako reporty z rep()).
  'Soubor, který pojmenováváš sám, pojmenuj česky podle vzoru kolecko-<co>.md; Claude Code subagentům blokuje zápis markdownu se jmény summary, findings, analysis a report-….',
].filter(Boolean).join('\n')
const M = { opusH: { model: 'opus', effort: 'high' }, opusM: { model: 'opus', effort: 'medium' }, sonL: { model: 'sonnet', effort: 'low' }, sonM: { model: 'sonnet', effort: 'medium' } }
const cisty = xs => [...new Set((xs || []).map(x => S(x).trim()).filter(Boolean))]
const norm = f => S(f).replace(`${cwd}/`, '')
// Cesty ze „soubor a symbol“ (zmenena_mista): část před dvojtečkou nebo mezerou, jen když vypadá jako cesta (lomítko nebo
// přípona). Commit podle souborů pozná, zda bezpečnostní oprava jde samostatným commitem; v revizi 1.4.0 dostal „soubor: symbol“.
const cestyZ = xs => cisty((xs || []).map(m => norm(S(m).trim()).split(/[\s:,;()]/)[0]).filter(x => /\//.test(x) || /\.[A-Za-z0-9]{1,8}$/.test(x)))

// ---------- schémata ----------
const str = d => ({ type: 'string', description: d })
const arr = d => ({ type: 'array', items: { type: 'string' }, description: d })
const idDuvod = (d, navic) => ({ type: 'array', items: { type: 'object', required: ['id', 'duvod'], properties: { id: { type: 'string' }, duvod: { type: 'string' }, ...navic } }, description: d })
const PREDAVKA = str('vyplň jen, když tě k tomu vyzve zpráva PŘEDÁVKA: absolutní cesta k souboru předávky; jinak nevyplňuj')
const BALICKY = { type: 'array', items: { type: 'object', required: ['soubory', 'nalezy'], properties: { soubory: arr('disjunktní množina souborů'), nalezy: arr('identifikátory nálezů z reportu'), security: { type: 'boolean' } } } }
const THERMO = { type: 'object', required: ['blokeru', 'nalezu', 'report_path', 'soubory'], properties: { blokeru: { type: 'integer', description: 'nálezy, které rubrika označuje za blokující' }, nalezu: { type: 'integer' }, report_path: str('absolutní cesta k reportu'), soubory: arr('soubory s nálezy BLOCKER a HIGH, cesty relativní ke kořeni projektu'), souhrn: str('max 3 řádky'), predavka: PREDAVKA } }
const FIX = { type: 'object', required: ['opraveno', 'zmenena_mista', 'typecheck', 'testy_zelene'], properties: {
  opraveno: { type: 'integer' },
  odmitnuto: idDuvod('nálezy, které jsi po ověření neopravil, s důvodem', { blokuje: { type: 'boolean', description: 'nález byl BLOKUJE' } }),
  jinak_nez_nalez: arr('kde jsi opravil jinou příčinu, než nález tvrdil, a proč'),
  zmenena_mista: arr('soubor a symbol nebo oblast, kde jsi měnil'),
  rozsireny_zasah: { type: 'boolean', description: 'nový plošný mechanismus, sdílený layout či helper, nebo soubory mimo nálezy' },
  rozsireny_popis: str('co přesně a proč'),
  typecheck: { type: 'boolean' }, testy_zelene: { type: 'boolean' },
  follow_ups: arr('nálezy mimo rozsah, které jsi neopravil, jednou větou s kontextem'),
  spory: arr('nové záznamy ve vize-spory'),
  security: { type: 'boolean', description: 'true u bezpečnostní opravy (commitne ji krok commitu po zelené bráně)' },
  predavka: PREDAVKA,
} }
const REVIEW = { type: 'object', required: ['nalezu', 'blokujicich', 'balicky', 'report_path'], properties: {
  nalezu: { type: 'integer' }, blokujicich: { type: 'integer' }, report_path: str('absolutní cesta k reportu; prázdné, když nebyl nález'),
  balicky: BALICKY, follow_up_ids: arr('nálezy FOLLOW-UP'), metodika: str('jen bezpečnostní fáze: security-review | vlastní průchod | obojí'),
  predavka: PREDAVKA,
} }
const TRIAZ = { type: 'object', required: ['nalezu', 'opravit_ted', 'follow_up', 'odmitnuto', 'balicky', 'report_path'], properties: {
  nalezu: { type: 'integer', description: 'nálezů po sloučení duplicit' },
  opravit_ted: { type: 'integer' }, follow_up: { type: 'integer' }, odmitnuto: { type: 'integer' },
  balicky: BALICKY, report_path: str('absolutní cesta ke sloučenému reportu'),
  follow_ups: arr('follow-up položky jednou větou s kontextem (kandidáti na řez)'),
  odmitnute: idDuvod('odmítnuté nálezy s důvodem'),
  sporne: arr('nálezy, o kterých má rozhodnout uživatel, jednou větou s navrženou odpovědí'),
  predavka: PREDAVKA,
} }
// Brána (bod 5): exit kód a kontroly pre-commitu jsou povinné, zelenou rozhoduje zelena(); měřidla kritérií kolečko nemá.
const VERIFY = { type: 'object', required: ['typecheck', 'proslo', 'selhalo', 'exit_kod', 'kontroly_ok'], properties: {
  typecheck: { type: 'boolean' }, proslo: { type: 'integer' }, selhalo: { type: 'integer' },
  exit_kod: { type: 'integer', description: 'návratový kód příkazu testů' },
  z_cache: { type: 'boolean', description: 'true = runner vrátil výsledek testů nebo typechecku z cache, měření neproběhlo' },
  kontroly: arr('kontroly z pre-commit hooku projektu s výsledkem'), kontroly_ok: { type: 'boolean', description: 'všechny kontroly z pre-commit hooku prošly; true, když projekt pre-commit hook nemá' },
  selhavajici: arr('jména selhávajících testů a chyby typecheck s file:line, max 20'), vystup_path: str('soubor s plným výstupem'), prikazy: arr('spuštěné příkazy'), marker: str('hash stromu z verify-marker.sh při zelené bráně, jinak prázdné'),
  predavka: PREDAVKA,
} }
const DEPLOY = { type: 'object', required: ['stav', 'commit'], properties: {
  stav: { type: 'string', enum: ['success', 'failed', 'commit-only'] },
  commit: str('40 znaků: git rev-parse HEAD hned po vytvoření commitu (při stromu beze změn hash HEAD); nikdy dopočítaný ani zkrácený'),
  infra: { type: 'boolean', description: 'true = selhání mimo kód: přihlášení nebo účet CLI, oprávnění, výpadek platformy; opakování bez zásahu člověka nepomůže' },
  security_commity: arr('hashe samostatných commitů fix(security) z git rev-parse, nikdy dopočítané'),
  health: str('doklad, že běží: status platformy + behaviorální doklad'), url: str(''), duvod: str('při failed: přesná chyba; při commit-only beze změn: „beze změn“'),
  predavka: PREDAVKA,
} }
const SESTAV = { type: 'object', required: ['e2e_path', 'kriterii'], properties: { e2e_path: str('absolutní cesta k docs/e2e/kolecko.md'), kriterii: { type: 'integer' }, plochy: arr('plochy a toky, které scénáře pokrývají'), poznamka: str('co se nedalo pokrýt a proč'), predavka: PREDAVKA } }
const E2E = { type: 'object', required: ['vysledek', 'celkem', 'pass', 'castecne', 'fail', 'report_path'], properties: {
  vysledek: { type: 'string', enum: ['pass', 'pass-castecne', 'fail', 'vada-kriteria'] }, celkem: { type: 'integer' }, pass: { type: 'integer' }, castecne: { type: 'integer' }, fail: { type: 'integer' },
  fail_kriteria: arr('identifikátory a jednou větou co selhalo'), castecna_kriteria: arr('co se ověřilo jen zčásti a čím je nesena druhá půlka'),
  vadna_kriteria: arr('kritéria, která nejde poctivě vyhodnotit, s dokladem druhu: nesplnitelné v prostředí E2E / koliduje s jiným kritériem nebo Ne-cílem vize / nález je předřezový a mimo rozsah; do fail se nepočítají'),
  zavazne_mimo_ak: arr('bezpečnostní a datové nálezy mimo kritéria'), kosmeticke: arr('kosmetické regresní postřehy'), report_path: str('absolutní cesta k reportu'),
  predavka: PREDAVKA,
} }
const CLOSE = { type: 'object', required: ['ok', 'review_passed'], properties: {
  ok: { type: 'boolean' }, review_passed: { type: 'boolean', description: 'docs/.review-passed existuje' }, poznamka: str('co se nepodařilo zapsat'),
  chybejici_commity: arr('bezpečnostní commity ze zadání, u kterých git cat-file -t nevrátil commit'),
  predavka: PREDAVKA,
} }

// ---------- stav ----------
const st = {
  thermo: null, review: { kolo1: null, kolo2: null }, security: { nalezu: 0, blokujicich: 0, commity: [] }, verify: null, deploy: null, e2e: null,
  commity: [], rozhodnuti: [], follow_ups: [], spory: [], odmitnute: [], jinak: [], chybejici: [], reports: [], review_passed: false,
}
// Odmítnutý nález BLOKUJE nese značku, ať ho journal odliší od pohodlného odmítnutí drobnosti (třída H).
const sber = r => { if (!r) return; st.follow_ups.push(...(r.follow_ups || [])); st.spory.push(...(r.spory || [])); st.odmitnute.push(...(r.odmitnuto || []).map(o => `${S(o.id)}${o.blokuje ? ' [BLOKUJE]' : ''}: ${S(o.duvod)}`)); st.jinak.push(...(r.jinak_nez_nalez || [])) }
// Commit krok i deploy vracejí hlavní commit a samostatné bezpečnostní commity (bod 19: fix agenti už necommitují).
const sberCommit = c => { if (!c) return; if (c.commit && c.duvod !== 'beze změn') st.commity.push(c.commit); st.security.commity.push(...(c.security_commity || [])) }
// Commit nebo deploy, který skončil failed, mohl před pádem vytvořit fix(security) commity: hashe jdou do návratu i z neúspěšného
// kroku, jinak je obnova commitne podruhé (revize 1.4.0). Hlavní commit ne: u failed je to jen HEAD, ne commit kolečka.
const sberSecurity = c => { if (c) st.security.commity.push(...cisty(c.security_commity)) }
const zmenilo = f => !!f && (f.opraveno > 0 || (f.zmenena_mista || []).length > 0)
const navrat = (vysledek, faze, detail) => ({
  ok: true, vysledek, faze: faze || '', detail: S(detail).slice(0, 1500),
  ...(vysledek === 'selhalo' ? { obnova_od: OBNOVA_OD[faze] || 'thermo' } : {}),
  ...(faze === 'deploy-infra' ? { infra: true } : {}),
  thermo: st.thermo, review: st.review,
  security: { nalezu: st.security.nalezu, blokujicich: st.security.blokujicich, commity: cisty(st.security.commity).filter(h => !st.chybejici.includes(h)) },
  verify: st.verify, deploy: st.deploy, e2e: st.e2e,
  commity: cisty([...st.commity, ...st.security.commity]).filter(h => !st.chybejici.includes(h)), chybejici_commity: cisty(st.chybejici),
  rozhodnuti: cisty(st.rozhodnuti), follow_ups: cisty(st.follow_ups), spory: cisty(st.spory),
  odmitnute: cisty(st.odmitnute), reports: cisty(st.reports), review_passed: st.review_passed, predavky: predavekCelkem,
})
const selhani = (faze, detail) => { log(`kolečko selhalo ve fázi ${faze}: ${S(detail).slice(0, 200)}`); return navrat('selhalo', faze, detail) }
// Selhání deploye mimo kód (přihlášení CLI, oprávnění, výpadek platformy) zastaví běh jako deploy-infra: oprava kódu nepomůže, čeká se na člověka.
const selhaniDeploye = (d, k, pred = '') => { sberSecurity(d); return selhani(d && d.infra ? 'deploy-infra' : 'deploy', `${pred}${d ? S(d.duvod) : nic(`deploy:kolečko:${k}`, 'deploy agent')}`) }

// ---------- kroky ----------
const thermo = () => runSePredavkou(`${ramec}

Úkol: thermo-nuclear review celé větve vize (rozsah větev, base ${base}; diff si posbírej sám). Report do ${rep('thermo')}. Vrať počty, cestu a soubory s nálezy BLOCKER a HIGH (relativně ke kořeni projektu). Žádné plošné přestavby na konci vize: co je velké jako řez, označ NOTE jako kandidáta na příští vizi.`,
  { label: 'thermo:kolečko', phase: 'Thermo', agentType: 'dev-pipeline:thermo-nuclear-review', schema: THERMO, ...M.opusM })

const fixThermo = th => runSePredavkou(`${ramec}

Úkol: oprav strukturální nálezy thermo review kolečka: ${th.report_path}. Meze: jen nálezy BLOCKER a HIGH, jen soubory ${cisty(th.soubory).join(', ') || 'z reportu'}; NOTE a plošné přestavby nech jako follow-up. Nezaváděj nové plošné mechanismy. Spouštěj jen dotčené testy a typecheck; plnou suitu nespouštěj, patří bráně. Každý nález je hypotéza: ověř proti kódu. Necommituj.`,
  { label: 'fix-thermo:kolečko', phase: 'Thermo', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const review1 = () => runSePredavkou(`${ramec}

Úkol: code-review kolečka, kolo 1, rozsah větev (base ${base}), všechny osy. Report do ${rep('code-review', 'kolo-1')}. Vrať počty, disjunktní balíčky po souborech s identifikátory nálezů a cestu; nálezy samotné nevracej. Každý nález v reportu nese BLOKUJE NASAZENÍ nebo FOLLOW-UP a CONFIRMED nebo PLAUSIBLE.`,
  { label: 'review:kolečko:1', phase: 'Code-review 1', agentType: 'dev-pipeline:code-review', schema: REVIEW, ...M.opusH })

const COCKY = [
  ['data-a-izolace', 'izolace mezi tenanty i přes join na rodiče, soft-delete filtry, konzistence migrací, peníze a měny'],
  ['kontrakty-a-volajici', 'změněné signatury a sémantika, JSDoc proti chování, každý volající změněného symbolu dohledaný Serenou'],
  ['regrese-z-historie', 'git log -p a git blame nad změněnými místy, dříve opravené bugy, které změna vrací'],
  ['bezpecnost', 'autorizace nových i dotčených rout, tokeny v logu nebo URL, vstupní hranice, secrets v kódu a konfiguraci'],
  ['testy-a-doktrina', 'pokrývá změna, co tvrdí; obcházení nebo zúžení existujících testů; porušení výslovných pravidel CLAUDE.md'],
]
const reviewCocka = (cocka, popis, r1) => runSePredavkou(`${ramec}

Úkol: code-review kolečka, kolo 2, čočka „${cocka}“ (${popis}). Nad celým rozsahem kontroluj do hloubky jen tuto osu; ostatní osy přeskoč, mají vlastní čočky. Kolo 1 už proběhlo${r1 && r1.report_path ? ` (report ${r1.report_path}: přečti jen identifikátory a místa, ty neopakuj)` : ''}; opravy kola 1 jsou v pracovním stromě a patří do rozsahu. Report do ${rep('code-review', 'kolo-2', cocka)}. Vrať počty, disjunktní balíčky po souborech s identifikátory a cestu; nálezy nevracej.`,
  { label: `review:kolečko:2:${cocka}`, phase: 'Code-review 2', agentType: 'dev-pipeline:code-review', schema: REVIEW, ...M.opusH })

const triaz = cocky => runSePredavkou(`${ramec}

Úkol: triáž nálezů kola 2 code-review kolečka. Reporty čoček: ${cocky.map(c => `${c.cocka} → ${c.report_path || 'bez nálezu'} (${c.nalezu} nálezů, ${c.blokujicich} blokujících)`).join(' | ')}.
Postup: (1) přečti reporty a slouč duplicity (stejné místo a mechanismus = jeden nález s vyšší závažností; identifikátor nového nálezu drž ve tvaru <čočka>/<původní id>). (2) Každý nález roztřiď: „opravit teď“ = dopad na uživatele nebo data v nasazené aplikaci; „follow-up“ = kandidát na řez příští vize (změna datového modelu, širší refaktor, plošný mechanismus); „odmítnuto“ = po ověření proti kódu neplatí nebo je to vědomé rozhodnutí vize, s důvodem. Nález, o kterém nejde rozhodnout bez uživatele (mění mantinel nebo Cíl vize), dej do sporné s navrženou odpovědí a zároveň ho neopravuj. (3) Zapiš sloučený report do ${rep('code-review', 'kolo-2')}: sekce Opravit teď (nálezy s místem, selháním a původní čočkou), Follow-up, Odmítnuto (důvody), Sporné. (4) Vrať počty, disjunktní balíčky po souborech jen pro „opravit teď“ (identifikátory ze sloučeného reportu, security příznak u bezpečnostních), follow-upy jednou větou s kontextem, odmítnuté s důvodem, sporné s návrhem. Kód needituješ, podagenty nespouštíš.`,
  { label: 'triáž:kolečko:2', phase: 'Code-review 2', agentType: 'general-purpose', schema: TRIAZ, ...M.opusH })

const secCocka = () => runSePredavkou(`${ramec}

Úkol: bezpečnostní review kolečka nad celou větví (base ${base}) plus pracovní strom, čočka „bezpecnost“ do hloubky, ostatní osy přeskoč. Checklist navíc: (1) u multi-tenant projektu projdi VŠECHNY dotčené routy, joby a nástroje, ne jen nové: autorizace, izolace organizace i přes join na rodiče, soft-delete; (2) jednořádkový sweep \`rg\` na známé rizikové vzory projektu z CLAUDE.md (přímé dotazy mimo kanonický helper, tokeny v logu nebo URL, secrets v kódu, vstupní hranice bez validace) nad celým repem; (3) pre-existing nález mimo diff platí a označ ho. Report do ${rep('security', 'cocka')}. Vrať počty, disjunktní balíčky po souborech (security: true), cestu; metodika: „vlastní průchod“.`,
  { label: 'security:kolečko:čočka', phase: 'Bezpečnost', agentType: 'dev-pipeline:code-review', schema: REVIEW, ...M.opusH })

const secSkill = () => runSePredavkou(`${ramec}

Úkol: druhá bezpečnostní metodika kolečka nad \`git diff ${base}...HEAD\` plus pracovní strom. Nejdřív zkus invokovat skill \`security-review\` nástrojem Skill; když není k dispozici nebo je odmítnut (disable-model-invocation), udělej ekvivalentní průchod sám: injekce (SQL, příkazy, šablony), autentizace a autorizace, únik dat a PII, nebezpečná deserializace, SSRF, secrets, závislosti. Každý nález ověř proti kódu a napiš scénář selhání; nejistý nález se scénářem nezahazuj, hlas ho jako PLAUSIBLE. Report do ${rep('security', 'review')} ve tvaru „N1 cesta:řádek — [CONFIRMED|PLAUSIBLE] [BLOKUJE|FOLLOW-UP] [security] popis / Selhání: …“; když nic nenajdeš, report nepiš a vrať nula nálezů. Vrať počty, disjunktní balíčky po souborech (security: true), cestu a metodika: „security-review“ nebo „vlastní průchod“. Kód needituješ, podagenty nespouštíš.`,
  { label: 'security:kolečko:security-review', phase: 'Bezpečnost', agentType: 'general-purpose', schema: REVIEW, ...M.opusH })

// Každá opravná vlna kolečka je poslední, po ní už review není (třída B): v neověřené poslední várce deník naměřil nejvyšší chybovost oprav.
const POSLEDNI_VARKA = 'Poslední várka, po ní už review není. Oprav zúžením. Nový mechanismus ani změnu rozhodovací logiky nedělej, nahlas je jako follow-up nebo rozhodnutí. Odložení je plnohodnotný výsledek.'
const fixBalicek = (faze, zdroje, b, i) => runSePredavkou(`${ramec}

Úkol: oprav nálezy kolečka (${faze}). ${zdroje.map(z => `Report ${z.report}: nálezy ${z.ids.join(', ') || 'všechny ve tvých souborech'}`).join(' · ')}. Sahej jen do souborů: ${b.soubory.join(', ')}; jiné soubory mohou souběžně opravovat jiní agenti. Root brána může být červená na cizích souborech, ověř svůj balíček. Spouštěj jen dotčené testy a typecheck; plnou suitu nespouštěj, patří bráně a souběžné agenty by vyhladověla. ${b.security ? 'Jde o bezpečnostní balíček: oprav celý hned, i pre-existing. Necommituj; bezpečnostní opravu commitne krok commitu po zelené bráně samostatně.' : 'Necommituj.'} Každý nález je hypotéza: ověř proti kódu; co míří vedle, oprav skutečnou příčinu a rozdíl uveď v jinak_nez_nalez; co neplatí, odmítni s důvodem. Žádné plošné přestavby na konci vize. Nahlas rozšířený zásah, když překročí nálezy. ${POSLEDNI_VARKA}`,
  { label: `fix:kolečko:${faze}:${i + 1}`, phase: faze === 'thermo' ? 'Thermo' : faze === 'kolo 1' ? 'Code-review 1' : faze === 'kolo 2' ? 'Code-review 2' : 'Bezpečnost', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

// Zelená jen nad doloženým měřením: exit kód testů 0, aspoň jeden prošlý test, nic z cache a kontroly pre-commitu (v běhu bez-dluhu
// pustila brána zelenou nad neproběhlou suitou a commit pak padl na kontrolu pre-commitu, kterou brána nespustila). Měřidla kolečko nemá.
const zelena = v => !!v && v.typecheck === true && v.selhalo === 0 && v.exit_kod === 0 && v.proslo > 0 && v.z_cache !== true && v.kontroly_ok !== false && v.meridla_ok !== false
// Proč je brána červená, stejným výčtem jako zelena(): jde do logu, do opravy brány i do detailu selhání.
const proc = v => [
  v.typecheck !== true && 'typecheck s chybami',
  v.selhalo !== 0 && `selhalo ${S(v.selhalo) || '?'} testů`,
  v.exit_kod !== 0 && `exit kód testů ${S(v.exit_kod) || '?'}`,
  !(v.proslo > 0) && 'žádný prošlý test',
  v.z_cache === true && 'výsledek z cache (spusť s --force)',
  v.kontroly_ok === false && 'kontroly pre-commitu neprošly',
].filter(Boolean).join(', ')
const verify = (faze, k, ph) => { const vystup = rep('verify', faze.replace(/\s+/g, '-'), k); return runSePredavkou(`${ramec}

Úkol: brána kolečka po fázi „${faze}“, běh ${k}: spusť typecheck a testy projektu podle CLAUDE.md${runbook ? ` (nebo runbooku ${runbook})` : ''}, každý příkaz s výstupem přesměrovaným do souboru a návratovým kódem čteným zvlášť (\`cmd > log 2>&1; echo EXIT=$?\`), nikdy přes rouru; plný výstup ulož do ${vystup}. Spusť i kontroly, které spouští pre-commit hook projektu (.husky/pre-commit, .git/hooks/pre-commit nebo lefthook; seznam si přečti z hooku), kromě plné suity, kterou už spouštíš, a vrať je v kontroly. Vrať skutečné výsledky (exit kód, počty, jména selhávajících testů, chyby s file:line). Nic neopravuj a neinterpretuj.${a.plugin_root ? ` Když je brána zelená (typecheck bez chyb, exit kód testů 0, aspoň jeden prošlý a žádný selhaný test, kontroly pre-commitu prošly), spusť \`bash ${a.plugin_root}/scripts/verify-marker.sh ${cwd} ${vystup}\` a jeho výstup (hash stromu) vrať v poli marker; při červené bráně marker nezapisuj.` : ''}${obnovaVeta(ph)}`,
  { label: `verify:kolečko:${faze}:${k}`, phase: ph, agentType: 'dev-pipeline:verify', schema: VERIFY, ...M.sonL }) }

// Oprava brány patří k bráně: při obnově nese značku i ona, jinak by se nad stejným selháním vrátila z cache bez opravy.
const fixBrana = (faze, v, ph) => runSePredavkou(`${ramec}

Úkol: brána kolečka po fázi „${faze}“ je červená (${proc(v)}). Selhává: ${(v.selhavajici || []).slice(0, 20).join(' | ') || 'viz výstup'}${v.kontroly_ok === false ? ` · kontroly pre-commitu: ${(v.kontroly || []).slice(0, 10).join(' | ') || 'viz výstup'}` : ''}${v.vystup_path ? ` · plný výstup: ${v.vystup_path}` : ''}. Oprav příčinu (ne test, pokud test není špatně); když suita neproběhla (žádný prošlý test nebo nenulový exit kód bez selhaného testu), hledej příčinu v jejím spuštění, ne v testech. Po opravě spusť dotčené testy a typecheck, plnou suitu pustí znovu brána. Necommituj.${obnovaVeta(ph)}`,
  { label: `fix-brana:kolečko:${faze}`, phase: ph, agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

// Bod 19 (třída D1): bezpečnostní opravy commitne až krok commitu po zelené bráně, samostatně a před ostatními změnami.
// Fix agent, který commitoval uprostřed souběžné vlny, narazil v bez-dluhu dvakrát na pre-commit nad rozdělanou prací ostatních.
const bezpecnostniOpravy = xs => (xs || []).length ? ` Bezpečnostní opravy: ${xs.map(o => `${o.popis}${o.soubory.length ? ` (${o.soubory.join(', ')})` : ''}`).join(' · ').slice(0, 2000)}. Před commitem ostatních změn je commitni samostatně zprávou fix(security): …, když jejich soubory nenesou jinou změnu (git diff souboru ukáže jen opravu); jinak přidej do zprávy commitu kolečka řádek fix(security): …. Hashe samostatných bezpečnostních commitů vrať v security_commity.` : ''
const commit = (faze, zprava, ph, secOpravy) => runSePredavkou(`${ramec}

Úkol: commit změn kolečka po fázi „${faze}“, režim commit-only.${bezpecnostniOpravy(secOpravy)} Jeden commit na vize větvi se zprávou „${zprava}“ se zbylými změnami kolečka (kód, testy, docs/e2e/kolecko.md, docs/journal.md, docs/follow-ups.md, docs/vize-spory.md). docs/reviews/ a markery jsou gitignorované. Když pracovní strom nemá co commitnout, necommituj a vrať stav commit-only, hash HEAD a duvod „beze změn“. Nenasazuj. Po commitu zkontroluj git status a netrackované soubory kolečka jmenuj v návratu.${obnovaVeta(ph, true)}`,
  { label: `commit:kolečko:${faze}`, phase: ph, agentType: 'dev-pipeline:deploy', schema: DEPLOY, ...M.sonM })

const deploy = (k, pozn, secOpravy) => runSePredavkou(`${ramec}

Úkol: nasazení kolečka (běh ${k}).${bezpecnostniOpravy(secOpravy)} Nejdřív commit zbylých změn na vize větvi, když nějaké jsou: „kolecko: ${pozn}“. ${!runtimeDopad ? 'Projekt nasazuje uživatel: skonči commitem (nebo hashem HEAD při stromu beze změn), stav commit-only.' : `Deploy podle deploy konfigurace projektu${runbook ? ` (runbook: ${runbook})` : ' (sekce Deploy v CLAUDE.md projektu nebo docs/deploy.md)'}: marker docs/.deploy-unlocked vytvoř samostatným příkazem před deployem, čekej omezenou smyčkou s počtem iterací (žádné nekonečné while), na každém terminálním stavu skonči (SUCCESS/FAILED/CRASHED) a vrať dva nezávislé doklady, že běží. ${deployOkno ? `Zakázané okno nasazení: ${deployOkno}; když do něj spadáš, počkej do jeho konce a ještě 10 minut rezervy.` : 'Zakázané okno nasazení z runbooku respektuj s rezervou deseti minut.'}${appPristup ? ` Pokyny majitele k prostředí a nasazení jsou závazné a mají přednost před skripty repa (skript, který nasazuje jinam nebo jinak, než pokyny říkají, nepoužij nebo doplň o správné parametry): ${appPristup.slice(0, 1200)}.` : ''}`} Necháváš na pokoji vše, co jsi sám nezměnil: žádné git checkout --, git restore, git stash ani git clean nad cizími nebo necommitnutými soubory (guard je během běhu blokuje); formátovací kontrolu pouštěj jen nad soubory, které commituješ. Nikdy si nedomýšlej postup, který projekt nedokumentuje.${obnovaVeta('Deploy a E2E', true)}`,
  { label: `deploy:kolečko:${k}`, phase: 'Deploy a E2E', agentType: 'dev-pipeline:deploy', schema: DEPLOY, ...M.sonM })

const sestavE2E = () => runSePredavkou(`${ramec}

Úkol: sestav E2E scénáře kolečka do ${e2ePath}. Zdroje: commity kolečka (\`git log ${base}..HEAD --oneline\`, commity se zprávou „kolecko:“ a „fix(security):“ od začátku kolečka) s jejich \`--stat\`, reporty ${cisty(st.reports).slice(-8).join(', ') || 'kolečka'} (jen sekce opravených nálezů) a tail docs/journal.md. Pravidla kritérií podle ${a.plugin_root ? `${a.plugin_root}/agents/prd.md` : 'agenta prd pluginu dev-pipeline'} (sekce Akceptační kritéria a E2E scénáře): každé kritérium na viditelném chování, záporné kritérium jmenuje šev, u čísel dotaz k přepočtu místo holé hodnoty, žádné výčty jmen souborů ani opsaná čísla, žádné kritérium závislé na commitu. Pokryj: každou opravu kolečka s dopadem na uživatele nebo data (regrese) a smoke průchod ploch, kterých se vize dotkla (z journalu), nejvýš 20 kritérií. Když kolečko nezměnilo kód, napiš jen smoke průchod do 5 kritérií. Nic jiného needituj.`,
  { label: 'e2e-scénáře:kolečko', phase: 'Deploy a E2E', agentType: 'general-purpose', schema: SESTAV, ...M.opusM })

const e2e = (k, failKola1) => runtimeDopad
  ? runSePredavkou(`${ramec}

Úkol: E2E verifikace kolečka, kolo ${k}: projdi scénáře z ${e2ePath} proti běžící aplikaci${appPristup ? ` (přístup: ${appPristup})` : ' (přístup podle CLAUDE.md projektu)'}${failKola1 ? `. Kolo 2 po opravě: přeměř VÝHRADNĚ kritéria, která v kole 1 selhala: ${failKola1.join(' | ')}; u ostatních jen ověř, že se jejich plocha načte bez chyby (smoke), verdikty z kola 1 nepřeměřuj; celkem = počet přeměřených kritérií, smoke selhání vrať ve fail_kriteria s předponou „smoke:“` : ''}, verdikt per kritérium PASS / PASS-částečně / FAIL s důkazy do reportu ${rep('e2e', k)}. Neověřuješ kód: nezakládej worktree, nic neinstaluj, nespouštěj testy ani typecheck. Prohlížeč bez okna (bez --headed), na konci agent-browser close. Nasazení není tvoje fáze: nic nenasazuješ a handoff nečteš; když nasazená revize není commit kolečka (shodu uznej i u pozdějšího commitu, který od něj mění jen docs/) nebo přihlášení nefunguje, vrať to ve fail_kriteria s předponou „prostředí:“ a kritéria neměř. Čísla přepočítej sám dotazem ze scénáře, nikdy je nepřebírej z journalu ani z reportů. Kritérium, které nejde poctivě vyhodnotit (nesplnitelné v prostředí E2E, koliduje s jiným kritériem nebo Ne-cílem vize, nález je předřezový a mimo rozsah), dej do vadna_kriteria s dokladem druhu; do fail ho nepočítej. Vrať jen počty, FAIL, částečná a vadná kritéria, závažné nálezy mimo kritéria (bezpečnost, data) zvlášť od kosmetických. Testovací data s prefixem [E2E], po sobě ukliď.${obnovaVeta('Deploy a E2E')}`,
    { label: `e2e:kolečko:${k}`, phase: 'Deploy a E2E', agentType: 'dev-pipeline:e2e-verifier', schema: E2E, ...M.opusM })
  : runSePredavkou(`${ramec}

Úkol: kolečko nemá runtime dopad (projekt nasazuje uživatel). Projdi kritéria z ${e2ePath} bod po bodu a každé dolož konkrétním důkazem (výstup příkazu, existence a obsah souboru, spuštěný test), verdikt per kritérium do ${rep('e2e', k)}. Kritérium, které nejde poctivě vyhodnotit, dej do vadna_kriteria s dokladem druhu, do fail ho nepočítej. Dočasné artefakty po sobě ukliď, pracovní strom nech čistý. Vrať jen počty, FAIL, částečná a vadná kritéria.${obnovaVeta('Deploy a E2E')}`,
    { label: `kriteria:kolečko:${k}`, phase: 'Deploy a E2E', agentType: 'general-purpose', schema: E2E, ...M.opusM })

const fixE2E = (e, k) => runSePredavkou(`${ramec}

Úkol: E2E kolečka selhalo (kolo ${k}): report ${e.report_path}, FAIL kritéria: ${(e.fail_kriteria || []).join(' | ') || `${e.fail} bez jmen, viz report`}. Každý nález je hypotéza: reprodukuj, oprav příčinu, testy a typecheck zelené. Necommituj, commit a deploy dělá další krok.`,
  { label: `fix-e2e:kolečko:${k}`, phase: 'Deploy a E2E', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const fixSecurityE2E = e => runSePredavkou(`${ramec}

Úkol: E2E kolečka našlo závažné nálezy mimo kritéria (bezpečnost/data): ${(e.zavazne_mimo_ak || []).join(' | ')} · report ${e.report_path}. Oprav okamžitě, i když jsou mimo rozsah. Necommituj; po zelené bráně bezpečnostní opravu commitne deploy samostatně. Bez jasného fixu nález nech jako follow-up s důvodem.`,
  { label: 'fix-security:kolečko:e2e', phase: 'Deploy a E2E', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

// Závěr ověří hashe bezpečnostních commitů: v bez-dluhu fix agent hlásil commit, který nevznikl, a blok to nepoznal (řez 23).
const close = souhrn => runSePredavkou(`${ramec}

Úkol: závěr kolečka.${souhrn.security.length ? ` (0) Ověř bezpečnostní commity kolečka ${souhrn.security.join(', ')}: git cat-file -t <hash> musí vrátit commit; který ho nevrátí, vrať v chybejici_commity a v journalu ho uveď jako chybějící; hash nikdy nedopočítávej.` : ''} (1) Připoj do docs/journal.md heredocem záznam „Review kolečko“: datum, nálezy per kolo (${souhrn.kola}), co zásadního se změnilo (commity ${souhrn.commity.join(', ') || 'žádné'}), kolik přinesla která bezpečnostní metodika (${souhrn.metodiky}), odmítnuté nálezy s důvodem: ${JSON.stringify(souhrn.odmitnute).slice(0, 1500)}${souhrn.jinak.length ? `, opravy jinak, než nález tvrdil: ${JSON.stringify(souhrn.jinak).slice(0, 1000)}` : ''}, sporné položky a vadná kritéria k rozhodnutí uživatele: ${JSON.stringify(souhrn.rozhodnuti).slice(0, 1200)}, E2E ${souhrn.e2e}. (2) Připoj do docs/follow-ups.md tyto položky (jedna odrážka = jedna, s kontextem, bez duplicit proti existujícím): ${JSON.stringify(souhrn.follow_ups).slice(0, 2500)}. (3) Pusť formátovač projektu na dotčené docs/*.md, když ho projekt má. (4) Vytvoř marker \`touch ${cwd}/docs/.review-passed\` a ověř, že existuje. (5) Smaž docs/.deploy-unlocked, když existuje. Necommituj (commituje další krok), do kódu nesahej.`,
  { label: 'závěr:kolečko', phase: 'Závěr', agentType: 'general-purpose', schema: CLOSE, ...M.sonM })

// ---------- opravná vlna: opravy → brána → commit ----------
const balickyZ = (r, prefix) => (r && r.balicky || []).map(b => ({ soubory: cisty((b.soubory || []).map(norm)), nalezy: cisty(b.nalezy), security: !!b.security, zdroje: [{ report: S(r.report_path), ids: cisty(b.nalezy) }] })).filter(b => b.soubory.length)
// sloučí balíčky z více zdrojů do disjunktních množin souborů
function sluc(balicky) {
  const out = []
  for (const b of balicky) {
    const hity = out.filter(o => o.soubory.some(f => b.soubory.includes(f)))
    if (!hity.length) { out.push({ ...b, soubory: [...b.soubory], zdroje: [...b.zdroje] }); continue }
    // Balíček, který spojí dva dosavadní, je sloučí oba: výsledek zůstane disjunktní (dřív se přidal jen k prvnímu a balíčky se překryly).
    const [cil, ...dalsi] = hity
    for (const o of [b, ...dalsi]) { cil.soubory = cisty([...cil.soubory, ...o.soubory]); cil.security = cil.security || o.security; cil.zdroje.push(...o.zdroje) }
    for (const o of dalsi) out.splice(out.indexOf(o), 1)
  }
  return out
}
async function vlna(faze, ph, zprava, balicky) {
  if (!balicky.length) { log(`${faze}: žádný balíček k opravě, brána a commit se vynechávají`); return { ok: true, fixAgentu: 0 } }
  const vysledky = await parallel(balicky.map((b, i) => () => fixBalicek(faze, b.zdroje, b, i)))
  const opravy = vysledky.filter(Boolean)
  opravy.forEach(sber)
  const zmenil = opravy.some(zmenilo)
  if (opravy.some(f => f.rozsireny_zasah)) log(`${faze}: rozšířený zásah nahlášen (${opravy.filter(f => f.rozsireny_zasah).map(f => S(f.rozsireny_popis).slice(0, 80)).join(' | ')}); zkontroluje ho další kolo`)
  if (!zmenil) { log(`${faze}: opravy nic nezměnily, brána a commit se vynechávají`); return { ok: true, fixAgentu: opravy.length } }
  // Bezpečnostní balíčky, které něco změnily: jejich soubory a popis dostane krok commitu až po zelené bráně (bod 19).
  const secOpravy = balicky.map((b, i) => (b.security || (vysledky[i] && vysledky[i].security)) && zmenilo(vysledky[i]) ? { soubory: b.soubory, popis: `${cisty(b.zdroje.flatMap(z => z.ids)).join(', ') || 'bezpečnostní nálezy'}: ${cisty(vysledky[i].zmenena_mista).slice(0, 6).join('; ')}` } : null).filter(Boolean)
  const b = await brana(faze, ph)
  if (!b.ok) return { ok: false, fixAgentu: opravy.length, detail: b.detail }
  const c = await commit(faze, zprava, ph, secOpravy)
  if (!c) return { ok: false, fixAgentu: opravy.length, detail: nic(`commit:kolečko:${faze}`, 'deploy agent (commit)') }
  if (c.stav === 'failed') { sberSecurity(c); return { ok: false, fixAgentu: opravy.length, detail: `commit selhal: ${S(c.duvod)}${cisty(c.security_commity).length ? ` (fix(security) už commitnuté: ${cisty(c.security_commity).join(', ')})` : ''}` } }
  sberCommit(c)
  if (secOpravy.length && !(c.security_commity || []).length) log(`${faze}: bezpečnostní opravy bez samostatného commitu (soubory nesou i jinou změnu), jdou řádkem fix(security) v commitu ${c.commit}`)
  log(`${faze}: ${opravy.length} fix agentů, commit ${c.commit}${(c.security_commity || []).length ? `, fix(security) ${c.security_commity.join(', ')}` : ''}`)
  return { ok: true, fixAgentu: opravy.length }
}
const zapisVerify = v => ({ typecheck: v.typecheck, proslo: v.proslo, selhalo: v.selhalo, exit_kod: v.exit_kod, kontroly_ok: v.kontroly_ok })
async function brana(faze, ph) {
  let v = await verify(faze, 1, ph)
  if (!v) return { ok: false, detail: nic(`verify:kolečko:${faze}:1`, 'verify agent') }
  if (!zelena(v)) {
    log(`brána po ${faze} červená: ${proc(v)}; jedna oprava`)
    const fb = await fixBrana(faze, v, ph); sber(fb)
    v = await verify(faze, 2, ph)
    if (!zelena(v)) { st.verify = v ? zapisVerify(v) : st.verify; return { ok: false, detail: v ? `brána červená po opravě: ${proc(v)}: ${(v.selhavajici || []).slice(0, 10).join(' | ')}` : nic(`verify:kolečko:${faze}:2`, 'verify agent') } }
  }
  st.verify = zapisVerify(v)
  log(`brána po ${faze} zelená: ${v.proslo} testů`)
  return { ok: true }
}

// ---------- 1. thermo ----------
phase('Thermo')
log(`kolečko vize ${S(a.vize)} nad ${base}...HEAD`)
if (obnova) {
  if (obnovaOd < 0) log(`obnova: neznámá fáze „${S(a.obnova.od_faze)}“ (platí ${FAZE.map(([, k]) => k).join(', ')}), přeměří se všechno od thermo`)
  if (obnova.znacka === 'bez značky') log('obnova: chybí značka; další obnova bez nové značky vrátí brány této obnovy z cache')
  log(`obnova od fáze ${FAZE[obnova.od][1]} (značka ${obnova.znacka}): brána, commit, deploy a E2E od ní se přeměří, review a čočky se vrátí z cache`)
}
const th = await thermo()
if (!th) return selhani('thermo', nic('thermo:kolečko', 'thermo agent'))
st.reports.push(th.report_path)
st.thermo = { nalezu: th.nalezu, blokeru: th.blokeru, opraveno: 0 }
log(`thermo: ${th.nalezu} nálezů, ${th.blokeru} blokujících, soubory BLOCKER/HIGH: ${cisty(th.soubory).length}`)
if (cisty(th.soubory).length) {
  const f = await fixThermo(th); sber(f)
  if (f) {
    st.thermo.opraveno = f.opraveno
    if (zmenilo(f)) {
      const b = await brana('thermo', 'Thermo'); if (!b.ok) return selhani('thermo', b.detail)
      const c = await commit('thermo', 'kolecko: thermo', 'Thermo')
      if (!c || c.stav === 'failed') { sberSecurity(c); return selhani('thermo', c ? `commit selhal: ${S(c.duvod)}` : nic('commit:kolečko:thermo', 'deploy agent (commit)')) }
      sberCommit(c)
    }
  } else log('thermo: fix agent nevrátil výsledek, nálezy zůstávají jako follow-up')
}

// ---------- 2. code-review kolo 1 ----------
phase('Code-review 1')
const r1 = await review1()
if (!r1) return selhani('code-review kolo 1', nic('review:kolečko:1', 'code-review agent'))
if (r1.report_path) st.reports.push(r1.report_path)
const b1 = sluc(balickyZ(r1))
log(`review 1: ${r1.nalezu} nálezů, ${r1.blokujicich} blokujících, ${b1.length} balíčků`)
const v1 = await vlna('kolo 1', 'Code-review 1', 'kolecko: code-review kolo 1', b1)
st.review.kolo1 = { nalezu: r1.nalezu, blokujicich: r1.blokujicich, fix_agentu: v1.fixAgentu }
if (!v1.ok) return selhani('code-review kolo 1', v1.detail)

// ---------- 3. code-review kolo 2: čočky + triáž ----------
phase('Code-review 2')
const cocky = (await parallel(COCKY.map(([cocka, popis]) => () => reviewCocka(cocka, popis, r1).then(r => r && { ...r, cocka })))).filter(Boolean)
cocky.forEach(c => { if (c.report_path) st.reports.push(c.report_path) })
const nalezuCocek = cocky.reduce((n, c) => n + (c.nalezu || 0), 0)
log(`review 2: ${cocky.length}/${COCKY.length} čoček vrátilo výsledek, ${nalezuCocek} nálezů před triáží`)
st.review.kolo2 = { cocek: cocky.length, nalezu: nalezuCocek, opravit_ted: 0, follow_up: 0, odmitnuto: 0, fix_agentu: 0 }
if (nalezuCocek > 0) {
  const t = await triaz(cocky)
  if (!t) return selhani('code-review kolo 2', nic('triáž:kolečko:2', 'agent triáže'))
  st.reports.push(t.report_path)
  st.follow_ups.push(...(t.follow_ups || [])); st.odmitnute.push(...(t.odmitnute || []).map(o => `${S(o.id)}: ${S(o.duvod)}`)); st.rozhodnuti.push(...(t.sporne || []))
  const b2 = sluc(balickyZ(t))
  log(`triáž: ${t.nalezu} nálezů po sloučení → opravit teď ${t.opravit_ted}, follow-up ${t.follow_up}, odmítnuto ${t.odmitnuto}, sporné ${(t.sporne || []).length}; ${b2.length} balíčků`)
  const v2 = await vlna('kolo 2', 'Code-review 2', 'kolecko: code-review kolo 2', b2)
  st.review.kolo2 = { cocek: cocky.length, nalezu: t.nalezu, opravit_ted: t.opravit_ted, follow_up: t.follow_up, odmitnuto: t.odmitnuto, fix_agentu: v2.fixAgentu }
  if (!v2.ok) return selhani('code-review kolo 2', v2.detail)
} else log('review 2: žádný nález, triáž se nekoná')

// ---------- 4. bezpečnost ----------
phase('Bezpečnost')
const [sc, ss] = await parallel([() => secCocka(), () => secSkill()])
for (const r of [sc, ss]) if (r && r.report_path) st.reports.push(r.report_path)
if (!sc && !ss) return selhani('bezpečnost', `ani jedna bezpečnostní metodika nevrátila výsledek (${nic('security:kolečko:čočka', 'čočka')}; ${nic('security:kolečko:security-review', 'security-review')})`)
st.security.nalezu = (sc ? sc.nalezu : 0) + (ss ? ss.nalezu : 0)
st.security.blokujicich = (sc ? sc.blokujicich : 0) + (ss ? ss.blokujicich : 0)
const metodiky = `čočka ${sc ? `${sc.nalezu} nálezů` : 'bez výsledku'}; ${ss ? `${S(ss.metodika) || 'security-review'} ${ss.nalezu} nálezů` : 'security-review bez výsledku'}`
log(`bezpečnost: ${metodiky}`)
const bs = sluc([...balickyZ(sc), ...balickyZ(ss)]).map(b => ({ ...b, security: true }))
const vs = await vlna('bezpečnost', 'Bezpečnost', 'kolecko: bezpečnost', bs)
if (!vs.ok) return selhani('bezpečnost', vs.detail)

// ---------- 5. deploy a E2E ----------
phase('Deploy a E2E')
const bd = await brana('před nasazením', 'Deploy a E2E'); if (!bd.ok) return selhani('deploy', bd.detail)
let d = await deploy(1, 'nasazení oprav')
if (!d) return selhaniDeploye(d, 1)
if (d.stav === 'failed') { st.deploy = { stav: d.stav, commit: d.commit }; return selhaniDeploye(d, 1) }
sberCommit(d)
st.deploy = { stav: d.stav, commit: d.commit }
log(`deploy: ${d.stav}, commit ${d.commit}`)
const se = await sestavE2E()
if (!se) return selhani('e2e', nic('e2e-scénáře:kolečko', 'agent E2E scénářů kolečka'))
log(`E2E scénáře kolečka: ${se.kriterii} kritérií${se.poznamka ? ` (${S(se.poznamka).slice(0, 120)})` : ''}`)
const verdikt = e => (e.fail > 0 || (e.fail_kriteria || []).length) ? 'fail' : (e.vadna_kriteria || []).length ? 'vada-kriteria' : e.castecne > 0 ? 'pass-castecne' : 'pass'
const zapisE2E = e => { st.e2e = { vysledek: verdikt(e), celkem: e.celkem, pass: e.pass, castecne: e.castecne, fail: e.fail, castecna_kriteria: e.castecna_kriteria || [], vadna_kriteria: e.vadna_kriteria || [] } }
const e2eLabel = k => `${runtimeDopad ? 'e2e' : 'kriteria'}:kolečko:${k}`
let e = await e2e(1)
if (!e) return selhani('e2e', nic(e2eLabel(1), 'verifikátor'))
st.reports.push(e.report_path); zapisE2E(e)
log(`E2E 1: ${verdikt(e)} (${e.pass}/${e.celkem}, částečně ${e.castecne}, fail ${e.fail}, vadná ${(e.vadna_kriteria || []).length})`)
if (verdikt(e) === 'fail') {
  const fe = await fixE2E(e, 1); sber(fe)
  const d2 = await deploy(2, 'oprava po E2E'); if (!d2 || d2.stav === 'failed') return selhaniDeploye(d2, 2)
  sberCommit(d2)
  d = d2; st.deploy = { stav: d.stav, commit: d.commit }
  const e1 = e
  // Kolo 2 přeměří jen jmenovaná FAIL kritéria kola 1. Když kolo 1 hlásí víc FAIL, než jich jmenuje, nejde říct která, a kolo 2
  // měří všechna (revize 1.4.0: fail 2 bez jmen dal kolu 2 prázdný seznam a kolečko prošlo bez přeměření). Bez runtime dopadu
  // měří kolo 2 všechna kritéria vždy (zadání kritérií nic nezužuje) a skládat ho s kolem 1 by počty zdvojilo.
  const jmenovana = cisty(e1.fail_kriteria)
  const vse = !runtimeDopad || (Number(e1.fail) || 0) > jmenovana.length
  if (vse && runtimeDopad) log(`E2E 1: fail ${e1.fail}, jmenovaných kritérií ${jmenovana.length}; kolo 2 přeměří všechna`)
  const e2 = await e2e(2, vse ? null : jmenovana)
  if (!e2) return selhani('e2e', `${nic(e2eLabel(2), 'verifikátor')} v kole 2`)
  // Plné přeměření, které nezměřilo nic, není pass (neproběhlo není spadlo).
  if (vse && !(Number(e2.celkem) > 0) && Number(e1.celkem) > 0) return selhani('e2e', `kolo 2 mělo přeměřit všechna kritéria (${e1.celkem}) a vrátilo celkem 0`)
  // Kolo 2 měřilo jen FAIL kritéria kola 1: výsledné počty se skládají z obou kol. Závažné nálezy a kosmetika z kola 1
  // se také nesmí ztratit (kolo 2 je jen smoke), jinak by bezpečnostní nález z kola 1 zmizel bez opravy.
  const zKola1 = { zavazne_mimo_ak: cisty([...(e1.zavazne_mimo_ak || []), ...(e2.zavazne_mimo_ak || [])]), kosmeticke: cisty([...(e1.kosmeticke || []), ...(e2.kosmeticke || [])]) }
  if (vse) e = { ...e2, ...zKola1 }
  else {
    const vadna = cisty([...(e1.vadna_kriteria || []), ...(e2.vadna_kriteria || [])])
    const castecne = (Number(e1.castecne) || 0) + (Number(e2.castecne) || 0)
    e = { ...e2, celkem: Number(e1.celkem) || 0, castecne, vadna_kriteria: vadna, castecna_kriteria: [...(e1.castecna_kriteria || []), ...(e2.castecna_kriteria || [])], ...zKola1,
      pass: Math.max(0, (Number(e1.celkem) || 0) - (Number(e2.fail) || 0) - castecne - vadna.length) }
  }
  st.reports.push(e2.report_path); zapisE2E(e)
  log(`E2E 2 (${vse ? 'všechna kritéria' : 'jen FAIL kola 1'}): ${verdikt(e)} (${e.pass}/${e.celkem}, fail ${e.fail})`)
  if (verdikt(e) === 'fail') return selhani('e2e', `FAIL kritéria po opravě: ${(e.fail_kriteria || []).join(' | ') || `${e.fail} bez jmen`}`)
}
if ((e.vadna_kriteria || []).length) {
  log(`E2E: ${e.vadna_kriteria.length} vadných kritérií, bez opravy, jdou k rozhodnutí`)
  st.rozhodnuti.push(...e.vadna_kriteria.map(k => `[vadné kritérium E2E kolečka] ${k} · návrh: kritérium přepsat nebo vyřadit, chování nechat`))
}
st.follow_ups.push(...(e.kosmeticke || []).map(k => `[E2E kosmetika kolečko] ${k}`))
if ((e.zavazne_mimo_ak || []).length) {
  log(`E2E: ${e.zavazne_mimo_ak.length} závažných nálezů mimo kritéria: oprava bez commitu, brána, deploy se samostatným commitem fix(security)`)
  // Neopravený nebo nenasazený závažný nález jde do follow_ups i do rozhodnuti: v revizi 1.4.0 ho fix-security bez výsledku
  // i selhaný deploy(3) ztratily a kolečko skončilo s review_passed true.
  const neopraveno = proc => cisty(e.zavazne_mimo_ak).forEach(z => {
    st.follow_ups.push(`[E2E bezpečnost kolečko · neopraveno] ${z} (${proc})`)
    st.rozhodnuti.push(`[E2E bezpečnost kolečko · neopraveno] ${z} · ${proc}; návrh: opravit a nasadit před uzavřením vize`)
  })
  const fs = await fixSecurityE2E(e); sber(fs)
  if (!fs) { log('fix-security nevrátil výsledek, nálezy jdou do follow-ups a rozhodnutí'); neopraveno(nic('fix-security:kolečko:e2e', 'fix-security')) }
  else if (zmenilo(fs)) {
    const bb = await brana('bezpečnost po E2E', 'Deploy a E2E')
    if (!bb.ok) { neopraveno('oprava neprošla bránou, zůstává v pracovním stromě'); return selhani('e2e', `bezpečnostní oprava neprošla bránou: ${bb.detail}`) }
    const d3 = await deploy(3, 'bezpečnostní oprava po E2E', [{ soubory: cestyZ(fs.zmenena_mista), popis: `závažné nálezy E2E mimo kritéria: ${e.zavazne_mimo_ak.join(' | ').slice(0, 600)}; oprava: ${cisty(fs.zmenena_mista).join('; ').slice(0, 400)}` }])
    // Selhaný deploy bezpečnostní opravy je selhání kolečka i mimo infra: review_passed nesmí vzniknout a commit závěru by opravu
    // smetl do „kolecko: závěr“ bez fix(security) a bez nasazení (revize 1.4.0).
    if (!d3 || d3.stav === 'failed') { neopraveno('oprava je v pracovním stromě necommitnutá a nenasazená'); return selhaniDeploye(d3, 3, 'deploy bezpečnostní opravy po E2E: ') }
    sberCommit(d3); d = d3; st.deploy = { stav: d.stav, commit: d.commit }
  } else log('E2E: bezpečnostní oprava nic nezměnila, nálezy zůstávají jako follow-up')
}

// ---------- 6. závěr ----------
phase('Závěr')
const kola = `thermo ${st.thermo.nalezu}/${st.thermo.blokeru} (opraveno ${st.thermo.opraveno}); kolo 1 ${st.review.kolo1.nalezu} nálezů, ${st.review.kolo1.blokujicich} blokujících, ${st.review.kolo1.fix_agentu} fix agentů; kolo 2 ${st.review.kolo2.cocek} čoček, ${st.review.kolo2.nalezu} nálezů → opravit ${st.review.kolo2.opravit_ted}, follow-up ${st.review.kolo2.follow_up}, odmítnuto ${st.review.kolo2.odmitnuto}; bezpečnost ${st.security.nalezu} nálezů, ${st.security.blokujicich} blokujících, commity ${cisty(st.security.commity).length}`
const c = await close({ kola, commity: cisty([...st.commity, ...st.security.commity]), security: cisty(st.security.commity), metodiky, odmitnute: cisty(st.odmitnute), jinak: cisty(st.jinak), rozhodnuti: cisty(st.rozhodnuti), follow_ups: cisty(st.follow_ups), e2e: `${st.e2e.vysledek} ${st.e2e.pass}/${st.e2e.celkem}${st.e2e.castecne ? ` (částečně ${st.e2e.castecne})` : ''}` })
st.review_passed = !!(c && c.ok && c.review_passed)
if (!st.review_passed) log(`závěr: marker docs/.review-passed nevznikl${c && c.poznamka ? ` (${S(c.poznamka).slice(0, 120)})` : ''}`)
st.chybejici.push(...cisty(c && c.chybejici_commity))
if (st.chybejici.length) log(`závěr: bezpečnostní commity neexistují: ${st.chybejici.join(', ')} (hlášené, ale git cat-file je neuznal)`)
const cz = await commit('závěr', 'kolecko: závěr', 'Závěr')
if (cz && cz.stav !== 'failed') sberCommit(cz)
else log(`závěr: commit docs selhal (${cz ? S(cz.duvod).slice(0, 120) : 'bez výsledku'}), dokumenty zůstávají v pracovním stromě`)
log(`kolečko hotové: ${cisty([...st.commity, ...st.security.commity]).filter(h => !st.chybejici.includes(h)).length} commitů, ${cisty(st.rozhodnuti).length} rozhodnutí, review_passed ${st.review_passed}`)
return navrat('hotovo', '', '')
