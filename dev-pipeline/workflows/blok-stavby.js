export const meta = {
  name: 'blok-stavby',
  description: 'dev-pipeline blok stavby jednoho řezu: refresh PRD nad dnešním stromem (když PRD zestárlo), implementace (malý řez jedním agentem, velký řez kontraktem, souběžnými částmi spouštěnými hned po svých závislostech a integrací), thermo a code-review souběžně (u částí po částech plus integrační review) s opravami po sloučených balíčcích (max 2 kola, poslední zúžením), brána testů s exit kódem, kontrolami pre-commitu a měřidly kritérií (jediná plná suita), deploy s kroky po nasazení a zápisem nasazení, E2E s verdiktem z počtů a stavem „vada kritéria“, uzavření s ověřením commitů a sesouhlasením thermo a dokladů. Až 3 pokusy, diagnóza před třetím; infra selhání nasazení blok zastaví bez pokusu; agent, který práci předá, dostane nástupce.',
  whenToUse: 'Spouští orchestrátor /dev-pipeline:orchestrate po schválení PRD řezu. args: {cwd, plugin_root, vize, rez, prd_path, e2e_path, hypotezy, ne_cile, prd_stale, mazane_pozdeji, deploy_okno, runtime_dopad, runbook, deploy_mode, app_pristup, profil, doklad_pred, kriteria, e2e_sekce, casti, kontrakt_potreba, mapa_kostry, max_pokusu, obnova}. casti prázdné nebo chybí = malý řez (cyklus v zavisi_na = okamžité selhání bez pokusu); max_pokusu 1–3 (výchozí 3); obnova {od_faze, znacka, pokus} po zastavení (od_faze i jako titul fáze, pokus = pokus, ve kterém běh spadl; bez něj značka od pokusu 1). Bez args nic nedělá.',
  phases: [
    { title: 'Refresh PRD', detail: 'jen když od PRD zestárl strom: delta prd-check kritérií závislých na stromu (kostra i části), zapracování' },
    { title: 'Kontrakt', detail: 'jen řez s částmi a kontraktem: schéma, typy, signatury a registrace; těla částí hlásí „neimplementováno“' },
    { title: 'Implementace', detail: 'malý řez: TDD podle PRD; řez s částmi: oprava po selhání za implementací' },
    { title: 'Části', detail: 'části souběžně, každá startuje hned po svých závislostech a jen ve svých souborech; hotová část se v dalším pokusu neopakuje' },
    { title: 'Integrace', detail: 'typecheck celého repa, švy mezi částmi, požadavky mimo hranici, zbytky „neimplementováno“' },
    { title: 'Review', detail: 'thermo a code-review souběžně (u částí po částech plus integrační review), opravy po sloučených balíčcích (thermo nálezy v téže vlně), nejvýš 2 kola, poslední várka zúžením; lehký profil bez thermo a s jedním kolem' },
    { title: 'Brána', detail: 'typecheck, plná suita jednou, kontroly pre-commitu a měřidla kritérií; zelená jen s exit kódem 0 a prošlými testy, jedna oprava; zelená zapíše marker docs/.verify-passed' },
    { title: 'Doklad', detail: 'jen když PRD předepisuje doklad před migrací: snímek dotčených dat před nasazením' },
    { title: 'Deploy', detail: 'commit řezu (bezpečnostní opravy samostatně), nasazení podle projektu, kroky po nasazení z PRD, zápis nasazení; migrace jen s dokladem; infra selhání blok zastaví' },
    { title: 'E2E', detail: 'akceptační kritéria proti běžící aplikaci; sekce po nejvýš 12 kritériích na verifikátor, kolo 2 jen nad FAIL' },
    { title: 'Diagnóza', detail: 'před 3. pokusem: reprodukce a příčina' },
    { title: 'Uzavření', detail: 'ověření commitů, PRD status, journal, follow-ups' },
  ],
}

// ---------- vstup ----------
let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch { a = null } }
if (!a || typeof a !== 'object' || !a.cwd || a.rez == null || a.rez === '' || !a.prd_path || !a.vize) {
  log('blok-stavby: chybí args (cwd, vize, rez, prd_path) – nic se nespustilo')
  return { ok: false, duvod: 'chybí args: cwd, vize, rez, prd_path' }
}
const S = v => String(v == null ? '' : v)
const pole = x => Array.isArray(x) ? x : (x == null || x === '' ? [] : [x])
const trimList = xs => [...new Set(pole(xs).map(x => S(x).trim()).filter(Boolean))]
const NN = String(a.rez).padStart(2, '0')
const cwd = S(a.cwd)
const norm = f => S(f).trim().replace(`${cwd}/`, '')
const cesty = xs => trimList(pole(xs).map(norm))
// Cesty ze „soubor a symbol“ (zmenena_mista): část před dvojtečkou nebo mezerou, jen když vypadá jako cesta (lomítko nebo
// přípona). Deploy podle souborů pozná, zda bezpečnostní oprava jde samostatným commitem; v revizi 1.4.0 dostal „soubor: symbol“.
const cestyZ = xs => cesty(pole(xs).map(m => norm(m).split(/[\s:,;()]/)[0]).filter(x => /\//.test(x) || /\.[A-Za-z0-9]{1,8}$/.test(x)))
// Pravidla běhu (KONTRAKT.md: soubory, frontmatter PRD, vize-spory). V rámci se nejmenují „kontrakt“: agent v roli kontrakt řezu
// s částmi by dostal dva různé kontrakty (tento soubor a sekci Kontrakt kostry PRD).
const pravidlaBehu = a.plugin_root ? `${a.plugin_root}/skills/orchestrate/KONTRAKT.md` : null
const prdPath = S(a.prd_path), e2ePath = S(a.e2e_path || `${cwd}/docs/e2e/rez-${NN}.md`)
const runtimeDopad = a.runtime_dopad !== false
const deployMode = a.deploy_mode === 'commit-only' ? 'commit-only' : 'config'
const runbook = a.runbook ? S(a.runbook) : null
const appPristup = a.app_pristup ? S(a.app_pristup) : null
const hypIn = a.hypotezy
const hyp = hypIn && typeof hypIn === 'object' && !Array.isArray(hypIn) && hypIn.report ? { report: S(hypIn.report), ids: hypIn.ids || [] } : null
// Volný text orchestrátora (stav stromu po předchozím řezu, rozhodnutí uživatele): string, pole vět, nebo hypotezy.text
const hypText = !hypIn ? '' : typeof hypIn === 'string' ? hypIn : (t => Array.isArray(t) ? t.map(S).filter(Boolean).join(' | ') : (t ? S(t) : ''))(Array.isArray(hypIn) ? hypIn : hypIn.text)
// Ne-cíle vize (text) vidí každá fáze, ne jen implementace: fix, thermo, code-review i E2E soudí i proti nim.
const neCile = a.ne_cile ? S(a.ne_cile).slice(0, 1500) : ''
// Řezy uzavřené od startu bloku PRD tohoto řezu (každý s oblastmi): neprázdné = PRD vzniklo nad starším stromem.
const prdStale = (Array.isArray(a.prd_stale) ? a.prd_stale.map(S).filter(Boolean) : (a.prd_stale ? [S(a.prd_stale)] : [])).slice(0, 12)
// Co maže pozdější řádek plánu: implementace tam nepřidává symboly ani testy.
const mazane = (Array.isArray(a.mazane_pozdeji) ? a.mazane_pozdeji.map(S).filter(Boolean) : []).slice(0, 12)
// Mapa sekcí kostry PRD z bloku PRD (řádky „od-do ## Sekce“): kdo kostru čte, čte ji po sekcích (běh web-podzim: 92 celých
// čtení kostry o 35–84 kB v bloku PRD). Bez mapy se pokyn vynechá.
const mapaKostry = a.mapa_kostry ? S(a.mapa_kostry).trim().slice(0, 3000) : ''
const mapaText = mapaKostry ? `Kostru PRD čti po sekcích podle mapy (Read s offset/limit), ne celou: ${mapaKostry}\n` : ''
// Zakázané okno nasazení z runbooku projektu (text), deploy čeká s rezervou.
const deployOkno = a.deploy_okno ? S(a.deploy_okno).slice(0, 300) : ''
// Lehký profil (řádek plánu `profil: lehký`, nebo orchestrátor u řezu bez runtime dopadu): bez thermo, jedno kolo review.
const profil = a.profil === 'lehky' ? 'lehky' : 'plny'
// Doklad před nasazením: PRD ho předepsalo (migrace mění nebo maže existující data, nebo je nevratná); má smysl jen když blok nasazuje.
const dokladPred = Boolean(a.doklad_pred) && runtimeDopad && deployMode !== 'commit-only'
const dokladPath = `${cwd}/docs/e2e/rez-${NN}-doklad-pred.md`
const nasazeniPath = `${cwd}/docs/e2e/rez-${NN}-nasazeni.md`
const kriteria = Number(a.kriteria) || 0
// Sekce E2E scénářů z bloku PRD, nově s počtem kritérií ({nazev, kriterii}); staré pole řetězců počty nenese.
const e2eSekce = pole(a.e2e_sekce).map(x => {
  if (!x || typeof x !== 'object') return { nazev: S(x).trim(), kriterii: null }
  const k = Number(x.kriterii)
  return { nazev: S(x.nazev).trim(), kriterii: x.kriterii != null && x.kriterii !== '' && Number.isFinite(k) ? Math.max(0, Math.floor(k)) : null }
}).filter(s => s.nazev).slice(0, 26)
const PISMENA = 'abcdefghijklmnopqrstuvwxyz'
// Verifikátoři E2E: sekce hladově v pořadí do skupin po nejvýš 12 kritériích, sekce nad 12 kritérií jde sama; kolik skupin,
// tolik souběžných verifikátorů (v běhu doplneni-webu stály velké řezy 49–70 min v jednom verifikátorovi). Bez počtů (staré
// pole řetězců) jako dřív dvě půlky, jen nad 12 kritérií a s aspoň dvěma sekcemi. Jedna skupina = jeden verifikátor bez sekcí.
const e2eSkupiny = (() => {
  if (!runtimeDopad || e2eSekce.length < 2) return []
  if (e2eSekce.some(s => s.kriterii == null)) {
    if (kriteria <= 12) return []
    const pul = Math.ceil(e2eSekce.length / 2)
    return [e2eSekce.slice(0, pul), e2eSekce.slice(pul)].map(g => g.map(s => s.nazev))
  }
  const out = []
  let cur = null
  for (const s of e2eSekce) {
    if (s.kriterii > 12) { out.push({ sekce: [s.nazev], soucet: s.kriterii }); cur = null }
    else if (cur && cur.soucet + s.kriterii <= 12) { cur.sekce.push(s.nazev); cur.soucet += s.kriterii }
    else { cur = { sekce: [s.nazev], soucet: s.kriterii }; out.push(cur) }
  }
  // Nejdelší skupina první: při stropu souběhu Workflow se dlouhý verifikátor nesmí řadit na konec dávky (běh web-podzim).
  return out.length >= 2 ? [...out].sort((x, y) => y.soucet - x.soucet).map(g => g.sekce) : []
})()
// Části řezu z bloku PRD (kostra + PRD části, každá s vlastními soubory, kritérii a závislostmi); prázdné pole = malý řez,
// jedna implementace jako dřív. Řez 18 běhu bez-dluhu (15 k řádků) stavěl jeden implement agent 258 min a zkompaktoval se 8×;
// část do ~1,5 k řádků unese jeden agent a nezávislé části běží souběžně.
const casti = []
for (const c of pole(a.casti)) {
  const id = c && typeof c === 'object' ? S(c.id).trim() : ''
  // Zahozená část je nález: řez postaví méně, než PRD slibuje, a bez záznamu v logu to nikdo nepozná.
  if (!id) { log(`část bez id zahozena (${S(c && c.nazev).trim().slice(0, 80) || 'bez názvu'})`); continue }
  if (casti.some(x => x.id === id)) { log(`duplicitní část ${id} zahozena (${S(c.nazev).trim().slice(0, 80) || 'bez názvu'}); platí první část s tímto id`); continue }
  casti.push({ id, nazev: S(c.nazev).trim() || id, soubory: cesty(c.soubory), kriteria: trimList(c.kriteria), prd_path: S(c.prd_path).trim(), zavisi_na: trimList(c.zavisi_na), odhad: Math.max(0, Number(c.odhad_radku) || 0) })
}
// Závislost na neznámé části (nebo na sobě) by část navždy zablokovala: vypadne s poznámkou v logu.
// „Kontrakt“ v zavisi_na je samozřejmost (kontrakt běží vždy před částmi), ne neznámá část: tiše pryč (běh web-podzim, řez 04
// měl Kontrakt u všech částí a log hlásil čtyři „neznámé závislosti“).
for (const c of casti) {
  c.zavisi_na = c.zavisi_na.filter(z => !/^kontrakt$/i.test(z) || casti.some(x => x.id === z))
  const nezname = c.zavisi_na.filter(z => z === c.id || !casti.some(x => x.id === z))
  if (nezname.length) { log(`část ${c.id}: neznámé závislosti ${nezname.join(', ')} vynechány`); c.zavisi_na = c.zavisi_na.filter(z => !nezname.includes(z)) }
}
// Topologické řazení (DFS) před prvním pokusem: cyklus v zavisi_na je vada vstupu, žádná část cyklu se nikdy nespustí a každý
// pokus skončí stejně (revize 1.4.0: K1 ↔ K2 spotřebovalo tři pokusy i diagnózu). Blok skončí hned, oprava patří do tabulky Části.
const cyklus = (() => {
  const stavUzlu = new Map(), cesta = []
  const dfs = c => {
    stavUzlu.set(c.id, 'otevreny'); cesta.push(c.id)
    for (const z of c.zavisi_na) {
      if (stavUzlu.get(z) === 'otevreny') return [...cesta.slice(cesta.indexOf(z)), z]
      if (!stavUzlu.has(z)) { const r = dfs(casti.find(x => x.id === z)); if (r) return r }
    }
    stavUzlu.set(c.id, 'hotovy'); cesta.pop()
    return null
  }
  for (const c of casti) if (!stavUzlu.has(c.id)) { const r = dfs(c); if (r) return r }
  return null
})()
if (cyklus) {
  const detail = `cyklus v zavisi_na: ${cyklus.join(' → ')}`
  log(`${detail}; blok nic nespustil (pokus ani diagnóza cyklus neodstraní, oprava patří do tabulky Části v kostře PRD)`)
  return { ok: true, rez: NN, vysledek: 'selhalo', pokusy: 0, faze: 'implementace', detail, diagnoza: null, follow_ups: [], spory: [], reports: [], rozhodnuti: [], odmitnute: [], security_commity: [], casti: casti.map(c => ({ id: c.id, hotovo: false })), predavky: 0 }
}
const sCastmi = casti.length > 0
const kontraktPotreba = sCastmi && Boolean(a.kontrakt_potreba)
const prdCasti = casti.map(c => c.prd_path).filter(Boolean)
const prdVse = sCastmi ? `kostra ${prdPath} a části ${prdCasti.join(', ') || '(cesty v kostře)'}` : prdPath
// Mini-řez z finální fáze vize posílá max_pokusu 1 (v běhu bez-dluhu běžel řez 24 dvakrát, protože strop 3 byl natvrdo).
const MAX_POKUSU = Math.floor(Math.min(3, Math.max(1, Number(a.max_pokusu) || 3)))
// Obnova po zastavení: orchestrátor obnovuje blok přes resumeFromRunId a nezměněný prompt se vrátí z cache (v kolečku
// běhu bez-dluhu se tak z cache vrátila i červená brána). Fáze od od_faze dál proto dostanou značku a přeměří dnešní stav.
// Nepovinné obnova.pokus omezí značku na pokusy od přerušeného dál: dřívější pokusy se vrátí z cache.
const FAZE_OBNOVY = ['refresh', 'implementace', 'review', 'brana', 'doklad', 'deploy', 'e2e', 'uzavreni']
// od_faze přijde i s diakritikou nebo jako titul fáze z /workflows („Brána“, „Uzavření“, „Refresh PRD“): normalizace jako
// bezDiakritiky v kolečku (revize 1.4.0: „brána“ blok nepoznal a běžel bez značky, brána i deploy by se vrátily z cache).
// Tituly podfází implementace (Kontrakt, Části, Integrace, Diagnóza) jsou implementace, faze deploy-infra ze zastavení je deploy.
const bezDiakritiky = v => S(v).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const TITULY_OBNOVY = { 'refresh prd': 'refresh', kontrakt: 'implementace', casti: 'implementace', integrace: 'implementace', diagnoza: 'implementace', 'deploy-infra': 'deploy' }
const obnova = a.obnova && typeof a.obnova === 'object' ? a.obnova : null
const obnovaFaze = obnova ? FAZE_OBNOVY.indexOf((f => TITULY_OBNOVY[f] || f)(bezDiakritiky(obnova.od_faze))) : -1
// Neznámá fáze přeměří všechno od refresh: běh bez značky vrátí z cache i červenou bránu (třída B1), přeměření stojí jen čas.
const obnovaOd = obnova ? Math.max(0, obnovaFaze) : -1
const obnovaZnacka = obnova ? S(obnova.znacka).trim() || 'obnova' : ''
const obnovaPokus = obnova ? Math.max(1, Math.floor(Number(obnova.pokus)) || 1) : 1
if (obnova && obnovaFaze < 0) log(`obnova: neznámá fáze „${S(obnova.od_faze)}“ (platí ${FAZE_OBNOVY.join(', ')}); značka platí od refresh, přeměří se všechno`)
// Bez pokusu blok neví, ve kterém pokusu běh spadl: značku dostanou i pokusy, které v přerušeném běhu doběhly, a přehrají se
// znovu místo z cache (E2E, oprava a deploy navíc). Hlasitě, ať to orchestrátor v logu vidí a příště pokus pošle.
if (obnova && !(Math.floor(Number(obnova.pokus)) >= 1)) log(`obnova bez pokusu: značka platí od pokusu 1, pokusy doběhlé v přerušeném běhu se přehrají znovu místo z cache; pošli obnova.pokus (číslo pokusu, ve kterém běh spadl)`)
// Číslo pokusu je v názvu reportu: pokus 2 nepřepisuje reporty pokusu 1.
let P = 1
const rep = (typ, kolo) => `${cwd}/docs/reviews/rez-${NN}-p${P}-${typ}-kolo-${kolo}.md`

// ---------- stav napříč pokusy ----------
// Pracovní strom nese práci hotových částí dál, takže hotová část se v dalším pokusu neopakuje: v pokusu 2 běží jen
// selhaná část a ty, které na ní čekají. Kontrakt a integrace se stejně tak dělají, dokud jednou neuspějí.
const castiStav = new Map(casti.map(c => [c.id, { hotovo: false, zrevidovano: false, soubory: [], mimo: [], selhani: '', vysledek: null }]))
// Selhání kontraktu jde dalšímu pokusu stejně jako selhání integrace (revize 1.4.0: kontrakt pokusu 2 o pádu pokusu 1 nevěděl).
let kontraktHotovo = false, kontraktVysledek = null, kontraktSelhani = ''
let integraceHotovo = false, integraceVysledek = null, integraceSelhani = ''
// Selhání za implementací (brána, doklad, deploy, E2E), které má další pokus řezu s částmi opravit; hotové části se znovu nestaví.
let opravaZ = null
// Revize řezu s částmi z pokusů, které padly až za review: část projde review jednou a další pokus ji znovu neposoudí, takže
// její thermo report, odmítnuté nálezy, opravy jinou příčinou a počty patří i do uzavření pozdějšího pokusu (revize 1.4.0:
// uzavření pokusu 2 nedostalo thermo report části K1 ani blokující nález odmítnutý v pokusu 1 a návrat hlásil thermo null).
const revizeDrive = []

// Bezpečnostní opravy čekají na commit deployem napříč pokusy: oprava z pokusu, který padl před deployem, leží necommitnutá
// v pracovním stromě a commitne ji až deploy dalšího pokusu (revize 1.4.0: v pokusu 2 se ztratila). Deduplikace podle popisu:
// výsledky hotových částí se sbírají v každém pokusu znovu a deploy pokusu 2 dostal tutéž opravu podruhé.
const securityOpravy = [], securityCommity = []
let secOdeslano = 0
// Historie nasazení bloku napříč pokusy (běh web-podzim: návrat nesl jen health posledního nasazení, takže orchestrátor u řezu 03
// neviděl, že první nasazení admin nasadilo) a doklad před migrací pořízený jednou za blok (řez 04: pokus 2 doklad přepsal).
const nasazeniHist = []
let dokladCesta = ''
const pridejSec = o => { if (o.popis && !securityOpravy.some(x => x.popis === o.popis)) securityOpravy.push(o) }

// ---------- pomocné ----------
const cekej = ms => (ms > 0 && typeof setTimeout === 'function') ? new Promise(r => setTimeout(r, ms)) : Promise.resolve()
async function run(prompt, opts) {
  const label = opts.label || 'agent'
  for (let i = 0; i <= 2; i++) {
    let r = null
    // Restart od nuly nezná stav předchůdce (třída C2: restartovaný agent řezu 16 CK-Go2 našel nevrácenou mutaci jen náhodou).
    const p = i >= 1 ? `${prompt}\n\nPředchozí běh tohoto zadání skončil bez výsledku a pracovní strom může nést jeho rozdělanou práci: začni inventurou (git status, git diff --stat) a navaž na ni, nezačínej od nuly.` : prompt
    try { r = await agent(p, opts) } catch (e) { log(`${label}: spuštění selhalo (${String(e && e.message || e).slice(0, 120)})`) }
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
// Fáze toku, ve které se právě spouští (pro značku obnovy); vstup() ji nastaví spolu s fází zobrazení.
let fazeObn = ''
const vstup = (titul, faze) => { phase(titul); fazeObn = faze }
// Všechna volání agentů jdou přes spust(): předávka a značka obnovy na konci zadání. Deploy po obnově může najít commit řezu
// a fix(security) z přerušeného běhu (infra pád po commitu): bez věty by je commitnul podruhé (revize 1.4.0).
const OBNOVA_COMMITU = ' Commit řezu nebo fix(security) z přerušeného běhu může už existovat (git log --grep): nový nedělej, vrať jejich hashe; změny pracovního stromu, které v nich nejsou, commitni dalším commitem.'
const spust = (prompt, opts) => runSePredavkou(obnovaOd >= 0 && P >= obnovaPokus && FAZE_OBNOVY.indexOf(fazeObn) >= obnovaOd
  ? `${prompt}\nObnova běhu (${obnovaZnacka}): výsledek této fáze z přerušeného běhu neplatí; změř a proveď ji znovu nad dnešním stavem.${opts.agentType === 'dev-pipeline:deploy' ? OBNOVA_COMMITU : ''}` : prompt, opts)
const ramec = [
  `Projekt: ${cwd} (absolutní cesty; commity jen na vize větvi, nikdy na main).`,
  `Řez ${NN}: PRD ${prdPath} · E2E ${e2ePath} · vize ${a.vize}${pravidlaBehu ? ` · pravidla běhu (soubory, frontmatter PRD, vize-spory): ${pravidlaBehu}` : ''}.`,
  'Běh je autonomní: uživatele se neptáš. Rozpor s vizí zapiš do docs/vize-spory.md, rozhodni konzervativně a pokračuj. Vykonáváš jen svou fázi; následné a kontrolní fáze spouští workflow.',
  ...(neCile ? [`Ne-cíle vize platí pro každou fázi včetně oprav (změna, která je porušuje, se nedělá; nález jde do follow-upu s důvodem): ${neCile}`] : []),
  ...(mazane.length ? [`Pozdější řádek plánu maže: ${mazane.join(' · ')}. Nepřidávej tam symboly, testy ani závislosti; co tam řez potřebuje, patří jinam.`] : []),
  'docs/handoff.md je stav orchestrátora, ne tvůj vstup: nečti ho; co máš vědět, je v tomto zadání.',
  'Tah končí jen strukturovaným návratem. Na proces, který jsi pustil na pozadí, nečekáš ukončením tahu: počkej na něj v tomtéž tahu (vlastní dlouhý příkaz přes `Monitor`, vnější stav jako nasazení smyčkou s pevným počtem iterací), nebo ho ukonči. Jedno čekací volání trvá nejvýš 4,5 minuty: cache agenta žije 5 minut a delší pauza zapíše celý kontext znovu. Dlouhý proces kontroluj opakovaně kratšími voláními se stropem iterací, ne jednou smyčkou na 10 minut. Smyčka bez stropu je zakázaná: po timeoutu se přesune na pozadí a přežije tě.',
  'Soubor, který pojmenováváš sám, pojmenuj česky podle vzoru rez-NN-<co>.md; Claude Code subagentům blokuje zápis markdownu se jmény summary, findings, analysis a report-….',
  'Tvůj finální výstup je strukturovaný návrat (schéma je vynucené). Do textových polí piš stručně; co se nevejde, napiš do souboru v docs/reviews/ a vrať cestu.',
].join('\n')
const M = { opusH: { model: 'opus', effort: 'high' }, opusM: { model: 'opus', effort: 'medium' }, sonL: { model: 'sonnet', effort: 'low' }, sonM: { model: 'sonnet', effort: 'medium' } }

// ---------- schémata ----------
const str = d => ({ type: 'string', description: d })
const arr = d => ({ type: 'array', items: { type: 'string' }, description: d })
const PREDAVKA = { predavka: str('jen cesta k TVÉ předávce (docs/reviews/predavka-<tvoje agent id>.md), když tě vyzvala zpráva PŘEDÁVKA a práce ještě není hotová; když je zadání hotové, nevyplňuj; cestu předávky předchůdce sem nikdy nevracej') }
const IMPL = { type: 'object', required: ['stav', 'souhrn', 'typecheck', 'testy_zelene'], properties: {
  stav: { type: 'string', enum: ['hotovo', 'castecne', 'selhalo'] },
  souhrn: str('max 10 řádků: co je postavené, čím je to ověřené'),
  oblasti: arr('změněné oblasti nebo moduly (ne výčet souborů)'),
  soubory: arr('změněné a nové soubory, cesty relativní ke kořeni projektu'),
  mimo_hranici: { type: 'array', items: { type: 'object', required: ['soubor', 'co'], properties: { soubor: { type: 'string' }, co: { type: 'string', description: 'co a proč' } } }, description: 'jen část řezu: potřebné změny mimo tvé soubory (jiná část, kontrakt, sdílený soubor); provede je integrace' },
  zmenena_mista: arr('soubor a symbol nebo oblast, kde jsi měnil'),
  typecheck: { type: 'boolean' }, testy_zelene: { type: 'boolean' }, novych_testu: { type: 'integer' },
  odchylky_od_prd: arr('vědomé odchylky od PRD a proč'),
  pasti_opravene: arr('pasti v kódu, které jsi místo dokumentování opravil'),
  follow_ups: arr('resty mimo rozsah řezu, každý jednou větou s kontextem'),
  spory: arr('nové záznamy ve vize-spory'),
  souhrn_path: str('cesta k delšímu souhrnu v docs/reviews/, když byl potřeba'),
  ...PREDAVKA,
} }
// Soubory nápravy nálezu BLOCKER/HIGH: náprava strukturálního nálezu často leží jinde než nález (běh web-podzim: ~35 z 53
// odmítnutých nálezů bylo „mimo mé soubory“, protože balíček dostal soubor s nálezem, ne soubor s nápravou).
const NAPRAVY = { type: 'array', items: { type: 'object', required: ['id', 'soubory'], properties: { id: { type: 'string' }, soubory: arr('soubory, které náprava nálezu mění (nemusí to být soubor s nálezem), cesty relativní ke kořeni projektu') } }, description: 'jen nálezy BLOCKER a HIGH: kde leží jejich náprava' }
const THERMO = { type: 'object', required: ['blokeru', 'nalezu', 'report_path', 'soubory'], properties: { blokeru: { type: 'integer', description: 'nálezy, které rubrika označuje za blokující' }, nalezu: { type: 'integer' }, report_path: str('absolutní cesta k reportu'), soubory: arr('soubory s nálezy BLOCKER a HIGH, cesty relativní ke kořeni projektu'), napravy: NAPRAVY, souhrn: str('max 3 řádky'), ...PREDAVKA } }
const FIX = { type: 'object', required: ['opraveno', 'zmenena_mista', 'typecheck', 'testy_zelene'], properties: {
  opraveno: { type: 'integer' },
  odmitnuto: { type: 'array', items: { type: 'object', required: ['id', 'duvod'], properties: { id: { type: 'string' }, duvod: { type: 'string' }, blokuje: { type: 'boolean', description: 'nález byl BLOKUJE' } } }, description: 'nálezy, které jsi po ověření neopravil, s důvodem' },
  jinak_nez_nalez: arr('kde jsi opravil jinou příčinu, než nález tvrdil, a proč'),
  zmenena_mista: arr('soubor a symbol nebo oblast, kde jsi měnil'),
  rozsireny_zasah: { type: 'boolean', description: 'nový plošný mechanismus, sdílený layout či helper, nebo soubory mimo nálezy' },
  rozsireny_popis: str('co přesně a proč'),
  typecheck: { type: 'boolean' }, testy_zelene: { type: 'boolean' },
  follow_ups: arr('nálezy mimo rozsah řezu, které jsi neopravil'),
  security: { type: 'boolean', description: 'true = bezpečnostní oprava; necommituješ ji, commitne ji deploy samostatně' },
  ...PREDAVKA,
} }
const REVIEW = { type: 'object', required: ['nalezu', 'blokujicich', 'balicky', 'report_path'], properties: {
  nalezu: { type: 'integer' }, blokujicich: { type: 'integer' }, report_path: str('absolutní cesta k reportu'),
  balicky: { type: 'array', items: { type: 'object', required: ['soubory', 'nalezy'], properties: { soubory: arr('disjunktní množina souborů'), nalezy: arr('identifikátory nálezů z reportu'), security: { type: 'boolean' } } } },
  follow_up_ids: arr('nálezy, které nejsou k opravě v řezu (FOLLOW-UP)'),
  ...PREDAVKA,
} }
const VERIFY = { type: 'object', required: ['typecheck', 'proslo', 'selhalo', 'exit_kod', 'kontroly_ok', 'meridla_ok'], properties: {
  typecheck: { type: 'boolean' }, proslo: { type: 'integer' }, selhalo: { type: 'integer' },
  exit_kod: { type: 'integer', description: 'návratový kód příkazu testů (EXIT=$? čtený zvlášť, ne přes rouru)' },
  z_cache: { type: 'boolean', description: 'true = runner vrátil výsledek testů nebo typechecku z cache, měření neproběhlo' },
  kontroly: arr('kontroly z pre-commit hooku projektu s výsledkem'),
  kontroly_ok: { type: 'boolean', description: 'všechny kontroly z pre-commit hooku prošly; true, když projekt pre-commit hook nemá' },
  meridla: arr('ID · příkaz · výsledek · ok|FAIL'),
  meridla_ok: { type: 'boolean', description: 'všechna měřidla kritérií prošla; true, když PRD žádné měřidlo nemá' },
  selhavajici: arr('jména selhávajících testů a chyby typecheck s file:line, max 20'), vystup_path: str('soubor s plným výstupem'), prikazy: arr('spuštěné příkazy'),
  marker: str('hash stromu z verify-marker.sh při zelené bráně, jinak prázdné'),
  ...PREDAVKA,
} }
const DEPLOY = { type: 'object', required: ['stav', 'commit'], properties: {
  stav: { type: 'string', enum: ['success', 'failed', 'commit-only'] },
  commit: str(`40 znaků: poslední commit „rez ${NN}“ (git log --grep), i když tento běh nový commit řezu nevytvořil (dorovnání prostředí, jen fix(security)); git rev-parse, nikdy commit zápisu nasazení, nikdy dopočítaný ani zkrácený`),
  commit_zapisu: str('hash samostatného commitu zápisu nasazení'),
  kroky_po_nasazeni: { type: 'array', items: { type: 'object', required: ['krok', 'stav'], properties: { krok: { type: 'string', description: 'text kroku z PRD, při každém nasazení stejný' }, stav: { type: 'string', enum: ['provedeno', 'selhalo', 'vynechano', 'pro-majitele'] }, duvod: { type: 'string' } } }, description: 'kroky ze sekce PRD „Nasazení a kroky po něm“: provedeno (proběhl a jeho ověření z PRD prošlo), selhalo (proběhl a ověření neprošlo), vynechano (nespustil se; s důvodem), pro-majitele (jen krok, který PRD výslovně vede jako ruční nebo neblokující krok majitele; blokující krok bez oprávnění je infra selhání)' },
  infra: { type: 'boolean', description: 'true = selhání mimo kód řezu: přihlášení nebo účet CLI, oprávnění, výpadek platformy; opakování pokusu bez zásahu člověka nepomůže' },
  report_path: str('absolutní cesta k zápisu nasazení'),
  security_commity: arr('hashe samostatných commitů fix(security)'),
  health: str('první řádek „aplikace: <app>@<verze nebo deployment id> nasazeno | <app> nenasazeno (<důvod z diffu>) | …“ za každou aplikaci, které se diff od báze dotkl; pak doklad, že běží: status platformy + behaviorální doklad (nebo odložený se změřenou baseline, nebo neexistuje s důvodem)'), url: str(''),
  duvod: str('při failed: přesná chyba'),
  ...PREDAVKA,
} }
const E2E = { type: 'object', required: ['vysledek', 'celkem', 'pass', 'castecne', 'fail', 'report_path'], properties: {
  vysledek: { type: 'string', enum: ['pass', 'pass-castecne', 'fail', 'vada-kriteria'] }, celkem: { type: 'integer' }, pass: { type: 'integer' }, castecne: { type: 'integer' }, fail: { type: 'integer' },
  fail_kriteria: arr('identifikátory a jednou větou co selhalo (skutečné selhání implementace)'), castecna_kriteria: arr('co se ověřilo jen zčásti a čím je nesena druhá půlka'),
  vadna_kriteria: arr('kritérium + doklad jednoho ze čtyř druhů: nesplnitelné v prostředí E2E (credential, měří se až po uzavíracím commitu) / koliduje s jiným kritériem nebo Ne-cílem vize / nález je předřezový (existoval před řezem) a řez ho nemá v rozsahu / scénář zastaral po opravě (odporuje odchylce od PRD nebo rozšířenému zásahu opravy ze zadání); nic jiného sem nepatří'),
  zavazne_mimo_ak: arr('bezpečnostní a datové nálezy mimo kritéria'), kosmeticke: arr('kosmetické regresní postřehy'), report_path: str('absolutní cesta k reportu'),
  prostredi: str('prázdné, když je prostředí v pořádku; jinak vada prostředí, kterou nemá opravovat fix agent: nasazená revize není commit řezu, aplikace nedostupná, přihlášení ze zadání nefunguje'),
  ...PREDAVKA,
} }
const DOKLAD = { type: 'object', required: ['ok', 'path'], properties: { ok: { type: 'boolean', description: 'true jen tehdy, když uspěl každý předepsaný bod dokladu' }, path: str('absolutní cesta k dokladu'), souhrn: str('max 5 řádků: co je zachyceno (tabulky, počty, vzorky) a čím'), duvod: str('při ok false: proč doklad nejde pořídit (chybí přístup, dotaz selhal)'), ...PREDAVKA } }
const DIAG = { type: 'object', required: ['pricina', 'doporuceni', 'smycka_postavena'], properties: { pricina: str('file:line + mechanismus'), doporuceni: str('co má třetí pokus udělat jinak'), smycka_postavena: { type: 'boolean' }, repro_path: str('cesta k reprodukčním artefaktům'), ...PREDAVKA } }
const CLOSE = { type: 'object', required: ['ok', 'thermo_nesesouhlaseno', 'chybejici_doklady'], properties: {
  ok: { type: 'boolean' }, poznamka: str('co se nepodařilo zapsat'),
  commit_overeny: str(`40 znaků: commit řezu ověřený git cat-file -t a zprávou „rez ${NN}“ (i když se shoduje se zadáním); nikdy dopočítaný`),
  chybejici_commity: arr('bezpečnostní commity ze zadání, které v repu neexistují'),
  thermo_nesesouhlaseno: { type: 'integer', description: 'nálezy BLOCKER/HIGH z thermo reportů, u kterých v journalu není ani „opraveno“, ani follow-up s odvozením' },
  chybejici_doklady: arr('artefakty, které PRD nebo vize předepisuje jako doklad řezu (měření, export, report v repu) a v commitu nejsou'),
  kontext: str(`souhrn záznamů řezu ${NN} z docs/.kontext.jsonl: nejvyšší hodnota podle typu agenta, počet compactů a předávek`),
  ...PREDAVKA,
} }
const CHECK = { type: 'object', required: ['verdikt', 'nalezu', 'blokujicich', 'report_path'], properties: {
  verdikt: { type: 'string', enum: ['ready', 'needs-fixes'] }, nalezu: { type: 'integer' }, blokujicich: { type: 'integer' },
  report_path: str('absolutní cesta k reportu'), nalezy_ids: arr('identifikátory nálezů v reportu (N1, N2, …), blokující první'),
  ...PREDAVKA,
} }
const PRD_FIX = { type: 'object', required: ['zmenena_mista'], properties: {
  zmenena_mista: arr('sekce nebo kritéria PRD/E2E, která se změnila'), odmitnute: { type: 'array', items: { type: 'object', required: ['id', 'duvod'], properties: { id: { type: 'string' }, duvod: { type: 'string' } } } },
  souhrn: str('max 5 řádků: co se v PRD změnilo a proč'), spory: arr('nové záznamy ve vize-spory'),
  ...PREDAVKA,
} }

// ---------- vyhodnocení ----------
// Zelená jen nad doloženým měřením: exit kód testů 0, aspoň jeden prošlý test, nic z cache, kontroly pre-commitu a měřidla kritérií
// (v běhu bez-dluhu pustila brána zelenou nad neproběhlou suitou a řez 20 padl na verify:arch, který brána nespustila).
const zelena = v => !!v && v.typecheck === true && v.selhalo === 0 && v.exit_kod === 0 && v.proslo > 0 && v.z_cache !== true && v.kontroly_ok !== false && v.meridla_ok !== false
const meridlaFail = v => { const m = trimList(v && v.meridla); const f = m.filter(x => /FAIL/.test(x)); return f.length ? f : m }
const branaDuvod = v => !v ? 'verify bez výsledku' : [
  v.typecheck !== true ? 'typecheck červený' : '',
  v.selhalo !== 0 ? `selhalo ${v.selhalo} testů` : '',
  v.exit_kod !== 0 ? `testy skončily kódem ${v.exit_kod}` : '',
  !(v.proslo > 0) ? 'žádný prošlý test (suita neproběhla)' : '',
  v.z_cache === true ? 'výsledek z cache (spusť s --force)' : '',
  v.kontroly_ok === false ? `kontroly pre-commitu: ${trimList(v.kontroly).slice(0, 8).join(' | ') || 'červené'}` : '',
  v.meridla_ok === false ? `měřidla: ${meridlaFail(v).slice(0, 8).join(' | ') || 'červená'}` : '',
].filter(Boolean).join('; ') || 'červená'
const normMimo = xs => pole(xs).map(m => m && typeof m === 'object' ? { soubor: norm(m.soubor), co: S(m.co).trim().slice(0, 400) } : { soubor: '', co: S(m).trim().slice(0, 400) }).filter(m => m.soubor || m.co)
// Krok po nasazení se stavem selhalo (proběhl, ověření z PRD neprošlo) nebo vynechano je selhání nasazení, když blok nasazoval
// (stav success): v řezu 1 běhu bez-dluhu deploy kroky z PRD vědomě vynechal a E2E pak dvakrát hlásilo vadu prostředí.
// Výjimky z běhu web-podzim: krok, který předchozí nasazení téhož řezu v tomto bloku provedlo, se nepouští znovu (řez 04 padl na
// krocích „provedeno v nasazení 1“ a pokus 2 přepsal doklad před migrací), a krok pro majitele (ruční nebo neblokující krok
// z PRD; blokující krok bez oprávnění je infra selhání) jde do rozhodnutí (řez 11 padl na ručním kroku, zatímco skutečné selhání ověření prošlo jako
// „provedeno“). Při commit-only nasazuje majitel a kroky po nasazení jsou jeho práce (revize 1.4.0).
// Párování kroků mezi nasazeními podle textu kroku z PRD (malá písmena, bez mezer na krajích).
const normKrok = s => S(s).trim().toLowerCase()
const provedeneKroky = new Map()
const krokyStav = (d, stav) => pole(d && d.kroky_po_nasazeni).filter(k => k && k.stav === stav)
const fmtKrok = k => `${S(k.krok)}${k.duvod ? ` (${S(k.duvod)})` : ''}`
const vynechane = d => krokyStav(d, 'vynechano').map(fmtKrok)
const chybneKroky = d => [...krokyStav(d, 'selhalo').map(k => `selhal ${fmtKrok(k)}`), ...krokyStav(d, 'vynechano').filter(k => !provedeneKroky.has(normKrok(k.krok))).map(k => `vynechán ${fmtKrok(k)}`)]
const chybaNasazeni = (d, k) => !d ? nic(`deploy:řez ${NN}:${k}`, 'deploy agent') : d.stav === 'failed' ? S(d.duvod) || 'deploy selhal' : d.stav === 'success' && chybneKroky(d).length ? `krok po nasazení: ${chybneKroky(d).join(' | ').slice(0, 600)}` : ''
const infra = d => !!(d && d.stav === 'failed' && d.infra)

// ---------- balíčky oprav ----------
// Balíčky z více review (u částí review každé části, integrační review a review opravy) se sloučí do disjunktních množin
// souborů jako v kolečku (třída L: nesloučený balíček rozbil bránu, která má jen jednu opravu, a pokus padl).
const balickyZ = r => (r && r.balicky || []).map(b => ({ soubory: cesty(b.soubory), security: !!b.security, zdroje: [{ report: S(r.report_path), ids: trimList(b.nalezy) }] })).filter(b => b.soubory.length)
function sluc(balicky) {
  const out = []
  for (const b of balicky) {
    const hity = out.filter(o => o.soubory.some(f => b.soubory.includes(f)))
    if (!hity.length) { out.push({ ...b, soubory: [...b.soubory], zdroje: [...b.zdroje] }); continue }
    // Balíček, který spojí dva dosavadní, je sloučí oba: výsledek zůstane disjunktní.
    const [cil, ...dalsi] = hity
    for (const o of [b, ...dalsi]) { cil.soubory = trimList([...cil.soubory, ...o.soubory]); cil.security = cil.security || o.security; cil.zdroje.push(...o.zdroje) }
    for (const o of dalsi) out.splice(out.indexOf(o), 1)
  }
  return out
}
// Thermo nálezy jdou do téže vlny. Nález s nápravou (napravy) je malý balíček se soubory nápravy, soubor s nálezem bez nápravy
// balíček o jednom souboru; sluc() je připojí k balíčkům, kterých se dotýkají. Náprava napříč dvěma balíčky je spojí do jednoho:
// fix agent smí jen soubory svého balíčku a tentýž nález nesmí opravovat dva agenti (běh web-podzim: řez 13 opravovali dva
// souběžně, ~35 nálezů fix odmítl jako „mimo mé soubory“). Vrací nové pole balíčků, vstup nemění.
const thermoSoubory = th => trimList([...cesty(th.soubory), ...pole(th.napravy).flatMap(x => cesty(x && x.soubory))])
function pridejThermo(balicky, th) {
  const report = S(th.report_path)
  const napravy = pole(th.napravy).filter(x => x && cesty(x.soubory).length)
  const sNapravou = new Set(napravy.flatMap(x => cesty(x.soubory)))
  const mini = [
    ...napravy.map(x => ({ soubory: cesty(x.soubory), security: false, zdroje: [{ report, ids: trimList([x.id]), thermo: true }] })),
    ...cesty(th.soubory).filter(f => !sNapravou.has(f)).map(f => ({ soubory: [f], security: false, zdroje: [{ report, ids: [], thermo: true }] })),
  ]
  return sluc([...balicky, ...mini])
}
const zdrojeText = zdroje => {
  const cr = new Map(), th = new Map()
  for (const z of zdroje) {
    if (z.thermo) th.set(z.report, trimList([...(th.get(z.report) || []), ...z.ids]))
    else cr.set(z.report, trimList([...(cr.get(z.report) || []), ...z.ids]))
  }
  return [...cr].map(([r, ids]) => ` Code-review report ${r}, tvoje nálezy: ${ids.join(', ') || 'všechny ve tvých souborech'}.`).join('')
    + [...th].map(([r, ids]) => ` Thermo report ${r}: ${ids.length ? `nálezy ${ids.join(', ')} (náprava je ve tvých souborech) a ostatní ` : 'nálezy '}BLOCKER a HIGH ve tvých souborech (NOTE jen když leží na místě, které stejně měníš); nezaváděj nové plošné mechanismy, sporné nech jako follow-up.`).join('')
}

// ---------- kroky ----------
// Refresh PRD: PRD vzniklo souběžně se stavbou předchozích řezů, tedy nad starším stromem. Delta prd-check jen nad
// kritérii a tvrzeními závislými na stavu stromu; při needs-fixes zapracování PRD agentem. Levnější než pokus navíc.
const refreshCheck = () => spust(`${ramec}

Úkol: delta prd-check PRD řezu ${NN} nad DNEŠNÍM stromem${sCastmi ? ` (${prdVse}; přeměř kostru a jen ty části, kterých se změny stromu týkají)` : ''}. PRD vzniklo před uzavřením těchto řezů: ${prdStale.join(' | ')}. Prověř VÝHRADNĚ kritéria a tvrzení PRD a E2E scénářů, která závisí na stavu stromu: výčty souborů a míst, počty, existence a jediné použití symbolů, premisy „jediný konzument“, cesty; každé takové kritérium přeměř spuštěním (rg, Serena, skript v repu), ne úsudkem. Osy A, D, E znovu nekontroluj.${mapaKostry ? ` Kostru PRD čti po sekcích podle mapy (Read s offset/limit), ne celou: ${mapaKostry}.` : ''}${hyp ? ` Zbylé nálezy kontroly PRD, které blok PRD neopravil (${hyp.report}, ${(hyp.ids || []).join(', ') || 'všechny'}), přeměř jako hypotézy nad dnešním stromem: blokující, který platí, zapiš do svého reportu jako nález (zapracování ho opraví), neplatný jmenuj v reportu jako ověřeně neplatný.` : ''} Report do ${rep('prd-refresh', 1)}, vrať verdikt, počty a identifikátory nálezů.`,
  { label: `prd-refresh:řez ${NN}`, phase: 'Refresh PRD', agentType: 'dev-pipeline:prd-check', schema: CHECK, ...M.opusM })

const refreshFix = k => spust(`${ramec}

Úkol: zapracuj do PRD řezu ${NN}${sCastmi ? ` (${prdVse})` : ''} nálezy delta kontroly nad dnešním stromem: ${k.report_path} (${(k.nalezy_ids || []).join(', ') || 'všechny'}). Každý nález je hypotéza: ověř proti kódu; co platí, oprav v PRD a E2E scénářích tak, aby kritéria měřila dnešní strom (výčet nahraď vlastností a měřidlem, počet přepočítej a uveď dotaz); co míří vedle, odmítni s důvodem. Rozsah řezu nerozšiřuj ani nezužuj; když nález žádá změnu rozsahu, zapiš do vize-spory a odmítni. Needituj nic jiného než PRD${sCastmi ? ' (kostru a části)' : ''} a E2E soubory řezu.`,
  { label: `prd-refresh-fix:řez ${NN}`, phase: 'Refresh PRD', agentType: 'dev-pipeline:prd', schema: PRD_FIX, ...M.opusH })

// Vstupy implementace společné malému řezu i částem: hypotézy (prd-check, refresh, orchestrátor) a diagnóza.
const hypotezyText = (refresh, jenSvoje) => `${hyp ? `Zbylé nálezy prd-checku jako hypotézy k ověření, ne fakta${jenSvoje ? ' (jen ty, které se týkají tvé práce)' : ''}: ${hyp.report} (${(hyp.ids || []).join(', ') || 'všechny'}).\n` : ''}${refresh ? `PRD bylo před stavbou přeměřeno nad dnešním stromem (${refresh.report_path}); zbylé nálezy (${(refresh.nalezy_ids || []).join(', ') || 'žádné'}) ber jako hypotézy.\n` : ''}${hypText ? `Hypotézy od orchestrátora k ověření, ne fakta (stav stromu po předchozím řezu, rozhodnutí uživatele): ${hypText.slice(0, 1500)}\n` : ''}`
const diagText = diag => diag ? `Diagnóza po dvou neúspěších (doložená příčina): ${S(diag.pricina).slice(0, 500)} · doporučení: ${S(diag.doporuceni).slice(0, 400)}\n` : ''
const pravidlaImpl = 'Hypotézy a follow-upy nikdy nerozšiřují rozsah PRD: co PRD nebo jeho kritéria zakazují, neděláš, i když to hypotéza navrhuje. Past v kódu, na kterou narazíš ve změněných souborech, oprav; mimo ně ji vrať jako follow-up „odstranit past X“. Testy piš k chování, ne k řezu; nepřidávej testovací soubory pojmenované po řezu. Měřidlo, které PRD předepisuje (skript v repu), spusť nad odevzdávaným stromem až na konci, ne uprostřed práce.'
const buildVerze = runbook ? ` Když postup nasazení (${runbook}) vyžaduje zvednutí build verze nebo markeru, udělej to teď jako součást řezu; při commitu se už nic nezvedá.` : ''

const impl = (n, predchozi, diag, refresh) => spust(`${ramec}

Úkol: implementuj řez ${NN} podle PRD (TDD červená až zelená, doktrína CLAUDE.md projektu, Serena na hledání symbolů). Pokus ${n} z ${MAX_POKUSU}.
${hypotezyText(refresh)}${predchozi ? `Předchozí pokus selhal ve fázi „${predchozi.faze}“: ${S(predchozi.detail).slice(0, 600)}. Pracovní strom obsahuje jeho stav; navaž na něj, nezačínej od nuly a nepoužívej git příkazy, které strom vracejí.\n` : ''}${diagText(diag)}${pravidlaImpl} Průběžně spouštěj jen dotčené testy; plnou suitu a typecheck celého projektu jednou, na konci.${buildVerze} Nespouštěj review, deploy ani E2E.`,
  { label: `implement:řez ${NN}:${n}`, phase: 'Implementace', agentType: 'dev-pipeline:implement', schema: IMPL, ...M.opusH })

// Kontrakt řezu s částmi: společné věci položí jeden agent před částmi, aby souběžní autoři nesahali na tentýž soubor.
const implKontrakt = (n, diag, refresh) => spust(`${ramec}

Úkol: kontrakt řezu ${NN}: polož společné věci ze sekce Kontrakt kostry PRD ${prdPath} (schéma a migrace, typy, signatury rozhraní mezi částmi, registrace tras); těla, která patří částem, nech vyhodit chybu „neimplementováno: část K“ (nebo ekvivalent v jazyce projektu); typecheck zelený; testy jen tam, kde kontrakt nese chování (migrace, validace); části neimplementuj; vrať změněné soubory. Pokus ${n} z ${MAX_POKUSU}.
${mapaText}${hypotezyText(refresh, true)}${kontraktSelhani ? `Kontrakt v minulém pokusu selhal: ${kontraktSelhani.slice(0, 600)}. Pracovní strom nese jeho rozdělanou práci; navaž na ni, nezačínej od nuly.\n` : ''}${diagText(diag)}Plnou suitu nespouštěj, pustí ji brána. Nespouštěj review, deploy ani E2E.`,
  { label: `implement:řez ${NN}:kontrakt:${n}`, phase: 'Kontrakt', agentType: 'dev-pipeline:implement', schema: IMPL, ...M.opusH })

const implCast = (c, n, diag, refresh) => {
  const st = castiStav.get(c.id)
  return spust(`${ramec}

Úkol: implementuj část ${c.id} (${c.nazev}) řezu ${NN} podle PRD části ${c.prd_path || '(cesta v kostře)'} a kostry ${prdPath} (z kostry čti Kontrakt, svůj řádek v Částech, svá kritéria${c.kriteria.length ? ` ${c.kriteria.join(', ')}` : ''} a společné sekce; sekce jiných částí přeskoč). ${kontraktPotreba ? 'Kontrakt už je v kódu.' : 'Řez samostatný kontrakt nemá.'} Hranice: měníš jen soubory a oblasti své části: ${c.soubory.join(', ') || '(podle PRD části)'}. Změnu jinde (jiná část, kontrakt, sdílený soubor) neprováděj, vrať ji v mimo_hranici (soubor, co a proč), provede ji integrace. Souběžně s tebou pracují ve stejném stromu jiné části: jejich soubory neupravuj, neformátuj, nevracej (git checkout, restore, stash) a nespouštěj nad nimi formátovač. Testy piš a pouštěj jen své (TDD); typecheck jen filtrovaný na svůj balíček nebo soubory; plnou suitu ani typecheck celého repa nespouštěj, patří integraci a bráně. Pokus ${n} z ${MAX_POKUSU}.
${mapaText}${hypotezyText(refresh, true)}${st.selhani ? `Tvoje část v minulém pokusu selhala: ${st.selhani.slice(0, 600)}. Pracovní strom nese její rozdělanou práci; navaž na ni, nezačínej od nuly.\n` : ''}${diagText(diag)}${pravidlaImpl}${runbook ? ' Build verzi ani marker v části nezvedáš, zvedne je integrace jednou za řez.' : ''} Nespouštěj review, deploy ani E2E.`,
    { label: `implement:řez ${NN}:část ${c.id}:${n}`, phase: 'Části', agentType: 'dev-pipeline:implement', schema: IMPL, ...M.opusH })
}

const implIntegrace = (n, diag) => {
  const ids = casti.map(c => c.id)
  const mimo = casti.flatMap(c => castiStav.get(c.id).mimo.map(m => ({ cast: c.id, ...m }))).slice(0, 40)
  return spust(`${ramec}

Úkol: integrace řezu ${NN} po částech ${ids.join(', ')}: spusť typecheck celého repa a testy dotčené všemi částmi (ne plnou suitu); sešij švy mezi částmi a kontraktem; proveď požadavky mimo hranici ${JSON.stringify(mimo)}, každý nejdřív ověř (je potřeba, neduplikuje existující); odstraň zbylé „neimplementováno: část“; nové chování nepřidávej; požadavek, který mění rozsah PRD, neprováděj a vrať jako odchylku. PRD: ${prdVse}. Pokus ${n} z ${MAX_POKUSU}.
${mapaText}${integraceSelhani ? `Integrace v minulém pokusu selhala: ${integraceSelhani.slice(0, 600)}. Pracovní strom nese její rozdělanou práci; navaž na ni.\n` : ''}${diagText(diag)}${buildVerze} Nespouštěj review, deploy ani E2E.`,
    { label: `implement:řez ${NN}:integrace:${n}`, phase: 'Integrace', agentType: 'dev-pipeline:implement', schema: IMPL, ...M.opusM })
}

// Oprava řezu s částmi po selhání za implementací: části jsou hotové a prošly review, znovu se nestaví.
const implOprava = (n, z, predchozi, diag) => spust(`${ramec}

Úkol: pokus ${n} řezu ${NN} po selhání ve fázi ${z.faze}: ${S(z.detail).slice(0, 800)}${diag ? ` · diagnóza: ${S(diag.pricina).slice(0, 500)} · doporučení: ${S(diag.doporuceni).slice(0, 400)}` : ''}; kód řezu je v pracovním stromě (kontrakt a všechny části hotové a prošly review); oprav příčinu, rozsah PRD nerozšiřuj; dotčené testy a typecheck, plnou suitu pustí brána; vrať zmenena_mista a soubory. PRD: ${prdVse}.${mapaKostry ? ` Kostru PRD čti po sekcích podle mapy (Read s offset/limit), ne celou: ${mapaKostry}.` : ''}${predchozi && predchozi !== z ? ` Předchozí oprava skončila bez úspěchu: ${S(predchozi.detail).slice(0, 400)}; pracovní strom nese její stav, navaž na něj.` : ''} Nepoužívej git příkazy, které strom vracejí. Nespouštěj review, deploy ani E2E.`,
  { label: `implement:řez ${NN}:oprava:${n}`, phase: 'Implementace', agentType: 'dev-pipeline:implement', schema: IMPL, ...M.opusH })

// Thermo bez části = celý pracovní strom (malý řez); s částí jen její soubory.
const thermo = (c, soubory) => spust(`${ramec}

Úkol: thermo-nuclear review ${c ? `části ${c.id} (${c.nazev}) řezu ${NN}: rozsah VÝHRADNĚ soubory části: ${soubory.join(', ')} (PRD části ${c.prd_path || 'v kostře'}); kontrakt a jiné části neposuzuj, strukturu napříč částmi posoudí integrační review` : `změn řezu ${NN} v pracovním stromě (diff si posbírej sám včetně netrackovaných souborů)`}. Suď proti rubrice, doktríně projektu a Ne-cílům vize z rámce, ne jen proti PRD: nový produkční kód, který PRD nežádá, nebo šev přidaný jen pro testy, je nález. Report do ${c ? rep(`thermo-cast-${c.id}`, 1) : rep('thermo', 1)}. Vrať počty, cestu, soubory s nálezy BLOCKER a HIGH a u každého takového nálezu soubory jeho nápravy v napravy (relativně ke kořeni projektu). Souběžně běží code-review téhož stromu; kód se nemění.`,
  { label: c ? `thermo:řez ${NN}:část ${c.id}` : `thermo:řez ${NN}`, phase: 'Review', agentType: 'dev-pipeline:thermo-nuclear-review', schema: THERMO, ...M.opusM })

const fixThermo = ths => spust(`${ramec}

Úkol: oprav strukturální nálezy thermo review řezu ${NN}: ${ths.map(t => t.report_path).join(', ')}. Meze: jen soubory tohoto řezu (pracovní strom), jen nálezy, které rubrika označuje za blokující nebo které máš po ověření za jisté; sporné a cizí nech jako follow-up. Nezaváděj nové plošné mechanismy. Spouštěj jen dotčené testy a typecheck; plnou suitu nespouštěj, patří bráně. Necommituj.`,
  { label: `fix-thermo:řez ${NN}`, phase: 'Review', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const review = (zadani, report, label) => spust(`${ramec}

Úkol: ${zadani} Report do ${report}. Vrať počty, disjunktní balíčky po souborech s identifikátory nálezů a cestu; nálezy samotné nevracej. Každý nález v reportu nese BLOKUJE NASAZENÍ nebo FOLLOW-UP; nad plochou, která zapisuje do produkce (migrace, deploy a datové skripty, mazání), je práh přísnější: i PLAUSIBLE nález tam BLOKUJE.`,
  { label, phase: 'Review', agentType: 'dev-pipeline:code-review', schema: REVIEW, ...M.opusH })
const reviewRez = () => review(`code-review řezu ${NN}, kolo 1. Rozsah: pracovní strom (celá změna řezu včetně netrackovaných souborů).`, rep('code-review', 1), `review:řez ${NN}:1`)
const reviewCast = (c, soubory) => review(`code-review části ${c.id} (${c.nazev}) řezu ${NN}, kolo 1. Rozsah: VÝHRADNĚ soubory části: ${soubory.join(', ')} (PRD části ${c.prd_path || 'v kostře'}); kontrakt a jiné části neposuzuj, švy a duplicity mezi částmi posoudí integrační review.`,
  rep(`code-review-cast-${c.id}`, 1), `review:řez ${NN}:část ${c.id}:1`)
const reviewIntegrace = ig => review(`integrační code-review řezu ${NN}: kontrakt (${cesty(kontraktVysledek && kontraktVysledek.soubory).join(', ') || 'řez samostatný kontrakt nemá'}), změny integrace (${cesty(ig.soubory).join(', ') || trimList(ig.zmenena_mista).join(' | ') || 'viz pracovní strom'}) a švy mezi částmi ${casti.map(c => c.id).join(', ')}; hledej hlavně rozpor mezi částmi a kontraktem, duplicity mezi částmi (dva podobné helpery, typy nebo konstanty; souběžní autoři je snadno napíšou dvakrát), nesešité švy a zbytky „neimplementováno“; uvnitř jedné části neposuzuj, to dělá review části.`,
  rep('code-review-integrace', 1), `review:řez ${NN}:integrace:1`)
const reviewOprava = (o, n) => review(`code-review opravy řezu ${NN} v pokusu ${n}. Rozsah: VÝHRADNĚ změny opravy: ${trimList(o.zmenena_mista).join(' | ') || cesty(o.soubory).join(', ') || 'viz pracovní strom'}; co prošlo review částí, znovu nekontroluj.`,
  rep('code-review-oprava', 1), `review:řez ${NN}:oprava:${n}`)
const review2 = (rozsah, odmBlok, reporty) => review(`code-review řezu ${NN}, kolo 2. Rozsah: VÝHRADNĚ opravná várka: ${rozsah.join(' | ')}${odmBlok.length ? `; odmítnuté blokující nálezy: ${odmBlok.join(' | ')}; obstojí odmítnutí? přeměř proti kódu (nálezy jsou v reportech kola 1: ${reporty.join(', ')})` : ''}. Co prošlo kolem 1, znovu nekontroluj.`,
  rep('code-review', 2), `review:řez ${NN}:2`)

// Poslední várka (kolo 2) jde zúžením: po ní už review není a deník vad u neověřené poslední várky naměřil nejvyšší chybovost oprav (třída B).
const fixBalicek = (b, i, kolo) => spust(`${ramec}

Úkol: oprav nálezy řezu ${NN} (kolo ${kolo}).${zdrojeText(b.zdroje)} Sahej jen do souborů: ${b.soubory.join(', ')}; jiné soubory mohou souběžně opravovat jiní agenti. Root brána může být červená na cizích souborech, ověř svůj balíček. Spouštěj jen dotčené testy a typecheck; plnou suitu nespouštěj, patří bráně a souběžné agenty by vyhladověla. ${b.security ? 'Jde o bezpečnostní balíček. Necommituj; bezpečnostní opravu commitne deploy samostatně. Vrať security: true a v zmenena_mista, co oprava mění.' : 'Necommituj.'} Každý nález je hypotéza: ověř proti kódu; co míří vedle, oprav skutečnou příčinu a rozdíl uveď v jinak_nez_nalez; nález, který neopravíš, vrať v odmitnuto s důvodem (u nálezu BLOKUJE s blokuje: true). Nahlas rozšířený zásah, když překročí nálezy.${kolo === 2 ? ' Poslední várka, po ní už review není. Oprav zúžením. Nový mechanismus ani změnu rozhodovací logiky nedělej, nahlas je jako follow-up nebo rozhodnutí. Odložení je plnohodnotný výsledek.' : ''}`,
  { label: `fix:řez ${NN}:${kolo}.${i + 1}`, phase: 'Review', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const verify = k => spust(`${ramec}

Úkol: brána řezu ${NN}, běh ${k}: spusť typecheck a testy projektu podle CLAUDE.md${runbook ? ` (nebo runbooku ${runbook})` : ''}, každý příkaz s výstupem přesměrovaným do souboru a návratovým kódem čteným zvlášť (\`cmd > log 2>&1; echo EXIT=$?\`), nikdy přes rouru; plný výstup ulož do ${rep('verify', k)}. Spusť i kontroly, které spouští pre-commit hook projektu (.husky/pre-commit, .git/hooks/pre-commit nebo lefthook; seznam si přečti z hooku), kromě plné suity, kterou už spouštíš, a vrať je v kontroly. Spusť měřidla kritérií, která PRD označuje [měřidlo] (${sCastmi ? prdVse : prdPath}), nad odevzdávaným stromem a výsledek každého vrať v meridla. Vrať skutečné výsledky (exit kód, počty, jména selhávajících testů, chyby s file:line). Nic neopravuj a neinterpretuj.${a.plugin_root ? ` Když je typecheck zelený, testy skončily kódem 0 s aspoň jedním prošlým a žádným selhaným testem a prošly kontroly i měřidla, spusť \`bash ${a.plugin_root}/scripts/verify-marker.sh ${cwd} ${rep('verify', k)}\` a jeho výstup (hash stromu) vrať v poli marker; jinak marker nezapisuj.` : ''}`,
  { label: `verify:řez ${NN}:${k}`, phase: 'Brána', agentType: 'dev-pipeline:verify', schema: VERIFY, ...M.sonL })

const fixBrana = v => spust(`${ramec}

Úkol: brána řezu ${NN} je červená (${branaDuvod(v)}). Selhává: ${(v.selhavajici || []).slice(0, 20).join(' | ') || 'viz výstup'}${v.kontroly_ok === false ? ` · kontroly pre-commitu: ${trimList(v.kontroly).slice(0, 12).join(' | ') || 'viz výstup'}` : ''}${v.meridla_ok === false ? ` · měřidla kritérií: ${meridlaFail(v).slice(0, 12).join(' | ') || 'viz výstup'}` : ''}${v.vystup_path ? ` · plný výstup: ${v.vystup_path}` : ''}. Oprav příčinu (ne test ani měřidlo, pokud nejsou špatně; suita, která skončila nenulovým kódem bez selhaného testu nebo bez jediného prošlého, neproběhla: zjisti proč); po opravě spusť dotčené testy, kontroly a typecheck, plnou suitu pustí znovu brána. Necommituj.`,
  { label: `fix-brana:řez ${NN}`, phase: 'Brána', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

// Deploy: commit řezu doslova (v běhu bez-dluhu pole commit 16× z 24 neslo commit zápisu nasazení a pět hashů si agent
// dopočítal), kroky po nasazení z PRD, zápis nasazení samostatným commitem, bezpečnostní opravy před commitem řezu.
const secText = xs => xs.map(s => `${s.popis} (soubory: ${s.soubory.join(', ') || 'viz popis'})`).join(' | ').slice(0, 1500)
const deploy = (k, pozn, x = {}) => spust(`${ramec}

Úkol: commit a nasazení řezu ${NN} (běh ${k}). Jeden commit na vize větvi: „rez ${NN}: <shrnutí z PRD>“${pozn ? ` (${pozn})` : ''}. Do commitu patří kód řezu, docs/prd/rez-${NN}* a docs/e2e/rez-${NN}* (kromě zápisu nasazení) a sdílené dokumenty běhu (handoff, journal, follow-ups, vize-spory, docs/mereni); rozpracované PRD a scénáře jiných řezů (rez-MM s jiným číslem) nech netrackované, commituje je jejich řez. Build verzi ani marker samostatným commitem nezvedáš (patří do řezu před bránou); když chybí a postup ji vyžaduje, zvedni ji a commitni spolu s obsahem. Pole commit je poslední commit „rez ${NN}“ (git log --grep, hash z git rev-parse), i když tento běh nový commit řezu nevytvořil (dorovnání prostředí, jen fix(security)); nikdy commit zápisu nasazení, nikdy dopočítaný ani zkrácený.${x.security && x.security.length ? ` Bezpečnostní opravy řezu: ${secText(x.security)}. Před commitem řezu je commitni samostatně zprávou fix(security): …, když jejich soubory nenesou jinou změnu řezu (git diff souboru ukáže jen opravu); jinak přidej do zprávy commitu řezu řádek fix(security): …. Hashe vrať v security_commity (i když nasazení potom selže).` : ''}${x.predchozi ? ` Předchozí pokus selhal ve fázi „${x.predchozi.faze}“: ${S(x.predchozi.detail).slice(0, 600)}${x.diag ? ` · diagnóza: ${S(x.diag.pricina).slice(0, 400)} · doporučení: ${S(x.diag.doporuceni).slice(0, 300)}` : ''}; nasazení tomu přizpůsob.` : ''}${x.prostredi ? ` E2E hlásí vadu prostředí: ${S(x.prostredi).slice(0, 800)}; dorovnej nasazení tak, aby ji odstranilo (typicky kroky po nasazení z PRD).` : ''} ${deployMode === 'commit-only' || !runtimeDopad ? 'Projekt nasazuje uživatel nebo řez nemá runtime dopad: skonči commitem, stav commit-only.' : `Deploy podle deploy konfigurace projektu${runbook ? ` (runbook: ${runbook})` : ' (sekce Deploy v CLAUDE.md projektu nebo docs/deploy.md)'}: marker docs/.deploy-unlocked vytvoř samostatným příkazem před deployem, počkej na doložený stav platformy (SUCCESS/FAILED) a vrať dva nezávislé doklady, že běží (druhý smí být odložený se změřenou baseline před nasazením, nebo neexistuje s důvodem; pozorovatelný rozdíl nevyráběj akcí v produkci).${deployOkno ? ` Zakázané okno nasazení: ${deployOkno}; když do něj spadáš, počkej do jeho konce a ještě 10 minut rezervy.` : ''}${appPristup ? ` Pokyny majitele k prostředí a nasazení jsou závazné a mají přednost před skripty repa (skript, který nasazuje jinam nebo jinak, než pokyny říkají, nepoužij nebo doplň o správné parametry): ${appPristup.slice(0, 1200)}.` : ''}${dokladPred ? ` Řez nese migraci s dokladem před nasazením: migraci aplikuj jen když existuje ${x.doklad || dokladPath}; bez něj migraci neaplikuj, nic nenasazuj a vrať failed s důvodem „chybí doklad před migrací“.` : ''} Co nasadit, urči podle git diff --stat <báze>..HEAD -- apps packages a importů změněných balíčků, nikdy podle diffu jednoho commitu: báze je poslední commit se zprávou „zápis nasazení“ (git log --grep 'zápis nasazení' -1 --format=%H), když žádný není, git merge-base HEAD main; nasaď každou aplikaci, které se diff dotkl, a pole health začni řádkem „aplikace: <app>@<verze nebo deployment id> nasazeno | <app> nenasazeno (<důvod z diffu>) | …“. Když PRD (kostra ${prdPath}) má sekci „Nasazení a kroky po něm“, proveď po nasazení každý krok a vrať ho v kroky_po_nasazeni s textem kroku z PRD a se stavem provedeno (proběhl a jeho ověření z PRD prošlo), selhalo (proběhl a ověření neprošlo), vynechano (nespustil se; s důvodem) nebo pro-majitele (jen krok, který PRD výslovně vede jako ruční nebo neblokující krok majitele; blokující krok bez oprávnění je infra selhání).${x.provedene && x.provedene.length ? ` Předchozí nasazení tohoto řezu už provedlo: ${x.provedene.join(' | ').slice(0, 1200)}. Krok, jehož vstup tvoje změna neovlivňuje, znovu nespouštěj a vrať ho jako vynechano s důvodem „provedeno v předchozím nasazení“; krok, kterého se změna týká, proveď znovu.` : ''} Zápis nasazení zapiš do ${nasazeniPath} (čas, commit řezu, co se nasadilo, doklady, kroky po nasazení; další nasazení téhož řezu připiš pod předchozí) a commitni ho samostatně až po commitu řezu; vrať report_path a commit_zapisu. Pole commit je commit řezu, ne commit zápisu. Selhání mimo kód řezu (přihlášení nebo účet CLI, oprávnění, výpadek platformy) vrať jako failed s infra: true. Každé čekání dělej smyčkou s pevným počtem iterací a krátkým spánkem. Jedno čekací volání trvá nejvýš 4,5 minuty: cache agenta žije 5 minut a delší pauza zapíše celý kontext znovu. Dlouhý proces kontroluj opakovaně kratšími voláními se stropem iterací, ne jednou smyčkou na 10 minut. Smyčka bez stropu (while ! grep … sleep) je zakázaná: přesune se na pozadí, přežije tě a nikdo ji neukončí.`} Necháváš na pokoji vše, co jsi sám nezměnil: žádné git checkout --, git restore, git stash ani git clean nad cizími nebo necommitnutými soubory (guard je během běhu blokuje); formátovací kontrolu pouštěj jen nad soubory řezu, ne nad celým repem. Nikdy si nedomýšlej postup, který projekt nedokumentuje.`,
  { label: `deploy:řez ${NN}:${k}`, phase: 'Deploy', agentType: 'dev-pipeline:deploy', schema: DEPLOY, ...M.sonM })

// Doklad před nasazením (jen když ho PRD předepsalo): Sonnet agent pořídí snímek dotčených dat dotazy jen pro čtení
// do docs/e2e/rez-NN-doklad-pred.md; deploy bez toho souboru migraci neaplikuje. V běhu doplneni-webu doklad dvakrát chyběl a dodatečně nešel.
const doklad = () => spust(`${ramec}

Úkol: doklad stavu před nasazením řezu ${NN}. PRD (${prdPath}) má sekci „Doklad před nasazením“: pořiď přesně to, co předepisuje (tabulky, počty řádků, vzorky záznamů, kontrolní součty), výhradně dotazy jen pro čtení nad prostředím, do kterého se bude nasazovat${appPristup ? ` (pokyny majitele k prostředí: ${appPristup.slice(0, 1200)})` : runbook ? ` (přístup podle runbooku ${runbook})` : ' (přístup podle CLAUDE.md projektu)'}. Pokus ${P}. Zapiš do ${dokladPath}: čas, revize (git rev-parse HEAD), každý dotaz doslova a jeho výsledek; když soubor už existuje (dřívější pokus nebo přerušený běh), nepřepisuj ho (je to stav před prvním zápisem, po migraci ho nikdo nedopočítá) a zapiš vedle ${dokladPath.replace(/\.md$/, '')}-p${P}.md. Cestu, kam jsi zapsal, vrať v path. Nic neměň, nic nemaž, migraci nespouštěj. Když přístup chybí nebo dotaz selže, vrať ok: false s důvodem; doklad si nedomýšlej. Když kterýkoli předepsaný bod dokladu selže, vrať ok: false; text a pole se nesmí rozcházet.`,
  { label: `doklad:řez ${NN}`, phase: 'Doklad', agentType: 'dev-pipeline:doklad', schema: DOKLAD, ...M.sonM })

// E2E kolo 1: skupiny sekcí souběžně (e2eSkupiny). Kolo 2 po opravě přeměřuje jen FAIL kritéria kola 1, ostatní jen smoke.
// Verifikátor kód neověřuje: kritéria [měřidlo] změřila brána (v běhu bez-dluhu si verifikátoři zakládali worktree
// s instalací a pouštěli suitu vedle běžící stavby). Odchylky a rozšířené zásahy oprav dostane předem, protože scénář
// zastaralý po opravě jinak vyrobí FAIL a oprava FAILu chování vrátí (třída J3). Výsledky měřidel brány dostane doslova,
// ne jen cestu k výstupu brány: kritérium [měřidlo] tak nemusí hledat v logu ani měřit znovu.
const meridlaText = o => (o.meridla || []).length ? `; výsledky měřidel: ${o.meridla.join(' | ').slice(0, 800)}` : ''
const e2eProhlizec = (k, o) => spust(`${ramec}

Úkol: E2E verifikace řezu ${NN}, kolo ${k}${o.sekce ? ` (verifikátor ${o.cast} z ${o.pocet}${o.samostatne ? '' : ' souběžných'})` : ''}: projdi scénáře z ${e2ePath} proti běžící aplikaci${appPristup ? ` (přístup: ${appPristup})` : ' (přístup podle CLAUDE.md projektu)'}${o.sekce ? `, ale VÝHRADNĚ sekce: ${o.sekce.join(' | ')}; ${o.samostatne ? 'ostatní sekce už ověřili ostatní verifikátoři' : 'ostatní verifikátoři souběžně ověřují ostatní sekce nad touž aplikací'}, do jejich dat nesahej` : ''}${o.fail ? `. Kolo 2 po opravě: přeměř VÝHRADNĚ kritéria, která v kole 1 selhala: ${o.fail.join(' | ')}; u ostatních kritérií jen ověř, že se jejich plocha načte bez chyby (smoke, jeden krok na plochu), verdikty z kola 1 nepřeměřuj; celkem = počet přeměřených kritérií, smoke selhání vrať ve fail_kriteria s předponou „smoke:“` : ''}, verdikt per kritérium PASS / PASS-částečně / FAIL s důkazy do reportu ${o.report}. Nejdřív ověř prostředí: nasazená revize je commit řezu${o.commit ? ` (${o.commit})` : ''} nebo pozdější commit, který od něj mění jen docs/ (zápis nasazení)${o.nasazeni ? `, zápis nasazení ${o.nasazeni},` : ''} a přihlášení ze zadání funguje; když ne, vrať to v poli prostredi a kritéria neměř, nic nenasazuj (nasazení není tvoje fáze) a handoff nečti. Neověřuješ kód: nezakládej worktree, nic neinstaluj, nespouštěj testy ani typecheck. Kritéria označená [měřidlo] změřila brána (report ${o.brana || 'brány tohoto pokusu'}${meridlaText(o)}); do celkem je nepočítej. Prohlížeč bez okna (bez --headed), na konci agent-browser close.${o.zmeny ? ` Odchylky od PRD a rozšířené zásahy oprav tohoto pokusu: ${o.zmeny}; scénář, který jim odporuje, vrať ve vadna_kriteria s druhem „scénář zastaral po opravě“, ne jako FAIL.` : ''} Čísla a výčty v chování aplikace přepočítej sám dotazem nad nasazenou revizí; hodnotu z PRD, journalu ani souhrnu implementace nepřebírej. Kritérium, které nejde splnit (chybí ti credential, měří se až po uzavíracím commitu), koliduje s jiným kritériem nebo Ne-cílem vize, nebo padá na nálezu, který prokazatelně existoval před řezem a řez ho nemá v rozsahu, vrať ve vadna_kriteria s dokladem druhu, ne jako FAIL; FAIL je jen skutečné selhání implementace. Vrať jen počty, FAIL, částečná a vadná kritéria, závažné nálezy mimo kritéria (bezpečnost, data) zvlášť od kosmetických. Testovací data s prefixem ${o.sekce ? `[E2E-${o.cast}]` : '[E2E]'}, po sobě ukliď.`,
  { label: `e2e:řez ${NN}:${k}${o.sekce ? `:${o.cast}` : ''}`, phase: 'E2E', agentType: 'dev-pipeline:e2e-verifier', schema: E2E, ...M.opusM })

const mergeE2E = (parts, report) => {
  const ps = parts.filter(Boolean)
  if (!ps.length) return null
  const sum = f => ps.reduce((n, p) => n + (Number(p[f]) || 0), 0)
  const cat = f => ps.flatMap(p => p[f] || [])
  return { vysledek: 'fail', celkem: sum('celkem'), pass: sum('pass'), castecne: sum('castecne'), fail: sum('fail'),
    fail_kriteria: cat('fail_kriteria'), castecna_kriteria: cat('castecna_kriteria'), vadna_kriteria: cat('vadna_kriteria'),
    zavazne_mimo_ak: cat('zavazne_mimo_ak'), kosmeticke: cat('kosmeticke'), report_path: report, prostredi: ps.map(p => S(p.prostredi).trim()).filter(Boolean).join(' | ') }
}

// Skupiny sekcí jdou souběžně v kole 1 a v kole 2, které přeměřuje všechna kritéria; kolo 2 nad jmenovanými FAIL jde jedním verifikátorem.
// Skupina bez výsledku není pass: mergeE2E by sečetl jen ostatní skupiny a řez by se uzavřel s neověřenou sekcí (revize 1.4.0:
// 20 z 30 kritérií a hotovo). Chybějící skupina jde ještě jednou samostatně, po doběhu ostatních; bez výsledku je E2E selhané.
const e2e = async (k, o = {}) => {
  if (!runtimeDopad) return e2eKriteria(k, o)
  if (!o.fail && e2eSkupiny.length >= 2) {
    const pocet = e2eSkupiny.length
    const skupina = (i, samostatne) => e2eProhlizec(k, { ...o, cast: PISMENA[i], sekce: e2eSkupiny[i], pocet, samostatne, report: rep(`e2e-${PISMENA[i]}`, k) })
    const vys = await parallel(e2eSkupiny.map((_, i) => () => skupina(i, false)))
    for (let i = 0; i < pocet; i++) {
      if (vys[i]) continue
      log(`E2E ${k}: verifikátor ${PISMENA[i]} nevrátil výsledek, pouštím ho ještě jednou samostatně`)
      vys[i] = await skupina(i, true)
    }
    const chybi = e2eSkupiny.map((_, i) => i).filter(i => !vys[i])
    if (chybi.length) return { chybi: chybi.map(i => nic(`e2e:řez ${NN}:${k}:${PISMENA[i]}`, `verifikátor ${PISMENA[i]}`)).join('; ') }
    return mergeE2E(vys, vys.map(x => x.report_path).filter(Boolean).join(' + '))
  }
  return e2eProhlizec(k, { ...o, report: rep('e2e', k) })
}
// Proč E2E nemá výsledek (prázdné = má): celé bez výsledku, skupina bez výsledku, nebo strop předávek.
const e2eNic = (e, k) => e && !e.chybi ? '' : e ? e.chybi : nic(`${runtimeDopad ? 'e2e' : 'kriteria'}:řez ${NN}:${k}`, 'verifikátor')

const e2eKriteria = (k, o) => spust(`${ramec}

Úkol: řez ${NN} nemá runtime dopad. Projdi akceptační kritéria z PRD (${prdVse}) bod po bodu a každé dolož konkrétním důkazem (výstup příkazu, existence a obsah souboru, spuštěný test), verdikt per kritérium do ${rep('e2e', k)}. Kritéria označená [měřidlo] změřila brána (report ${o.brana || 'brány tohoto pokusu'}${meridlaText(o)}): znovu je nespouštěj a do celkem je nepočítej. Čísla a výčty přepočítej sám nad odevzdávaným stromem; hodnotu ze souhrnu implementace nepřebírej. Kritérium nesplnitelné před uzavíracím commitem, kolidující s jiným kritériem nebo Ne-cílem vize, nebo padající na předřezovém nálezu mimo rozsah řezu vrať ve vadna_kriteria s dokladem druhu, ne jako FAIL.${o.zmeny ? ` Odchylky od PRD a rozšířené zásahy oprav tohoto pokusu: ${o.zmeny}; kritérium, které jim odporuje, vrať ve vadna_kriteria s druhem „scénář zastaral po opravě“, ne jako FAIL.` : ''} Dočasné artefakty po sobě ukliď, pracovní strom nech čistý. Vrať jen počty, FAIL a vadná kritéria.`,
  { label: `kriteria:řez ${NN}:${k}`, phase: 'E2E', agentType: 'general-purpose', schema: E2E, ...M.opusM })

// Kolo 2 měřilo jen FAIL kritéria kola 1 (+ smoke): výsledné počty se skládají z obou kol. Závažné nálezy a kosmetika kola 1
// se nesmí ztratit (kolo 2 je jen smoke), jinak bezpečnostní nález z kola 1 zmizí bez opravy; kolečko je skládá stejně.
const zKola1 = (e1, e2) => ({ zavazne_mimo_ak: trimList([...(e1.zavazne_mimo_ak || []), ...(e2.zavazne_mimo_ak || [])]), kosmeticke: trimList([...(e1.kosmeticke || []), ...(e2.kosmeticke || [])]) })
const slozE2E = (e1, e2) => {
  const vadna = trimList([...(e1.vadna_kriteria || []), ...(e2.vadna_kriteria || [])])
  const castecne = (Number(e1.castecne) || 0) + (Number(e2.castecne) || 0)
  const fail = Number(e2.fail) || 0
  const celkem = Number(e1.celkem) || 0
  return { ...e2, celkem, fail, castecne, pass: Math.max(0, celkem - fail - castecne - vadna.length), vadna_kriteria: vadna,
    castecna_kriteria: [...(e1.castecna_kriteria || []), ...(e2.castecna_kriteria || [])], report_path: [e1.report_path, e2.report_path].filter(Boolean).join(' + '),
    ...zKola1(e1, e2) }
}

const fixE2E = (e, k) => spust(`${ramec}

Úkol: E2E řezu ${NN} selhalo (kolo ${k}): report ${e.report_path}, FAIL kritéria: ${(e.fail_kriteria || []).join(' | ') || `${e.fail} bez jmen, viz report`}. Každý nález je hypotéza: reprodukuj, oprav příčinu, testy a typecheck zelené. Necommituj, commit a deploy dělá další krok.`,
  { label: `fix-e2e:řez ${NN}:${k}`, phase: 'E2E', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

// Bezpečnostní fix agent necommituje: v běhu bez-dluhu (řez 23) tvrdil commit, který nevznikl, a blok to nepoznal.
// Opravu projde brána a commitne ji deploy samostatně.
const fixSecurity = e => spust(`${ramec}

Úkol: E2E řezu ${NN} našlo závažné nálezy mimo kritéria (bezpečnost/data): ${(e.zavazne_mimo_ak || []).join(' | ')} · report ${e.report_path}. Oprav je, i když jsou mimo rozsah řezu. Necommituj; bezpečnostní opravu commitne deploy samostatně. Vrať security: true a v zmenena_mista, co oprava mění. Bez jasného fixu nález nech jako follow-up s důvodem.`,
  { label: `fix-security:řez ${NN}`, phase: 'E2E', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const diagnose = last => spust(`${ramec}

Úkol: řez ${NN} dvakrát funkčně selhal, naposledy ve fázi „${last.faze}“: ${S(last.detail).slice(0, 800)}. Postav těsnou reprodukční smyčku a najdi doloženou příčinu; nic neopravuj, pracovní strom vrať do stavu, v jakém jsi ho našel. Vrať příčinu (file:line + mechanismus) a doporučení pro třetí pokus.`,
  { label: `diagnose:řez ${NN}`, phase: 'Diagnóza', agentType: 'dev-pipeline:diagnose', schema: DIAG, ...M.opusH })

// Seznam do zadání uzavření jde celý: položky jednotlivě oříznuté na 600 znaků, nikdy celek uprostřed položky (běh web-podzim:
// follow-upy useknuté na 2 500 znaků, do docs/follow-ups.md se dostala čtvrtina; odchylky useknuté ve 13 ze 14 řezů).
const celySeznam = xs => JSON.stringify(pole(xs).map(x => { const t = typeof x === 'string' ? x : JSON.stringify(x); return t.length > 600 ? `${t.slice(0, 599)}…` : t }))
// Uzavření ověří commit řezu a bezpečnostní commity podle gitu (pole commit bylo v běhu bez-dluhu jen 4× z 24 commitem řezu).
const close = s => spust(`${ramec}

Úkol: uzavření řezu ${NN}. (0) Ověř commit řezu: git cat-file -t ${s.commit} musí vrátit commit a zpráva commitu nese „rez ${NN}“; když ne, najdi skutečný commit řezu (git log --grep) a vrať ho v commit_overeny; hash nikdy nedopočítávej.${s.security.length ? ` Totéž pro bezpečnostní commity ${s.security.join(', ')}: neexistující vrať v chybejici_commity.` : ''} (1) PRD frontmatter${sCastmi ? ' kostry' : ''}: status: done, commit: ověřený commit řezu z bodu 0. (2) Srovnej PRD (${prdVse}) a E2E scénáře s tím, co se skutečně postavilo; odchylky: ${celySeznam(s.odchylky)}. Dokument nesmí tvrdit něco jiného než kód; uprav dotčené věty.${s.vadna.length ? ` Vadná kritéria podle E2E (${celySeznam(s.vadna)}): u každého nech text kritéria, připiš „VADNÉ KRITÉRIUM: <doklad>; čeká na rozhodnutí majitele“ a zapiš záznam do docs/vize-spory.md s navrženou odpovědí.` : ''} (3) Doklady: když PRD nebo vize předepisuje artefakt v repu jako doklad řezu (měření, export, report), ověř, že existuje a je v ověřeném commitu řezu (git show --stat); chybějící vrať v chybejici_doklady. (4) Thermo: ${s.thermo_paths.length ? `projdi v ${s.thermo_paths.join(', ')} nálezy BLOCKER a HIGH a u každého urči podle kódu, zda je opraven, nebo zůstává; neopravený zapiš do follow-ups s odvozením (nález, proč zůstal); počet bez obojího vrať v thermo_nesesouhlaseno.` : 'thermo bez nálezů, thermo_nesesouhlaseno: 0.'} (5) Připoj do docs/journal.md heredocem záznam: datum, řez, co je hotové, odchylky, pokusy ${s.pokusy}, E2E ${s.e2e}, review ${s.review}, thermo ${s.thermo}; odmítnuté nálezy s důvodem: ${s.odmitnute.length ? celySeznam(s.odmitnute) : 'žádné'}${s.jinak.length ? `; opravy jinou příčinou, než nález tvrdil: ${celySeznam(s.jinak)}` : ''}; výsledky měřidel brány: ${s.meridla.length ? celySeznam(s.meridla) : 'žádná měřidla'}; kroky po nasazení: ${s.kroky.length ? celySeznam(s.kroky) : 'žádné'}; předávky v bloku: ${s.predavky}; z docs/.kontext.jsonl (když existuje) záznamy řezu ${NN}: nejvyšší hodnota podle typu agenta a počet compactů; tentýž souhrn vrať v poli kontext. (6) Připoj do docs/follow-ups.md tyto položky (jedna odrážka = jedna, s kontextem; každá začíná značkou „[řez ${NN} · <oblast>]“, kde oblast je modul nebo plocha ze slovníku projektu, aby šly položky číst grepem po oblastech): ${celySeznam(s.follow_ups)}. Položka „<id> (FOLLOW-UP z <report>)“ je nález code-review k odložení: text a kontext vezmi z reportu. (7) Smaž docs/.deploy-unlocked, když existuje. (8) Pusť formátovač projektu na dotčené docs/*.md, když ho projekt má. Necommituj (commituje další řez), do kódu nesahej.`,
  { label: `uzavření:řez ${NN}`, phase: 'Uzavření', agentType: 'dev-pipeline:uzavreni', schema: CLOSE, ...M.sonM })

// ---------- implementace řezu s částmi ----------
// Pokus n: kontrakt (dokud jednou neuspěje), oprava po selhání za implementací, části souběžně bez stropu (myšlení běží na
// serverech, místní těžké příkazy řadí fronta), integrace. Část startuje hned, jak jsou hotové její závislosti, ne až po celé
// předchozí vlně (běh web-podzim: řez 12 K2 čekal 112 min na nesouvisející K4, bariéra vln stála 150 min). Nezávislé části
// pokračují i po selhání jiné, závislé na selhané se nespustí. Připravené části startují od největšího odhadu (strop souběhu).
async function implementaceCasti(n, predchozi, diag, refresh, sberImpl) {
  const ted = { kontrakt: null, oprava: null, casti: [], integrace: null, chyba: '' }
  // Hotové kroky z dřívějších pokusů se znovu nespustí: jejich follow-upy a odchylky jdou do sběru tohoto pokusu. Bezpečnostní
  // odchylky z nich jsou v securityOpravy už z pokusu, který je sebral (deduplikace podle popisu), deploy je nedostane dvakrát.
  for (const r of [kontraktVysledek, ...casti.map(c => castiStav.get(c.id).vysledek), integraceVysledek]) sberImpl(r)

  if (kontraktPotreba && !kontraktHotovo) {
    vstup('Kontrakt', 'implementace')
    const k = await implKontrakt(n, diag, refresh)
    if (!k || k.stav === 'selhalo') {
      kontraktSelhani = k ? S(k.souhrn).trim() || 'stav selhalo' : nic(`implement:řez ${NN}:kontrakt:${n}`, 'agent')
      ted.chyba = `kontrakt: ${kontraktSelhani.slice(0, 800)}`; if (k) sberImpl(k); return ted
    }
    kontraktHotovo = true; kontraktSelhani = ''; kontraktVysledek = k; ted.kontrakt = k; sberImpl(k)
    log(`kontrakt: ${k.stav}, ${cesty(k.soubory).length} souborů, typecheck ${k.typecheck ? 'ok' : 'červený'}`)
  }

  if (opravaZ) {
    vstup('Implementace', 'implementace')
    const o = await implOprava(n, opravaZ, predchozi, diag)
    if (!o || o.stav === 'selhalo') { ted.chyba = `oprava po selhání ve fázi ${opravaZ.faze}: ${o ? S(o.souhrn).slice(0, 800) : nic(`implement:řez ${NN}:oprava:${n}`, 'agent')}`; if (o) sberImpl(o); return ted }
    opravaZ = null; ted.oprava = o; sberImpl(o)
    log(`oprava (pokus ${n}): ${o.stav}, ${trimList(o.zmenena_mista).length} míst, typecheck ${o.typecheck ? 'ok' : 'červený'}`)
  }

  const hotova = id => castiStav.get(id).hotovo
  const selhaloTed = new Set()
  const bezi = new Map()
  const pripravene = () => casti.filter(c => !hotova(c.id) && !selhaloTed.has(c.id) && !bezi.has(c.id) && c.zavisi_na.every(hotova))
    .sort((x, y) => y.odhad - x.odhad)
  for (;;) {
    for (const c of pripravene()) {
      vstup('Části', 'implementace')
      log(`část ${c.id} start${c.zavisi_na.length ? ` (závislosti hotové: ${c.zavisi_na.join(', ')})` : ''}`)
      bezi.set(c.id, implCast(c, n, diag, refresh).then(r => ({ c, r }), () => ({ c, r: null })))
    }
    if (!bezi.size) break
    const { c, r } = await Promise.race(bezi.values())
    bezi.delete(c.id)
    const st = castiStav.get(c.id)
    ted.casti.push(c.id)
    if (r) sberImpl(r)
    if (r && r.stav !== 'selhalo') {
      Object.assign(st, { hotovo: true, soubory: cesty(r.soubory), mimo: normMimo(r.mimo_hranici), selhani: '', vysledek: r })
      log(`část ${c.id}: ${r.stav}, ${st.soubory.length} souborů${st.mimo.length ? `, ${st.mimo.length} požadavků mimo hranici` : ''}`)
    } else {
      st.selhani = r ? S(r.souhrn).trim() || 'stav selhalo' : nic(`implement:řez ${NN}:část ${c.id}:${n}`, 'agent')
      selhaloTed.add(c.id)
      log(`část ${c.id} selhala: ${st.selhani.slice(0, 160)}`)
    }
  }
  const nehotove = casti.filter(c => !hotova(c.id))
  if (nehotove.length) {
    ted.chyba = `části nedokončené: ${nehotove.map(c => `${c.id} (${selhaloTed.has(c.id) ? castiStav.get(c.id).selhani.slice(0, 200) : `čeká na ${c.zavisi_na.filter(z => !hotova(z)).join(', ')}`})`).join(', ')}`
    return ted
  }

  if (ted.kontrakt || ted.casti.length || !integraceHotovo) {
    vstup('Integrace', 'implementace')
    const ig = await implIntegrace(n, diag)
    if (ig) sberImpl(ig)
    if (!ig || ig.stav === 'selhalo') {
      integraceSelhani = ig ? S(ig.souhrn).trim() || 'stav selhalo' : nic(`implement:řez ${NN}:integrace:${n}`, 'agent')
      ted.chyba = `integrace: ${integraceSelhani.slice(0, 800)}`
      return ted
    }
    integraceHotovo = true; integraceSelhani = ''; integraceVysledek = ig; ted.integrace = ig
    log(`integrace: ${ig.stav}, typecheck ${ig.typecheck ? 'ok' : 'červený'}, testy ${ig.testy_zelene ? 'zelené' : 'červené'}`)
  }
  return ted
}

// Štíhlý návrat (běh web-podzim: follow-upy, odchylky a pasti tvořily 80 % návratu stavby a orchestrátor je četl dvakrát,
// v notifikaci i ze souboru): když uzavření prošlo, jsou zapsané v docs/follow-ups.md, journalu a PRD a orchestrátor dostane
// počty; při selhání nebo zastavení jdou celé, zapíše je orchestrátor.
const seznamy = (follow, odch, pasti, zapsano) => ({ follow_ups: zapsano ? [] : follow, odchylky: zapsano ? [] : odch, pasti_opravene: zapsano ? [] : pasti,
  follow_ups_pocet: follow.length, odchylky_pocet: odch.length, pasti_pocet: pasti.length, seznamy_zapsane: zapsano })
// Všechna nasazení bloku a commit řezu z prvního úspěšného nasazení (u řezu s opravou po E2E je poslední commit jen oprava).
const historie = () => ({ nasazeni: nasazeniHist.map(x => ({ ...x })), commit_hlavni: (nasazeniHist.find(x => (x.stav === 'success' || x.stav === 'commit-only') && x.commit) || {}).commit || '' })

// ---------- jeden pokus ----------
async function pokus(n, predchozi, diag) {
  const followUps = [], odchylky = [], spory = [], pasti = [], reports = [], rozhodnuti = [], odmitnute = [], jinak = [], rozsirene = []
  // Výsledky review pokusu; fail() je předá dalšímu pokusu řezu s částmi (revizeDrive), úspěšný pokus je složí s dřívějšími.
  let ths = [], kola = 0, nalezu = 0, blokujicich = 0, fixAgentu = 0, thermoFix = null
  const revize = () => ({ ths, kola, nalezu, blokujicich, fixAgentu, thermoFix: Boolean(thermoFix), odmitnute: [...odmitnute], jinak: [...jinak] })
  const fail = (faze, detail) => ({ vysledek: 'selhalo', faze, detail: S(detail).slice(0, 1500), ...seznamy(followUps, odchylky, pasti, false), spory, reports, rozhodnuti, odmitnute, revize: revize() })
  // Odmítnuté nálezy se sbírají do journalu (třída H: odmítnutý nález fix agenta nikdo neověřil ani nezapsal).
  // Každá oprava s security: true (review, thermo, brána, E2E) jde deployi jako fix(security), když něco změnila; balíček, který
  // review označilo security, i bez příznaku (vynutit). V revizi 1.4.0 se oprava brány nebo E2E se security: true ke commitu nedostala.
  const sber = (r, sec = {}) => {
    if (!r) return
    followUps.push(...(r.follow_ups || [])); odchylky.push(...(r.odchylky_od_prd || [])); spory.push(...(r.spory || [])); pasti.push(...(r.pasti_opravene || []))
    // Bezpečnostní oprava z implementace (implement.md: odchylka s předponou „security:“) jde deployi jako fix(security) stejně jako z review.
    for (const o of trimList(r.odchylky_od_prd)) if (/^security:/i.test(o)) pridejSec({ soubory: [], popis: o.replace(/^security:\s*/i, '').slice(0, 400) })
    if ((r.security === true || sec.vynutit) && (r.opraveno > 0 || trimList(r.zmenena_mista).length)) {
      pridejSec({ soubory: sec.soubory || cestyZ(r.zmenena_mista), popis: `${sec.zdroj || 'bezpečnostní oprava'}: ${trimList(r.zmenena_mista).join('; ').slice(0, 400) || 'viz report'}` })
    }
    odmitnute.push(...pole(r.odmitnuto).filter(Boolean).map(o => `${S(o.id)}: ${S(o.duvod)}`)); jinak.push(...trimList(r.jinak_nez_nalez))
    if (r.rozsireny_zasah && S(r.rozsireny_popis).trim()) rozsirene.push(S(r.rozsireny_popis).trim())
  }
  const implVysledky = []
  const sberImpl = r => { if (!r) return; sber(r); implVysledky.push(r); if (r.souhrn_path) reports.push(r.souhrn_path) }
  const zmenyPokusu = () => trimList([...odchylky, ...rozsirene]).join(' | ').slice(0, 1500)
  // Kroky po nasazení a zápis nasazení z posledního úspěšného deploye; bezpečnostní opravy a commity jsou stav bloku.
  let krokyPo = [], commitZapisu = '', nasazeniReport = ''
  const nasad = async (k, pozn, x = {}) => {
    const posilam = securityOpravy.length
    const d = await deploy(k, pozn, { ...x, security: securityOpravy.slice(secOdeslano), provedene: [...provedeneKroky.values()], doklad: dokladCesta })
    nasazeniHist.push({ pokus: n, k, pozn: S(pozn), stav: d ? S(d.stav) : 'bez výsledku', commit: d ? S(d.commit).trim() : '', health: d ? S(d.health) : '',
      kroky_po_nasazeni: d ? pole(d.kroky_po_nasazeni).filter(Boolean).map(kr => ({ krok: S(kr.krok), stav: S(kr.stav), duvod: S(kr.duvod) })) : [] })
    // Hashe fix(security) bere blok z každého návratu, i z neúspěšného: deploy, který commitnul a pak padl (infra), je vytvořil
    // (revize 1.4.0: po zastavení se ztratily a obnova poslala tytéž opravy ke commitu znovu). Opravy s commitem jsou odeslané.
    if (d) securityCommity.push(...trimList(d.security_commity))
    if (!chybaNasazeni(d, k) || (d && trimList(d.security_commity).length)) secOdeslano = posilam
    if (!chybaNasazeni(d, k)) {
      if (pole(d.kroky_po_nasazeni).length) krokyPo = pole(d.kroky_po_nasazeni).filter(Boolean).map(x => `${S(x.krok)}: ${S(x.stav)}${x.duvod ? ` (${S(x.duvod)})` : ''}`)
      for (const kr of krokyStav(d, 'provedeno')) provedeneKroky.set(normKrok(kr.krok), S(kr.krok).trim())
      if (S(d.commit_zapisu).trim()) commitZapisu = S(d.commit_zapisu).trim()
      if (S(d.report_path).trim()) { nasazeniReport = S(d.report_path).trim(); if (!reports.includes(nasazeniReport)) reports.push(nasazeniReport) }
    }
    // Commit-only: nasazuje majitel, vynechané kroky po nasazení jsou jeho práce po nasazení (rozhodnutí), ne selhání.
    if (d && d.stav === 'commit-only') for (const kr of vynechane(d)) { const t = `[řez ${NN} · krok po nasazení pro majitele] ${kr}: proveď po svém nasazení`; if (!rozhodnuti.includes(t)) rozhodnuti.push(t) }
    // Krok pro majitele (krok, který PRD vede jako ruční nebo neblokující) není selhání nasazení, jde do rozhodnutí.
    if (d && d.stav !== 'failed') for (const kr of krokyStav(d, 'pro-majitele').map(fmtKrok)) { const t = `[řez ${NN} · krok po nasazení pro majitele] ${kr}`; if (!rozhodnuti.includes(t)) rozhodnuti.push(t) }
    return d
  }
  // Infra selhání nasazení (přihlášení CLI, účet, výpadek platformy) pokus nespotřebuje: blok zastaví a orchestrátor ho po
  // nápravě obnoví od fáze deploy. V běhu bez-dluhu padl pokus 3 řezu 1 na přihlášení wrangleru, předem ztracený.
  // Commit řezu a fix(security), které deploy stihl před pádem, jdou do návratu: obnova je jinak commitne podruhé (revize 1.4.0).
  const zastav = d => ({ vysledek: 'zastaveno', faze: 'deploy-infra', infra: true, detail: S(d.duvod).slice(0, 1500), pokusy: n, commit: S(d.commit).trim(), security_commity: trimList(securityCommity), ...seznamy(followUps, odchylky, pasti, false), spory, reports, rozhodnuti: [], ...historie() })

  let refresh = null
  if (n === 1 && prdStale.length) {
    vstup('Refresh PRD', 'refresh')
    refresh = await refreshCheck()
    if (!refresh) log('refresh PRD: prd-check nevrátil výsledek, stavím podle původního PRD')
    else {
      reports.push(refresh.report_path)
      log(`refresh PRD (${prdStale.length} řezů od PRD): ${refresh.verdikt}, ${refresh.nalezu} nálezů, ${refresh.blokujicich} blokujících`)
      if (refresh.verdikt === 'needs-fixes') {
        const rf = await refreshFix(refresh)
        if (rf) { spory.push(...(rf.spory || [])); log(`refresh PRD: zapracováno (${(rf.zmenena_mista || []).length} míst, ${(rf.odmitnute || []).length} odmítnuto)`) }
        else log('refresh PRD: zapracování selhalo, nálezy jdou implementaci jako hypotézy')
      }
    }
  }

  // ---- implementace ----
  let ted = null
  if (!sCastmi) {
    vstup('Implementace', 'implementace')
    const im = await impl(n, predchozi, diag, refresh)
    if (!im) return fail('implementace', nic(`implement:řez ${NN}:${n}`, 'implementační agent'))
    sberImpl(im)
    log(`implementace (pokus ${n}): ${im.stav}, typecheck ${im.typecheck ? 'ok' : 'červený'}, testy ${im.testy_zelene ? 'zelené' : 'červené'}`)
    if (im.stav === 'selhalo') return fail('implementace', im.souhrn)
  } else {
    ted = await implementaceCasti(n, predchozi, diag, refresh, sberImpl)
    if (ted.chyba) return fail('implementace', ted.chyba)
  }

  // ---- review ----
  vstup('Review', 'review')
  // Lehký profil: bez thermo a bez kola 2 (řez bez runtime dopadu; v běhu doplneni-webu stálo review řezu 0 víc než jeho implementace).
  if (profil === 'lehky') log('lehký profil: thermo se nekoná, review má jedno kolo')
  // U částí jde review po částech (jen soubory části) a integrační review nad kontraktem a švy; každá hotová část projde
  // review jednou, i když byla hotová už v pokusu, který padl dřív, než review začalo.
  const ulohy = []
  const kRevizi = sCastmi ? casti.filter(c => castiStav.get(c.id).hotovo && !castiStav.get(c.id).zrevidovano) : []
  // Pořadí nejdelší první: při stropu souběhu Workflow čekal nejdelší agent dávky (integrační review) ve frontě až nakonec
  // (běh web-podzim: fronta review ~1 h za běh). Integrační review a review opravy, pak review částí od největší, pak thermo.
  if (!sCastmi) {
    ulohy.push({ f: () => reviewRez() })
    if (profil !== 'lehky') ulohy.push({ th: true, f: () => thermo(null) })
  } else {
    if (ted.integrace) ulohy.push({ f: () => reviewIntegrace(ted.integrace) })
    if (ted.oprava) ulohy.push({ f: () => reviewOprava(ted.oprava, n) })
    const rozsah = c => { const st = castiStav.get(c.id); return st.soubory.length ? st.soubory : c.soubory }
    const podleVelikosti = [...kRevizi].sort((x, y) => rozsah(y).length - rozsah(x).length)
    for (const c of podleVelikosti) ulohy.push({ cast: c.id, f: () => reviewCast(c, rozsah(c)) })
    if (profil !== 'lehky') for (const c of podleVelikosti) ulohy.push({ th: true, cast: c.id, f: () => thermo(c, rozsah(c)) })
  }
  const vysReview = ulohy.length ? await parallel(ulohy.map(u => u.f)) : []
  // Část je zrevidovaná, až když její review (v plném profilu i thermo) vrátilo výsledek; jinak ji posoudí další pokus
  // (revize 1.4.0: review části K2 bez výsledku ji označilo za zrevidovanou a pokus 2 ji už nikdo neposoudil).
  for (const c of kRevizi) {
    const bez = ulohy.filter((u, i) => u.cast === c.id && !vysReview[i]).map(u => (u.th ? 'thermo' : 'review'))
    if (bez.length) log(`část ${c.id}: ${bez.join(' a ')} bez výsledku, část posoudí další pokus`)
    else castiStav.get(c.id).zrevidovano = true
  }
  ths = vysReview.filter((r, i) => r && ulohy[i].th)
  const r1s = vysReview.filter((r, i) => r && !ulohy[i].th)
  const thNalezu = ths.reduce((s, t) => s + (Number(t.nalezu) || 0), 0), thBlokeru = ths.reduce((s, t) => s + (Number(t.blokeru) || 0), 0)
  if (ths.length) { ths.forEach(t => reports.push(t.report_path)); log(`thermo: ${thNalezu} nálezů, ${thBlokeru} blokujících${ths.length > 1 ? ` (${ths.length} reportů)` : ''}`) }
  const sThermoNalezy = ths.filter(t => t.nalezu > 0)
  // Thermo bez souborů BLOCKER/HIGH, nebo když žádné review nevrátilo výsledek, opravuje samostatný agent (jako dřív).
  const thermoZbyva = sThermoNalezy.filter(t => !r1s.length || !thermoSoubory(t).length)
  if (r1s.length) {
    kola = 1
    nalezu = r1s.reduce((s, r) => s + (Number(r.nalezu) || 0), 0); blokujicich = r1s.reduce((s, r) => s + (Number(r.blokujicich) || 0), 0)
    r1s.forEach(r => reports.push(r.report_path))
    let balicky = sluc(r1s.flatMap(balickyZ))
    for (const t of sThermoNalezy.filter(t => thermoSoubory(t).length)) balicky = pridejThermo(balicky, t)
    // Nejdelší balíček první (strop souběhu Workflow): podle počtu souborů, pak počtu nálezů.
    const vaha = b => [b.soubory.length, b.zdroje.reduce((s, z) => s + z.ids.length, 0)]
    balicky.sort((x, y) => vaha(y)[0] - vaha(x)[0] || vaha(y)[1] - vaha(x)[1])
    // FOLLOW-UP nálezy review, které nejdou opravě, jdou do follow-upů s odkazem na report (dosud se ztrácely v gitignorovaných reportech).
    const kOprave = new Set(r1s.flatMap(r => pole(r.balicky).flatMap(b => trimList(b && b.nalezy).map(id => `${S(r.report_path)}#${id}`))))
    for (const r of r1s) for (const id of trimList(r.follow_up_ids)) if (!kOprave.has(`${S(r.report_path)}#${id}`)) followUps.push(`${id} (FOLLOW-UP z ${S(r.report_path)})`)
    log(`review 1: ${nalezu} nálezů, ${blokujicich} blokujících${r1s.length > 1 ? ` (${r1s.length} review)` : ''}, ${balicky.length} balíčků${balicky.some(b => b.zdroje.some(z => z.thermo)) ? ' (thermo v téže vlně)' : ''}`)
    const opravy = (await parallel(balicky.map((b, i) => () => fixBalicek(b, i, 1).then(f => f && { f, b })))).filter(Boolean)
    fixAgentu += opravy.length
    const odmBlok = []
    for (const { f, b } of opravy) {
      sber(f, { vynutit: b.security, soubory: b.soubory, zdroj: b.zdroje.flatMap(z => z.ids).join(', ') || 'bezpečnostní balíček' })
      odmBlok.push(...pole(f.odmitnuto).filter(o => o && o.blokuje).map(o => `${S(o.id)} — ${S(o.duvod).slice(0, 300)}`))
    }
    const rozsireni = opravy.filter(x => x.f.rozsireny_zasah)
    const varka = trimList(opravy.flatMap(x => x.f.zmenena_mista || []))
    // Kolo 2 i nad odmítnutým blokujícím nálezem: obstojí odmítnutí? (třída H)
    if (profil !== 'lehky' && opravy.length && (rozsireni.length || blokujicich > 0 || thBlokeru > 0 || odmBlok.length)) {
      if (odmBlok.length) log(`review 1: ${odmBlok.length} blokujících nálezů odmítnuto, kolo 2 přeměří odmítnutí`)
      const r2 = await review2(varka.length ? varka : ['celá opravná várka'], odmBlok, r1s.map(r => r.report_path))
      if (r2) {
        kola = 2; nalezu += r2.nalezu; blokujicich = r2.blokujicich; reports.push(r2.report_path)
        const kOprave2 = new Set(pole(r2.balicky).flatMap(b => trimList(b && b.nalezy)))
        for (const id of trimList(r2.follow_up_ids)) if (!kOprave2.has(id)) followUps.push(`${id} (FOLLOW-UP z ${S(r2.report_path)})`)
        log(`review 2 (opravná várka): ${r2.nalezu} nálezů, ${r2.blokujicich} blokujících`)
        if (r2.blokujicich > 0 && (r2.balicky || []).length) {
          const vsechny = { soubory: cesty(r2.balicky.flatMap(b => b.soubory || [])), security: r2.balicky.some(b => b.security), zdroje: [{ report: S(r2.report_path), ids: trimList(r2.balicky.flatMap(b => b.nalezy || [])) }] }
          const f2 = await fixBalicek(vsechny, 0, 2); fixAgentu += f2 ? 1 : 0
          sber(f2, { vynutit: vsechny.security, soubory: vsechny.soubory, zdroj: vsechny.zdroje[0].ids.join(', ') || 'bezpečnostní balíček' })
          log('review: třetí kolo se nekoná, zbylé nálezy jdou do follow-ups')
        }
      }
    }
  } else log(ulohy.length ? 'review nevrátilo výsledek, pokračuji bránou' : 'review: v tomto pokusu není co posoudit')
  if (thermoZbyva.length) {
    thermoFix = await fixThermo(thermoZbyva); sber(thermoFix, { zdroj: 'oprava thermo' }); fixAgentu += thermoFix ? 1 : 0
    if (thermoFix) log(`thermo oprava samostatně: ${thermoFix.opraveno} opraveno, ${(thermoFix.odmitnuto || []).length} odmítnuto`)
  }

  // ---- brána ----
  vstup('Brána', 'brana')
  let v = await verify(1)
  if (!v) return fail('brána', nic(`verify:řez ${NN}:1`, 'verify agent'))
  let vk = 1
  if (!zelena(v)) {
    log(`brána červená: ${branaDuvod(v).slice(0, 200)}; jedna oprava`)
    const fb = await fixBrana(v); sber(fb, { zdroj: 'oprava brány' }); fixAgentu += fb ? 1 : 0
    v = await verify(2); vk = 2
    if (!zelena(v)) return fail('brána', v ? `${branaDuvod(v)}: ${(v.selhavajici || []).slice(0, 10).join(' | ')}` : nic(`verify:řez ${NN}:2`, 'verify agent'))
  }
  const branaReport = S(v.vystup_path).trim() || rep('verify', vk)
  const meridla = trimList(v.meridla)
  log(`brána zelená: ${v.proslo} testů${meridla.length ? `, ${meridla.length} měřidel` : ''}${trimList(v.kontroly).length ? `, ${trimList(v.kontroly).length} kontrol pre-commitu` : ''}`)

  // Doklad před migrací se pořizuje jednou za blok: pokus 2 a dál dostane doklad z dřívějšího pokusu (stav před prvním zápisem;
  // nový doklad by zachytil stav po zápisech, běh web-podzim řez 04). Cestu bere blok z návratu agenta (při existujícím souboru
  // zapisuje doklad vedle s příponou -p<pokus>).
  if (dokladPred && dokladCesta) log(`doklad před nasazením: platí doklad z dřívějšího pokusu (${dokladCesta}), znovu se nepořizuje`)
  else if (dokladPred) {
    vstup('Doklad', 'doklad')
    let dk = await doklad()
    if (!dk || !dk.ok) { log(`doklad před nasazením: ${dk ? S(dk.duvod).slice(0, 160) : nic(`doklad:řez ${NN}`, 'agent')}; jeden pokus navíc`); dk = await doklad() }
    if (!dk || !dk.ok) return fail('doklad', dk ? `doklad před migrací nejde pořídit: ${S(dk.duvod).slice(0, 600)}` : nic(`doklad:řez ${NN}`, 'doklad agent'))
    dokladCesta = S(dk.path).trim() || dokladPath
    reports.push(dokladCesta); log(`doklad před nasazením: ${S(dk.souhrn).slice(0, 160) || dokladCesta}`)
  }

  // ---- deploy ----
  vstup('Deploy', 'deploy')
  // Pokus 2+ po selhání v deployi nebo E2E: deploy dostane příčinu a diagnózu (v řezu 1 běhu bez-dluhu dostal deploy v každém
  // pokusu stejné zadání a zopakoval tutéž chybu).
  const predDeploy = predchozi && ['deploy', 'e2e'].includes(predchozi.faze) ? predchozi : null
  let d = await nasad(1, '', { predchozi: predDeploy, diag })
  if (infra(d)) return zastav(d)
  if (chybaNasazeni(d, 1)) return fail('deploy', chybaNasazeni(d, 1))
  log(`deploy: ${d.stav}, commit ${d.commit}${krokyPo.length ? `, ${krokyPo.length} kroků po nasazení` : ''}${securityCommity.length ? `, ${securityCommity.length} bezpečnostních commitů` : ''}`)

  // ---- E2E ----
  vstup('E2E', 'e2e')
  // Verdikt se odvozuje z počtů, ne z textu verifikátora: fail > 0 je fail, ať verifikátor napsal cokoli.
  // Vadné kritérium (nesplnitelné, kolidující, předřezový nález, scénář zastaralý po opravě) není selhání implementace:
  // žádná oprava ani další pokus, řez se uzavře a kritérium jde orchestrátorovi jako rozhodnutí pro majitele.
  const normE2E = e => {
    const vadna = trimList(e.vadna_kriteria)
    e.vadna_kriteria = vadna
    e.vysledek = (e.fail > 0 || (e.fail_kriteria || []).length) ? 'fail' : vadna.length ? 'vada-kriteria' : e.castecne > 0 ? 'pass-castecne' : 'pass'
    if (e.fail === 0 && (e.fail_kriteria || []).length) e.fail = e.fail_kriteria.length
    return e
  }
  const e2eOpts = () => ({ commit: d.commit, nasazeni: nasazeniReport, brana: branaReport, meridla, zmeny: zmenyPokusu() })
  let e = await e2e(1, e2eOpts())
  if (e2eNic(e, 1)) return fail('e2e', e2eNic(e, 1))
  // Vada prostředí (nasazená revize není commit řezu, aplikace nedostupná) není nález pro fix agenta: jednou dorovnat nasazení
  // s popisem vady od E2E a přeměřit.
  if (S(e.prostredi).trim()) {
    log(`E2E 1: vada prostředí (${S(e.prostredi).slice(0, 160)}); dorovnání nasazení a jedno přeměření`)
    const dp = await nasad(2, 'dorovnání prostředí po E2E', { prostredi: e.prostredi })
    if (infra(dp)) return zastav(dp)
    if (chybaNasazeni(dp, 2)) return fail('deploy', chybaNasazeni(dp, 2))
    d = dp
    e = await e2e(1, e2eOpts())
    if (e2eNic(e, 1)) return fail('e2e', `${e2eNic(e, 1)} po dorovnání prostředí`)
    if (S(e.prostredi).trim()) return fail('e2e', `vada prostředí trvá: ${S(e.prostredi).slice(0, 600)}`)
  }
  normE2E(e); reports.push(e.report_path)
  log(`E2E 1: ${e.vysledek} (${e.pass}/${e.celkem}, částečně ${e.castecne}, fail ${e.fail}${e.vadna_kriteria.length ? `, vadná kritéria ${e.vadna_kriteria.length}` : ''}${e2eSkupiny.length >= 2 ? `, ${e2eSkupiny.length} verifikátoři` : ''})`)
  if (e.vysledek === 'fail') {
    const fe = await fixE2E(e, 1); sber(fe, { zdroj: 'oprava po E2E' }); fixAgentu += fe ? 1 : 0
    const d2 = await nasad(2, 'oprava po E2E')
    if (infra(d2)) return zastav(d2)
    if (chybaNasazeni(d2, 2)) return fail('deploy', chybaNasazeni(d2, 2))
    d = d2
    const e1 = e
    // Kolo 2 přeměří jen jmenovaná FAIL kritéria kola 1. Když kolo 1 hlásí víc FAIL, než jich jmenuje, nejde říct která, a kolo 2
    // měří všechna (revize 1.4.0: fail 2 bez jmen dal kolu 2 prázdný seznam a řez prošel bez přeměření). Bez runtime dopadu
    // měří kolo 2 všechna kritéria vždy (zadání kritérií nic nezužuje) a skládat ho s kolem 1 by počty zdvojilo.
    const jmenovana = trimList(e1.fail_kriteria)
    const vse = !runtimeDopad || (Number(e1.fail) || 0) > jmenovana.length
    if (vse && runtimeDopad) log(`E2E 1: fail ${e1.fail}, jmenovaných kritérií ${jmenovana.length}; kolo 2 přeměří všechna`)
    const e2 = await e2e(2, { ...e2eOpts(), fail: vse ? null : jmenovana })
    if (e2eNic(e2, 2)) return fail('e2e', `${e2eNic(e2, 2)} v kole 2`)
    if (S(e2.prostredi).trim()) return fail('e2e', `vada prostředí v kole 2: ${S(e2.prostredi).slice(0, 600)}`)
    // Plné přeměření, které nezměřilo nic, není pass: kolo 1 mělo kritéria, kolo 2 je vrátilo nula (neproběhlo není spadlo).
    if (vse && !(Number(e2.celkem) > 0) && Number(e1.celkem) > 0) return fail('e2e', `kolo 2 mělo přeměřit všechna kritéria (${e1.celkem}) a vrátilo celkem 0`)
    e = normE2E(vse ? { ...e2, ...zKola1(e1, e2), report_path: [e1.report_path, e2.report_path].filter(Boolean).join(' + ') } : slozE2E(e1, e2)); reports.push(e2.report_path)
    log(`E2E 2 (${vse ? 'všechna kritéria' : 'jen FAIL kola 1'}): ${e.vysledek} (${e.pass}/${e.celkem}, fail ${e.fail}${e.vadna_kriteria.length ? `, vadná kritéria ${e.vadna_kriteria.length}` : ''})`)
    if (e.vysledek === 'fail') return fail('e2e', `FAIL kritéria po opravě: ${(e.fail_kriteria || []).join(' | ') || `${e.fail} bez jmen`}`)
  }
  if (e.vadna_kriteria.length) {
    log(`E2E: ${e.vadna_kriteria.length} vadných kritérií, bez opravy; řez se uzavře a jdou jako rozhodnutí pro majitele`)
    rozhodnuti.push(...e.vadna_kriteria.map(k => `[řez ${NN} vadné kritérium] ${k}`))
  }
  followUps.push(...(e.kosmeticke || []).map(k => `[E2E kosmetika řez ${NN}] ${k}`))
  // Závažné nálezy mimo kritéria: oprava bez commitu, brána nad ní a nasazení se samostatným commitem fix(security).
  if ((e.zavazne_mimo_ak || []).length) {
    log(`E2E: ${e.zavazne_mimo_ak.length} závažných nálezů mimo kritéria, oprava, brána a samostatný commit`)
    const fs = await fixSecurity(e); fixAgentu += fs ? 1 : 0
    sber(fs, { vynutit: true, zdroj: `E2E ${trimList(e.zavazne_mimo_ak).join('; ').slice(0, 300)}` })
    if (!fs) { log('fix-security nevrátil výsledek, nálezy jdou do follow-ups'); followUps.push(...e.zavazne_mimo_ak.map(z => `[E2E bezpečnost řez ${NN} · neopraveno] ${z}`)) }
    else if (!(fs.opraveno > 0 || trimList(fs.zmenena_mista).length)) log('fix-security nic nezměnil, nálezy zůstávají ve follow-ups')
    else {
      let vs = await verify('sec')
      if (!zelena(vs)) {
        log(`brána po bezpečnostní opravě červená: ${branaDuvod(vs).slice(0, 200)}; jedna oprava`)
        const fb = vs ? await fixBrana(vs) : null; sber(fb, { zdroj: 'oprava brány' }); fixAgentu += fb ? 1 : 0
        vs = await verify('sec-2')
        if (!zelena(vs)) return fail('e2e', `bezpečnostní oprava neprošla bránou: ${branaDuvod(vs)}`)
      }
      const d3 = await nasad(3, 'bezpečnostní oprava')
      if (infra(d3)) return zastav(d3)
      if (!chybaNasazeni(d3, 3)) d = d3
      else { log(`deploy bezpečnostní opravy selhal (${chybaNasazeni(d3, 3).slice(0, 160)}), zůstává v pracovním stromě jako follow-up`); followUps.push(`[řez ${NN} · bezpečnost] bezpečnostní oprava po E2E zůstala nenasazená v pracovním stromě: ${chybaNasazeni(d3, 3).slice(0, 300)}`) }
    }
  }

  // ---- uzavření ----
  vstup('Uzavření', 'uzavreni')
  // Řez s částmi skládá revizi pokusů, které padly až za review (revizeDrive), s tímto pokusem; malý řez reviduje každý pokus celý.
  const drive = sCastmi ? revizeDrive : []
  const soucet = (xs, f) => xs.reduce((s, x) => s + (Number(x[f]) || 0), 0)
  const thsVse = [...drive.flatMap(r => r.ths), ...ths]
  const thNalezuVse = soucet(thsVse, 'nalezu'), thBlokeruVse = soucet(thsVse, 'blokeru')
  const kolaVse = Math.max(kola, ...drive.map(r => r.kola))
  const nalezuVse = nalezu + soucet(drive, 'nalezu'), blokujicichVse = blokujicich + soucet(drive, 'blokujicich'), fixAgentuVse = fixAgentu + soucet(drive, 'fixAgentu')
  const e2eText = `${e.vysledek} ${e.pass}/${e.celkem}${e.castecne ? ` (částečně ${e.castecne})` : ''}${e.vadna_kriteria.length ? ` (vadná kritéria ${e.vadna_kriteria.length})` : ''}`
  const reviewText = `${kolaVse} kol, ${nalezuVse} nálezů, ${fixAgentuVse} fix agentů`
  const thermoOprava = !thsVse.length ? 'bez výsledku' : thNalezuVse === 0 ? 'nic' : (thermoFix || drive.some(r => r.thermoFix) ? 'samostatně' : 've vlně review')
  const thermoText = thsVse.length ? `${thNalezuVse} nálezů, ${thBlokeruVse} blokujících, oprava ${thermoOprava}` : 'bez výsledku'
  const odmitnuteSeznam = trimList([...drive.flatMap(r => r.odmitnute), ...odmitnute])
  const c = await close({ commit: d.commit, security: trimList(securityCommity), odchylky, pokusy: n, e2e: e2eText, review: reviewText, thermo: thermoText,
    thermo_paths: thsVse.filter(t => t.nalezu > 0).map(t => t.report_path).filter(Boolean), follow_ups: followUps, vadna: e.vadna_kriteria,
    odmitnute: odmitnuteSeznam, jinak: trimList([...drive.flatMap(r => r.jinak), ...jinak]), meridla, kroky: krokyPo, predavky: predavekCelkem })
  // commit_overeny platí jen jako plný hash: zkrácený nebo text by šel do návratu jako commit řezu (revize 1.4.0).
  const coVraceny = S(c && c.commit_overeny).trim()
  const commitOvereny = /^[0-9a-f]{40}$/.test(coVraceny) ? coVraceny : ''
  if (coVraceny && !commitOvereny) log(`uzavření: commit_overeny „${coVraceny.slice(0, 60)}“ není 40znakový hash, platí commit z deploye ${d.commit}`)
  if (c) {
    if ((c.chybejici_doklady || []).length) { odchylky.push(...c.chybejici_doklady.map(x => `chybí doklad předepsaný PRD/vizí: ${x}`)); log(`uzavření: ${c.chybejici_doklady.length} chybějících dokladů`) }
    if (c.thermo_nesesouhlaseno > 0) log(`uzavření: ${c.thermo_nesesouhlaseno} thermo nálezů BLOCKER/HIGH bez sesouhlasení`)
    if (commitOvereny && commitOvereny !== S(d.commit).trim()) log(`uzavření: commit řezu je ${commitOvereny}, deploy hlásil ${d.commit}`)
    if ((c.chybejici_commity || []).length) log(`uzavření: bezpečnostní commity neexistují: ${c.chybejici_commity.join(', ')}`)
  }
  const chybejiciCommity = c ? trimList(c.chybejici_commity) : []
  const secCommity = trimList(securityCommity).filter(h => !chybejiciCommity.includes(h))
  return {
    vysledek: 'hotovo', pokusy: n, profil, commit: commitOvereny || d.commit, commit_zapisu: commitZapisu, deploy: d.stav, health: S(d.health).slice(0, 800), doklad_pred: dokladPred ? (dokladCesta || dokladPath) : null,
    oblasti: trimList(implVysledky.flatMap(r => r.oblasti || [])),
    e2e: { vysledek: e.vysledek, celkem: e.celkem, pass: e.pass, castecne: e.castecne, fail: e.fail, castecna_kriteria: e.castecna_kriteria || [], vadna_kriteria: e.vadna_kriteria },
    review: { kola: kolaVse, nalezu: nalezuVse, blokujicich: blokujicichVse, fix_agentu: fixAgentuVse, security_commity: secCommity },
    thermo: thsVse.length ? { nalezu: thNalezuVse, blokeru: thBlokeruVse, oprava: thermoOprava, nesesouhlaseno: c ? (c.thermo_nesesouhlaseno || 0) : null } : null,
    rozhodnuti, ...seznamy(followUps, odchylky, pasti, Boolean(c && c.ok)), spory, reports: trimList([...reports, ...drive.flatMap(r => r.ths.map(t => t.report_path))]),
    uzavreni: c ? c.ok : false, chybejici_doklady: c ? (c.chybejici_doklady || []) : [], chybejici_commity: chybejiciCommity,
    kroky_po_nasazeni: krokyPo, security_commity: secCommity, odmitnute: odmitnuteSeznam, meridla, kontext: c ? S(c.kontext) : '', ...historie(),
  }
}

// ---------- pokusy ----------
const stavCasti = () => casti.map(c => ({ id: c.id, hotovo: castiStav.get(c.id).hotovo }))
let last = null, diag = null
for (let n = 1; n <= MAX_POKUSU; n++) {
  P = n
  // Diagnóza jen před třetím pokusem: při max_pokusu 1 by `n === MAX_POKUSU` spustil diagnózu bez předchozího selhání.
  if (n === 3) { vstup('Diagnóza', ''); diag = await diagnose(last); log(diag ? `diagnóza: ${S(diag.pricina).slice(0, 160)}` : 'diagnóza bez výsledku') }
  const res = await pokus(n, last, diag)
  if (res.vysledek === 'hotovo') { log(`řez ${NN} hotový na pokus ${n}, commit ${res.commit}`); return { ok: true, rez: NN, ...res, casti: stavCasti(), predavky: predavekCelkem } }
  if (res.vysledek === 'zastaveno') { log(`řez ${NN} zastaven v pokusu ${n}: infra selhání nasazení (${res.detail.slice(0, 160)}); pokus se nepočítá, blok čeká na obnovu od fáze deploy`); return { ok: true, rez: NN, ...res, casti: stavCasti(), predavky: predavekCelkem } }
  log(`pokus ${n} selhal ve fázi ${res.faze}`)
  if (sCastmi && res.faze !== 'implementace') opravaZ = res
  if (sCastmi) revizeDrive.push(res.revize)
  last = res
}
// Hashe fix(security) z deployů všech pokusů jdou i do selhaného návratu: commity v repu existují, orchestrátor je nesmí ztratit.
return { ok: true, rez: NN, vysledek: 'selhalo', pokusy: MAX_POKUSU, faze: last.faze, detail: last.detail, diagnoza: diag ? { pricina: diag.pricina, doporuceni: diag.doporuceni, repro: S(diag.repro_path) } : null, follow_ups: last.follow_ups, follow_ups_pocet: last.follow_ups_pocet, odchylky: last.odchylky, odchylky_pocet: last.odchylky_pocet, pasti_opravene: last.pasti_opravene, pasti_pocet: last.pasti_pocet, seznamy_zapsane: false, ...historie(), spory: last.spory, reports: last.reports, rozhodnuti: last.rozhodnuti || [], odmitnute: sCastmi ? trimList(revizeDrive.flatMap(r => r.odmitnute)) : (last.odmitnute || []), security_commity: trimList(securityCommity), casti: stavCasti(), predavky: predavekCelkem }
