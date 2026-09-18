export const meta = {
  name: 'blok-kolecko',
  description: 'dev-pipeline závěrečné review kolečko vize jako Workflow: thermo → code-review kolo 1 → kolo 2 fan-outem pěti čoček s triáží → bezpečnost (čočka + security-review) → deploy a E2E kolečka → závěr. Po každé opravné vlně verify a commit. Bez opakování fází; neúspěch vrací fázi a detail.',
  whenToUse: 'Spouští orchestrátor /dev-pipeline:orchestrate ve finální fázi vize (skill dev-pipeline:review-kolecko), nebo uživatel výslovně nad větší sérií změn. args: {cwd, plugin_root, vize, produkt, base, ne_cile, runbook, deploy_mode, deploy_okno, app_pristup}. Bez args nic nedělá. Ne na jeden řez.',
  phases: [
    { title: 'Thermo', detail: 'strukturální audit větve, oprava jen BLOCKER/HIGH, brána, commit' },
    { title: 'Code-review 1', detail: 'korektnost celé větve, opravy po balíčcích souběžně, brána, commit' },
    { title: 'Code-review 2', detail: 'pět čoček souběžně nad celým rozsahem, triáž (opravit teď / follow-up / odmítnout), opravy, brána, commit' },
    { title: 'Bezpečnost', detail: 'bezpečnostní čočka s checklistem ∥ security-review, opravy samostatnými commity fix(security)' },
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
const kontrakt = a.plugin_root ? `${a.plugin_root}/skills/orchestrate/KONTRAKT.md` : null
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
  `Projekt: ${cwd} (absolutní cesty; commity jen na vize větvi, nikdy na ${base}).`,
  `Závěrečné kolečko vize ${a.vize}${produkt ? ` · severka ${produkt}` : ''}${kontrakt ? ` · kontrakt: ${kontrakt}` : ''}. Rozsah: ${rozsah}.`,
  neCile ? `Ne-cíle vize platí pro každou fázi včetně oprav: ${neCile}` : '',
  'Běh je autonomní: uživatele se neptáš. Rozpor s vizí zapiš do docs/vize-spory.md, rozhodni konzervativně a pokračuj. Vykonáváš jen svou fázi; následné a kontrolní fáze spouští workflow.',
  'Tvůj finální výstup je strukturovaný návrat (schéma je vynucené). Do textových polí piš stručně; co se nevejde, napiš do souboru v docs/reviews/ a vrať cestu.',
].filter(Boolean).join('\n')
const M = { opusH: { model: 'opus', effort: 'high' }, opusM: { model: 'opus', effort: 'medium' }, sonL: { model: 'sonnet', effort: 'low' }, sonM: { model: 'sonnet', effort: 'medium' } }
const cisty = xs => [...new Set((xs || []).map(x => S(x).trim()).filter(Boolean))]
const norm = f => S(f).replace(`${cwd}/`, '')

// ---------- schémata ----------
const str = d => ({ type: 'string', description: d })
const arr = d => ({ type: 'array', items: { type: 'string' }, description: d })
const idDuvod = d => ({ type: 'array', items: { type: 'object', required: ['id', 'duvod'], properties: { id: { type: 'string' }, duvod: { type: 'string' } } }, description: d })
const BALICKY = { type: 'array', items: { type: 'object', required: ['soubory', 'nalezy'], properties: { soubory: arr('disjunktní množina souborů'), nalezy: arr('identifikátory nálezů z reportu'), security: { type: 'boolean' } } } }
const THERMO = { type: 'object', required: ['blokeru', 'nalezu', 'report_path', 'soubory'], properties: { blokeru: { type: 'integer', description: 'nálezy, které rubrika označuje za blokující' }, nalezu: { type: 'integer' }, report_path: str('absolutní cesta k reportu'), soubory: arr('soubory s nálezy BLOCKER a HIGH, cesty relativní ke kořeni projektu'), souhrn: str('max 3 řádky') } }
const FIX = { type: 'object', required: ['opraveno', 'zmenena_mista', 'typecheck', 'testy_zelene'], properties: {
  opraveno: { type: 'integer' },
  odmitnuto: idDuvod('nálezy, které jsi po ověření neopravil, s důvodem'),
  zmenena_mista: arr('soubor a symbol nebo oblast, kde jsi měnil'),
  rozsireny_zasah: { type: 'boolean', description: 'nový plošný mechanismus, sdílený layout či helper, nebo soubory mimo nálezy' },
  rozsireny_popis: str('co přesně a proč'),
  typecheck: { type: 'boolean' }, testy_zelene: { type: 'boolean' },
  follow_ups: arr('nálezy mimo rozsah, které jsi neopravil, jednou větou s kontextem'),
  spory: arr('nové záznamy ve vize-spory'),
  commit: str('hash, jen když jsi měl za úkol samostatný commit'),
} }
const REVIEW = { type: 'object', required: ['nalezu', 'blokujicich', 'balicky', 'report_path'], properties: {
  nalezu: { type: 'integer' }, blokujicich: { type: 'integer' }, report_path: str('absolutní cesta k reportu; prázdné, když nebyl nález'),
  balicky: BALICKY, follow_up_ids: arr('nálezy FOLLOW-UP'), metodika: str('jen bezpečnostní fáze: security-review | vlastní průchod | obojí'),
} }
const TRIAZ = { type: 'object', required: ['nalezu', 'opravit_ted', 'follow_up', 'odmitnuto', 'balicky', 'report_path'], properties: {
  nalezu: { type: 'integer', description: 'nálezů po sloučení duplicit' },
  opravit_ted: { type: 'integer' }, follow_up: { type: 'integer' }, odmitnuto: { type: 'integer' },
  balicky: BALICKY, report_path: str('absolutní cesta ke sloučenému reportu'),
  follow_ups: arr('follow-up položky jednou větou s kontextem (kandidáti na řez)'),
  odmitnute: idDuvod('odmítnuté nálezy s důvodem'),
  sporne: arr('nálezy, o kterých má rozhodnout uživatel, jednou větou s navrženou odpovědí'),
} }
const VERIFY = { type: 'object', required: ['typecheck', 'proslo', 'selhalo'], properties: { typecheck: { type: 'boolean' }, proslo: { type: 'integer' }, selhalo: { type: 'integer' }, selhavajici: arr('jména selhávajících testů a chyby typecheck s file:line, max 20'), vystup_path: str('soubor s plným výstupem'), prikazy: arr('spuštěné příkazy'), marker: str('hash stromu z verify-marker.sh při zelené bráně, jinak prázdné') } }
const DEPLOY = { type: 'object', required: ['stav', 'commit'], properties: { stav: { type: 'string', enum: ['success', 'failed', 'commit-only'] }, commit: str('hash commitu (při stromu beze změn hash HEAD)'), health: str('doklad, že běží: status platformy + behaviorální doklad'), url: str(''), duvod: str('při failed: přesná chyba; při commit-only beze změn: „beze změn“') } }
const SESTAV = { type: 'object', required: ['e2e_path', 'kriterii'], properties: { e2e_path: str('absolutní cesta k docs/e2e/kolecko.md'), kriterii: { type: 'integer' }, plochy: arr('plochy a toky, které scénáře pokrývají'), poznamka: str('co se nedalo pokrýt a proč') } }
const E2E = { type: 'object', required: ['vysledek', 'celkem', 'pass', 'castecne', 'fail', 'report_path'], properties: {
  vysledek: { type: 'string', enum: ['pass', 'pass-castecne', 'fail', 'vada-kriteria'] }, celkem: { type: 'integer' }, pass: { type: 'integer' }, castecne: { type: 'integer' }, fail: { type: 'integer' },
  fail_kriteria: arr('identifikátory a jednou větou co selhalo'), castecna_kriteria: arr('co se ověřilo jen zčásti a čím je nesena druhá půlka'),
  vadna_kriteria: arr('kritéria, která nejde poctivě vyhodnotit, s dokladem druhu: nesplnitelné v prostředí E2E / koliduje s jiným kritériem nebo Ne-cílem vize / nález je předřezový a mimo rozsah; do fail se nepočítají'),
  zavazne_mimo_ak: arr('bezpečnostní a datové nálezy mimo kritéria'), kosmeticke: arr('kosmetické regresní postřehy'), report_path: str('absolutní cesta k reportu'),
} }
const CLOSE = { type: 'object', required: ['ok', 'review_passed'], properties: { ok: { type: 'boolean' }, review_passed: { type: 'boolean', description: 'docs/.review-passed existuje' }, poznamka: str('co se nepodařilo zapsat') } }

// ---------- stav ----------
const st = {
  thermo: null, review: { kolo1: null, kolo2: null }, security: { nalezu: 0, blokujicich: 0, commity: [] }, verify: null, deploy: null, e2e: null,
  commity: [], rozhodnuti: [], follow_ups: [], spory: [], odmitnute: [], reports: [], review_passed: false,
}
const sber = r => { if (!r) return; st.follow_ups.push(...(r.follow_ups || [])); st.spory.push(...(r.spory || [])); st.odmitnute.push(...(r.odmitnuto || []).map(o => `${S(o.id)}: ${S(o.duvod)}`)); if (r.commit) st.security.commity.push(r.commit) }
const navrat = (vysledek, faze, detail) => ({
  ok: true, vysledek, faze: faze || '', detail: S(detail).slice(0, 1500),
  thermo: st.thermo, review: st.review,
  security: { nalezu: st.security.nalezu, blokujicich: st.security.blokujicich, commity: cisty(st.security.commity) },
  verify: st.verify, deploy: st.deploy, e2e: st.e2e,
  commity: cisty([...st.commity, ...st.security.commity]), rozhodnuti: cisty(st.rozhodnuti), follow_ups: cisty(st.follow_ups), spory: cisty(st.spory),
  odmitnute: cisty(st.odmitnute), reports: cisty(st.reports), review_passed: st.review_passed,
})
const selhani = (faze, detail) => { log(`kolečko selhalo ve fázi ${faze}: ${S(detail).slice(0, 200)}`); return navrat('selhalo', faze, detail) }

// ---------- kroky ----------
const thermo = () => run(`${ramec}

Úkol: thermo-nuclear review celé větve vize (rozsah větev, base ${base}; diff si posbírej sám). Report do ${rep('thermo')}. Vrať počty, cestu a soubory s nálezy BLOCKER a HIGH (relativně ke kořeni projektu). Žádné plošné přestavby na konci vize: co je velké jako řez, označ NOTE jako kandidáta na příští vizi.`,
  { label: 'thermo:kolečko', phase: 'Thermo', agentType: 'dev-pipeline:thermo-nuclear-review', schema: THERMO, ...M.opusM })

const fixThermo = th => run(`${ramec}

Úkol: oprav strukturální nálezy thermo review kolečka: ${th.report_path}. Meze: jen nálezy BLOCKER a HIGH, jen soubory ${cisty(th.soubory).join(', ') || 'z reportu'}; NOTE a plošné přestavby nech jako follow-up. Nezaváděj nové plošné mechanismy. Spouštěj jen dotčené testy a typecheck; plnou suitu nespouštěj, patří bráně. Každý nález je hypotéza: ověř proti kódu. Necommituj.`,
  { label: 'fix-thermo:kolečko', phase: 'Thermo', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const review1 = () => run(`${ramec}

Úkol: code-review kolečka, kolo 1, rozsah větev (base ${base}), všechny osy. Report do ${rep('code-review', 'kolo-1')}. Vrať počty, disjunktní balíčky po souborech s identifikátory nálezů a cestu; nálezy samotné nevracej. Každý nález v reportu nese BLOKUJE NASAZENÍ nebo FOLLOW-UP a CONFIRMED nebo PLAUSIBLE.`,
  { label: 'review:kolečko:1', phase: 'Code-review 1', agentType: 'dev-pipeline:code-review', schema: REVIEW, ...M.opusH })

const COCKY = [
  ['data-a-izolace', 'izolace mezi tenanty i přes join na rodiče, soft-delete filtry, konzistence migrací, peníze a měny'],
  ['kontrakty-a-volajici', 'změněné signatury a sémantika, JSDoc proti chování, každý volající změněného symbolu dohledaný Serenou'],
  ['regrese-z-historie', 'git log -p a git blame nad změněnými místy, dříve opravené bugy, které změna vrací'],
  ['bezpecnost', 'autorizace nových i dotčených rout, tokeny v logu nebo URL, vstupní hranice, secrets v kódu a konfiguraci'],
  ['testy-a-doktrina', 'pokrývá změna, co tvrdí; obcházení nebo zúžení existujících testů; porušení výslovných pravidel CLAUDE.md'],
]
const reviewCocka = (cocka, popis, r1) => run(`${ramec}

Úkol: code-review kolečka, kolo 2, čočka „${cocka}“ (${popis}). Nad celým rozsahem kontroluj do hloubky jen tuto osu; ostatní osy přeskoč, mají vlastní čočky. Kolo 1 už proběhlo${r1 && r1.report_path ? ` (report ${r1.report_path}: přečti jen identifikátory a místa, ty neopakuj)` : ''}; opravy kola 1 jsou v pracovním stromě a patří do rozsahu. Report do ${rep('code-review', 'kolo-2', cocka)}. Vrať počty, disjunktní balíčky po souborech s identifikátory a cestu; nálezy nevracej.`,
  { label: `review:kolečko:2:${cocka}`, phase: 'Code-review 2', agentType: 'dev-pipeline:code-review', schema: REVIEW, ...M.opusH })

const triaz = cocky => run(`${ramec}

Úkol: triáž nálezů kola 2 code-review kolečka. Reporty čoček: ${cocky.map(c => `${c.cocka} → ${c.report_path || 'bez nálezu'} (${c.nalezu} nálezů, ${c.blokujicich} blokujících)`).join(' | ')}.
Postup: (1) přečti reporty a slouč duplicity (stejné místo a mechanismus = jeden nález s vyšší závažností; identifikátor nového nálezu drž ve tvaru <čočka>/<původní id>). (2) Každý nález roztřiď: „opravit teď“ = dopad na uživatele nebo data v nasazené aplikaci; „follow-up“ = kandidát na řez příští vize (změna datového modelu, širší refaktor, plošný mechanismus); „odmítnuto“ = po ověření proti kódu neplatí nebo je to vědomé rozhodnutí vize, s důvodem. Nález, o kterém nejde rozhodnout bez uživatele (mění mantinel nebo Cíl vize), dej do sporné s navrženou odpovědí a zároveň ho neopravuj. (3) Zapiš sloučený report do ${rep('code-review', 'kolo-2')}: sekce Opravit teď (nálezy s místem, selháním a původní čočkou), Follow-up, Odmítnuto (důvody), Sporné. (4) Vrať počty, disjunktní balíčky po souborech jen pro „opravit teď“ (identifikátory ze sloučeného reportu, security příznak u bezpečnostních), follow-upy jednou větou s kontextem, odmítnuté s důvodem, sporné s návrhem. Kód needituješ, podagenty nespouštíš.`,
  { label: 'triáž:kolečko:2', phase: 'Code-review 2', agentType: 'general-purpose', schema: TRIAZ, ...M.opusH })

const secCocka = () => run(`${ramec}

Úkol: bezpečnostní review kolečka nad celou větví (base ${base}) plus pracovní strom, čočka „bezpecnost“ do hloubky, ostatní osy přeskoč. Checklist navíc: (1) u multi-tenant projektu projdi VŠECHNY dotčené routy, joby a nástroje, ne jen nové: autorizace, izolace organizace i přes join na rodiče, soft-delete; (2) jednořádkový sweep \`rg\` na známé rizikové vzory projektu z CLAUDE.md (přímé dotazy mimo kanonický helper, tokeny v logu nebo URL, secrets v kódu, vstupní hranice bez validace) nad celým repem; (3) pre-existing nález mimo diff platí a označ ho. Report do ${rep('security', 'cocka')}. Vrať počty, disjunktní balíčky po souborech (security: true), cestu; metodika: „vlastní průchod“.`,
  { label: 'security:kolečko:čočka', phase: 'Bezpečnost', agentType: 'dev-pipeline:code-review', schema: REVIEW, ...M.opusH })

const secSkill = () => run(`${ramec}

Úkol: druhá bezpečnostní metodika kolečka nad \`git diff ${base}...HEAD\` plus pracovní strom. Nejdřív zkus invokovat skill \`security-review\` nástrojem Skill; když není k dispozici nebo je odmítnut (disable-model-invocation), udělej ekvivalentní průchod sám: injekce (SQL, příkazy, šablony), autentizace a autorizace, únik dat a PII, nebezpečná deserializace, SSRF, secrets, závislosti. Každý nález ověř proti kódu a napiš scénář selhání; falešně pozitivní nález je dražší než přehlédnutý. Report do ${rep('security', 'review')} ve tvaru „N1 cesta:řádek — [CONFIRMED|PLAUSIBLE] [BLOKUJE|FOLLOW-UP] [security] popis / Selhání: …“; když nic nenajdeš, report nepiš a vrať nula nálezů. Vrať počty, disjunktní balíčky po souborech (security: true), cestu a metodika: „security-review“ nebo „vlastní průchod“. Kód needituješ, podagenty nespouštíš.`,
  { label: 'security:kolečko:security-review', phase: 'Bezpečnost', agentType: 'general-purpose', schema: REVIEW, ...M.opusH })

const fixBalicek = (faze, zdroje, b, i) => run(`${ramec}

Úkol: oprav nálezy kolečka (${faze}). ${zdroje.map(z => `Report ${z.report}: nálezy ${z.ids.join(', ') || 'všechny ve tvých souborech'}`).join(' · ')}. Sahej jen do souborů: ${b.soubory.join(', ')}; jiné soubory mohou souběžně opravovat jiní agenti. Root brána může být červená na cizích souborech, ověř svůj balíček. Spouštěj jen dotčené testy a typecheck; plnou suitu nespouštěj, patří bráně a souběžné agenty by vyhladověla. ${b.security ? 'Jde o bezpečnostní balíček: oprav celý hned, i pre-existing, a po opravě udělej samostatný commit fix(security): … a vrať hash.' : 'Necommituj.'} Každý nález je hypotéza: ověř proti kódu; co míří vedle, oprav skutečnou příčinu a rozdíl uveď; co neplatí, odmítni s důvodem. Žádné plošné přestavby na konci vize. Nahlas rozšířený zásah, když překročí nálezy.`,
  { label: `fix:kolečko:${faze}:${i + 1}`, phase: faze === 'thermo' ? 'Thermo' : faze === 'kolo 1' ? 'Code-review 1' : faze === 'kolo 2' ? 'Code-review 2' : 'Bezpečnost', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const verify = (faze, k, ph) => run(`${ramec}

Úkol: brána kolečka po fázi „${faze}“, běh ${k}: spusť typecheck a testy projektu podle CLAUDE.md${runbook ? ` nebo runbooku ${runbook}` : ''}, plný výstup ulož do ${rep('verify', faze.replace(/\s+/g, '-'), k)} a vrať skutečné výsledky (počty, jména selhávajících testů, chyby s file:line). Nic neopravuj a neinterpretuj.${a.plugin_root ? ` Když je typecheck i testy zelené, spusť \`bash ${a.plugin_root}/scripts/verify-marker.sh ${cwd} ${rep('verify', faze.replace(/\s+/g, '-'), k)}\` a jeho výstup (hash stromu) vrať v poli marker; při červené bráně marker nezapisuj.` : ''}`,
  { label: `verify:kolečko:${faze}:${k}`, phase: ph, agentType: 'dev-pipeline:verify', schema: VERIFY, ...M.sonL })

const fixBrana = (faze, v, ph) => run(`${ramec}

Úkol: brána kolečka po fázi „${faze}“ je červená. Selhává: ${(v.selhavajici || []).slice(0, 20).join(' | ') || 'viz výstup'}${v.vystup_path ? ` · plný výstup: ${v.vystup_path}` : ''}. Oprav příčinu (ne test, pokud test není špatně); po opravě spusť dotčené testy a typecheck, plnou suitu pustí znovu brána. Necommituj.`,
  { label: `fix-brana:kolečko:${faze}`, phase: ph, agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const commit = (faze, zprava, ph) => run(`${ramec}

Úkol: commit změn kolečka po fázi „${faze}“, režim commit-only: jeden commit na vize větvi se zprávou „${zprava}“. Bezpečnostní opravy už commitly fix agenti samostatně; ty commitni zbylé změny kolečka (kód, testy, docs/e2e/kolecko.md, docs/journal.md, docs/follow-ups.md, docs/vize-spory.md). docs/reviews/ a markery jsou gitignorované. Když pracovní strom nemá co commitnout, necommituj a vrať stav commit-only, hash HEAD a duvod „beze změn“. Nenasazuj. Po commitu zkontroluj git status a netrackované soubory kolečka jmenuj v návratu.`,
  { label: `commit:kolečko:${faze}`, phase: ph, agentType: 'dev-pipeline:deploy', schema: DEPLOY, ...M.sonL })

const deploy = (k, pozn) => run(`${ramec}

Úkol: nasazení kolečka (běh ${k}). Nejdřív commit zbylých změn na vize větvi, když nějaké jsou: „kolecko: ${pozn}“. ${!runtimeDopad ? 'Projekt nasazuje uživatel: skonči commitem (nebo hashem HEAD při stromu beze změn), stav commit-only.' : `Deploy podle deploy konfigurace projektu${runbook ? ` (runbook: ${runbook})` : ' (sekce Deploy v CLAUDE.md projektu nebo docs/deploy.md)'}: marker docs/.deploy-unlocked vytvoř samostatným příkazem před deployem, čekej omezenou smyčkou s počtem iterací (žádné nekonečné while), na každém terminálním stavu skonči (SUCCESS/FAILED/CRASHED) a vrať dva nezávislé doklady, že běží. ${deployOkno ? `Zakázané okno nasazení: ${deployOkno}; když do něj spadáš, počkej do jeho konce a ještě 10 minut rezervy.` : 'Zakázané okno nasazení z runbooku respektuj s rezervou deseti minut.'}`} Nikdy si nedomýšlej postup, který projekt nedokumentuje.`,
  { label: `deploy:kolečko:${k}`, phase: 'Deploy a E2E', agentType: 'dev-pipeline:deploy', schema: DEPLOY, ...M.sonL })

const sestavE2E = () => run(`${ramec}

Úkol: sestav E2E scénáře kolečka do ${e2ePath}. Zdroje: commity kolečka (\`git log ${base}..HEAD --oneline\`, commity se zprávou „kolecko:“ a „fix(security):“ od začátku kolečka) s jejich \`--stat\`, reporty ${cisty(st.reports).slice(-8).join(', ') || 'kolečka'} (jen sekce opravených nálezů) a tail docs/journal.md. Pravidla kritérií podle ${a.plugin_root ? `${a.plugin_root}/agents/prd.md` : 'agenta prd pluginu dev-pipeline'} (sekce Akceptační kritéria a E2E scénáře): každé kritérium na viditelném chování, záporné kritérium jmenuje šev, u čísel dotaz k přepočtu místo holé hodnoty, žádné výčty jmen souborů ani opsaná čísla, žádné kritérium závislé na commitu. Pokryj: každou opravu kolečka s dopadem na uživatele nebo data (regrese) a smoke průchod ploch, kterých se vize dotkla (z journalu), nejvýš 20 kritérií. Když kolečko nezměnilo kód, napiš jen smoke průchod do 5 kritérií. Nic jiného needituj.`,
  { label: 'e2e-scénáře:kolečko', phase: 'Deploy a E2E', agentType: 'general-purpose', schema: SESTAV, ...M.opusM })

const e2e = k => runtimeDopad
  ? run(`${ramec}

Úkol: E2E verifikace kolečka, kolo ${k}: projdi scénáře z ${e2ePath} proti běžící aplikaci${appPristup ? ` (přístup: ${appPristup})` : ' (přístup podle CLAUDE.md projektu)'}, verdikt per kritérium PASS / PASS-částečně / FAIL s důkazy do reportu ${rep('e2e', k)}. Čísla přepočítej sám dotazem ze scénáře, nikdy je nepřebírej z journalu ani z reportů. Kritérium, které nejde poctivě vyhodnotit (nesplnitelné v prostředí E2E, koliduje s jiným kritériem nebo Ne-cílem vize, nález je předřezový a mimo rozsah), dej do vadna_kriteria s dokladem druhu; do fail ho nepočítej. Vrať jen počty, FAIL, částečná a vadná kritéria, závažné nálezy mimo kritéria (bezpečnost, data) zvlášť od kosmetických. Testovací data s prefixem [E2E], po sobě ukliď.`,
    { label: `e2e:kolečko:${k}`, phase: 'Deploy a E2E', agentType: 'dev-pipeline:e2e-verifier', schema: E2E, ...M.opusM })
  : run(`${ramec}

Úkol: kolečko nemá runtime dopad (projekt nasazuje uživatel). Projdi kritéria z ${e2ePath} bod po bodu a každé dolož konkrétním důkazem (výstup příkazu, existence a obsah souboru, spuštěný test), verdikt per kritérium do ${rep('e2e', k)}. Kritérium, které nejde poctivě vyhodnotit, dej do vadna_kriteria s dokladem druhu, do fail ho nepočítej. Dočasné artefakty po sobě ukliď, pracovní strom nech čistý. Vrať jen počty, FAIL, částečná a vadná kritéria.`,
    { label: `kriteria:kolečko:${k}`, phase: 'Deploy a E2E', agentType: 'general-purpose', schema: E2E, ...M.opusM })

const fixE2E = (e, k) => run(`${ramec}

Úkol: E2E kolečka selhalo (kolo ${k}): report ${e.report_path}, FAIL kritéria: ${(e.fail_kriteria || []).join(' | ')}. Každý nález je hypotéza: reprodukuj, oprav příčinu, testy a typecheck zelené. Necommituj, commit a deploy dělá další krok.`,
  { label: `fix-e2e:kolečko:${k}`, phase: 'Deploy a E2E', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const fixSecurityE2E = e => run(`${ramec}

Úkol: E2E kolečka našlo závažné nálezy mimo kritéria (bezpečnost/data): ${(e.zavazne_mimo_ak || []).join(' | ')} · report ${e.report_path}. Oprav okamžitě, i když jsou mimo rozsah, samostatným commitem fix(security): … a vrať hash. Bez jasného fixu nález nech jako follow-up s důvodem.`,
  { label: 'fix-security:kolečko:e2e', phase: 'Deploy a E2E', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const close = souhrn => run(`${ramec}

Úkol: závěr kolečka. (1) Připoj do docs/journal.md heredocem záznam „Review kolečko“: datum, nálezy per kolo (${souhrn.kola}), co zásadního se změnilo (commity ${souhrn.commity.join(', ') || 'žádné'}), kolik přinesla která bezpečnostní metodika (${souhrn.metodiky}), odmítnuté nálezy s důvodem: ${JSON.stringify(souhrn.odmitnute).slice(0, 1500)}, sporné položky a vadná kritéria k rozhodnutí uživatele: ${JSON.stringify(souhrn.rozhodnuti).slice(0, 1200)}, E2E ${souhrn.e2e}. (2) Připoj do docs/follow-ups.md tyto položky (jedna odrážka = jedna, s kontextem, bez duplicit proti existujícím): ${JSON.stringify(souhrn.follow_ups).slice(0, 2500)}. (3) Pusť formátovač projektu na dotčené docs/*.md, když ho projekt má. (4) Vytvoř marker \`touch ${cwd}/docs/.review-passed\` a ověř, že existuje. (5) Smaž docs/.deploy-unlocked, když existuje. Necommituj (commituje další krok), do kódu nesahej.`,
  { label: 'závěr:kolečko', phase: 'Závěr', agentType: 'general-purpose', schema: CLOSE, ...M.sonM })

// ---------- opravná vlna: opravy → brána → commit ----------
const balickyZ = (r, prefix) => (r && r.balicky || []).map(b => ({ soubory: cisty((b.soubory || []).map(norm)), nalezy: cisty(b.nalezy), security: !!b.security, zdroje: [{ report: S(r.report_path), ids: cisty(b.nalezy) }] })).filter(b => b.soubory.length)
// sloučí balíčky z více zdrojů do disjunktních množin souborů
function sluc(balicky) {
  const out = []
  for (const b of balicky) {
    const hit = out.find(o => o.soubory.some(f => b.soubory.includes(f)))
    if (hit) { hit.soubory = cisty([...hit.soubory, ...b.soubory]); hit.security = hit.security || b.security; hit.zdroje.push(...b.zdroje) }
    else out.push({ ...b, soubory: [...b.soubory], zdroje: [...b.zdroje] })
  }
  return out
}
async function vlna(faze, ph, zprava, balicky) {
  if (!balicky.length) { log(`${faze}: žádný balíček k opravě, brána a commit se vynechávají`); return { ok: true, fixAgentu: 0 } }
  const opravy = (await parallel(balicky.map((b, i) => () => fixBalicek(faze, b.zdroje, b, i)))).filter(Boolean)
  opravy.forEach(sber)
  const zmenil = opravy.some(f => f.opraveno > 0 || (f.zmenena_mista || []).length)
  if (opravy.some(f => f.rozsireny_zasah)) log(`${faze}: rozšířený zásah nahlášen (${opravy.filter(f => f.rozsireny_zasah).map(f => S(f.rozsireny_popis).slice(0, 80)).join(' | ')}); zkontroluje ho další kolo`)
  if (!zmenil) { log(`${faze}: opravy nic nezměnily, brána a commit se vynechávají`); return { ok: true, fixAgentu: opravy.length } }
  const b = await brana(faze, ph)
  if (!b.ok) return { ok: false, fixAgentu: opravy.length, detail: b.detail }
  const c = await commit(faze, zprava, ph)
  if (!c) return { ok: false, fixAgentu: opravy.length, detail: 'deploy agent (commit) nevrátil výsledek' }
  if (c.stav === 'failed') return { ok: false, fixAgentu: opravy.length, detail: `commit selhal: ${S(c.duvod)}` }
  if (c.commit && c.duvod !== 'beze změn') st.commity.push(c.commit)
  log(`${faze}: ${opravy.length} fix agentů, commit ${c.commit}`)
  return { ok: true, fixAgentu: opravy.length }
}
async function brana(faze, ph) {
  let v = await verify(faze, 1, ph)
  if (!v) return { ok: false, detail: 'verify agent nevrátil výsledek' }
  if (!(v.typecheck && v.selhalo === 0)) {
    log(`brána po ${faze} červená: typecheck ${v.typecheck ? 'ok' : 'chyby'}, ${v.selhalo} testů selhalo; jedna oprava`)
    const fb = await fixBrana(faze, v, ph); sber(fb)
    v = await verify(faze, 2, ph)
    if (!v || !(v.typecheck && v.selhalo === 0)) { st.verify = v ? { typecheck: v.typecheck, proslo: v.proslo, selhalo: v.selhalo } : st.verify; return { ok: false, detail: v ? `brána červená po opravě: typecheck ${v.typecheck}, selhalo ${v.selhalo}: ${(v.selhavajici || []).slice(0, 10).join(' | ')}` : 'verify bez výsledku' } }
  }
  st.verify = { typecheck: v.typecheck, proslo: v.proslo, selhalo: v.selhalo }
  log(`brána po ${faze} zelená: ${v.proslo} testů`)
  return { ok: true }
}

// ---------- 1. thermo ----------
phase('Thermo')
log(`kolečko vize ${S(a.vize)} nad ${base}...HEAD`)
const th = await thermo()
if (!th) return selhani('thermo', 'thermo agent nevrátil výsledek')
st.reports.push(th.report_path)
st.thermo = { nalezu: th.nalezu, blokeru: th.blokeru, opraveno: 0 }
log(`thermo: ${th.nalezu} nálezů, ${th.blokeru} blokujících, soubory BLOCKER/HIGH: ${cisty(th.soubory).length}`)
if (cisty(th.soubory).length) {
  const f = await fixThermo(th); sber(f)
  if (f) {
    st.thermo.opraveno = f.opraveno
    if (f.opraveno > 0 || (f.zmenena_mista || []).length) {
      const b = await brana('thermo', 'Thermo'); if (!b.ok) return selhani('thermo', b.detail)
      const c = await commit('thermo', 'kolecko: thermo', 'Thermo'); if (!c || c.stav === 'failed') return selhani('thermo', c ? c.duvod : 'commit bez výsledku')
      if (c.commit && c.duvod !== 'beze změn') st.commity.push(c.commit)
    }
  } else log('thermo: fix agent nevrátil výsledek, nálezy zůstávají jako follow-up')
}

// ---------- 2. code-review kolo 1 ----------
phase('Code-review 1')
const r1 = await review1()
if (!r1) return selhani('code-review kolo 1', 'code-review agent nevrátil výsledek')
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
  if (!t) return selhani('code-review kolo 2', 'triáž nevrátila výsledek')
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
if (!sc && !ss) return selhani('bezpečnost', 'ani jedna bezpečnostní metodika nevrátila výsledek')
st.security.nalezu = (sc ? sc.nalezu : 0) + (ss ? ss.nalezu : 0)
st.security.blokujicich = (sc ? sc.blokujicich : 0) + (ss ? ss.blokujicich : 0)
const metodiky = `čočka ${sc ? `${sc.nalezu} nálezů` : 'bez výsledku'}; ${ss ? `${S(ss.metodika) || 'security-review'} ${ss.nalezu} nálezů` : 'security-review bez výsledku'}`
log(`bezpečnost: ${metodiky}`)
const bs = sluc([...balickyZ(sc), ...balickyZ(ss)]).map(b => ({ ...b, security: true }))
const vs = await vlna('bezpečnost', 'Bezpečnost', 'kolecko: bezpečnost', bs)
if (!vs.ok) return selhani('bezpečnost', vs.detail)
if (bs.length && st.security.commity.length === 0) log('bezpečnost: fix agenti nevrátili žádný commit fix(security); zkontroluj journal')

// ---------- 5. deploy a E2E ----------
phase('Deploy a E2E')
const bd = await brana('před nasazením', 'Deploy a E2E'); if (!bd.ok) return selhani('deploy', bd.detail)
let d = await deploy(1, 'nasazení oprav')
if (!d) return selhani('deploy', 'deploy agent nevrátil výsledek')
if (d.stav === 'failed') { st.deploy = { stav: d.stav, commit: d.commit }; return selhani('deploy', d.duvod) }
if (d.commit && d.duvod !== 'beze změn') st.commity.push(d.commit)
st.deploy = { stav: d.stav, commit: d.commit }
log(`deploy: ${d.stav}, commit ${d.commit}`)
const se = await sestavE2E()
if (!se) return selhani('e2e', 'agent nesestavil E2E scénáře kolečka')
log(`E2E scénáře kolečka: ${se.kriterii} kritérií${se.poznamka ? ` (${S(se.poznamka).slice(0, 120)})` : ''}`)
const verdikt = e => (e.fail > 0 || (e.fail_kriteria || []).length) ? 'fail' : (e.vadna_kriteria || []).length ? 'vada-kriteria' : e.castecne > 0 ? 'pass-castecne' : 'pass'
const zapisE2E = e => { st.e2e = { vysledek: verdikt(e), celkem: e.celkem, pass: e.pass, castecne: e.castecne, fail: e.fail, castecna_kriteria: e.castecna_kriteria || [], vadna_kriteria: e.vadna_kriteria || [] } }
let e = await e2e(1)
if (!e) return selhani('e2e', 'verifikátor nevrátil výsledek')
st.reports.push(e.report_path); zapisE2E(e)
log(`E2E 1: ${verdikt(e)} (${e.pass}/${e.celkem}, částečně ${e.castecne}, fail ${e.fail}, vadná ${(e.vadna_kriteria || []).length})`)
if (verdikt(e) === 'fail') {
  const fe = await fixE2E(e, 1); sber(fe)
  const d2 = await deploy(2, 'oprava po E2E'); if (!d2 || d2.stav === 'failed') return selhani('deploy', d2 ? d2.duvod : 'deploy bez výsledku')
  if (d2.commit && d2.duvod !== 'beze změn') st.commity.push(d2.commit)
  d = d2; st.deploy = { stav: d.stav, commit: d.commit }
  e = await e2e(2)
  if (!e) return selhani('e2e', 'verifikátor nevrátil výsledek v kole 2')
  st.reports.push(e.report_path); zapisE2E(e)
  log(`E2E 2: ${verdikt(e)} (${e.pass}/${e.celkem}, fail ${e.fail})`)
  if (verdikt(e) === 'fail') return selhani('e2e', `FAIL kritéria po opravě: ${(e.fail_kriteria || []).join(' | ')}`)
}
if ((e.vadna_kriteria || []).length) {
  log(`E2E: ${e.vadna_kriteria.length} vadných kritérií, bez opravy, jdou k rozhodnutí`)
  st.rozhodnuti.push(...e.vadna_kriteria.map(k => `[vadné kritérium E2E kolečka] ${k} · návrh: kritérium přepsat nebo vyřadit, chování nechat`))
}
st.follow_ups.push(...(e.kosmeticke || []).map(k => `[E2E kosmetika kolečko] ${k}`))
if ((e.zavazne_mimo_ak || []).length) {
  log(`E2E: ${e.zavazne_mimo_ak.length} závažných nálezů mimo kritéria, oprava samostatným commitem`)
  const fs = await fixSecurityE2E(e); sber(fs)
  const d3 = await deploy(3, 'bezpečnostní oprava po E2E'); if (d3 && d3.stav !== 'failed') { d = d3; st.deploy = { stav: d.stav, commit: d.commit } } else log('deploy bezpečnostní opravy selhal, zůstává v pracovním stromě jako follow-up')
}

// ---------- 6. závěr ----------
phase('Závěr')
const kola = `thermo ${st.thermo.nalezu}/${st.thermo.blokeru} (opraveno ${st.thermo.opraveno}); kolo 1 ${st.review.kolo1.nalezu} nálezů, ${st.review.kolo1.blokujicich} blokujících, ${st.review.kolo1.fix_agentu} fix agentů; kolo 2 ${st.review.kolo2.cocek} čoček, ${st.review.kolo2.nalezu} nálezů → opravit ${st.review.kolo2.opravit_ted}, follow-up ${st.review.kolo2.follow_up}, odmítnuto ${st.review.kolo2.odmitnuto}; bezpečnost ${st.security.nalezu} nálezů, ${st.security.blokujicich} blokujících, commity ${cisty(st.security.commity).length}`
const c = await close({ kola, commity: cisty([...st.commity, ...st.security.commity]), metodiky, odmitnute: cisty(st.odmitnute), rozhodnuti: cisty(st.rozhodnuti), follow_ups: cisty(st.follow_ups), e2e: `${st.e2e.vysledek} ${st.e2e.pass}/${st.e2e.celkem}${st.e2e.castecne ? ` (částečně ${st.e2e.castecne})` : ''}` })
st.review_passed = !!(c && c.ok && c.review_passed)
if (!st.review_passed) log(`závěr: marker docs/.review-passed nevznikl${c && c.poznamka ? ` (${S(c.poznamka).slice(0, 120)})` : ''}`)
const cz = await commit('závěr', 'kolecko: závěr', 'Závěr')
if (cz && cz.stav !== 'failed' && cz.commit && cz.duvod !== 'beze změn') st.commity.push(cz.commit)
else if (!cz || cz.stav === 'failed') log(`závěr: commit docs selhal (${cz ? S(cz.duvod).slice(0, 120) : 'bez výsledku'}), dokumenty zůstávají v pracovním stromě`)
log(`kolečko hotové: ${cisty([...st.commity, ...st.security.commity]).length} commitů, ${cisty(st.rozhodnuti).length} rozhodnutí, review_passed ${st.review_passed}`)
return navrat('hotovo', '', '')
