export const meta = {
  name: 'blok-prd',
  description: 'dev-pipeline blok PRD jednoho řezu: PRD architekt napíše PRD a E2E scénáře (velký řez jako kostru s Kontraktem a tabulkou Částí, PRD částí souběžně píšou autoři částí), nezávislá kontrola po dokumentech (měřidla kritérií se spouští už v kole 1), zapracování nálezů (kostra, pak části), delta kontrola jen nad změněnými místy. Žádné třetí kolo, zbylé nálezy jdou stavbě jako hypotézy. Režim zapracovani: jen zapracování nálezů orchestrátora do hotového PRD + delta kontrola.',
  whenToUse: 'Spouští orchestrátor /dev-pipeline:orchestrate před blokem stavby každého řezu. args: {cwd, plugin_root, rez, args_file} (args_file = docs/.prd-NN.json ze scripts/args-bloku.py; první agent bloku ho načte spolu s docs/.run-args.json), nebo celé {cwd, plugin_root, vize, produkt, rez, plan_row, stav_po_minulem, hypotezy, follow_ups, app_pristup, profil, prd_lehke, kontrakt_prd, kontrakt_rez, mapa_vize}; režim zapracování navíc {rezim: "zapracovani", prd_path, e2e_path, nalezy: [...], puvodni}; pokračování po návrhu rozdělit řez {od_faze: "autori", puvodni} (puvodni = celý předchozí návrat bloku PRD včetně pole stavba). Návrh rozdělit řez ukončí blok hned po architektovi. Bez args nic nedělá.',
  phases: [
    { title: 'PRD', detail: 'PRD architekt píše PRD a E2E scénáře; velký řez rozdělí na části (kostra s Kontraktem a tabulkou Částí), malý řez píše celý' },
    { title: 'Autoři částí', detail: 'jen u řezu s částmi: autor každé části souběžně píše PRD své části ověřené proti kódu své oblasti' },
    { title: 'Kontrola', detail: 'prd-check kolo 1 kostry (u malého řezu celého PRD) a souběžně každé části, plné reporty do souborů' },
    { title: 'Zapracování', detail: 'nejdřív kostra (nálezy, požadavky částí na Kontrakt), pak souběžně části; vrací změněná místa' },
    { title: 'Delta kontrola', detail: 'prd-check jen nad změněnými místy, po dokumentech s aspoň dvěma blokujícími nálezy kola 1; u lehkého profilu a lehkého PRD mini-řezu nikdy' },
  ],
}

// ---------- vstup ----------
let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch { a = null } }
// Args ze souboru (spec 1.6.0 § 1.3): orchestrátor v běhu web-rijen přepsal args bloků ručně 26× (159 k znaků výstupu) a runtime
// je potřetí opsal do notifikace; stavba 8 dostala mapu kostry řezu 7. Skript Workflow soubory číst neumí, proto soubor načte agent.
if (a && typeof a === 'object' && a.args_file) {
  const n = await nactiArgs(a)
  if (!n.ok) { log(`blok-prd: ${n.duvod} – nic se nespustilo`); return { ok: false, rez: n.rez, duvod: n.duvod } }
  a = n.args
}
if (!a || typeof a !== 'object' || !a.cwd || !a.vize || a.rez == null || a.rez === '' || !a.plan_row) {
  log('blok-prd: chybí args (cwd, vize, rez, plan_row) – nic se nespustilo')
  return { ok: false, duvod: 'chybí args: cwd, vize, rez, plan_row' }
}
const S = v => String(v == null ? '' : v)
const NN = String(a.rez).padStart(2, '0')
const cwd = S(a.cwd)
// Pravidla běhu (KONTRAKT.md: soubory, frontmatter PRD, vize-spory). V rámci se nejmenují „kontrakt“: architekt a autoři částí
// pracují se sekcí Kontrakt kostry PRD a dva různé kontrakty v jednom zadání se pletou.
const pravidlaBehu = a.plugin_root ? `${a.plugin_root}/skills/orchestrate/KONTRAKT.md` : null
const produkt = a.produkt ? S(a.produkt) : null
const row = a.plan_row
const stavPoMinulem = a.stav_po_minulem ? S(a.stav_po_minulem) : null
const hypotezy = Array.isArray(a.hypotezy) ? a.hypotezy.map(S) : []
const followUps = a.follow_ups ? S(a.follow_ups) : `${cwd}/docs/follow-ups.md`
const spory = `${cwd}/docs/vize-spory.md`
// Pokyny majitele k prostředí (přístup do aplikace, nasazení, doklady): PRD podle nich předepisuje doklad před migrací.
const appPristup = a.app_pristup ? S(a.app_pristup).slice(0, 1200) : ''
// Lehký profil (řádek plánu `profil: lehký`, nebo úsudek orchestrátora u řezu bez runtime dopadu): bez delta kontroly.
const profil = a.profil === 'lehky' ? 'lehky' : 'plny'
// Lehké PRD mini-řezu finální fáze (z validátoru): bez delta kontroly, zbytek jako plný profil (thermo a review stavby zůstávají).
// Mini-řez 11 běhu web-rijen čekal na PRD 49 min na kritické cestě.
const prdLehke = a.prd_lehke === true
// PRD závislého řezu souběžně se stavbou jeho závislosti: PRD stavěného řezu je kontrakt, rozhraní z něj jsou předpoklady.
const kontraktPrd = a.kontrakt_prd ? S(a.kontrakt_prd) : ''
const kontraktRez = a.kontrakt_rez != null && a.kontrakt_rez !== '' ? String(a.kontrakt_rez).padStart(2, '0') : ''
// Mapa sekcí vize s řádky od–do (setup orchestrátora): agenti bloku čtou výřez vize, ne celou. PRD agent běhu bez-dluhu
// protočil Ø 433 k, z toho 72 k vize (118 kB, čtená celá).
const mapa = a.mapa_vize ? S(a.mapa_vize).slice(0, 2400) : ''
// Režim zapracování: orchestrátor odmítl odchylku od plánu nebo chybí pokrytí bodů vize; místo nového PRD (celý blok znovu)
// běží jen PRD agent v režimu zapracování nad hotovým PRD (kostrou) a delta prd-check nad změněnými místy.
const rezim = a.rezim === 'zapracovani' ? 'zapracovani' : 'novy'
const nalezyOrch = (Array.isArray(a.nalezy) ? a.nalezy.map(S) : (a.nalezy ? [S(a.nalezy)] : [])).filter(Boolean)
if (rezim === 'zapracovani' && (!a.prd_path || !nalezyOrch.length)) {
  log('blok-prd: režim zapracovani vyžaduje prd_path a nalezy – nic se nespustilo')
  return { ok: false, duvod: 'režim zapracovani vyžaduje prd_path a nalezy' }
}
// Předchozí návrat bloku PRD pro režim zapracování (casti, e2e_sekce, kontrakt_potreba, doklad_pred, doklad_popis, odhad_radku,
// kriteria): výchozí hodnoty, které přebije jen to, co zapracování výslovně vrátí. Bez nich návrat ztratil e2e_sekce (stavba
// pustila jednoho verifikátora na 30 kritérií) a přepnul kontrakt_potreba na true a doklad_pred na false (revize 1.4.0).
const puvodni = a.puvodni && typeof a.puvodni === 'object' && !Array.isArray(a.puvodni) ? a.puvodni : null
// Od 1.6.0 nese návrat bloku pole pro stavbu (casti, e2e_sekce, kontrakt_potreba …) v podobjektu stavba: puvodni je celý předchozí
// návrat, pole ze stavba mají přednost; starý tvar (casti nahoře) platí dál.
const pu = puvodni ? { ...puvodni, ...(puvodni.stavba && typeof puvodni.stavba === 'object' ? puvodni.stavba : {}) } : {}
// Pokračování po návrhu rozdělit řez (spec 1.6.0 § 1.8): blok skončil po architektovi, orchestrátor řez nerozdělil a pouští blok
// znovu od autorů částí nad kostrou z disku (cesty a části z puvodni). Rozdělení řezu 10 v běhu web-rijen odmítl, protože by
// zahodilo hotové PRD za $125; stavba pak trvala 309 min na 2 pokusy.
const odFaze = a.od_faze ? S(a.od_faze) : ''
if (odFaze && (odFaze !== 'autori' || rezim === 'zapracovani')) {
  log(`blok-prd: od_faze „${odFaze}“ blok nezná (jen „autori“ mimo režim zapracování) – nic se nespustilo`)
  return { ok: false, rez: NN, duvod: `neznámé od_faze: ${odFaze}` }
}
if (odFaze && !(puvodni && pu.prd_path && Array.isArray(pu.casti) && pu.casti.length)) {
  log('blok-prd: od_faze autori vyžaduje puvodni s prd_path a casti (návrat bloku po architektovi) – nic se nespustilo')
  return { ok: false, rez: NN, duvod: 'od_faze autori vyžaduje puvodni s prd_path a casti' }
}

// ---------- pomocné ----------
const cekej = ms => (ms > 0 && typeof setTimeout === 'function') ? new Promise(r => setTimeout(r, ms)) : Promise.resolve()
const seznam = v => (Array.isArray(v) ? v : (v ? [v] : [])).map(S).map(x => x.trim()).filter(Boolean)
// Seznam do zadání celý po položkách, strop celku jen jako pojistka. Ořez celku uprostřed položky (slice(0, 2000)) ztratil v běhu
// web-podzim 111 ze 197 požadavků autorů na Kontrakt: kontrola ani zapracování kostry je neviděly.
const spojCele = (xs, strop = 20000) => {
  const out = []
  let delka = 0
  for (const x of xs) {
    if (delka + x.length > strop) { out.push(`… a ${xs.length - out.length} dalších položek nad strop zadání`); break }
    out.push(x); delka += x.length + 3
  }
  return out.join(' | ')
}
// Pořadí „nejdelší první“: Workflow pouští souběžně nejvýš min(16, jádra − 2) agentů a zbytek řadí do fronty v pořadí volání.
// Dlouhý agent na konci dávky čeká na volný slot a prodlouží celou fázi (běh web-podzim: PRD řezu 13 +30 min na stropu 6).
// Výsledky vrací v pořadí items.
async function parallelOdNejdelsiho(items, delka, fn) {
  const poradi = items.map((_, i) => i).sort((p, q) => (delka(items[q]) - delka(items[p])) || p - q)
  const vysl = await parallel(poradi.map(i => () => fn(items[i], i)))
  const out = items.map(() => null)
  poradi.forEach((i, j) => { out[i] = vysl[j] || null })
  return out
}
// Opakování po chybě zná stav předchůdce jen z pracovního stromu (třída C2: restart začínal od nuly nad rozdělanou prací).
const poChybe = 'Předchozí běh tohoto zadání skončil bez výsledku a pracovní strom může nést jeho rozdělanou práci: začni inventurou (git status, git diff --stat) a navaž na ni, nezačínej od nuly.'
async function run(prompt, opts) {
  const label = opts.label || 'agent'
  for (let i = 0; i <= 2; i++) {
    let r = null
    try { r = await agent(i >= 1 ? `${prompt}\n\n${poChybe}` : prompt, opts) } catch (e) { log(`${label}: spuštění selhalo (${String(e && e.message || e).slice(0, 120)})`) }
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
// Relativní cesta (docs/reviews/predavka-….md) platí také a doplní se o cwd: v běhu web-rijen ji blok stavby odmítl, návrat
// s nedokončenou prací vzal jako konečný a na nehotové části stavěl další (spec 1.6.0 § 1.2).
const PREDAVKA_CESTA = /(^|\/)docs\/reviews\/predavka-[^/\s]+\.md$/
const absPredavka = s => s.startsWith('/') ? s : `${cwd}/${s.replace(/^\.\//, '')}`
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
    const surova = S(r.predavka).trim()
    const soubor = PREDAVKA_CESTA.test(surova) ? absPredavka(surova) : surova
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
// Části implementace (tvar § 1.6 spec 1.4.0). Jedna část není rozdělení: řez s méně než dvěma částmi běží jako malý (jedna implementace, PRD celé).
// zavisi_na se normalizuje stejně jako id: „K 1“ v závislosti by neodpovídalo části K1 a stavba by závislost zahodila jako neznámou.
const normId = v => S(v).replace(/\s+/g, '')
const castPath = id => `${cwd}/docs/prd/rez-${NN}-cast-${id}.md`
const normCast = (x, i) => {
  const id = normId(x.id) || `K${i + 1}`
  return { id, nazev: S(x.nazev).trim(), soubory: seznam(x.soubory), kriteria: seznam(x.kriteria), odhad_radku: Number(x.odhad_radku) || 0, zavisi_na: [...new Set(seznam(x.zavisi_na).map(normId).filter(Boolean))], prd_path: S(x.prd_path).trim() || castPath(id) }
}
const objekty = v => (Array.isArray(v) ? v : []).filter(x => x && typeof x === 'object')
// Duplicitní id (dvakrát K2, nebo část bez id, jejíž výchozí K<n> už má jiná část) blok přečísluje na nejmenší volné K<n>
// se záznamem v logu a ve vady (revize 1.4.0: dva autoři psali týž soubor rez-NN-cast-K2.md a stavba druhou část zahodila).
// Tabulka Části v kostře duplicitu dál nese: vady jdou zapracování kostry (hlidejCasti).
const normCasti = (v, vady = []) => {
  const syrove = objekty(v), c = syrove.map(normCast)
  if (c.length < 2) return []
  const vsechna = new Set(c.map(x => x.id)), videna = new Set()
  c.forEach((x, i) => {
    if (videna.has(x.id)) {
      let n = 1
      while (vsechna.has(`K${n}`)) n++
      const nove = `K${n}`
      const popis = `${normId(syrove[i].id) ? `id ${x.id} dvakrát (část „${x.nazev}“)` : `část „${x.nazev}“ bez id (výchozí ${x.id} už má jiná část)`}: blok ji přečísloval na ${nove}`
      log(`tabulka Části: ${popis}`); vady.push(popis)
      if (x.prd_path === castPath(x.id)) x.prd_path = castPath(nove)
      x.id = nove; vsechna.add(nove)
    }
    videna.add(x.id)
  })
  return c
}
// Cyklus v zavisi_na (DFS jako ve stavbě): cesta cyklu, nebo null. Závislost na neznámé části cyklus netvoří (stavba ji vynechá).
const cyklusCasti = cs => {
  const stavUzlu = new Map(), cesta = []
  const dfs = c => {
    stavUzlu.set(c.id, 'otevreny'); cesta.push(c.id)
    for (const z of c.zavisi_na) {
      if (stavUzlu.get(z) === 'otevreny') return [...cesta.slice(cesta.indexOf(z)), z]
      const dalsi = cs.find(x => x.id === z)
      if (dalsi && !stavUzlu.has(z)) { const r = dfs(dalsi); if (r) return r }
    }
    stavUzlu.set(c.id, 'hotovy'); cesta.pop()
    return null
  }
  for (const c of cs) if (!stavUzlu.has(c.id)) { const r = dfs(c); if (r) return r }
  return null
}
const vadyCasti = (cs, vady = []) => { const cy = cyklusCasti(cs); return [...vady, ...(cy ? [`cyklus v zavisi_na: ${cy.join(' → ')}`] : [])] }
// Zapracování kostry smí přesunout soubory, kritéria a závislosti mezi částmi; počet a id částí drží architekt (nová část by neměla autora ani kontrolu).
const sloucCasti = (puvodni, nove) => {
  const n = new Map(objekty(nove).map(normCast).map(c => [c.id, c]))
  const cizi = [...n.keys()].filter(id => !puvodni.some(c => c.id === id))
  if (cizi.length) log(`zapracování kostry vrátilo části mimo tabulku architekta (${cizi.join(', ')}): ignoruji, nemají autora ani kontrolu`)
  return puvodni.map(c => n.has(c.id) ? { ...n.get(c.id), nazev: n.get(c.id).nazev || c.nazev, prd_path: c.prd_path } : c)
}
// Sekce E2E s počtem kritérií (§ 1.7), od 1.6.0 i s odhadem minut verifikace a příznakem bez_soubehu (spec 1.6.0 § 1.9): blok stavby
// podle doby skládá souběžné verifikátory (v běhu web-rijen trvala jedna skupina řezu 4 34,5 min, druhá 11,6 min; řez 10 šel
// s 10 kritérii ze 4 oblastí jedním verifikátorem 41 min). Starý tvar (řetězec) přijme také.
const normSekce = v => (Array.isArray(v) ? v : [])
  .map(x => x && typeof x === 'object' ? {
    nazev: S(x.nazev).trim(), kriterii: Math.max(0, Math.round(Number(x.kriterii) || 0)),
    ...(Number(x.doba_min) > 0 ? { doba_min: Math.round(Number(x.doba_min)) } : {}),
    ...(x.bez_soubehu === true ? { bez_soubehu: true } : {}),
  } : S(x).trim())
  .filter(x => typeof x === 'string' ? x : x.nazev)
const ramec = [
  // Hook hlídače kontextu čte číslo řezu z prvního výskytu „Řez NN“ v transkriptu agenta.
  `Řez ${NN}: blok PRD.`,
  `Projekt: ${cwd} (absolutní cesty, git jen na vize větvi).`,
  `Vize: ${a.vize}${produkt ? ` · Produktová severka: ${produkt}` : ''}${pravidlaBehu ? ` · pravidla běhu (soubory, frontmatter PRD, vize-spory): ${pravidlaBehu}` : ''}.`,
  `Vizi nečti celou: přečti Proč, Cíle, Ne-cíle, body vize z řádku plánu, dotčená Povolení a Mantinely${mapa ? ` (mapa sekcí: ${mapa})` : ' (mapu sekcí dá grep -n "^## " vize)'}; ostatní jen grepem podle potřeby.`,
  'Běh je autonomní: uživatele se neptáš. Rozpor nebo chybějící rozhodnutí ve vizi zapiš do docs/vize-spory.md (formát podle pravidel běhu), rozhodni konzervativně a pokračuj.',
  'docs/handoff.md je stav orchestrátora, ne tvůj vstup: nečti ho; co máš vědět, je v tomto zadání.',
  // Monitor v agentovi Workflow nečeká: v běhu web-rijen 0 notifikací za celý běh, verify ho zavolal 308× naprázdno (spec 1.6.0 § 1.10).
  'Tah končí jen strukturovaným návratem. Na proces na pozadí čekáš v tomtéž tahu: spusť ho přes `run_in_background` a kontroluj smyčkou s pevným počtem iterací (`for i in $(seq 1 26); do …; sleep 10; done`). Jedno čekací volání trvá nejvýš 4,5 minuty: cache agenta žije 5 minut. Smyčka bez stropu je zakázaná. `Monitor` v agentovi Workflow nečeká (notifikace nedorazí), nepoužívej ho.',
  'Soubor, který pojmenováváš sám, pojmenuj česky podle vzoru rez-NN-<co>.md; Claude Code subagentům blokuje zápis markdownu se jmény summary, findings, analysis a report-….',
  'Tvůj finální výstup je strukturovaný návrat pro orchestrátor (schéma je vynucené), ne zpráva člověku. Do textových polí piš stručně, žádné výpisy souborů ani diffů.',
].join('\n')

// ---------- schémata ----------
const str = d => ({ type: 'string', description: d })
const arr = d => ({ type: 'array', items: { type: 'string' }, description: d })
const predavka = str(`jen absolutní cesta k TVÉ předávce (${cwd}/docs/reviews/predavka-<tvoje agent id>.md), když tě vyzvala zpráva PŘEDÁVKA a práce ještě není hotová; když je zadání hotové, nevyplňuj; cestu předávky předchůdce sem nikdy nevracej`)
const ODMITNUTE = { type: 'array', items: { type: 'object', required: ['id', 'duvod'], properties: { id: { type: 'string' }, duvod: { type: 'string' } } }, description: 'jen při zapracování: nálezy, které jsi po ověření proti kódu nezapracoval, s důvodem' }
const PRD_SCHEMA = {
  type: 'object',
  required: ['prd_path', 'e2e_path', 'cil', 'kriteria', 'souhrn', 'lesen', 'zapis_do_ziveho', 'runtime_dopad', 'odhad_radku', 'casti'],
  properties: {
    prd_path: str('absolutní cesta k docs/prd/rez-NN-<slug>.md (u řezu s částmi kostra)'),
    e2e_path: str('absolutní cesta k docs/e2e/rez-NN.md'),
    cil: str('cíl řezu jednou větou'),
    kriteria: { type: 'integer', description: 'počet akceptačních kritérií celého řezu' },
    souhrn: str('souhrn pro orchestrátora, max 20 řádků: rozsah (co ano / co ne), body vize, dotčené UI plochy, zápisy do živých systémů, rizika, odchylky od plánu'),
    lesen: { type: 'boolean', description: 'řez staví lešení (zkušební UI nebo nástroj mimo produktové plochy vize)' },
    lesen_popis: str('co je lešení, za jakou přístupovou hranicí sedí a kdy se odstraní'),
    zapis_do_ziveho: { type: 'boolean', description: 'řez zapisuje do živého vnějšího systému' },
    zapis_popis: str('do jakého systému, jaké operace a o které Povolení z vize se opírá (doslovně)'),
    runtime_dopad: { type: 'boolean', description: 'false = řez bez runtime dopadu (jen testy, tooling, dokumentace)' },
    nove_ui_plochy: arr('UI plochy, které PRD zavádí a vize je v seznamu UI ploch nejmenuje (prázdné = žádné)'),
    pokryte_body_vize: arr('čísla Cílů a požadavků vize, které řez plní (C1, F3, …)'),
    odchylky_od_planu: str('v čem se PRD liší od řádku plánu a proč; prázdné = bez odchylky'),
    spory: arr('nové záznamy ve vize-spory.md, každý jednou větou'),
    zmenena_mista: arr('jen při zapracování nálezů: sekce nebo kritéria PRD/E2E, která se změnila (u kostry místa v Kontraktu a Částech s předponou sekce: „Kontrakt: …“, „Části: …“)'),
    odmitnute: ODMITNUTE,
    oblasti: arr('dotčené moduly nebo oblasti kódu (stejný slovník jako návrat stavby: modul, ne soubor); orchestrátor podle nich pozná překryv s uzavřenými řezy'),
    doklad_pred: { type: 'boolean', description: 'true = PRD předepisuje doklad stavu před nasazením (migrace mění, přesouvá nebo maže existující data, nebo je nevratná; kritérium potřebuje jako protějšek stav, který nasazení sdíleného backendu přepíše; populace nad daty, která řez mění, se zmrazí před prvním zápisem; nebo pokyny majitele žádají doklad před každou migrací)' },
    doklad_popis: str('co se před nasazením zachytí (tabulky, počty, vzorky, dotazy, zmrazená populace); prázdné bez dokladu'),
    e2e_sekce: { type: 'array', items: { type: 'object', required: ['nazev', 'kriterii'], properties: { nazev: str('název sekce, jak stojí v nadpisu E2E scénářů'), kriterii: { type: 'integer', description: 'počet kritérií, která sekce ověřuje' }, doba_min: { type: 'integer', description: 'odhad minut verifikace sekce (podle sekce Doba v PRD a kroků scénáře)' }, bez_soubehu: { type: 'boolean', description: 'true = scénář sekci nedovoluje měřit souběžně s jinou sekcí (zátěž produkce, měření výkonu)' } } }, description: 'vzájemně nezávislé sekce E2E scénářů s počtem kritérií, odhadem minut verifikace a příznakem bez_soubehu, vždy když scénáře mají aspoň dvě sekce (blok stavby podle nich skládá souběžné verifikátory); jinak prázdné' },
    odhad_radku: { type: 'integer', description: 'odhad změněných řádků celého řezu včetně testů, fixtur a měřidel (přesun a rozdělení souboru dvakrát, data zvlášť)' },
    kontrakt_odhad_radku: { type: 'integer', description: 'jen u řezu s částmi: odhad změněných řádků Kontraktu včetně testů (strop ~1 500 jako u části)' },
    casti: {
      type: 'array',
      description: 'části implementace podle tabulky Části (každá ~600–1 500 změněných řádků včetně testů, fixtur a měřidel, s vlastními soubory, kritérii a závislostmi); prázdné = malý řez, PRD celé',
      items: {
        type: 'object',
        required: ['id', 'nazev', 'soubory', 'kriteria', 'odhad_radku', 'zavisi_na'],
        properties: {
          id: str('K1, K2, …'),
          nazev: str('název části'),
          soubory: arr('soubory a oblasti části (cesty nebo globy), disjunktní s ostatními částmi; sdílené věci patří do Kontraktu'),
          kriteria: arr('ID kritérií, která část plní (AK3, …)'),
          odhad_radku: { type: 'integer', description: 'odhad změněných řádků části včetně testů, fixtur a měřidel' },
          zavisi_na: arr('id částí, které musí být hotové dřív (prázdné = nezávislá)'),
        },
      },
    },
    kontrakt_potreba: { type: 'boolean', description: 'jen u řezu s částmi: true = Kontrakt pokládá do kódu společné věci (schéma a migrace, typy, signatury rozhraní, registrace tras), které se implementují před částmi' },
    rozdelit_navrh: str('jen když odhad přesahuje ~12 k řádků nebo ~10 částí: jak řez rozdělit na dva podle rizika a závislostí (blok pak skončí po architektovi a rozhodne orchestrátor); jinak prázdné'),
    predavka,
  },
}
const CAST_SCHEMA = {
  type: 'object',
  required: ['prd_path', 'kriteria', 'souhrn'],
  properties: {
    prd_path: str('absolutní cesta k docs/prd/rez-NN-cast-K.md'),
    kriteria: { type: 'integer', description: 'počet kritérií části' },
    souhrn: str('souhrn části, max 10 řádků: postup, precedent, pasti, rizika'),
    kontrakt_doplnit: arr('co Kontrakt v kostře nepokrývá a část to přitom potřebuje sdílet (typ, schéma, signatura, trasa), každé jednou větou'),
    spory: arr('nové záznamy ve vize-spory.md, každý jednou větou'),
    zmenena_mista: arr('jen při zapracování nálezů: sekce PRD části, které se změnily'),
    odmitnute: ODMITNUTE,
    predavka,
  },
}
const CHECK_SCHEMA = {
  type: 'object',
  required: ['verdikt', 'nalezu', 'blokujicich', 'report_path'],
  properties: {
    verdikt: { type: 'string', enum: ['ready', 'needs-fixes'] },
    nalezu: { type: 'integer' },
    blokujicich: { type: 'integer' },
    osy: arr('osy, na kterých nález padl (A úplnost vůči vizi, B technická validita, C kritéria, D rozsah, E optimalita)'),
    report_path: str('absolutní cesta k plnému reportu'),
    nalezy_ids: arr('identifikátory nálezů v reportu (N1, N2, …), blokující první'),
    nalezy_kostra: arr('jen kontrola části: identifikátory nálezů, jejichž oprava patří do kostry (text kritéria, Kontrakt, řádek části v tabulce Části)'),
    odhad_casti: { type: 'integer', description: 'jen kontrola části: tvůj vlastní odhad změněných řádků části včetně testů, fixtur a měřidel (přesun a rozdělení souboru dvakrát, data zvlášť)' },
    overit_prvni: { type: 'array', items: { type: 'object', required: ['id', 'kriterium', 'hypoteza'], properties: { id: str('identifikátor nálezu (N3)'), kriterium: str('ID kritéria (AK5)'), hypoteza: str('co může kritérium shodit a čím to stavba ověří, jednou až dvěma větami') } }, description: 'nejisté nálezy nad kritérii, které jsi spustit nemohl (měřidlo nebo predikát staví až řez): stavba je ověří jako první; mezi blokující je nepočítej' },
    predavka,
  },
}

// Pravidla kritérií, která se opakovaně vyplatila (důkaz: dva opakované pokusy v běhu uklid-po-sklik padly na kritériích psaných jako výčet jmen a opsané číslo).
// Kritérium nad kódem měří brána nad odevzdávaným stromem: pravidlo z 1.2.0 (měřidlo bere revizi parametrem, aby ho E2E spustilo nad nasazenou revizí)
// vedlo v běhu bez-dluhu E2E verifikátory k worktree, instalaci a bráně v nich.
// 1.6.0 (běh web-rijen, všech 6 vadných kritérií ve stavbě vzniklo v bloku PRD): populace dotazem a zmrazená v dokladu (řez 06 to
// udělal sám, plugin to nepředepisoval), protějšek na předchozím nasazení nad sdíleným backendem měřil nový svět (řez 03 AK1),
// rozpor dvou kritérií, absolutní práh bez rezervy a predikát měřidla bez prototypu (mini-řez 11 AK3, AK5, AK6).
const pravidlaKriterii = 'Kritéria: vlastnost + kanál deklarované výjimky + měřidlo, nikdy „právě tyto N jmenované soubory/výjimky“ ani opsané číslo bez dotazu; měřitelná nad pracovním stromem před uzavíracím commitem a v prostředí, které E2E má (bez credentialu, který verifikátor nemá). Populaci nad daty, která řez (nebo souběžný řez) mění, urči dotazem (predikát v PRD), spuštěným jednou v dokladu před prvním zápisem a zmrazeným jako seznam identit (ID/slug); kroky i E2E ji berou jen z dokladu a dotaz po zápisu nepřepočítávají; počet z vize je jen kontrola. Kontrolní protějšek na předchozím nasazení smí jen tam, kde rozdíl vzniká v kódu, který to nasazení samo nese; když hodnotu počítá backend nebo data, které řez mění, a předchozí nasazení je čte živě (sdílené API, databáze, keš), ukazuje po nasazení už nový stav: předepiš datový protějšek (dotaz nad dnešními daty, stará logika z git objektů git grep <symbol> <rev>), nebo stav před nasazením v dokladu. Dvě kritéria se nesmí vylučovat a kritérium nestojí na předpokladu, který PRD samo označuje za neověřený; absolutní práh nad stránkami mimo plochu řezu, jehož dnešní rezerva je pod rozptylem měření, se měří A/B proti předchozímu stavu; predikát měřidla, které řez teprve staví, ověř prototypem nad dnešním stavem. Kritérium nad kódem (výčet, počet, vlastnost kódu) má měřidlo v repu (skript nebo dotaz) a v PRD značku [měřidlo]; měří ho brána nad odevzdávaným stromem, E2E ověřuje jen chování běžící aplikace; měřidlo nad starší revizí smí jen přes git objekty (git show, git grep <rev>), nikdy přes worktree ani instalaci. Měřidlo nebo krok po nasazení, který prochází populaci (stránky, záznamy, soubory), má v PRD nebo ve scénáři E2E, na který PRD odkazuje, odhad doby: počet položek × čas na položku; nad ~10 minut ho předepiš souběžně (pool 8–16) nebo na vzorku s důvodem a velikostí vzorku; populace do ~20 položek nebo lokální měřidlo pod minutu je malá a odhad nemá. Nálezy z minulých řezů a follow-upy nejsou kritéria tohoto řezu, patří do sekce „Pozor na“ nebo mimo rozsah.'
// Kroky po nasazení páruje blok stavby mezi nasazeními podle čísla (spec 1.6.0 § 1.1): v běhu web-rijen je deploy přeformuloval
// a párování podle textu shodilo řez 02 na tři pokusy.
const krokyCislovane = 'Sekce „Nasazení a kroky po něm“ má kroky jako číslovaný seznam (1., 2., …): číslo kroku je jeho id, podle něj deploy páruje kroky mezi nasazeními; existující kroky nepřečíslovávej, nový krok dostane další číslo.'

// Cyklus v zavisi_na nebo duplicitní id by stavbu zablokovaly (část v cyklu se nespustí nikdy, dvě části se stejným id píšou
// týž soubor a stavba druhou zahodí; revize 1.4.0). Blok je hlídá po architektovi i po zapracování kostry: při vadě jedno
// zapracování kostry s nálezem; když vada trvá, blok končí ok: false (stavba by na ní jen pálila pokusy). prevezmi(o) převezme
// casti z opravy a vrátí vady, které zůstaly; návrat je důvod selhání, nebo prázdný.
async function hlidejCasti(vady, prevezmi, poAutorech) {
  if (!vady.length) return ''
  log(`tabulka Části: ${vady.join('; ')}; zapracování kostry s nálezem`)
  const o = await runSePredavkou(`${ramec}

Úkol: oprav tabulku Části v kostře PRD řezu ${NN} (${prd.prd_path}): ${vady.join(' | ')}. Každá část má jedinečné id (K1, K2, …) a závislosti zavisi_na bez cyklu; co si části potřebují předat oběma směry, patří do Kontraktu (sdílené typy, schéma, signatury rozhraní), ne do vzájemné závislosti. ${poAutorech ? `PRD částí už existují (docs/prd/rez-${NN}-cast-K.md): počet částí neměň, id měň jen u duplicity (soubor části pak přejmenuj podle nového id); soubory, kritéria a závislosti mezi částmi přesunout smíš.` : 'Autoři částí ještě nepsali: části smíš sloučit, rozdělit a přečíslovat.'} Oprav kostru (tabulku Části, Kontrakt, frontmatter casti) a vrať casti podle opravené tabulky a změněná místa; nic jiného neměň. Edituj dotčená místa (Edit); soubor nepřepisuj celý (Write), přepis ztrácí text.${kostraCteni(false)} Na kód odkazuj souborem a jménem symbolu, nikdy číslem řádku.`,
    { label: `prd-fix:řez ${NN}`, phase: poAutorech ? 'Zapracování' : 'PRD', agentType: 'dev-pipeline:prd', schema: PRD_SCHEMA, model: 'opus', effort: 'high' })
  if (o) sporyVse.push(...seznam(o.spory))
  if (!o || !Array.isArray(o.casti)) return `tabulka Části: ${vady.join('; ')}; ${o ? 'zapracování kostry nevrátilo casti' : nic(`prd-fix:řez ${NN}`, 'zapracování kostry')}`
  const zbyva = prevezmi(o)
  if (zbyva.length) return `tabulka Části ani po zapracování kostry: ${zbyva.join('; ')}`
  log(`tabulka Části opravena: ${casti.length ? casti.map(c => `${c.id}${c.zavisi_na.length ? ` (závisí na ${c.zavisi_na.join(', ')})` : ''}`).join(', ') : 'malý řez'}`)
  return ''
}

// ---------- 1. PRD ----------
let prd
// Části implementace (§ 1.6); prázdné = malý řez. V režimu zapracování je vrací zapracování kostry.
let casti = []
const sporyVse = []
// Kostru čtou čtenáři po sekcích, ne celou (v běhu web-podzim se kostra 35–84 kB četla 92× celá). Mapu sekcí si od 1.6.0 dělá
// každý čtenář sám jedním rg: mapa předávaná v args se v běhu web-rijen spletla s mapou jiného řezu (stejné nadpisy, jiné řádky)
// a šetřila pod $5 (spec 1.6.0 § 1.3). Čtenář části čte ze sekce kritérií jen svá kritéria podle ID (pokrytí kostry 70 %,
// kritéria jsou 20–30 % kostry).
const reEsc = s => S(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const kostraCteni = (jenSvoje, kriteria = []) => ` Kostru čti po sekcích (Read s offset/limit), ne celou: mapu sekcí si udělej sám (rg -n '^## ' ${prd.prd_path})${jenSvoje ? ' a čti jen sekce, které potřebuješ' : ''}.${kriteria.length ? ` Ze sekce akceptačních kritérií čti jen svá kritéria podle ID (rg -n '\\b(${kriteria.map(reEsc).join('|')})\\b' ${prd.prd_path}).` : ''}`
// Strop velikosti části a Kontraktu (řádky včetně testů, fixtur a měřidel).
const STROP_CASTI = 1500

// Návrat bloku (spec 1.6.0 § 1.4): runtime useká výsledek v notifikaci na ~8,1 k znaků (v běhu web-rijen 15 z 25 notifikací)
// a orchestrátor ho 20× dočítal z .output. Část pro orchestrátora (souhrn pro schválení, příznaky, počty) drží pod 6 000 znaků;
// seznamy jdou počtem a cestou. Pole pro stavbu nese podobjekt stavba až na konci návratu: scripts/args-bloku.py ho čte ze souboru
// běhu Workflow, takže useknutí notifikace mu nevadí; useknout smí runtime jen tuhle strojovou část. Odmítnuté nálezy zapracování
// jdou jen počtem a identifikátory (důvody zůstávají v návratu agenta zapracování, vidět v /workflows).
const kratce = (v, n) => { const t = S(v).trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }
// Strop části pro orchestrátora i v nejhorším případě (plan-check 1.6.0): souhrn, deset sporů, odchylky, návrh rozdělení a popisy
// dohromady dávaly až ~7,5 k. Když se celek nevejde pod 5 800 znaků, blok zkracuje texty a seznamy po stupních; celé znění
// zůstává v PRD, vize-spory a reportech. pokryte_body_vize se nekrátí počtem (orchestrátor podle nich kontroluje pokrytí řádku).
const STROP_NAVRATU = 5800
const STUPNE = [
  { souhrn: 1200, cil: 300, popis: 400, odchylky: 600, spory: 10, spor: 240, prehled: 600, rozdelit: 800, polozka: 160, pocet: 40 },
  { souhrn: 900, cil: 200, popis: 250, odchylky: 400, spory: 6, spor: 200, prehled: 400, rozdelit: 500, polozka: 120, pocet: 20 },
  { souhrn: 650, cil: 160, popis: 160, odchylky: 250, spory: 3, spor: 160, prehled: 250, rozdelit: 300, polozka: 80, pocet: 10 },
  { souhrn: 450, cil: 120, popis: 120, odchylky: 160, spory: 0, spor: 0, prehled: 160, rozdelit: 200, polozka: 60, pocet: 5 },
]
const sporyKratce = (xs, L) => {
  const u = [...new Set(seznam(xs).map(x => kratce(x, L.spor)))]
  if (!u.length) return []
  if (!L.spory) return [`${u.length} záznamů v docs/vize-spory.md`]
  return u.length > L.spory ? [...u.slice(0, L.spory), `… a ${u.length - L.spory} dalších v docs/vize-spory.md`] : u
}
const omez = (xs, L, pocet = true) => {
  const u = seznam(xs).map(x => kratce(x, L.polozka))
  return pocet && u.length > L.pocet ? [...u.slice(0, L.pocet), `… a ${u.length - L.pocet} dalších`] : u
}
const navratBloku = args => {
  let out = null
  for (const L of STUPNE) {
    out = navratStupen(args, L)
    const { stavba, ...ridici } = out
    if (JSON.stringify(ridici).length <= STROP_NAVRATU) return out
  }
  log(`návrat bloku pro orchestrátora i po zkrácení nad ${STROP_NAVRATU} znaků; runtime ho v notifikaci může useknout`)
  return out
}
const navratStupen = ({ fin, fix = null, faze = '', kontrola = null, hypotezy = null, odmitnute = [], castiNad = [] }, L) => {
  const e2eFix = normSekce(fix && fix.e2e_sekce)
  const kontraktPotreba = fix && typeof fix.kontrakt_potreba === 'boolean' ? fix.kontrakt_potreba : prd.kontrakt_potreba
  const kontraktOdhad = Number(fix && fix.kontrakt_odhad_radku != null ? fix.kontrakt_odhad_radku : prd.kontrakt_odhad_radku) || null
  const dokladPred = Boolean(fix && fix.doklad_pred != null ? fix.doklad_pred : prd.doklad_pred)
  const oblasti = [...new Set([...seznam(prd.oblasti), ...seznam(fix && fix.oblasti)])]
  const kriteria = fin.kriteria || prd.kriteria
  const runtimeDopad = fin.runtime_dopad !== false
  const sKontraktem = casti.length > 0 && kontraktPotreba !== false
  return {
    ok: true,
    rez: NN,
    ...(faze ? { faze } : {}),
    rezim,
    profil,
    ...(prdLehke ? { prd_lehke: true } : {}),
    prd_path: prd.prd_path,
    e2e_path: prd.e2e_path,
    cil: kratce(fin.cil || prd.cil, L.cil),
    kriteria,
    souhrn: kratce(fin.souhrn, L.souhrn),
    lesen: Boolean(fin.lesen), lesen_popis: kratce(fin.lesen_popis, L.popis),
    zapis_do_ziveho: Boolean(fin.zapis_do_ziveho), zapis_popis: kratce(fin.zapis_popis, L.popis),
    runtime_dopad: runtimeDopad,
    nove_ui_plochy: omez(fin.nove_ui_plochy, L),
    pokryte_body_vize: omez(fin.pokryte_body_vize || prd.pokryte_body_vize, L, false),
    odchylky_od_planu: kratce(fin.odchylky_od_planu || prd.odchylky_od_planu, L.odchylky),
    spory: sporyKratce(sporyVse, L),
    oblasti: omez(oblasti, L),
    doklad_pred: dokladPred, doklad_popis: kratce((fix && fix.doklad_popis) || prd.doklad_popis, L.popis),
    kontrakt_rez: kontraktRez || null,
    odhad_radku: Number(fix && fix.odhad_radku != null ? fix.odhad_radku : prd.odhad_radku) || null,
    kontrakt_potreba: sKontraktem,
    // Části jen přehledem (id, odhad, závislosti); celé jsou ve stavba.casti.
    casti_pocet: casti.length,
    casti_prehled: kratce(casti.map(c => `${c.id} ${c.odhad_radku || '?'} ř.${c.zavisi_na.length ? ` ← ${c.zavisi_na.join(',')}` : ''}`).join(' · '), L.prehled),
    casti_nad_stropem: castiNad,
    rozdelit_navrh: kratce((fix && fix.rozdelit_navrh) || prd.rozdelit_navrh, L.rozdelit),
    kontrola: kontrola ? { ...kontrola, bez_kontroly: omez(kontrola.bez_kontroly, L) } : kontrola,
    odmitnute_nalezy: odmitnute.length,
    odmitnute_ids: omez(odmitnute.map(o => o.id), L),
    predavky: predavekCelkem,
    // Pole pro stavbu: vždy celé a poslední (useknout smí runtime jen tuhle strojovou část, args-bloku.py ji čte ze souboru běhu).
    stavba: {
      rez: NN,
      // Profil jde stavbě odsud: args-bloku.py přenáší jen stavba a lehký řez by jinak dostal thermo a druhé kolo review.
      profil,
      prd_path: prd.prd_path,
      e2e_path: prd.e2e_path,
      kriteria,
      runtime_dopad: runtimeDopad,
      doklad_pred: dokladPred,
      // Části pro blok stavby (§ 1.6 spec 1.4.0): prázdné = malý řez, jedna implementace.
      casti,
      kontrakt_potreba: sKontraktem,
      kontrakt_odhad_radku: casti.length ? kontraktOdhad : null,
      e2e_sekce: e2eFix.length ? e2eFix : normSekce(prd.e2e_sekce),
      hypotezy,
      oblasti,
      casti_nad_stropem: castiNad,
    },
  }
}

if (rezim === 'zapracovani') {
  prd = { prd_path: S(a.prd_path), e2e_path: S(a.e2e_path || `${cwd}/docs/e2e/rez-${NN}.md`), cil: '', kriteria: Number(pu.kriteria) || 0, souhrn: '', spory: [],
    e2e_sekce: pu.e2e_sekce, kontrakt_potreba: pu.kontrakt_potreba, kontrakt_odhad_radku: pu.kontrakt_odhad_radku, doklad_pred: pu.doklad_pred, doklad_popis: pu.doklad_popis, odhad_radku: pu.odhad_radku }
  casti = normCasti(pu.casti)
  log(`blok PRD řez ${NN}: režim zapracování (${nalezyOrch.length} nálezů orchestrátora)${puvodni ? `; výchozí hodnoty z předchozího návratu (${casti.length ? `části ${casti.map(c => c.id).join(', ')}` : 'malý řez'})` : '; bez puvodni: e2e_sekce, kontrakt_potreba a doklad_pred jen z toho, co zapracování vrátí'}`)
} else if (odFaze === 'autori') {
  // Kostra a scénáře leží na disku z běhu, který skončil po architektovi; pole návratu architekta nese puvodni.
  prd = { prd_path: S(pu.prd_path), e2e_path: S(pu.e2e_path || `${cwd}/docs/e2e/rez-${NN}.md`), cil: S(pu.cil), kriteria: Number(pu.kriteria) || 0, souhrn: S(pu.souhrn), spory: [],
    lesen: pu.lesen, lesen_popis: pu.lesen_popis, zapis_do_ziveho: pu.zapis_do_ziveho, zapis_popis: pu.zapis_popis, runtime_dopad: pu.runtime_dopad,
    nove_ui_plochy: pu.nove_ui_plochy, pokryte_body_vize: pu.pokryte_body_vize, odchylky_od_planu: pu.odchylky_od_planu, oblasti: pu.oblasti,
    e2e_sekce: pu.e2e_sekce, kontrakt_potreba: pu.kontrakt_potreba, kontrakt_odhad_radku: pu.kontrakt_odhad_radku, doklad_pred: pu.doklad_pred, doklad_popis: pu.doklad_popis, odhad_radku: pu.odhad_radku,
    rozdelit_navrh: '' }
  const vadyPu = []
  casti = normCasti(pu.casti, vadyPu)
  log(`blok PRD řez ${NN}: pokračování od autorů částí (orchestrátor řez nerozdělil; části ${casti.map(c => c.id).join(', ')})`)
  const chybaCasti = await hlidejCasti(vadyCasti(casti, vadyPu), o => {
    const v = []
    casti = normCasti(o.casti, v)
    if (typeof o.kontrakt_potreba === 'boolean') prd.kontrakt_potreba = o.kontrakt_potreba
    if (o.odhad_radku != null) prd.odhad_radku = o.odhad_radku
    return vadyCasti(casti, v)
  }, false)
  if (chybaCasti) return { ok: false, rez: NN, duvod: chybaCasti, prd_path: prd.prd_path, predavky: predavekCelkem }
} else {
  phase('PRD')
  log(`blok PRD řez ${NN}: ${S(row.nazev || row.name || '')}`)
  // Velký řez: architekt píše kostru (kritéria, Kontrakt, tabulka Části), technický postup částí píšou autoři částí. PRD agent
  // běhu bez-dluhu protočil Ø 433 k (vlastní výstup 125 k, čtení kódu 119 k) a 22 z 25 přes 300 k; malý řez jede jako dřív.
  const prdPrompt = `${ramec}

Úkol: napiš PRD a E2E scénáře řezu ${NN} podle přiděleného řádku plánu. Řez vybral orchestrátor, ty ho nevybíráš ani nerozšiřuješ; rozsah je řádek plánu a body vize v něm. Když realita kódu plán nesnese, napiš odchylku do odchylky_od_planu a PRD piš na to, co jde postavit a ověřit.
Řádek plánu: ${JSON.stringify(row)}
${stavPoMinulem ? `Stav po předchozím řezu (fakt, přečti): ${stavPoMinulem}\n` : ''}${hypotezy.length ? `Hypotézy od orchestrátora k ověření (ne fakta): ${hypotezy.join(' | ')}\n` : ''}${kontraktPrd ? `Řez závisí na řezu ${kontraktRez}, který se právě staví; jeho PRD je kontrakt: ${kontraktPrd}. Rozhraní, symboly a data, které z něj potřebuješ, ber jako dané a v PRD je označ „předpoklad podle PRD řezu ${kontraktRez}“; proti kódu je neověřuj, kód je ještě nemá (stavba tvé PRD před implementací přeměří nad dnešním stromem).\n` : ''}${profil === 'lehky' ? 'Profil řezu je lehký (bez runtime dopadu: měřidlo, otisk, dokumentace, skript): PRD krátké, kritéria dokládaná příkazem nebo souborem, žádné E2E v prohlížeči.\n' : ''}${pravidlaKriterii}
Follow-ups a spory: z ${followUps} a ${spory} čti jen záznamy, které se dotýkají bodů vize, modulů a cest tohoto řezu (grep podle F čísel, jmen modulů a cest z řádku plánu), plus posledních 10 záznamů; celé soubory nečti. Dotčené otevřené follow-ups dej do PRD do sekce „Pozor na“ (past se opravuje v řezu, když je ve změněných souborech; jinak zůstane follow-up).
Doklad před nasazením: když řez nese migraci, která mění, přesouvá nebo maže existující data, nebo je nevratná, když kritérium potřebuje jako protějšek stav, který nasazení sdíleného backendu přepíše, nebo když populaci nad daty, která řez mění, je třeba zmrazit před prvním zápisem${appPristup ? ', nebo když pokyny majitele k prostředí žádají doklad před každou migrací' : ''}, napiš do PRD sekci „Doklad před nasazením“ (co přesně se před nasazením zachytí: tabulky, počty, vzorky, zmrazená populace, dotazy jen pro čtení) a vrať doklad_pred: true; u aditivní migrace a u řezu, který nic z toho nepotřebuje, doklad nepředepisuj.
${krokyCislovane}
E2E scénáře piš v sekcích, které jsou na sobě nezávislé (žádná sekce nezávisí na datech, která jiná sekce vytváří nebo maže); když scénáře mají aspoň dvě sekce, vrať v e2e_sekce každou sekci s počtem kritérií, která ověřuje, odhadem minut verifikace (doba_min, podle sekce Doba a kroků scénáře) a bez_soubehu: true, když ji scénář nedovoluje měřit souběžně s jinou sekcí (zátěž produkce, měření výkonu); blok stavby podle nich skládá souběžné verifikátory.
Části: odhadni změněné řádky celého řezu včetně testů, fixtur a měřidel (odhad_radku); přesun a rozdělení souboru počítej dvakrát (smazání i přidání), data (JSON, překlady) počítej zvlášť a do velikosti části jen tehdy, když je část píše ručně. Řez do ~2 k řádků je malý: napiš PRD celé jako dosud a vrať casti: [] (jedna část není rozdělení). Větší řez rozděl na části, každou ~600–1 500 změněných řádků včetně testů, fixtur a měřidel (část pod ~600 řádků nezakládej: přidej ji k části se stejnými soubory nebo do Kontraktu), s vlastními soubory (disjunktními: žádný soubor ve dvou částech, sdílené věci patří do Kontraktu), vlastními kritérii a závislostmi (zavisi_na, bez cyklu), a napiš kostru: frontmatter navíc s casti: K1,K2,…; cíl, rozsah, všechna kritéria s ID (AK1, AK2, …), zákazy, UI plochu, doklad, „Pozor na“, sekci „Nasazení a kroky po něm“, když řez po nasazení něco potřebuje (patří do kostry, ne do části: deploy ji čte jen z kostry); sekci „## Kontrakt“ (sdílené typy, schéma a migrace, signatury rozhraní mezi částmi, registrace tras; kontrakt_potreba: true, když z ní vzniká kód, který musí stát před částmi) a sekci „## Části“ s tabulkou | část | název | soubory a oblasti | kritéria | odhad řádků vč. testů | závisí na | poznámka |. Kontrakt nese typy, rozhraní, schéma a migrace a sdílené konstanty, chování (logika, validace, skripty) patří částem; odhadni i jeho řádky (kontrakt_odhad_radku), strop ~1 500 jako u části: Kontrakt staví jeden agent před všemi částmi. Technický postup, precedent, pasti a mapu symbolů jednotlivých částí do kostry nepiš: napíšou je souběžně autoři částí do docs/prd/rez-${NN}-cast-K.md, každý nad kostrou a kódem své oblasti; kód proto čti jen tolik, kolik potřebuješ na rozdělení a Kontrakt. Postup u řezu s částmi: hned po rozdělení zapiš kostru s tabulkou Části, Kontraktem a kritérii, teprve pak doplňuj ostatní sekce a E2E scénáře; přílohy vize (docs/vize/<slug>/) čti jen grepem podle bodů řezu. Při odhadu nad ~12 k řádků nebo ~10 částí vrať rozdelit_navrh (jak řez rozdělit na dva podle rizika a závislostí) a kostru přesto napiš: blok skončí po tobě a orchestrátor rozhodne, jestli řez rozdělí, nebo pokračuje autory částí nad tvou kostrou.
Na kód odkazuj souborem a jménem symbolu, nikdy číslem řádku.
${appPristup ? `Pokyny majitele k prostředí (přístup, nasazení, doklady): ${appPristup}\n` : ''}Soubory: docs/prd/rez-${NN}-<slug>.md a docs/e2e/rez-${NN}.md (frontmatter a formát podle pravidel běhu a tvé instrukce). Nic jiného needituj. Kontrolu PRD dělá jiný agent.`
  prd = await runSePredavkou(prdPrompt, { label: `prd:řez ${NN}`, phase: 'PRD', agentType: 'dev-pipeline:prd', schema: PRD_SCHEMA, model: 'opus', effort: 'high' })
  if (!prd) return { ok: false, rez: NN, duvod: vycerpane.has(`prd:řez ${NN}`) ? nic(`prd:řez ${NN}`, 'PRD agent') : 'PRD agent nevrátil výsledek ani po opakování', predavky: predavekCelkem }
  sporyVse.push(...seznam(prd.spory))
  const vadyArch = []
  casti = normCasti(prd.casti, vadyArch)

  if (objekty(prd.casti).length === 1) log('PRD architekt vrátil jednu část: jedna část není rozdělení, řez běží jako malý')
  const odhad = Number(prd.odhad_radku) || '?'
  if (casti.length && Number(prd.kontrakt_odhad_radku) > STROP_CASTI) log(`PRD architekt odhaduje Kontrakt na ${prd.kontrakt_odhad_radku} ř. (strop ~${STROP_CASTI}): posoudí kontrola kostry`)
  log(`PRD: ${prd.kriteria} kritérií, ${casti.length ? `části ${casti.map(c => c.id).join(', ')}, odhad ${odhad} ř.${prd.kontrakt_potreba === false ? ', bez kontraktu v kódu' : ''}` : `malý řez (odhad ${odhad} ř.)`}${S(prd.rozdelit_navrh).trim() ? ', návrh rozdělit řez' : ''}${prd.lesen ? ', lešení' : ''}${prd.zapis_do_ziveho ? ', zápis do živého systému' : ''}${prd.doklad_pred ? ', doklad před migrací' : ''}${normSekce(prd.e2e_sekce).length ? `, E2E sekce ${normSekce(prd.e2e_sekce).length}` : ''}${(prd.nove_ui_plochy || []).length ? `, nové UI plochy mimo vizi: ${prd.nove_ui_plochy.join(', ')}` : ''}`)
  // Návrh rozdělit řez ukončí blok hned po architektovi (spec 1.6.0 § 1.8): orchestrátor rozhodne dřív, než zaplatí autory,
  // kontroly a zapracování (~$110 u řezu 10 běhu web-rijen, rozdělení pak odmítl, aby PRD nezahodil). Při nerozdělení pustí blok
  // znovu s od_faze „autori“ a puvodni = tento návrat; tabulku Části pohlídá až pokračování.
  if (S(prd.rozdelit_navrh).trim() && casti.length) {
    log('návrh rozdělit řez: blok končí po architektovi, rozhodne orchestrátor (při nerozdělení pokračuje od_faze „autori“ nad touto kostrou)')
    return navratBloku({ fin: prd, faze: 'architekt', castiNad: casti.filter(c => c.odhad_radku > STROP_CASTI).map(c => ({ id: c.id, odhad: c.odhad_radku })) })
  }
  // Tabulka Části před autory: cyklus nebo duplicitní id opraví architekt dřív, než autoři napíšou soubory podle vadné tabulky.
  const chybaCasti = await hlidejCasti(vadyCasti(casti, vadyArch), o => {
    const v = []
    casti = normCasti(o.casti, v)
    // Oprava tabulky smí změnit i potřebu kontraktu a odhad (sdílené věci přesunuté do Kontraktu, sloučené části).
    if (typeof o.kontrakt_potreba === 'boolean') prd.kontrakt_potreba = o.kontrakt_potreba
    if (o.odhad_radku != null) prd.odhad_radku = o.odhad_radku
    return vadyCasti(casti, v)
  }, false)
  if (chybaCasti) return { ok: false, rez: NN, duvod: chybaCasti, prd_path: prd.prd_path, predavky: predavekCelkem }
}

// ---------- 2. autoři částí ----------
// Autor části čte z kostry Kontrakt, svůj řádek v Částech, svá kritéria a společné sekce, kód jen ve své oblasti. Kostru needituje:
// co Kontrakt nepokrývá, vrátí v kontrakt_doplnit a zapracuje to zapracování kostry.
let kontraktDoplnit = []
if (casti.length) {
  phase('Autoři částí')
  const castPrompt = c => `${ramec}

Úkol: napiš PRD části ${c.id} (${c.nazev}) řezu ${NN}. Kostru PRD napsal PRD architekt: ${prd.prd_path}; z ní přečti Kontrakt, svůj řádek v tabulce Části, svá kritéria (${c.kriteria.join(', ') || 'podle řádku části'}) a společné sekce (cíl, rozsah, zákazy, „Pozor na“, doklad); sekce a soubory jiných částí nečti.${kostraCteni(true, c.kriteria)} Kód čti jen ve své oblasti (${c.soubory.join(', ')}), mimo ni jen Kontrakt a rozhraní, na která část navazuje${c.zavisi_na.length ? ` (závisí na ${c.zavisi_na.join(', ')})` : ''}.
Napiš ${c.prd_path}: technický postup ověřený proti kódu, precedent v kódu (jak týž problém řeší repo a proč se část odchyluje, nebo neodchyluje), pasti, testy k chování (ne k řezu) a mapu souborů a symbolů, které část mění; na kód odkazuj souborem a jménem symbolu, nikdy číslem řádku.${kontraktPrd ? ` Rozhraní z PRD řezu ${kontraktRez} (${kontraktPrd}), který se právě staví, ber jako dané a označ je „předpoklad podle PRD řezu ${kontraktRez}“; proti kódu je neověřuj, kód je ještě nemá.` : ''}
Kostru ani soubory jiných částí needituj: co část potřebuje sdílet a Kontrakt to nepokrývá, vrať v kontrakt_doplnit. Rozsah části nerozšiřuj. Nic jiného needituj. Kontrolu dělá jiný agent.`
  const autori = await parallelOdNejdelsiho(casti, c => c.odhad_radku, c => runSePredavkou(castPrompt(c), { label: `prd-část:řez ${NN}:${c.id}`, phase: 'Autoři částí', agentType: 'dev-pipeline:prd', schema: CAST_SCHEMA, model: 'opus', effort: 'high' }))
  const chybi = casti.filter((c, i) => !autori[i]).map(c => c.id)
  if (chybi.length) return { ok: false, rez: NN, duvod: chybi.map(id => nic(`prd-část:řez ${NN}:${id}`, `autor části ${id}`)).join('; '), prd_path: prd.prd_path, predavky: predavekCelkem }
  casti = casti.map((c, i) => ({ ...c, prd_path: S(autori[i].prd_path).trim() || c.prd_path }))
  autori.forEach(r => sporyVse.push(...seznam(r.spory)))
  kontraktDoplnit = autori.flatMap((r, i) => seznam(r.kontrakt_doplnit).map(x => `${casti[i].id}: ${x}`))
  log(`autoři částí: ${casti.map((c, i) => `${c.id} ${Number(autori[i].kriteria) || 0} krit.`).join(', ')}${kontraktDoplnit.length ? `; Kontrakt doplnit ${kontraktDoplnit.length}×` : ''}`)
}

// ---------- 3. kontrola ----------
// Po dokumentech: kostra (u malého řezu celé PRD jako dřív) a každá část zvlášť, souběžně. Kontrola kostry s částmi nese osy A, C, D, E
// a strukturu Částí; kontrola části osu B nad kódem své oblasti a kritéria části.
const reportCesta = (kolo, c) => `${cwd}/docs/reviews/rez-${NN}-prd-check-${c ? `cast-${c.id}-` : ''}kolo-${kolo}.md`
const vratJen = 'a vrať jen verdikt, počty, osy a identifikátory nálezů (N1, N2, …), nálezy samotné nevracej.'
const predpokladKontrakt = kontraktPrd ? ` Tvrzení označená „předpoklad podle PRD řezu ${kontraktRez}“ ověřuj proti tomu PRD (${kontraktPrd}), ne proti kódu; kód je ještě nemá.` : ''
// 1.6.0 (běh web-rijen): protějšek nad sdíleným backendem „potvrdily“ tři kontroly měřením před nasazením (řez 03 AK1); nejistý
// nález nad kritériem přesně předpověděl vadné kritérium mini-řezu 11 (AK6), ale nikdo ho nespustil. Nespustitelný nejistý nález jde
// stavbě v overit_prvni, ne mezi blokující: nafoukl by deltu a zapracování by ho stejně nespustilo (Martin 6. 10.).
const vadnaKriteria = 'kritérium tvaru „právě tyto N jmenované soubory/výjimky“ nebo opsané číslo bez dotazu je nález „výčet místo vlastnosti“; kritérium nad kódem bez měřidla v repu a značky [měřidlo] je nález; kritérium závislé na uzavíracím commitu, na credentialu, který E2E prostředí nemá, nebo na nálezu z minulého řezu mimo rozsah tohoto je nález; měřidlo nebo krok po nasazení nad populací (stránky, záznamy, soubory) bez odhadu doby (počet položek × čas na položku, v PRD nebo ve scénáři E2E, na který PRD odkazuje; populace do ~20 položek nebo lokální měřidlo pod minutu odhad nemá), nebo s odhadem nad ~10 minut bez souběhu (pool 8–16) či vzorku s důvodem a velikostí, je nález; populace zadaná počtem nebo výčtem bez dotazu, nebo dotaz přepočítávaný po krocích, které mění data jeho predikátu, je nález; kontrolní protějšek na předchozím nasazení, jehož hodnotu počítá backend nebo data, které řez mění, je nález „protějšek měří nový svět“ (posuď ho proti přechodnému stavu „starý frontend nad novým backendem“ v sekci Nasazení, ne měřením dnešní produkce); dvě kritéria, která nejde splnit současně, a kritérium stojící na předpokladu, který PRD samo označuje za neověřený, jsou nález; absolutní práh nad stránkami mimo plochu řezu, jehož dnešní rezerva je pod rozptylem měření a který se neměří A/B proti předchozímu stavu, je nález; predikát měřidla, které řez teprve staví, bez ověření prototypem nad dnešním stavem je nález. Nejistý nález nad kritériem spusť; když to nejde (měřidlo nebo predikát staví až řez), vrať ho v overit_prvni s kritériem a hypotézou (stavba ho ověří jako první) a mezi blokující ho nepočítej'
const spolecneK1 = `Doklad před nasazením: PRD ho předepisuje právě tehdy, když migrace mění, přesouvá nebo maže existující data, nebo je nevratná, když kritérium potřebuje jako protějšek stav, který nasazení sdíleného backendu přepíše, nebo když populaci nad daty, která řez mění, je třeba zmrazit před prvním zápisem${appPristup ? ', nebo když pokyny majitele žádají doklad před každou migrací' : ''}; chybějící i zbytečný doklad je nález. Kroky sekce „Nasazení a kroky po něm“ jsou číslovaný seznam (číslo kroku je jeho id, podle něj deploy páruje kroky mezi nasazeními); nečíslovaný krok je nález. Sekce E2E scénářů musí být vzájemně nezávislé (žádná nezávisí na datech jiné). Follow-ups a vize-spory čti jen grepem podle bodů vize, modulů a cest řezu, ne celé.${predpokladKontrakt}${appPristup ? ` Pokyny majitele k prostředí: ${appPristup}` : ''}`
const delta = zmenena => `Delta kontrola: prověř VÝHRADNĚ tato změněná místa: ${zmenena.join(' | ')}. Co prošlo kolem 1, znovu nekontroluj. Měřidla změněných kritérií spusť; místo se značkou „neověřeno“ (návrh, který zapracování nespustilo) ber jako hypotézu a spusť, co jde. Zbylé nálezy označ; třetí kolo nebude, půjdou stavbě jako hypotézy.`
const checkPrompt = (kolo, zmenena) => `${ramec}

Úkol: prd-check kolo ${kolo} pro řez ${NN}${casti.length ? ' (kostra PRD s částmi)' : ''}.
PRD: ${prd.prd_path} · E2E: ${prd.e2e_path} · řádek plánu: ${JSON.stringify(row)}${casti.length ? ` · soubory částí: ${casti.map(c => `${c.id} ${c.prd_path}`).join(', ')}` : ''}
Report zapiš do ${reportCesta(kolo)} ${vratJen}
${kolo !== 1 ? delta(zmenena) : !casti.length
    ? `Kontroluj úplnost vůči řádku plánu a bodům vize, technickou validitu proti skutečnému kódu (Serena), kvalitu kritérií, rozsah řezu a to, že PRD nezavádí UI plochu, mantinel ani zápis do živého systému, který vize nejmenuje. Na ose C navíc: každé kritérium s měřidlem (rg, počet, skript, dotaz) SPUSŤ teď nad dnešním stromem a výsledek zapiš do reportu; ${vadnaKriteria}. ${spolecneK1}`
    : `Kostra nese kritéria, Kontrakt a tabulku Části; technický postup částí je v jejich souborech a kontrolují ho souběžně kontroly částí (osa B není tvoje). Kontroluj osy A (úplnost vůči řádku plánu a bodům vize; PRD nezavádí UI plochu, mantinel ani zápis do živého systému, který vize nejmenuje), C (kvalita všech kritérií: ${vadnaKriteria}; měřidla SPUSŤ teď nad dnešním stromem jen u kritérií, která žádná část nemá, kritéria částí změří kontroly částí), D (rozsah řezu) a E (optimalita rozdělení a Kontraktu). Navíc tabulku Části a Kontrakt: žádný soubor ve dvou částech (sdílený soubor patří do Kontraktu), každé kritérium má svou část, Kontrakt pokrývá, co části potřebují sdílet (sdílené typy, schéma a migrace, signatury rozhraní mezi částmi, registrace tras), odhad každé části ~600–1 500 změněných řádků včetně testů, fixtur a měřidel, závislosti bez cyklu; Kontrakt nese typy, rozhraní, schéma a sdílené konstanty do ~1 500 řádků (odhad architekta ${Number(prd.kontrakt_odhad_radku) || 'chybí'}), přerostlý Kontrakt nebo Kontrakt s chováním (logika, validace, skripty), které patří částem, je nález. Soubory částí čti jen tam, kde to potřebuješ k úplnosti Kontraktu.${kontraktDoplnit.length ? ` Autoři částí hlásí, co Kontrakt nepokrývá (hypotézy, ověř): ${spojCele(kontraktDoplnit)}.` : ''} ${spolecneK1}`}${casti.length ? kostraCteni(false) : ''}`
const checkCastPrompt = (kolo, c, zmenena) => `${ramec}

Úkol: prd-check kolo ${kolo} části ${c.id} (${c.nazev}) řezu ${NN}.
Kostra PRD: ${prd.prd_path} · PRD části: ${c.prd_path} · soubory a oblasti části: ${c.soubory.join(', ')} · kritéria části: ${c.kriteria.join(', ')}
Report zapiš do ${reportCesta(kolo, c)} ${vratJen}
${kolo !== 1 ? delta(zmenena) : `Z kostry čti Kontrakt, řádek části v tabulce Části, kritéria části a společné sekce; sekce a soubory jiných částí ne. Kontroluj osu B: technickou validitu PRD části proti skutečnému kódu (Serena): jmenované soubory a symboly existují, postup sedí s architekturou a doktrínou CLAUDE.md, precedent v repu a důvod odchylky, pasti; osu C nad kritérii části: každé kritérium s měřidlem (rg, počet, skript, dotaz) SPUSŤ teď nad dnešním stromem a výsledek zapiš do reportu, ${vadnaKriteria}; a soulad s Kontraktem: část mění jen své soubory, sdílené věci bere z Kontraktu a nic sdíleného mimo Kontrakt nezavádí. Kontrakt a tabulku Části posuzuj jen v tom, co tvoje část z Kontraktu používá nebo co jí chybí; obecnou úplnost a strukturu Kontraktu kontroluje kostra. Osy A, D a E nekontroluj, patří kontrole kostry. Nálezy, jejichž oprava patří do kostry (text kritéria, Kontrakt, řádek části v tabulce Části), vrať navíc v nalezy_kostra: část kostru needituje, zapracuje je zapracování kostry. Odhadni sám změněné řádky části včetně testů, fixtur a měřidel (přesun a rozdělení souboru dvakrát, data zvlášť) a vrať je v odhad_casti: část nad ~${STROP_CASTI} řádků jde stavbě i při verdiktu ready.${predpokladKontrakt}`}${kostraCteni(true, c.kriteria)}`
const CHECK = { agentType: 'dev-pipeline:prd-check', schema: CHECK_SCHEMA, model: 'opus', effort: 'high' }
const logCheck = (kdo, k) => { if (k) log(`${kdo}: ${k.verdikt}, ${k.nalezu} nálezů, ${k.blokujicich} blokujících`) }
let k1 = null, k2 = null
const k1C = {}, k2C = {}
if (rezim === 'novy') {
  phase('Kontrola')
  // Kostra první (čte nejvíc), pak části od největšího odhadu.
  const [kk, ...kc] = await parallelOdNejdelsiho([null, ...casti], c => c ? c.odhad_radku : 1e12, c => c
    ? runSePredavkou(checkCastPrompt(1, c), { ...CHECK, label: `prd-check:řez ${NN}:část ${c.id}:1`, phase: 'Kontrola' })
    : runSePredavkou(checkPrompt(1), { ...CHECK, label: `prd-check:řez ${NN}:1`, phase: 'Kontrola' }))
  k1 = kk || null
  casti.forEach((c, i) => { k1C[c.id] = kc[i] || null })
  if (!k1) log(`prd-check kolo 1 ${casti.length ? 'kostry ' : ''}nevrátil výsledek, pokračuji bez kontroly`)
  else logCheck(`prd-check 1${casti.length ? ' kostra' : ''}`, k1)
  for (const c of casti) k1C[c.id] ? logCheck(`prd-check 1 část ${c.id}`, k1C[c.id]) : log(`prd-check kolo 1 části ${c.id} nevrátil výsledek, pokračuji bez kontroly části`)
}

// ---------- 4. zapracování ----------
// Nejdřív kostra (její nálezy, nálezy kontrol částí patřící do kostry, požadavky autorů na Kontrakt), potom souběžně části.
let fix = null
const fixC = {}
const blokujiciIds = k => seznam(k && k.nalezy_ids).slice(0, Number(k && k.blokujicich) || 0)
// V běhu web-podzim zavedlo 151 z 239 nálezů delta kontroly samo zapracování: aspoň 23 doslovným převzetím chybného návrhu
// z reportu kola 1, 10 ztrátou textu při přepisu celého souboru.
// Běh web-rijen: 92 ze 128 nálezů delty (72 %) zavedlo samo zapracování (64 nový text, 28 převzatý návrh, z toho 20 nespuštěných);
// 3 ze 6 vadných kritérií ve stavbě vznikla převzetím návrhu. Přepis Write zmizel, ale 217 přepisů sekcí skriptem v Bashi zůstalo.
// Návrh, který spustit nejde, se zapíše se značkou a delta ho dostane jako hypotézu (Martin 6. 10.: zákaz zápisu by nález ztratil).
const navrhHypoteza = 'Oprav nejmenší změnou, která nález řeší. Nové pravidlo, rozhraní, kritérium ani krok, který report nenavrhuje, nezaváděj; když oprava jinak nejde, uveď ho ve změněných místech se značkou „nové“. Návrh v reportu je hypotéza stejně jako nález: převzaté znění (kritérium, příkaz měřidla, regex, formát, rozhraní, cesta, číslo) spusť nad dnešním stromem nebo ověř čtením kódu dřív, než ho zapíšeš, a výsledek uveď ve změněných místech; návrh, který spustit nejde, zapiš se značkou „neověřeno: <proč>“ ve změněných místech (delta kontrola ho dostane jako hypotézu). Edituj dotčená místa (Edit); soubor nepřepisuj celý (Write) a sekci nepřepisuj skriptem celou (python open(…, \'w\')), přepis ztrácí text.'
const doKostry = casti.map(c => ({ c, k: k1C[c.id], ids: seznam(k1C[c.id] && k1C[c.id].nalezy_kostra) })).filter(x => x.k && x.ids.length)
let kostraZmenena = []
const kostraFixNutny = rezim === 'zapracovani' || (k1 && k1.verdikt === 'needs-fixes') || kontraktDoplnit.length > 0 || doKostry.length > 0
if (kostraFixNutny) {
  phase('Zapracování')
  const zdroje = [
    rezim === 'zapracovani' ? `Nálezy orchestrátora (schválení souhrnu PRD): ${spojCele(nalezyOrch)}.` : '',
    k1 && k1.verdikt === 'needs-fixes' ? `Report: ${k1.report_path} (nálezy ${seznam(k1.nalezy_ids).join(', ') || 'všechny'}).` : '',
    doKostry.length ? `Nálezy kontrol částí, jejichž oprava patří do kostry: ${doKostry.map(x => `${x.c.id}: ${x.k.report_path} (${x.ids.join(', ')})`).join(' | ')}.` : '',
    kontraktDoplnit.length ? `Autoři částí hlásí, co Kontrakt nepokrývá a část to potřebuje sdílet (každé ověř, co platí, doplň do Kontraktu): ${spojCele(kontraktDoplnit)}.` : '',
  ].filter(Boolean).join(' ')
  const castiPravidla = rezim === 'zapracovani'
    ? `Má-li PRD části (tabulka Části, soubory docs/prd/rez-${NN}-cast-K.md), smíš upravit i soubory částí, kterých se nález týká; počet a id částí neměň a změněná místa v souboru části uveď s předponou části (K2: …).`
    : casti.length
      ? 'Soubory částí needituj, sjednotí je jejich zapracování. Počet a id částí neměň (nová část by neměla autora ani kontrolu); soubory, kritéria a závislosti mezi částmi přesunout smíš. Změněná místa v Kontraktu a Částech uveď s předponou sekce (Kontrakt: …, Části: …), podle nich se části sjednotí s kostrou.'
      : 'Řez bez částí na části nedělej (části by neměly autora ani kontrolu); casti vrať prázdné.'
  const fixPrompt = `${ramec}

Úkol: zapracuj nálezy do ${casti.length ? 'kostry PRD' : 'PRD'} řezu ${NN}. ${zdroje} PRD: ${prd.prd_path} · E2E: ${prd.e2e_path} · řádek plánu: ${JSON.stringify(row)}
Každý nález je hypotéza: ověř proti kódu a vizi; co míří vedle, nezapracuj a uveď v odmitnute s důvodem. ${navrhHypoteza} Rozsah řezu nerozšiřuj; nález žádající novou plochu, mantinel nebo zápis mimo vizi zapiš do vize-spory a odmítni. ${pravidlaKriterii}
${castiPravidla}${casti.length ? kostraCteni(false) : ''} ${krokyCislovane} Na kód odkazuj souborem a jménem symbolu, nikdy číslem řádku. Vrať seznam změněných míst (sekce, kritéria), casti podle tabulky Části (bez částí prázdné) a aktualizovaný souhrn pro orchestrátora${rezim === 'zapracovani' ? ' včetně cíle, počtu kritérií a všech příznaků (lešení, zápis do živého, runtime dopad, body vize)' : ''}.`
  fix = await runSePredavkou(fixPrompt, { label: `prd-fix:řez ${NN}`, phase: 'Zapracování', agentType: 'dev-pipeline:prd', schema: PRD_SCHEMA, model: 'opus', effort: 'high' })
  if (fix) {
    sporyVse.push(...seznam(fix.spory))
    if (rezim === 'zapracovani') {
      // S předchozím návratem drží počet a id částí sloucCasti (zadání je měnit nedovoluje); bez něj vrací části zapracování.
      const sPuvodnimi = casti.length > 0
      const prevezmi = o => { const v = []; casti = sPuvodnimi ? sloucCasti(casti, o.casti) : normCasti(o.casti, v); return vadyCasti(casti, v) }
      const chyba = await hlidejCasti(prevezmi(fix), prevezmi, true)
      if (chyba) return { ok: false, rez: NN, duvod: chyba, prd_path: prd.prd_path, predavky: predavekCelkem }
    } else if (casti.length) {
      // Změnilo-li zapracování Kontrakt nebo Části, sjednotí se s kostrou všechny části, ne jen ty s nálezy.
      const pred = JSON.stringify(casti)
      let opravaZmenena = []
      casti = sloucCasti(casti, fix.casti)
      // Zapracování smí přesunout závislosti mezi částmi: cyklus hlídá blok i tady (autoři už psali, id a počet zůstávají).
      const chyba = await hlidejCasti(vadyCasti(casti), o => { opravaZmenena = seznam(o.zmenena_mista); casti = sloucCasti(casti, o.casti); return vadyCasti(casti) }, true)
      if (chyba) return { ok: false, rez: NN, duvod: chyba, prd_path: prd.prd_path, predavky: predavekCelkem }
      kostraZmenena = seznam([...seznam(fix.zmenena_mista), ...opravaZmenena]).filter(x => /kontrakt|části/i.test(x))
      if (!kostraZmenena.length && JSON.stringify(casti) !== pred) kostraZmenena = ['tabulka Části (soubory, kritéria nebo závislosti částí)']
    } else if (objekty(fix.casti).length) log('zapracování vrátilo části u malého řezu: ignoruji, nemají autora ani kontrolu')
  } else {
    log(rezim === 'zapracovani' ? 'zapracování nálezů selhalo, PRD zůstává beze změny' : `zapracování ${casti.length ? 'kostry' : 'nálezů'} selhalo, ${casti.length ? 'kostra zůstává' : 'PRD zůstává'} v podobě po kole 1`)
    if (rezim === 'zapracovani') return { ok: false, rez: NN, duvod: nic(`prd-fix:řez ${NN}`, 'PRD agent v režimu zapracování'), predavky: predavekCelkem }
  }
}
if (rezim === 'novy' && casti.length) {
  const kFix = casti.map(c => {
    const k = k1C[c.id]
    const vadna = Boolean(k && k.verdikt === 'needs-fixes')
    const kostrou = seznam(k && k.nalezy_kostra)
    const vlastni = seznam(k && k.nalezy_ids).filter(id => !kostrou.includes(id))
    // needs-fixes bez identifikátorů: všechny nálezy bere část sama.
    const sNalezy = vadna && (vlastni.length > 0 || !seznam(k.nalezy_ids).length)
    return { c, k, kostrou, vlastni, sNalezy }
  }).filter(x => x.sNalezy || kostraZmenena.length)
  if (kFix.length) {
    if (!kostraFixNutny) phase('Zapracování')
    const fixCastPrompt = ({ c, k, kostrou, vlastni, sNalezy }) => `${ramec}

Úkol: zapracování PRD části ${c.id} (${c.nazev}) řezu ${NN}. ${sNalezy ? `Nálezy kontroly části: report ${k.report_path} (nálezy ${vlastni.join(', ') || 'všechny'}${kostrou.length ? `; ${kostrou.join(', ')} zapracovává kostra, ty přeskoč` : ''}). ` : ''}${kostraZmenena.length ? `Kostra se při zapracování změnila v místech: ${spojCele(kostraZmenena, 6000)}; sjednoť svou část s kostrou (Kontrakt, řádek části v tabulce Části, kritéria části). ` : ''}Kostra PRD: ${prd.prd_path} · PRD části: ${c.prd_path} · soubory a oblasti části: ${c.soubory.join(', ')} · kritéria části: ${c.kriteria.join(', ')}
Z kostry čti Kontrakt, svůj řádek v Částech, svá kritéria a společné sekce; sekce a soubory jiných částí nečti.${kostraCteni(true, c.kriteria)} Každý nález je hypotéza: ověř proti kódu a kostře; co míří vedle, nezapracuj a uveď v odmitnute s důvodem. ${navrhHypoteza} Rozsah části nerozšiřuj. Kostru ani soubory jiných částí needituj: co Kontrakt nepokrývá, vrať v kontrakt_doplnit. Na kód odkazuj souborem a jménem symbolu, nikdy číslem řádku. Vrať seznam změněných míst (sekce PRD části) a aktualizovaný souhrn části.`
    const vysl = await parallelOdNejdelsiho(kFix, x => x.vlastni.length || Number(x.k && x.k.nalezu) || 0, x => runSePredavkou(fixCastPrompt(x), { label: `prd-fix:řez ${NN}:část ${x.c.id}`, phase: 'Zapracování', agentType: 'dev-pipeline:prd', schema: CAST_SCHEMA, model: 'opus', effort: 'high' }))
    kFix.forEach((x, i) => {
      const r = vysl[i]
      if (!r) { log(`zapracování části ${x.c.id} selhalo, část zůstává v podobě po kole 1`); return }
      fixC[x.c.id] = r
      sporyVse.push(...seznam(r.spory))
      // Třetí kolo kostry není: požadavek vrátí implementace části v mimo_hranici a provede ho integrace stavby.
      if (seznam(r.kontrakt_doplnit).length) log(`zapracování části ${x.c.id} hlásí, co Kontrakt nepokrývá: ${seznam(r.kontrakt_doplnit).join(' | ').slice(0, 300)} (kostra se už nezapracovává)`)
    })
    log(`zapracování částí: ${kFix.map(x => `${x.c.id} ${fixC[x.c.id] ? `změněná místa ${seznam(fixC[x.c.id].zmenena_mista).length}` : 'selhalo'}`).join(', ')}`)
  }
}

// ---------- 5. delta kontrola ----------
// Delta po dokumentech jen tam, kde kolo 1 mělo aspoň dva blokující nálezy (v režimu zapracování vždy, kolo 1 nebylo; jedním prd-checkem
// nad kostrou i dotčenými soubory částí); u lehkého profilu a lehkého PRD mini-řezu nikdy. Zbylé nálezy bez delta kontroly jdou stavbě jako hypotézy (report kola 1).
// Běh web-podzim: blokující nález mělo v kole 1 69 ze 74 dokumentů, dokument s jediným dal v deltě 0,33 blokujícího, se dvěma a víc 0,62.
const DELTA_OD = 2
const bezDeltyProfil = profil === 'lehky' || prdLehke
const bezDelty = n => profil === 'lehky' ? 'lehký profil' : prdLehke ? 'lehké PRD mini-řezu' : n === 1 ? `kolo 1 s jediným blokujícím nálezem, delta od ${DELTA_OD}` : 'kolo 1 bez blokujících nálezů'
const delty = []
if (fix) {
  const blokKostra = (k1 ? Number(k1.blokujicich) || 0 : 0) + doKostry.reduce((s, x) => s + x.ids.filter(id => blokujiciIds(x.k).includes(id)).length, 0)
  if (rezim === 'zapracovani' || (!bezDeltyProfil && blokKostra >= DELTA_OD)) delty.push({ c: null, zmenena: seznam(fix.zmenena_mista) })
  else log(`zapracováno (${seznam(fix.zmenena_mista).length} míst); delta kontrola ${casti.length ? 'kostry ' : ''}se nekoná (${bezDelty(blokKostra)}), zbylé nálezy jdou stavbě jako hypotézy`)
}
for (const c of casti) {
  const f = fixC[c.id], k = k1C[c.id]
  if (!f) continue
  const blok = k ? Number(k.blokujicich) || 0 : 0
  if (!bezDeltyProfil && blok >= DELTA_OD) delty.push({ c, zmenena: seznam(f.zmenena_mista) })
  else log(`část ${c.id} zapracována; delta kontrola se nekoná (${bezDelty(blok)})`)
}
if (delty.length) {
  phase('Delta kontrola')
  // Kostra první, části od největšího počtu nálezů kola 1.
  const vysl = await parallelOdNejdelsiho(delty, d => d.c ? Number(k1C[d.c.id] && k1C[d.c.id].nalezu) || 0 : 1e12, d => d.c
    ? runSePredavkou(checkCastPrompt(2, d.c, d.zmenena.length ? d.zmenena : ['celé PRD části (agent změněná místa neuvedl)']), { ...CHECK, label: `prd-check:řez ${NN}:část ${d.c.id}:2`, phase: 'Delta kontrola' })
    : runSePredavkou(checkPrompt(2, d.zmenena.length ? d.zmenena : ['celé PRD (agent změněná místa neuvedl)']), { ...CHECK, label: `prd-check:řez ${NN}:2`, phase: 'Delta kontrola' }))
  delty.forEach((d, i) => {
    if (d.c) k2C[d.c.id] = vysl[i] || null
    else k2 = vysl[i] || null
    logCheck(`prd-check 2 (delta)${d.c ? ` část ${d.c.id}` : ''}`, vysl[i])
  })
}

// ---------- návrat ----------
const fin = fix || prd
// Dokumenty řezu s posledním kolem kontroly: kostra (u malého řezu celé PRD) a části. Identifikátory nálezů částí nesou předponu části (K1/N3).
// zapr: nálezy dokumentu prošly zapracováním (u části i ty, které za ni zapracovala kostra).
const dokumenty = [{ id: '', k1, k2, fix, zapr: Boolean(fix) },
  ...casti.map(c => ({ id: c.id, k1: k1C[c.id], k2: k2C[c.id], fix: fixC[c.id], zapr: Boolean(fixC[c.id] || (fix && doKostry.some(x => x.c.id === c.id))) }))]
const posl = d => d.k2 || d.k1
const zkontrolovane = dokumenty.filter(posl)
const zbyle = zkontrolovane.filter(d => posl(d).verdikt === 'needs-fixes')
const sId = (d, id) => d.id ? `${d.id}/${id}` : id
// Blokující nálezy delty, které zbyly, zvlášť (spec 1.6.0 § 1.5): blok stavby nad nimi pustí refresh i bez prd_stale. V běhu web-rijen
// šly 3 takové nálezy (řez 01 N1, N2; řez 11 N1) jen implementaci, protože se refresh bez prd_stale nekonal.
const blokujici = dokumenty.filter(d => d.k2 && d.k2.verdikt === 'needs-fixes').flatMap(d => blokujiciIds(d.k2).map(id => sId(d, id)))
// Nespustitelné nejisté nálezy nad kritérii z obou kol (delta přebije kolo 1 u téhož id): stavba je ověří jako první.
const overitMapa = new Map()
for (const d of dokumenty) for (const k of [d.k1, d.k2]) for (const o of objekty(k && k.overit_prvni)) {
  const id = sId(d, S(o.id).trim() || `?${overitMapa.size + 1}`)
  overitMapa.set(id, { id, kriterium: kratce(o.kriterium, 120), hypoteza: kratce(o.hypoteza, 600) })
}
const overitPrvni = [...overitMapa.values()]
// Bez delta kontroly jdou stavbě nálezy kola 1 (zapracované, k ověření); s delta kontrolou jen to, co po ní zbylo.
const hypotezyStavby = zbyle.length || overitPrvni.length ? {
  report: zbyle.map(d => posl(d).report_path).join(' + '),
  ids: zbyle.flatMap(d => seznam(posl(d).nalezy_ids).map(id => sId(d, id))),
  blokujici,
  overit_prvni: overitPrvni,
  zapracovano: zbyle.some(d => d.zapr && !d.k2),
} : null
// Část, kterou kontrola odhadla nad strop (spec 1.6.0 § 1.8), jde stavbě i při verdiktu ready: delta K8 řezu 10 v běhu web-rijen
// předpověděla 1 650–1 800 řádků, K8 skončila ready a pokus 1 padl na stropu předávek právě na ní.
const castiNad = casti.map(c => ({ id: c.id, odhad: Math.max(Number(c.odhad_radku) || 0, ...[k1C[c.id], k2C[c.id]].map(k => Number(k && k.odhad_casti) || 0)) }))
  .filter(x => x.odhad > STROP_CASTI)
if (castiNad.length) log(`části nad stropem ~${STROP_CASTI} ř.: ${castiNad.map(x => `${x.id} ${x.odhad} ř.`).join(', ')} (jdou stavbě)`)
return navratBloku({
  fin,
  fix,
  // Nejhorší verdikt a součty přes poslední kolo každého dokumentu; reporty jen počtem a vzorem cesty.
  kontrola: zkontrolovane.length ? {
    kola: dokumenty.some(d => d.k2) ? 2 : 1,
    verdikt: zbyle.length ? 'needs-fixes' : 'ready',
    nalezu: zkontrolovane.reduce((s, d) => s + (Number(posl(d).nalezu) || 0), 0),
    blokujicich: zkontrolovane.reduce((s, d) => s + (Number(posl(d).blokujicich) || 0), 0),
    reporty_pocet: zkontrolovane.length,
    reporty: `${cwd}/docs/reviews/rez-${NN}-prd-check-*kolo-*.md`,
    bez_kontroly: dokumenty.filter(d => !posl(d)).map(d => d.id || (casti.length ? 'kostra' : 'PRD')),
  } : null,
  hypotezy: hypotezyStavby,
  odmitnute: dokumenty.flatMap(d => objekty(d.fix && d.fix.odmitnute).map(o => ({ id: sId(d, S(o.id)) }))),
  castiNad,
})

// ---------- args ze souboru ----------
// Deklarace funkce: volá se na začátku skriptu, proto nesmí sahat na konstanty definované níž (stavy TDZ). Agent opisuje hodnoty
// ze dvou souborů; skript hlídá číslo řezu (stavba 8 běhu web-rijen dostala args řezu 7 a nikdo to nepoznal) a povinná pole.
async function nactiArgs(volani) {
  const T = v => String(v == null ? '' : v)
  const nnVolani = T(volani.rez).trim() ? T(volani.rez).trim().padStart(2, '0') : ''
  if (!volani.cwd || !nnVolani) return { ok: false, rez: nnVolani || null, duvod: 'args_file bez cwd nebo rez ve volání' }
  const soubor = T(volani.args_file).startsWith('/') ? T(volani.args_file) : `${volani.cwd}/${T(volani.args_file).replace(/^\.\//, '')}`
  const s = d => ({ type: 'string', description: d })
  const schema = {
    type: 'object',
    required: ['cwd', 'rez'],
    properties: {
      cwd: s('kořen projektu'), plugin_root: s('kořen pluginu'), vize: s('cesta k vizi'), produkt: s('cesta k produktové severce'),
      rez: s('číslo řezu přesně jako v souboru'), plan_row: { type: 'object', description: 'řádek plánu, celý objekt beze změny' },
      stav_po_minulem: s(''), hypotezy: { type: 'array', items: { type: 'string' } }, follow_ups: s(''), app_pristup: s('pokyny majitele k prostředí'),
      profil: s(''), prd_lehke: { type: 'boolean' }, kontrakt_prd: s(''), kontrakt_rez: s(''), mapa_vize: s('mapa sekcí vize'),
      rezim: s(''), prd_path: s(''), e2e_path: s(''), nalezy: { type: 'array', items: { type: 'string' } },
      puvodni: { type: 'object', description: 'předchozí návrat bloku PRD, celý objekt beze změny' }, od_faze: s(''),
      chyba: s('jen když soubor args chybí nebo není platný JSON: proč; jinak nevyplňuj'),
    },
  }
  const prompt = `Řez ${nnVolani}: načtení args bloku PRD.
Přečti ${soubor} a ${volani.cwd}/docs/.run-args.json (když existuje). Vrať jejich sloučení: pole souboru řezu mají přednost před .run-args.json. Hodnoty opiš přesně, nic nezkracuj, nepřeformuluj ani nedoplňuj; pole, které v souborech není, vynech. Když ${soubor} chybí nebo není platný JSON, vyplň jen cwd, rez a chyba. Jiné soubory nečti, nic nespouštěj ani needituj.`
  let r = null
  for (let i = 0; i <= 2 && !r; i++) {
    try { r = await agent(prompt, { label: `args:řez ${nnVolani}`, phase: 'PRD', agentType: 'dev-pipeline:nacteni-args', schema, model: 'sonnet', effort: 'low' }) }
    catch (e) { log(`args:řez ${nnVolani}: spuštění selhalo (${T(e && e.message || e).slice(0, 120)})`) }
  }
  if (!r) return { ok: false, rez: nnVolani, duvod: `načtení ${volani.args_file} nevrátilo výsledek` }
  if (T(r.chyba).trim()) return { ok: false, rez: nnVolani, duvod: `args_file: ${T(r.chyba).trim().slice(0, 300)}` }
  const nnSoubor = T(r.rez).trim() ? T(r.rez).trim().padStart(2, '0') : ''
  if (nnSoubor !== nnVolani) return { ok: false, rez: nnVolani, duvod: `args_file patří řezu ${nnSoubor || '(bez rez)'}, volání je pro řez ${nnVolani}` }
  const zVolani = { ...volani }
  delete zVolani.args_file
  const { chyba, ...zeSouboru } = r
  log(`args:řez ${nnVolani}: načteno ${Object.keys(zeSouboru).length} polí z ${volani.args_file}`)
  return { ok: true, args: { ...zeSouboru, ...zVolani } }
}
